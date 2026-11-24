/**
 * Deterministic, idempotent candidate importer (pure function: archive members -> dataset).
 * - Archive content is untrusted data: parsed, guarded, never executed or followed.
 * - All 263 integration claims and all 1,290 field-mapping rows are preserved with provenance.
 * - No wall-clock time, no randomness: same input -> byte-identical output.
 * - Human-reviewed decisions are read-only inputs and are never overwritten.
 */
import {
  SCHEMA_VERSION, type Channel, type Conflict, type Dataset, type Decision, type EndRef, type EntityMapping,
  type Evidence, type EvidenceLevel, type FieldMapping, type Flow, type Integration, type MechanismKind,
  type RegistryGrant, type RegistryRecord, type ReviewItem, type System, EVIDENCE_RANK, type ProvRef,
} from '../../shared/schema.ts';
import { guardText } from '../../shared/sensitive.ts';
import {
  EXTERNAL_PROVIDERS, DOMAIN_RULES, resolveEndpoint, directionRules, mechanismRule, evidenceLevels, deploymentRule,
  triggerRule, cardinalityRule, normalizePath, type Resolution, type CatalogEntry, INTERNAL_PATTERNS,
} from './rules.ts';
import { safeJsonParse } from './zip.ts';
import { byId, cmp, firstDefined, firstWords, parseCsv, stableId, text, uniqSorted } from './util.ts';

export const IMPORTER_VERSION = '1.0.0';

/** Allow-list of archive members the importer reads. `_tools/`, `_raw/`, screenshots and prompts are never read. */
export function allowMember(name: string): boolean {
  return /(?:^|\/)(consolidated-(?:systems|integrations|field-mappings)\.json|project-inventory\.csv|registry-application-mapping\.csv|registry-data\/registry-(?:apps|grants|health)\.csv|individual-audits\/[a-z0-9-]+\.integration-audit\.json)$/.test(name)
    && !/(?:^|\/)_(?:tools|raw)\//.test(name);
}

export type ImportInput = {
  archiveName: string;
  archiveSha256: string;
  memberNames: string[];
  files: Map<string, Buffer>;
  decisions: Decision[];
};

export type MissingMappingLink = {
  id: string; reportedBy: string; agentMappingId: string | null; status: string; rawIntegrationRef: string | null;
  candidateIntegrationIds: string[]; entity: string | null; sourcePath: string | null; destinationPath: string | null; rule: string;
};

export type ImportOutput = {
  dataset: Dataset;
  provenanceIndex: Record<string, { type: string; provenance: ProvRef[] }>;
  missingMappingLinks: MissingMappingLink[];
  report: string;
  warnings: string[];
};

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as Obj) : []);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sysId = (key: string) => stableId('sys', 'catalog', key);
/** Registry discovery/token/key endpoints: plumbing of the Registry role, not the data operation. */
const REGISTRY_PLUMBING = /\/api\/registry\/|\/api\/auth\/token|public-key|\.well-known|jwks/i;

export function buildDataset(input: ImportInput): ImportOutput {
  const warnings: string[] = [];
  const sysName = input.memberNames.find((n) => n.endsWith('consolidated-systems.json'));
  if (!sysName) throw new Error('archive does not contain consolidated-systems.json');
  const prefix = sysName.slice(0, -'consolidated-systems.json'.length);
  const member = (rel: string) => `${prefix}${rel}`;
  const raw = (rel: string): string => {
    const b = input.files.get(member(rel));
    if (!b) throw new Error(`archive member missing or not allow-listed: ${rel}`);
    return b.toString('utf8');
  };
  const json = (rel: string) => asObj(safeJsonParse(raw(rel)));
  const csv = (rel: string) => parseCsv(raw(rel));
  const P = (rel: string, pointer: string): ProvRef => ({ member: member(rel), pointer });

  const withheldCount = { secret: 0, security_finding: 0 };
  const guard = (v: unknown, field: string, sink: string[]): string | null => {
    const g = guardText(text(v));
    if (g.withheld) { sink.push(field); withheldCount[g.reason!]++; }
    return g.text;
  };

  const cSystems = asArr(json('consolidated-systems.json').systems).map(asObj);
  const cInts = asArr(json('consolidated-integrations.json').integrations).map(asObj);
  const cMaps = asArr(json('consolidated-field-mappings.json').fieldMappings).map(asObj);
  const generatedAt = text(json('consolidated-systems.json').generatedAt) ?? 'unknown';
  const inventory = csv('project-inventory.csv');
  const regMap = csv('registry-application-mapping.csv');
  const regApps = csv('registry-data/registry-apps.csv');
  const regGrants = csv('registry-data/registry-grants.csv');
  const regHealth = csv('registry-data/registry-health.csv');

  const audits = new Map<string, Obj>();
  for (const s of cSystems) {
    const f = text(s.sourceFile);
    if (f && input.files.has(member(f))) audits.set(text(s.systemId)!, json(f));
  }

  // ------------------------------------------------------------------ systems
  const systems = new Map<string, System>(); // by catalog key
  const regCodeToKey = new Map<string, string>();
  for (const r of regMap) {
    const sid = r.system_id ?? '';
    if (r.registry_code && /^[A-Z][A-Z0-9_-]*$/.test(sid)) regCodeToKey.set(r.registry_code, sid);
  }
  const regAppByCode = new Map(regApps.map((r, i) => [r.code!, { row: r, i }]));
  const regRecordId = (code: string) => stableId('reg', 'app', code);
  const host = (u: string | undefined | null) => (u ? u.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || null : null);
  const domainOf = (key: string, ...texts: (string | null)[]) => {
    if (['ASAKIN-AUTH', 'ASAKIN-REGISTRY', 'ASAKIN-TINY'].includes(key)) return 'identity_platform';
    const t = texts.filter(Boolean).join(' ');
    return DOMAIN_RULES.find(([, re]) => re.test(t))?.[0] ?? 'other';
  };
  const invBySlug = new Map(inventory.map((r, i) => [r.slug!, { row: r, i }]));
  const deployFrom = (key: string, publish: string | undefined): { s: System['deploymentStatus']; src: string | null } => {
    const reg = [...regCodeToKey.entries()].find(([, k]) => k === key)?.[0] ?? (regAppByCode.has(key) ? key : null);
    const app = reg ? regAppByCode.get(reg) : undefined;
    if (app) return { s: app.row.status === 'ACTIVE' ? 'active' : app.row.status === 'INACTIVE' ? 'inactive' : 'unknown', src: `Registry app status ${app.row.status} (UI transcript, ${app.row.updated})` };
    if (publish === 'Published') return { s: 'active', src: 'Replit publish status: Published (project inventory; not a runtime check)' };
    if (publish === 'Draft') return { s: 'draft', src: 'Replit publish status: Draft (project inventory)' };
    return { s: 'unknown', src: null };
  };
  const regCodeOf = (key: string) => [...regCodeToKey.entries()].find(([, k]) => k === key)?.[0] ?? (regAppByCode.has(key) ? key : null);

  cSystems.forEach((s, i) => {
    const key = text(s.systemId)!;
    const sink: string[] = [];
    const slug = text(s.replitProject);
    const inv = slug ? invBySlug.get(slug) : undefined;
    const mapRow = regMap.find((r) => r.system_id === key);
    const agentName = text(s.applicationName);
    const claimed = asObj(s.registryAppCodeClaimed).value ?? s.registryAppCodeClaimed;
    const codes: System['codes'] = [{ namespace: 'audit', value: key, source: 'consolidated-systems.json systemId' }];
    if (slug) codes.push({ namespace: 'replit_project', value: slug, source: 'consolidated-systems.json replitProject' });
    const rc = regCodeOf(key);
    if (rc) codes.push({ namespace: 'registry', value: rc, source: `registry-application-mapping.csv (${mapRow?.match_status ?? 'match'})` });
    if (mapRow?.auth_app_code && mapRow.auth_app_code !== '—') codes.push({ namespace: 'auth', value: mapRow.auth_app_code, source: 'registry-application-mapping.csv auth_app_code' });
    const claimedText = typeof claimed === 'string' ? claimed : null;
    if (claimedText && /^[A-Z][A-Z0-9_]{1,40}$/.test(claimedText)) codes.push({ namespace: 'claimed_in_code', value: claimedText, source: 'agent: application.registryCode' });
    const chatCode = /Chat Center (?:uses a different )?code[^a-z_]*\(?([a-z_]{2,})\)?/i.exec(mapRow?.notes ?? '')?.[1];
    if (chatCode) codes.push({ namespace: 'chat_center', value: chatCode, source: 'registry-application-mapping.csv notes' });
    const purpose = guard(s.purpose, 'description', sink);
    const category = text(s.category);
    const completeness = text(s.auditCompleteness) ?? '';
    const audit = audits.get(key);
    const dep = deployFrom(key, inv?.row.publish_status);
    const collected = asArr(s.collectedAt).map((x) => String(x).slice(0, 10)).sort();
    const questions = asArr(audit?.unresolvedQuestions).map((q) => guardText(text(q))).filter((g) => !g.withheld && g.text).map((g) => g.text!);
    asArr(audit?.unresolvedQuestions).forEach((q) => { const g = guardText(text(q)); if (g.withheld) withheldCount[g.reason!]++; });
    const name = agentName && agentName !== 'UNKNOWN' ? agentName : inv?.row.project_name ?? key;
    systems.set(key, {
      id: sysId(key), key, displayName: name, agentName: agentName && agentName !== 'UNKNOWN' ? agentName : null,
      aliases: uniqSorted([...asArr(s.aliases).map((a) => text(a)).filter((a): a is string => !!a), ...(slug ? [slug] : [])]),
      codes, description: purpose, shortDescription: firstWords(purpose),
      category: category && category !== 'UNKNOWN' ? category : inv?.row.category && !/^UNKNOWN/.test(inv.row.category) ? inv.row.category : null,
      domain: key === 'CHAT-CENTER' ? 'communications' : domainOf(key, category, purpose, name),
      kind: key === 'CHAT-CENTER' ? 'shared_service' : 'business_app', layer: 'internal',
      coverage: completeness.startsWith('COMPLETE') ? 'complete' : 'partial',
      coverageReason: completeness.startsWith('COMPLETE') ? 'audited' : 'reply_truncated',
      coverageNote: [completeness, ...asArr(s.truncationNotes).map((t) => String(t))].filter(Boolean).join(' · ') || null,
      deploymentStatus: dep.s, deploymentStatusSource: dep.src,
      domainName: inv?.row.published_url && inv.row.published_url !== '' ? inv.row.published_url : host(rc ? regAppByCode.get(rc)?.row.base_url : null),
      registryRecordId: rc && regAppByCode.has(rc) ? regRecordId(rc) : null,
      lastAudit: collected.at(-1) ?? null,
      openQuestions: questions,
      provenance: [P('consolidated-systems.json', `/systems/${i}`), ...(text(s.sourceFile) ? [P(text(s.sourceFile)!, '/application')] : [])],
    });
  });

  // Blocked primary projects from the inventory (Payments, Auth, Registry): provisional, not audited.
  inventory.forEach((r, i) => {
    if (r.audit_scope !== 'PRIMARY' || !/BLOCKED/.test(r.audit_status ?? '')) return;
    const mapRow = regMap.find((m) => m.replit_project === r.slug);
    const key = mapRow && /^[A-Z][A-Z0-9-]+$/.test(mapRow.system_id ?? '') ? mapRow.system_id! : (r.slug ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '-');
    if (systems.has(key)) return;
    const viewOnly = /view-only/i.test(`${r.notes} ${mapRow?.notes ?? ''}`) || ['ASAKIN-AUTH', 'ASAKIN-REGISTRY'].includes(key);
    const sink: string[] = [];
    systems.set(key, {
      id: sysId(key), key, displayName: r.project_name || key, agentName: null, aliases: uniqSorted([r.slug ?? '', r.project_name ?? ''].filter(Boolean)),
      codes: [{ namespace: 'replit_project', value: r.slug!, source: 'project-inventory.csv slug' }],
      description: guard(r.category, 'description', sink), shortDescription: firstWords(guard(r.category, 'description', [])),
      category: r.category || null, domain: domainOf(key, r.category ?? null),
      kind: ['ASAKIN-AUTH', 'ASAKIN-REGISTRY'].includes(key) ? 'shared_service' : 'business_app', layer: 'internal',
      coverage: 'not_audited', coverageReason: viewOnly ? 'blocked_view_only' : 'blocked_agent_busy',
      coverageNote: viewOnly ? 'Workspace view-only for the auditing account; repository not code-audited.' : 'Audit prompt not sent: project agent busy on owner work; repository not code-audited.',
      deploymentStatus: viewOnly ? 'unknown' : deployFrom(key, r.publish_status).s,
      deploymentStatusSource: viewOnly ? 'Not audited; Replit project status does not establish deployment state.' : deployFrom(key, r.publish_status).src,
      domainName: r.published_url || null, registryRecordId: null, lastAudit: null, openQuestions: [],
      provenance: [P('project-inventory.csv', `row ${i + 2} (slug ${r.slug})`)],
    });
  });

  // Registry-only records: provisional catalog nodes, except inactive test records.
  regApps.forEach((r, i) => {
    const code = r.code!;
    if (regCodeToKey.has(code) || systems.has(code)) return;
    if (/test/i.test(`${code} ${r.name}`) && r.status === 'INACTIVE') return; // documented rule: test records stay Registry-only
    const mapRow = regMap.find((m) => m.registry_code === code);
    const sink: string[] = [];
    const note = guard(mapRow?.notes, 'coverageNote', sink);
    systems.set(code, {
      id: sysId(code), key: code, displayName: r.name || code, agentName: null, aliases: [],
      codes: [{ namespace: 'registry', value: code, source: 'registry-apps.csv (UI transcript)' }],
      description: null, shortDescription: firstWords(`Registry-registered app (${r.name}); no audited project in this workspace.`),
      category: null, domain: domainOf(code, r.name ?? null), kind: 'business_app', layer: 'internal',
      coverage: 'not_audited', coverageReason: 'registry_only', coverageNote: note,
      deploymentStatus: r.status === 'ACTIVE' ? 'active' : r.status === 'INACTIVE' ? 'inactive' : 'unknown',
      deploymentStatusSource: `Registry app status ${r.status} (UI transcript, ${r.updated})`,
      domainName: host(r.base_url), registryRecordId: regRecordId(code), lastAudit: null, openQuestions: [],
      provenance: [P('registry-data/registry-apps.csv', `row ${i + 2} (code ${code})`)],
    });
    regCodeToKey.set(code, code);
  });

  const ensureLazy = (key: string): System | null => {
    const existing = systems.get(key);
    if (existing) return existing;
    if (key === 'ASAKIN-TINY') {
      const s: System = {
        id: sysId(key), key, displayName: 'AsakinTiny SDK (@asakin/tiny)', agentName: null, aliases: ['AsakinTiny', '@asakin/tiny', 'Tiny'],
        codes: [], description: 'Client library vendored into caller apps for Registry discovery and token acquisition. A library, not a running service.',
        shortDescription: 'Client library for Registry discovery and tokens; a library, not a running service.',
        category: 'SDK / library', domain: 'identity_platform', kind: 'sdk_library', layer: 'internal',
        coverage: 'not_audited', coverageReason: 'library', coverageNote: 'Vendored source was not read by the auditing agents.',
        deploymentStatus: 'unknown', deploymentStatusSource: null, domainName: null, registryRecordId: null, lastAudit: null,
        openQuestions: [], provenance: [P('consolidated-integrations.json', 'mechanism text mentioning AsakinTiny')],
      };
      systems.set(key, s);
      return s;
    }
    const ext = EXTERNAL_PROVIDERS.find((e) => e.key === key);
    if (ext) {
      const s: System = {
        id: sysId(key), key, displayName: ext.name, agentName: null, aliases: [ext.nameAr],
        codes: [], description: ext.description, shortDescription: firstWords(ext.description),
        category: 'External provider', domain: 'external', kind: 'external_service', layer: 'external',
        coverage: 'not_audited', coverageReason: 'external_provider', coverageNote: 'Third-party service; outside the audit scope.',
        deploymentStatus: 'unknown', deploymentStatusSource: null, domainName: null, registryRecordId: null, lastAudit: null,
        openQuestions: [], provenance: [P('consolidated-integrations.json', `provider named by claims (${key})`)],
      };
      systems.set(key, s);
      return s;
    }
    return null;
  };

  const selfAliasesFor = (key: string): RegExp[] => {
    const s = systems.get(key);
    if (!s) return [];
    const tokens = uniqSorted([key, `APP-${key}`, ...s.aliases, ...s.codes.filter((c) => c.namespace !== 'domain').map((c) => c.value)])
      .filter((t) => t.length >= 3 && !/^(api|app|web|asakin)$/i.test(t));
    return tokens.map((t) => new RegExp(`(?<![A-Za-z0-9])${escapeRe(t)}(?![A-Za-z0-9])`, 'i'));
  };

  // ------------------------------------------------------------------ evidence lookup per reporter
  const evidenceIndex = new Map<string, Map<string, { item: Obj; idx: number }>>();
  for (const [key, audit] of audits) {
    const m = new Map<string, { item: Obj; idx: number }>();
    asArr(audit.evidence).forEach((e, idx) => { const o = asObj(e); const id = text(o.id); if (id) m.set(id, { item: o, idx }); });
    evidenceIndex.set(key, m);
  }
  const evidence = new Map<string, Evidence>();
  const auditFileOf = (key: string) => text(cSystems.find((s) => s.systemId === key)?.sourceFile) ?? 'consolidated-systems.json';
  const refEvidence = (key: string, evId: string): string | null => {
    const hit = evidenceIndex.get(key)?.get(evId);
    if (!hit) return null;
    const id = stableId('ev', key, evId);
    if (!evidence.has(id)) {
      const o = hit.item; const sink: string[] = [];
      const finding = guard(firstDefined(o, 'finding', 'claim', 'description', 'summary', 'detail', 'statement', 'what'), 'finding', sink);
      const lvlRaw = text(firstDefined(o, 'verificationStatus', 'evidenceType', 'level', 'evidenceLevel', 'type'));
      evidence.set(id, {
        id, reportedBySystemId: sysId(key), agentEvidenceId: evId, kind: 'code_reference', finding,
        file: guard(firstDefined(o, 'file', 'path', 'files', 'location', 'source'), 'file', sink),
        symbol: guard(firstDefined(o, 'function', 'symbol', 'functions'), 'symbol', sink),
        lines: text(firstDefined(o, 'lines', 'line', 'lineRange')),
        level: evidenceLevels(lvlRaw).level, levelRaw: lvlRaw, basis: 'agent_reported',
        observedAt: systems.get(key)?.lastAudit ?? null, contentWithheld: sink.length > 0,
        provenance: [P(auditFileOf(key), `/evidence/${hit.idx}`)],
      });
    }
    return id;
  };

  // ------------------------------------------------------------------ decisions
  const decisionsBy = new Map(input.decisions.map((d) => [`${d.subjectType}:${d.subjectKey}`, d]));
  const usedDecisions = new Set<string>();
  const decide = (type: Decision['subjectType'], key: string) => {
    const d = decisionsBy.get(`${type}:${key}`);
    if (d) usedDecisions.add(d.id);
    return d;
  };

  // ------------------------------------------------------------------ dynamic catalog
  // Every imported system key and Registry code is resolvable, not only the static list in rules.ts.
  const staticKeys = new Set(INTERNAL_PATTERNS.map((e) => e.key));
  const dynamicCatalog: CatalogEntry[] = [...systems.values()]
    .filter((s) => s.layer === 'internal' && !staticKeys.has(s.key))
    .map((s) => ({ key: s.key, patterns: uniqSorted([s.key, ...s.codes.filter((c) => c.namespace === 'registry').map((c) => c.value)])
      .filter((t) => t.length >= 2).map((t) => new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(t)}(?![A-Za-z0-9_-])`)) }));

  // ------------------------------------------------------------------ integrations
  const integrations: Integration[] = [];
  const intMeta = new Map<string, { reporterKey: string; srcKey: string | null; dstKey: string | null; paths: string[]; name: string | null }>();
  const reviewQueue = new Map<string, ReviewItem>();
  const addReview = (r: Omit<ReviewItem, 'status' | 'decisionId'>) => {
    const d = decide('review_item', r.id);
    reviewQueue.set(r.id, { ...r, status: d ? (d.decision === 'rejected' ? 'rejected' : 'accepted') : 'new', decisionId: d?.id ?? null });
  };

  const itemFor = (reporterKey: string, category: string, agentId: string | null): { item: Obj; idx: number } | null => {
    const a = audits.get(reporterKey);
    if (!a || !agentId) return null;
    const list = asArr(a[category]);
    const idx = list.findIndex((x) => text(asObj(x).id) === agentId);
    return idx >= 0 ? { item: asObj(list[idx]), idx } : null;
  };

  const consolidatorNorm = (v: string | null): string => {
    if (!v || /^(UNKNOWN|UNKNOWN\/ANY|ANY-GRANTED-APP)$/.test(v)) return 'UNRESOLVED';
    if (v === 'INFRA:OBJECT-STORAGE') return 'EXT:STORAGE';
    return v;
  };

  cInts.forEach((c, i) => {
    const reporterKey = text(c.reportedBy)!;
    const reporter = systems.get(reporterKey);
    if (!reporter) { warnings.push(`claim ${text(c.integrationKey)}: unknown reporter ${reporterKey}`); return; }
    const agentId = text(c.agentIntegrationId) ?? `#${i}`;
    const category = text(c.category) ?? 'internalIntegrations';
    const hit = itemFor(reporterKey, category, text(c.agentIntegrationId));
    const it = hit?.item ?? {};
    const id = stableId('int', reporterKey, category, agentId);
    const withheld: string[] = [];
    const nameRaw = text(firstDefined(it, 'name', 'logicalIntegration') ?? c.name);
    const name = guard(nameRaw, 'name', withheld);
    const purpose = guard(firstDefined(it, 'purpose', 'logicalPurpose'), 'purpose', withheld);
    const mechRaw = text(c.mechanism);
    const dirRaw = text(c.direction);
    const selfA = selfAliasesFor(reporterKey);

    // --- endpoints (both sides)
    const fallbackText = [nameRaw, agentId.replace(/[-_.]/g, ' '), text(firstDefined(it, 'provider', 'service', 'peer', 'destinationService')), mechRaw].filter(Boolean).join(' | ');
    const nameRes = (): Resolution => {
      const r = resolveEndpoint(fallbackText, reporterKey, [], dynamicCatalog);
      if (!r || (r.kind === 'system' && r.key === reporterKey)) return { kind: 'unresolved', cls: 'counterpart_not_stated', candidates: [], rule: 'N-none' };
      return { ...r, rule: `N-${r.rule}` } as Resolution;
    };
    let src = resolveEndpoint(text(c.sourceRaw), reporterKey, selfA, dynamicCatalog);
    let dst = resolveEndpoint(text(c.destinationRaw), reporterKey, selfA, dynamicCatalog);
    const inbound = /^\s*inbound|\binbound\b/i.test(dirRaw ?? '') && !/outbound/i.test(dirRaw ?? '');
    const reporterRes: Resolution = { kind: 'system', key: reporterKey, qualifier: null, rule: 'R-REPORTER-IMPLIED' };
    const isReporter = (r: Resolution | null) => r?.kind === 'system' && r.key === reporterKey;
    if (!src && !dst) {
      const other = nameRes();
      if (inbound) { src = other; dst = reporterRes; } else { src = reporterRes; dst = other; }
    } else if (!src) {
      if (isReporter(dst)) src = nameRes();
      else if (inbound) { src = dst; dst = reporterRes; } else src = reporterRes;
    } else if (!dst) {
      if (isReporter(src)) dst = nameRes();
      else if (inbound) dst = reporterRes; else { dst = src; src = reporterRes; }
    }
    const sdkKeys = new Set<string>();
    const textBlob = `${mechRaw ?? ''} ${nameRaw ?? ''} ${text(c.registryRole) ?? ''}`;
    if (/AsakinTiny|@asakin\/tiny|\bTiny\b/i.test(textBlob)) sdkKeys.add('ASAKIN-TINY');
    // SDK is never a counterpart (PRD §7.2: an SDK is a library unless code shows a running service).
    const sdkFix = (r: Resolution): Resolution => (r.kind === 'system' && r.key === 'ASAKIN-TINY'
      ? (sdkKeys.add('ASAKIN-TINY'), { kind: 'unresolved', cls: 'counterpart_not_stated', candidates: [], rule: `${r.rule}+SDK-NOT-COUNTERPART` })
      : r);
    src = sdkFix(src!); dst = sdkFix(dst!);

    const targetIsRegistry = [src, dst].some((r) => r.kind === 'system' && r.key === 'ASAKIN-REGISTRY' && r.key !== reporterKey);
    const assistedRaw = c.registryAssisted === undefined || c.registryAssisted === null ? null : String(c.registryAssisted);
    // "not via Registry", "No Registry", per-app HS256 secrets: the consolidator's regex-based registryAssisted=true is not trusted.
    const negatedRegistry = /\b(?:not|no)\b[^.;]{0,25}registry|outside the V3 protocol|per-app (?:embed-app )?secret|HS256/i.test(`${mechRaw ?? ''} ${text(c.registryRole) ?? ''}`);
    const mech = mechanismRule(negatedRegistry ? (mechRaw ?? '').replace(/registry[- ]?\w*|\btiny\b/gi, '') : mechRaw ?? '', { targetIsRegistry, registryAssisted: c.registryAssisted === true && !negatedRegistry, name: `${nameRaw ?? ''} ${agentId}` });

    // Navigation links are not data integrations: counterpart stays an unresolved link target.
    const navFix = (r: Resolution): Resolution => (mech.kind === 'navigation_link' && !(r.kind === 'system' && r.key === reporterKey)
      ? { kind: 'unresolved', cls: 'navigation_link', candidates: r.kind === 'system' ? [r.key] : r.candidates, rule: `${r.rule}+NAV` }
      : r);
    src = navFix(src); dst = navFix(dst);

    // Reviewed endpoint overrides (DEC-xxx subjectType "endpoint").
    const override = (side: 'source' | 'target', r: Resolution): Resolution => {
      const d = decide('endpoint', `${id}:${side}`);
      if (d && d.decision === 'set_system' && d.systemKey && (systems.has(d.systemKey) || ensureLazy(d.systemKey))) {
        return { kind: 'system', key: d.systemKey, qualifier: null, rule: `REVIEWED:${d.id}` };
      }
      return r;
    };
    src = override('source', src); dst = override('target', dst);

    const toRef = (r: Resolution, rawV: unknown): EndRef => {
      const rawText = guardText(text(rawV)).text;
      if (r.kind === 'system') {
        const s = ensureLazy(r.key);
        if (s) return { systemId: s.id, raw: rawText, qualifier: r.qualifier, unresolved: null, rule: r.rule };
        return { systemId: null, raw: rawText, qualifier: null, unresolved: { class: 'unrecognized', candidates: [] }, rule: `${r.rule}+NOT-IN-CATALOG` };
      }
      const cands = r.candidates.map((k) => ensureLazy(k)?.id).filter((x): x is string => !!x);
      return { systemId: null, raw: rawText, qualifier: null, unresolved: { class: r.cls, candidates: uniqSorted(cands) }, rule: r.rule };
    };
    const source = toRef(src, c.sourceRaw);
    const target = toRef(dst, c.destinationRaw);
    const negative = /NOT_FOUND|negative finding/i.test(`${text(c.status) ?? ''} ${text(c.verification) ?? ''}`);
    const scope: Integration['scope'] = negative ? 'negative_finding' : source.systemId && target.systemId ? (source.systemId === target.systemId ? 'intra_system' : 'inter_system') : 'unresolved';

    // --- endpoints & methods
    const endpoints: Integration['endpoints'] = [];
    const methods: string[] = [];
    const pushEp = (e: unknown) => {
      if (typeof e === 'string') {
        const m = /^\s*((?:GET|POST|PUT|PATCH|DELETE|HEAD)(?:\s*[|/]\s*(?:GET|POST|PUT|PATCH|DELETE|HEAD))*)\s+(.*)$/i.exec(e);
        const g = guardText(m ? m[2]! : e);
        if (m && (targetIsRegistry || !REGISTRY_PLUMBING.test(m[2]!))) methods.push(m[1]!);
        endpoints.push({ owner: null, method: m ? m[1]!.toUpperCase() : null, path: g.text!, normalizedPath: g.withheld ? null : normalizePath(m ? m[2]! : e) });
      } else if (e && typeof e === 'object' && !Array.isArray(e)) {
        const o = asObj(e);
        const p = text(firstDefined(o, 'path', 'url', 'route', 'endpoint'));
        if (!p) return;
        const method = text(firstDefined(o, 'method', 'httpMethod'));
        if (method && (targetIsRegistry || (!REGISTRY_PLUMBING.test(p) && !/registry|auth server/i.test(text(o.target) ?? '')))) methods.push(method);
        const g = guardText(p);
        endpoints.push({ owner: text(firstDefined(o, 'owner', 'target', 'direction')), method: method?.toUpperCase() ?? null, path: g.text!, normalizedPath: g.withheld ? null : normalizePath(p) });
      }
    };
    const eps = c.endpoints;
    if (Array.isArray(eps)) eps.forEach(pushEp); else if (eps && typeof eps === 'object') Object.values(eps).forEach((v) => (Array.isArray(v) ? v.forEach(pushEp) : pushEp(v))); else if (eps) pushEp(eps);
    for (const k of ['httpMethod', 'method', 'httpMethods']) { const v = text(it[k]); if (v && /GET|POST|PUT|PATCH|DELETE/i.test(v)) methods.push(v); }
    endpoints.sort((a, b) => cmp(`${a.method}${a.path}`, `${b.method}${b.path}`));

    // --- direction
    const reporterEnd = source.systemId === reporter.id && target.systemId !== reporter.id ? 'source'
      : target.systemId === reporter.id && source.systemId !== reporter.id ? 'target' : null;
    const dr = directionRules(dirRaw, methods, mech.kind);
    let requestInitiator: Integration['direction']['requestInitiator'] = 'unknown';
    let data: Integration['direction']['data'] = 'unknown';
    let rule = dr.rule;
    if (scope === 'intra_system') rule = `${rule}+intra`;
    else {
      const repSide = reporterEnd ?? 'source';
      if (!reporterEnd) rule = `${rule}+default-orientation`;
      const otherSide = repSide === 'source' ? 'target' : 'source';
      requestInitiator = dr.initiator === 'reporter' ? repSide : dr.initiator === 'other' ? otherSide : 'unknown';
      data = dr.data === 'bidirectional' ? 'bidirectional' : dr.data === 'unknown' ? 'unknown'
        : (dr.data === 'reporter_to_other') === (repSide === 'source') ? 'source_to_target' : 'target_to_source';
    }

    // --- registry role (discovery/authorization/routing/dataTransfer are distinct; PRD §7.2)
    const rrRaw = c.registryRole;
    const tri = (v: unknown): 'yes' | 'no' | 'unknown' => {
      if (v === true) return 'yes'; if (v === false) return 'no';
      const s = text(v)?.toLowerCase() ?? '';
      if (/^\s*(yes|caller[- ]side|true)/.test(s)) return 'yes';
      if (/^\s*(no|false|n\/a)/.test(s)) return 'no';
      return 'unknown';
    };
    const role = { discovery: 'unknown', authorization: 'unknown', routing: 'unknown', dataTransfer: 'unknown' } as Record<'discovery' | 'authorization' | 'routing' | 'dataTransfer', 'yes' | 'no' | 'unknown'>;
    const o = asObj(rrRaw);
    if (Object.keys(o).length) {
      const pick = (...ks: string[]) => { for (const k of ks) if (k in o) return tri(o[k]); return 'unknown' as const; };
      role.discovery = pick('discovery', 'serviceDiscovery', 'usedForDiscovery');
      role.authorization = pick('authorization', 'usedForAuthorization');
      role.routing = pick('routing', 'usedForRouting');
      role.dataTransfer = pick('dataTransfer', 'actualDataTransfer', 'usedForTransfer');
      if ('used' in o && o.used === false) role.discovery = role.authorization = role.routing = role.dataTransfer = 'no';
    } else {
      const s = (Array.isArray(rrRaw) ? rrRaw.map((x) => text(x)).join('; ') : text(rrRaw)) ?? '';
      if (/^\s*\[?\s*\]?\s*$/.test(s) && Array.isArray(rrRaw)) { role.discovery = role.authorization = role.routing = role.dataTransfer = 'no'; }
      else if (/^\s*(none|not_used|no\b)/i.test(s) || /^\["?none/i.test(s)) { role.discovery = role.authorization = role.routing = role.dataTransfer = 'no'; }
      else if (s) {
        const neg = (re: RegExp) => new RegExp(`\\b(?:not|no|NOT|NO)\\b[^.;]{0,20}${re.source}`, 'i').test(s);
        role.discovery = /discover|resolve|base_url/i.test(s) ? (neg(/discover/) ? 'no' : 'yes') : 'unknown';
        role.authorization = /authori|token|public[- ]key|jwt/i.test(s) ? 'yes' : 'unknown';
        role.routing = /proxy|routing/i.test(s) ? (neg(/(?:proxy|routing)/) ? 'no' : 'unknown') : 'unknown';
        role.dataTransfer = /does not carry|not carry the data|no data transfer|data goes directly|directly (?:caller|from|to)/i.test(s) ? 'no' : 'unknown';
      } else if (c.registryAssisted === false || c.registryAssisted === 'NOT_REGISTRY_INFERRED') {
        role.discovery = role.authorization = role.routing = role.dataTransfer = 'no';
      }
    }
    const rrText = guardText(Array.isArray(rrRaw) || (rrRaw && typeof rrRaw === 'object') ? JSON.stringify(rrRaw) : text(rrRaw)).text;

    // --- registry grant (configuration, not proof of traffic)
    let grant: Integration['registryGrant'] = { status: 'not_applicable', grantId: null, consolidatorNote: text(c.registryGrantCheck) };
    const assisted = (c.registryAssisted === true && !negatedRegistry) || role.discovery === 'yes' || role.authorization === 'yes' || mech.kind === 'registry_assisted_api';
    if (assisted && scope === 'inter_system' && mech.kind !== 'registry_call') {
      const sKey = src.kind === 'system' ? src.key : null; const tKey = dst.kind === 'system' ? dst.key : null;
      const sc = sKey ? regCodeOf(sKey) : null; const tc = tKey ? regCodeOf(tKey) : null;
      if (sc && tc) {
        const callerFirst = requestInitiator === 'target' ? [tc, sc] : requestInitiator === 'source' ? [sc, tc] : null;
        const g = (callerFirst ? [callerFirst] : [[sc, tc], [tc, sc]])
          .map(([a, b]) => regGrants.find((x) => x.caller === a && x.provider === b)).find(Boolean);
        grant = g
          ? { status: g.grant_status === 'ACTIVE' ? 'active' : g.grant_status === 'REVOKED' ? 'revoked' : 'not_checkable', grantId: stableId('reg', 'grant', g.caller!, g.provider!), consolidatorNote: text(c.registryGrantCheck) }
          : { status: 'none', grantId: null, consolidatorNote: text(c.registryGrantCheck) };
      } else grant = { status: 'not_checkable', grantId: null, consolidatorNote: text(c.registryGrantCheck) };
    }

    // --- trigger, deployment, evidence
    const trigRaw = text(c.trigger); const freq = text(c.frequency);
    const depRaw = [text(c.status), text(it.productionStatus), text(it.statusNote), text(it.deprecatedOrUnused), text(it.state)].filter(Boolean).join(' | ') || null;
    let depStatus = deploymentRule(depRaw ?? '');
    const verRaw = text(c.verification);
    if (depStatus === 'unknown' && verRaw) { const v = deploymentRule(verRaw); if (v === 'unused' || v === 'disabled') depStatus = v; }
    const evIds = new Set<string>();
    const refBlob = [c.codeRefs, it.evidenceIds, it.evidenceRefs, it.evidenceRef, it.codeReferences, it.evidence, c.verification]
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''))).join(' ');
    for (const evKey of evidenceIndex.get(reporterKey)?.keys() ?? []) {
      if (new RegExp(`(?<![A-Za-z0-9-])${escapeRe(evKey)}(?![A-Za-z0-9])`).test(refBlob)) { const e = refEvidence(reporterKey, evKey); if (e) evIds.add(e); }
    }
    let ev = evidenceLevels(verRaw);
    if (ev.level === 'unknown' && evIds.size) {
      const lv = [...evIds].map((e) => evidence.get(e)!.level).filter((l) => l !== 'unknown').sort((a, b) => EVIDENCE_RANK[a] - EVIDENCE_RANK[b]);
      if (lv.length) ev = { level: lv[0]!, claimed: uniqSorted(lv) as EvidenceLevel[], rule: 'E3-min-linked-evidence' };
    }
    // claim record evidence (provenance of the claim itself)
    const claimEv = stableId('ev', 'claim', id);
    evidence.set(claimEv, {
      id: claimEv, reportedBySystemId: reporter.id, agentEvidenceId: agentId, kind: 'claim_record', finding: null,
      file: null, symbol: null, lines: null, level: ev.level, levelRaw: guardText(verRaw).text, basis: 'agent_reported',
      observedAt: reporter.lastAudit, contentWithheld: false,
      provenance: [P('consolidated-integrations.json', `/integrations/${i}`), ...(hit ? [P(auditFileOf(reporterKey), `/${category}/${hit.idx}`)] : [])],
    });
    evIds.add(claimEv);

    const myKeys = [src, dst].map((r) => (r.kind === 'system' ? (r.key.startsWith('EXT:REPLIT') || r.key === 'EXT:GCS' ? 'EXT:STORAGE' : r.key) : 'UNRESOLVED')).sort();
    const theirKeys = [consolidatorNorm(text(c.source)), consolidatorNorm(text(c.destination))].map((k) => (k.startsWith('EXT:') || k === 'UNRESOLVED' || systems.has(k) ? k : 'UNRESOLVED')).sort();
    const differs = myKeys.join('|') !== theirKeys.join('|');

    const integration: Integration = {
      id, reportedBySystemId: reporter.id, agentIntegrationId: agentId,
      category: category === 'externalIntegrations' ? 'external' : 'internal',
      name, purpose, source, target, scope,
      direction: { raw: guardText(dirRaw).text, requestInitiator, data, rule },
      mechanism: { kind: mech.kind, raw: guard(mechRaw, 'mechanism', withheld), rule: mech.rule },
      registryRole: { assistedRaw, ...role, raw: rrText },
      registryGrant: grant,
      endpoints,
      sdkSystemIds: negative ? [] : [...sdkKeys].map((k) => ensureLazy(k)!.id).sort(),
      trigger: { kind: triggerRule(`${trigRaw ?? ''} ${freq ?? ''}`), raw: guard(trigRaw, 'trigger', withheld), frequency: guard(freq, 'frequency', withheld) },
      auth: guard(c.auth, 'auth', withheld),
      deployment: { status: depStatus, raw: guard(depRaw, 'deployment', withheld) },
      evidence: { level: ev.level, levelsClaimed: ev.claimed, basis: 'agent_reported', raw: guard(verRaw, 'evidence', withheld) },
      evidenceIds: [...evIds].sort(),
      corroboration: { state: 'one_sided', counterpartIds: [], basis: 'no counterpart claim matched' },
      channelId: null,
      consolidator: { source: text(c.source), destination: text(c.destination), differs },
      withheldFields: uniqSorted(withheld),
      provenance: [P('consolidated-integrations.json', `/integrations/${i}`), ...(hit ? [P(auditFileOf(reporterKey), `/${category}/${hit.idx}`)] : [])],
    };
    integrations.push(integration);
    intMeta.set(id, {
      reporterKey, srcKey: src.kind === 'system' ? src.key : null, dstKey: dst.kind === 'system' ? dst.key : null,
      paths: uniqSorted(endpoints.map((e) => e.normalizedPath).filter((p): p is string => !!p)), name: nameRaw,
    });

    for (const side of ['source', 'target'] as const) {
      const ref = integration[side];
      if (ref.unresolved) {
        addReview({
          id: stableId('rev', 'unresolved_endpoint', id, side), kind: 'unresolved_endpoint', subjectId: id, relatedIds: ref.unresolved.candidates,
          note: `${side} unresolved (${ref.unresolved.class}, rule ${ref.rule}); raw: ${ref.raw ?? 'غير موثق'}`,
        });
      }
    }
    if (differs) {
      addReview({
        id: stableId('rev', 'normalization', id), kind: 'normalization_differs_from_consolidator', subjectId: id, relatedIds: [],
        note: `consolidator: ${theirKeys.join(' / ')}; this importer: ${myKeys.join(' / ')} (rules ${source.rule}, ${target.rule})`,
      });
    }
    if (role.dataTransfer === 'yes' && mech.kind !== 'registry_call') {
      addReview({
        id: stableId('rev', 'registry_transport', id), kind: 'registry_transport_claim', subjectId: id, relatedIds: [],
        note: 'Agent states Registry carries data. Not rendered as a transport hop until independently verified (PRD J-03).',
      });
    }
  });
  integrations.sort(byId);
  const intById = new Map(integrations.map((x) => [x.id, x]));

  // ------------------------------------------------------------------ field mappings
  const intsByReporterAgentId = new Map<string, Integration[]>();
  for (const x of integrations) {
    const k = `${x.reportedBySystemId}::${x.agentIntegrationId}`;
    intsByReporterAgentId.set(k, [...(intsByReporterAgentId.get(k) ?? []), x]);
  }
  const dupCounter = new Map<string, number>();
  const fieldMappings: FieldMapping[] = [];
  const missingMappingLinks: MissingMappingLink[] = [];
  cMaps.forEach((m, j) => {
    const reporterKey = text(m.reportedBy)!;
    const reporter = systems.get(reporterKey);
    if (!reporter) { warnings.push(`mapping #${j}: unknown reporter ${reporterKey}`); return; }
    const withheld: string[] = [];
    const linkRaw = m.integrationId === null || m.integrationId === undefined || m.integrationId === '' ? null : text(m.integrationId);
    const agentMappingId = text(m.agentMappingId);
    const tupleKey = [reporterKey, agentMappingId, text(m.sourceField), text(m.destinationField), text(m.entity), linkRaw].join('␟');
    const n = dupCounter.get(tupleKey) ?? 0; dupCounter.set(tupleKey, n + 1);
    const id = stableId('map', tupleKey, n);
    let link: FieldMapping['link'];
    if (linkRaw === null) link = { status: 'missing_integration_id', raw: null, integrationIds: [], rule: 'L0-no-integration-id' };
    else {
      const exact = intsByReporterAgentId.get(`${reporter.id}::${linkRaw}`);
      if (exact && exact.length === 1) link = { status: 'matched', raw: linkRaw, integrationIds: [exact[0]!.id], rule: 'L1-exact-id-same-reporter' };
      else {
        // L2: free-text reference naming one or more of the reporter's own integration ids (incl. "INT-004 to INT-008").
        const own = integrations.filter((x) => x.reportedBySystemId === reporter.id);
        const found = new Set<string>();
        for (const x of own) if (new RegExp(`(?<![A-Za-z0-9-])${escapeRe(x.agentIntegrationId)}(?![A-Za-z0-9])`).test(linkRaw)) found.add(x.id);
        const range = /([A-Za-z]+-)(\d+)\s+to\s+\1?(\d+)/.exec(linkRaw);
        if (range) {
          const [, pre, a, b] = range; const lo = Number(a); const hi = Number(b);
          for (const x of own) { const mm = new RegExp(`^${escapeRe(pre!)}(\\d+)$`).exec(x.agentIntegrationId); if (mm && Number(mm[1]) >= lo && Number(mm[1]) <= hi) found.add(x.id); }
        }
        const ids = [...found].sort();
        link = ids.length === 0 ? { status: 'unmatched_reference', raw: linkRaw, integrationIds: [], rule: 'L3-no-own-integration-named' }
          : ids.length === 1 ? { status: 'token_reference', raw: linkRaw, integrationIds: ids, rule: range ? 'L2-range' : 'L2-token' }
            : { status: 'multi_integration', raw: linkRaw, integrationIds: ids, rule: range ? 'L2-range' : 'L2-tokens' };
      }
    }
    const d = decide('mapping_link', id);
    let reviewStatus: FieldMapping['reviewStatus'] = link.status === 'matched' ? 'matched' : 'needs_review';
    if (d) {
      if (d.decision === 'accepted' && link.integrationIds.length === 1) { link = { ...link, status: 'matched', rule: `REVIEWED:${d.id}` }; reviewStatus = 'accepted'; }
      else if (d.decision === 'rejected') reviewStatus = 'rejected';
    }
    const vRaw = text(m.verification);
    const fm: FieldMapping = {
      id, reportedBySystemId: reporter.id, agentMappingId, ordinal: j, link,
      entity: guard(m.entity, 'entity', withheld), directionRaw: guard(m.direction, 'direction', withheld),
      sourcePath: guard(m.sourceField, 'sourcePath', withheld),
      destinationPath: guard(m.destinationField, 'destinationPath', withheld), // null stays null (غير موثق)
      dataType: guard(m.dataType, 'dataType', withheld),
      required: typeof m.required === 'boolean' ? m.required : null,
      transformation: guard(m.transformation, 'transformation', withheld),
      usage: guard(Array.isArray(m.usage) ? m.usage.map((u) => text(u)).join('; ') : m.usage, 'usage', withheld),
      evidence: { level: evidenceLevels(vRaw).level, raw: guardText(vRaw).text, basis: 'agent_reported' },
      reviewStatus, withheldFields: uniqSorted(withheld),
      provenance: [P('consolidated-field-mappings.json', `/fieldMappings/${j}`)],
    };
    fieldMappings.push(fm);
    if (fm.link.status !== 'matched') {
      missingMappingLinks.push({
        id, reportedBy: reporterKey, agentMappingId, status: fm.link.status, rawIntegrationRef: linkRaw,
        candidateIntegrationIds: fm.link.integrationIds, entity: fm.entity, sourcePath: fm.sourcePath, destinationPath: fm.destinationPath, rule: fm.link.rule,
      });
    }
  });
  fieldMappings.sort(byId);
  missingMappingLinks.sort(byId);
  const mapsByInt = new Map<string, FieldMapping[]>();
  for (const fm of fieldMappings) if (fm.link.status === 'matched') {
    const k = fm.link.integrationIds[0]!; mapsByInt.set(k, [...(mapsByInt.get(k) ?? []), fm]);
  }

  // ------------------------------------------------------------------ reconciliation -> channels
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const union = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  const inter = integrations.filter((x) => x.scope === 'inter_system');
  const overlap = (a: string[], b: string[]) => a.some((p) => b.includes(p));
  const conflicts = new Map<string, Conflict>();
  const addConflict = (c: Omit<Conflict, 'status' | 'decisionId'>) => {
    const d = decide('conflict', c.id);
    conflicts.set(c.id, { ...c, status: d ? (d.decision === 'rejected' ? 'rejected' : 'accepted') : 'conflict', decisionId: d?.id ?? null });
  };
  const pairKey = (x: Integration) => [x.source.systemId!, x.target.systemId!].sort().join('|');
  for (let a = 0; a < inter.length; a++) for (let b = a + 1; b < inter.length; b++) {
    const x = inter[a]!; const y = inter[b]!;
    if (x.reportedBySystemId === y.reportedBySystemId || pairKey(x) !== pairKey(y)) continue;
    const mx = intMeta.get(x.id)!; const my = intMeta.get(y.id)!;
    if (mx.paths.length && my.paths.length) { if (overlap(mx.paths, my.paths)) union(x.id, y.id); }
    else {
      const [p, q] = [x.id, y.id].sort();
      addReview({ id: stableId('rev', 'possible_counterpart', p!, q!), kind: 'possible_counterpart', subjectId: p!, relatedIds: [q!], note: 'Same system pair reported by both sides; at least one side documents no endpoint path, so no automatic match.' });
    }
  }
  // provider-surface corroboration: caller claim X->P matches P's own surface claim (unknown callers) by endpoint
  const surfaceClass = (e: EndRef) => e.unresolved?.class === 'any_granted_caller' || e.unresolved?.class === 'unknown';
  const surfaces = integrations.filter((x) => x.scope === 'unresolved'
    && ((surfaceClass(x.source) && x.target.systemId === x.reportedBySystemId) || (surfaceClass(x.target) && x.source.systemId === x.reportedBySystemId)));
  const surfaceLinks = new Map<string, Set<string>>();
  for (const x of inter) for (const s of surfaces) {
    const sp = s.reportedBySystemId;
    if (sp === x.reportedBySystemId || ![x.source.systemId, x.target.systemId].includes(sp)) continue;
    if (overlap(intMeta.get(x.id)!.paths, intMeta.get(s.id)!.paths)) {
      surfaceLinks.set(x.id, (surfaceLinks.get(x.id) ?? new Set()).add(s.id));
      surfaceLinks.set(s.id, (surfaceLinks.get(s.id) ?? new Set()).add(x.id));
    }
  }

  const groups = new Map<string, Integration[]>();
  for (const x of inter) groups.set(find(x.id), [...(groups.get(find(x.id)) ?? []), x]);
  const channels: Channel[] = [];
  const flows: Flow[] = [];
  const entityByInt = new Map<string, string[]>();
  for (const [k, fms] of mapsByInt) entityByInt.set(k, uniqSorted(fms.map((f) => f.entity).filter((e): e is string => !!e && !e.startsWith('['))));

  for (const claims of groups.values()) {
    claims.sort(byId);
    const [A, B] = [claims[0]!.source.systemId!, claims[0]!.target.systemId!].sort() as [string, string];
    const chId = stableId('ch', ...claims.map((c) => c.id));
    const rel = (x: Integration) => {
      const aIsSource = x.source.systemId === A;
      const data = x.direction.data === 'bidirectional' ? 'bidirectional' : x.direction.data === 'unknown' ? 'unknown'
        : (x.direction.data === 'source_to_target') === aIsSource ? 'a_to_b' : 'b_to_a';
      const init = x.direction.requestInitiator === 'unknown' ? 'unknown' : (x.direction.requestInitiator === 'source') === aIsSource ? 'a' : 'b';
      return { data, init };
    };
    const rels = claims.map(rel);
    const knownData = uniqSorted(rels.map((r) => r.data).filter((d) => d !== 'unknown'));
    let data: Channel['data'] = knownData.length === 0 ? 'unknown' : knownData.length === 1 ? knownData[0] as Channel['data'] : 'conflict';
    if (data === 'conflict' && knownData.includes('bidirectional') && knownData.length === 2) data = 'bidirectional';
    const knownInit = uniqSorted(rels.map((r) => r.init).filter((d) => d !== 'unknown'));
    const requestInitiator: Channel['requestInitiator'] = knownInit.length === 0 ? 'unknown' : knownInit.length === 1 ? knownInit[0] as 'a' | 'b' : 'conflict';
    if (data === 'conflict') {
      addConflict({
        id: stableId('cfl', 'direction', chId), kind: 'direction_mismatch', severity: 'medium',
        summary: 'Two matched claims for the same channel state opposite data directions.',
        claims: claims.map((c, i) => ({ integrationId: c.id, mappingIds: [], reportedBySystemId: c.reportedBySystemId, statement: `data ${rels[i]!.data} (rule ${c.direction.rule}; raw: ${c.direction.raw ?? 'غير موثق'})` })),
      });
    }
    const reporters = new Set(claims.map((c) => c.reportedBySystemId));
    const surfaceIds = uniqSorted(claims.flatMap((c) => [...(surfaceLinks.get(c.id) ?? [])]));
    const corroboration: Channel['corroboration'] = data === 'conflict' ? 'conflict' : reporters.size >= 2 ? 'two_sided' : surfaceIds.length ? 'provider_surface_match' : 'one_sided';
    for (const c of claims) {
      c.channelId = chId;
      const others = claims.filter((o) => o.id !== c.id).map((o) => o.id);
      const surf = [...(surfaceLinks.get(c.id) ?? [])];
      c.corroboration = corroboration === 'conflict' ? { state: 'conflict', counterpartIds: others, basis: 'matched claims disagree on direction' }
        : others.length ? { state: 'two_sided', counterpartIds: others.sort(), basis: 'endpoint path match with the counterpart system’s own claim' }
          : surf.length ? { state: 'provider_surface_match', counterpartIds: surf.sort(), basis: 'endpoint path matches the provider’s own surface claim (callers unnamed)' }
            : c.corroboration;
    }
    const deps = uniqSorted(claims.map((c) => c.deployment.status));
    const level = claims.map((c) => c.evidence.level).sort((a, b) => EVIDENCE_RANK[b] - EVIDENCE_RANK[a])[0]!;
    const channel: Channel = {
      id: chId, systemA: A, systemB: B, claimIds: claims.map((c) => c.id),
      matchBasis: claims.length > 1 ? 'endpoint_match' : 'single_claim', data, requestInitiator,
      mechanismKinds: uniqSorted(claims.map((c) => c.mechanism.kind)) as MechanismKind[],
      label: claims.map((c) => c.name ?? c.agentIntegrationId).find(Boolean) ?? claims[0]!.agentIntegrationId,
      evidenceLevel: level, corroboration,
      registryAssisted: claims.some((c) => c.mechanism.kind === 'registry_assisted_api' || c.registryRole.discovery === 'yes' || c.registryRole.authorization === 'yes'),
      deploymentStatus: deps.length === 1 ? deps[0] as Channel['deploymentStatus'] : 'mixed',
    };
    channels.push(channel);
    const initSys = requestInitiator === 'a' ? A : requestInitiator === 'b' ? B : null;
    const entities = uniqSorted(claims.flatMap((c) => entityByInt.get(c.id) ?? []));
    const triggers = uniqSorted(claims.map((c) => c.trigger.kind)) as Flow['triggerKinds'];
    const mk = (prod: string, cons: string) => flows.push({
      id: stableId('flow', chId, prod, cons), channelId: chId, producerSystemId: prod, consumerSystemId: cons,
      requestInitiatorSystemId: initSys, claimIds: channel.claimIds, entities, triggerKinds: triggers, evidenceLevel: level,
    });
    if (data === 'a_to_b' || data === 'bidirectional') mk(A, B);
    if (data === 'b_to_a' || data === 'bidirectional') mk(B, A);

    // --- field contract comparison between producer-side and consumer-side claims (never auto-merged)
    const producer = data === 'a_to_b' ? A : data === 'b_to_a' ? B : null;
    if (producer) {
      const counterpartClaims = [...claims.map((c) => c.id), ...surfaceIds];
      const prodMaps = counterpartClaims.filter((cid) => intById.get(cid)!.reportedBySystemId === producer).flatMap((cid) => mapsByInt.get(cid) ?? []);
      const consMaps = counterpartClaims.filter((cid) => intById.get(cid)!.reportedBySystemId !== producer).flatMap((cid) => mapsByInt.get(cid) ?? []);
      compareContracts(prodMaps, consMaps, chId);
    }
  }
  for (const s of surfaces) {
    const linked = [...(surfaceLinks.get(s.id) ?? [])];
    if (linked.length) s.corroboration = { state: 'provider_surface_match', counterpartIds: linked.sort(), basis: 'caller claims name this provider surface by endpoint path' };
  }

  function wireLeaf(p: string | null): string | null {
    if (!p) return null;
    const cleaned = p.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/)[0] ?? '';
    const leaf = cleaned.split(/[.:/]/).filter(Boolean).at(-1)?.replace(/\[\]$|\[\d+\]$/, '').replace(/[^A-Za-z0-9_]/g, '') ?? '';
    return leaf.length >= 2 ? leaf : null;
  }
  function typeFamily(t: string | null): string | null {
    if (!t) return null;
    const s = t.toLowerCase();
    if (/bool/.test(s)) return 'boolean';
    if (/int|number|numeric|decimal|float|double|bigint/.test(s)) return 'number';
    if (/date|time/.test(s)) return 'datetime';
    if (/array|\[\]|list/.test(s)) return 'array';
    if (/object|json|record/.test(s)) return 'object';
    if (/string|text|uuid|varchar|enum|url|email/.test(s)) return 'string';
    return null;
  }
  function compareContracts(prodMaps: FieldMapping[], consMaps: FieldMapping[], chId: string) {
    if (!prodMaps.length || !consMaps.length) return;
    const prodByLeaf = new Map<string, FieldMapping[]>();
    for (const pm of prodMaps) { const l = wireLeaf(pm.destinationPath); if (l) prodByLeaf.set(l, [...(prodByLeaf.get(l) ?? []), pm]); }
    if (!prodByLeaf.size) return;
    for (const cm of consMaps) {
      const leaf = wireLeaf(cm.sourcePath);
      if (!leaf) continue;
      const pms = prodByLeaf.get(leaf);
      if (!pms) {
        addReview({ id: stableId('rev', 'field_not_found', chId, cm.id), kind: 'field_not_found_on_counterpart', subjectId: cm.id, relatedIds: [chId],
          note: `Consumer reads "${leaf}" but the producer-side mappings for this channel do not emit a field with that name.` });
        continue;
      }
      const cf = typeFamily(cm.dataType);
      const clash = pms.filter((pm) => { const pf = typeFamily(pm.dataType); return cf && pf && cf !== pf; });
      if (clash.length) {
        addConflict({
          id: stableId('cfl', 'field', chId, cm.id), kind: 'field_contract_mismatch', severity: 'high',
          summary: `Producer and consumer disagree on the type of "${leaf}".`,
          claims: [
            { integrationId: clash[0]!.link.integrationIds[0] ?? null, mappingIds: clash.map((x) => x.id).sort(), reportedBySystemId: clash[0]!.reportedBySystemId, statement: `${clash[0]!.destinationPath} : ${clash[0]!.dataType}` },
            { integrationId: cm.link.integrationIds[0] ?? null, mappingIds: [cm.id], reportedBySystemId: cm.reportedBySystemId, statement: `${cm.sourcePath} : ${cm.dataType}` },
          ],
        });
      }
    }
  }

  // ------------------------------------------------------------------ entity mappings
  const entityMappings: EntityMapping[] = [];
  for (const [key, audit] of audits) {
    asArr(audit.recordRelationships).forEach((r, idx) => {
      const o = asObj(r); const sink: string[] = [];
      const from = guard(firstDefined(o, 'from', 'source', 'parent', 'entityA'), 'from', sink);
      if (!from) return;
      const to = guard(firstDefined(o, 'to', 'target', 'child', 'entityB'), 'to', sink);
      const cardRaw = text(firstDefined(o, 'cardinality', 'relationship', 'type'));
      entityMappings.push({
        id: stableId('ent', key, 'rel', idx, from, to), reportedBySystemId: sysId(key), kind: 'record_relationship',
        sourceEntity: from, destinationEntity: to, cardinality: cardinalityRule(cardRaw), cardinalityRaw: cardRaw,
        key: guard(firstDefined(o, 'key', 'foreignKey', 'via', 'joinKey'), 'key', sink), integrationIds: [],
        sourceOfTruthClaim: guard(firstDefined(o, 'sourceOfTruth', 'owner'), 'sourceOfTruth', sink), note: guard(firstDefined(o, 'note', 'notes'), 'note', sink),
        provenance: [P(auditFileOf(key), `/recordRelationships/${idx}`)],
      });
    });
  }
  for (const [intId, fms] of mapsByInt) {
    const x = intById.get(intId)!;
    const byEntity = new Map<string, FieldMapping[]>();
    for (const f of fms) if (f.entity && !f.entity.startsWith('[')) byEntity.set(f.entity, [...(byEntity.get(f.entity) ?? []), f]);
    for (const [ent, list] of byEntity) {
      entityMappings.push({
        id: stableId('ent', intId, 'flow', ent), reportedBySystemId: x.reportedBySystemId, kind: 'flow_entity',
        sourceEntity: ent, destinationEntity: null, cardinality: 'unknown', cardinalityRaw: null, key: null, integrationIds: [intId],
        sourceOfTruthClaim: null, note: `${list.length} field mapping(s) reported for this entity`,
        provenance: list.slice(0, 3).flatMap((f) => f.provenance),
      });
    }
  }
  entityMappings.sort(byId);

  // ------------------------------------------------------------------ registry
  const healthBy = new Map(regHealth.map((h) => [h.code!, h]));
  const keyToId = (k: string | undefined | null) => (k && systems.get(k) ? systems.get(k)!.id : null);
  const records: RegistryRecord[] = regApps.map((r, i) => {
    const h = healthBy.get(r.code!);
    return {
      id: regRecordId(r.code!), code: r.code!, name: r.name ?? r.code!, status: r.status ?? 'UNKNOWN', baseUrl: r.base_url || null, updated: r.updated || null,
      health: h ? { api: h.api_health || null, integration: h.integration_health || null, lastChecked: h.last_checked || null, note: 'registry_monitor_snapshot_not_live' as const } : null,
      systemId: keyToId(regCodeToKey.get(r.code!)), provenance: [P('registry-data/registry-apps.csv', `row ${i + 2}`), ...(h ? [P('registry-data/registry-health.csv', `code ${r.code}`)] : [])],
    };
  }).sort(byId);
  const grants: RegistryGrant[] = regGrants.map((g, i) => ({
    id: stableId('reg', 'grant', g.caller!, g.provider!), callerCode: g.caller!, providerCode: g.provider!,
    callerSystemId: keyToId(regCodeToKey.get(g.caller!)), providerSystemId: keyToId(regCodeToKey.get(g.provider!)),
    scopes: (g.scopes ?? '').split(/\s+/).filter(Boolean).sort(), status: g.grant_status ?? 'UNKNOWN', compatibility: g.compatibility && g.compatibility !== '-' ? g.compatibility : null,
    updated: g.updated || null, provenance: [P('registry-data/registry-grants.csv', `row ${i + 2}`)],
  })).sort(byId);
  const matches = regMap.map((r, i) => {
    const sink: string[] = [];
    return {
      id: stableId('reg', 'match', r.replit_project ?? '', r.registry_code ?? '', i), replitProject: r.replit_project && r.replit_project !== '—' ? r.replit_project : null,
      systemId: keyToId(/^[A-Z]/.test(r.system_id ?? '') ? r.system_id : regCodeToKey.get(r.registry_code ?? '')),
      registryCode: r.registry_code || null, authAppCode: r.auth_app_code && r.auth_app_code !== '—' ? r.auth_app_code : null,
      claimedInCode: guard(r.app_code_claimed_in_code, 'claimedInCode', sink), matchStatus: r.match_status ?? 'UNKNOWN',
      note: guard(r.notes, 'note', sink), provenance: [P('registry-application-mapping.csv', `row ${i + 2}`)],
    };
  }).sort(byId);

  // ------------------------------------------------------------------ reviewed system exclusions
  // A human decision `{ subjectType: 'system', decision: 'exclude' }` removes a non-audited system (e.g. an
  // out-of-scope external provider) and every claim touching it, consistently across all collections.
  // Audited systems (reporters) cannot be excluded: their own claims would lose their reporter.
  const excluded = { systems: [] as string[], integrations: 0, fieldMappings: 0, evidence: 0, decisions: [] as string[] };
  {
    const exSys = new Set<string>();
    for (const [key, s] of systems) {
      const d = decide('system', key);
      if (!d) continue;
      if (d.decision === 'rename') {
        // Display name only: the stable id, key and endpoint resolution are unaffected (applied after resolution);
        // the archive's name stays searchable as an alias.
        if (!d.displayName) { warnings.push(`decision ${d.id}: rename requires displayName`); continue; }
        const was = s.displayName;
        s.displayName = d.displayName;
        if (!s.aliases.includes(was)) s.aliases = uniqSorted([...s.aliases, was]);
        continue;
      }
      if (d.decision !== 'exclude') { warnings.push(`decision ${d.id}: only "exclude" or "rename" apply to subjectType system`); continue; }
      const reports = integrations.some((x) => x.reportedBySystemId === s.id) || fieldMappings.some((m) => m.reportedBySystemId === s.id);
      if (reports) { warnings.push(`decision ${d.id}: ${key} is an audit reporter and cannot be excluded`); continue; }
      exSys.add(s.id); excluded.systems.push(key); excluded.decisions.push(d.id);
    }
    if (exSys.size) {
      const keep = <T,>(arr: T[], pred: (x: T) => boolean) => { const k = arr.filter(pred); arr.length = 0; arr.push(...k); };
      const exInt = new Set(integrations.filter((x) => (x.source.systemId && exSys.has(x.source.systemId)) || (x.target.systemId && exSys.has(x.target.systemId))).map((x) => x.id));
      const before = { ints: integrations.length, maps: fieldMappings.length, ev: evidence.size };
      const exEvidence = new Set(integrations.filter((x) => exInt.has(x.id)).flatMap((x) => x.evidenceIds));
      keep(integrations, (x) => !exInt.has(x.id));
      for (const x of integrations) {
        x.sdkSystemIds = x.sdkSystemIds.filter((id) => !exSys.has(id));
        x.corroboration.counterpartIds = x.corroboration.counterpartIds.filter((id) => !exInt.has(id));
        for (const e of [x.source, x.target]) if (e.unresolved) e.unresolved.candidates = e.unresolved.candidates.filter((id) => !exSys.has(id));
      }
      const exCh = new Set(channels.filter((c) => exSys.has(c.systemA) || exSys.has(c.systemB) || c.claimIds.every((id) => exInt.has(id))).map((c) => c.id));
      keep(channels, (c) => !exCh.has(c.id));
      for (const c of channels) c.claimIds = c.claimIds.filter((id) => !exInt.has(id));
      keep(flows, (f) => !exCh.has(f.channelId));
      for (const f of flows) f.claimIds = f.claimIds.filter((id) => !exInt.has(id));
      // field mappings: drop rows linked only to excluded claims; re-classify rows that also named other claims
      const exMap = new Set<string>();
      for (const m of fieldMappings) {
        if (!m.link.integrationIds.some((id) => exInt.has(id))) continue;
        const rest = m.link.integrationIds.filter((id) => !exInt.has(id));
        if (!rest.length) { exMap.add(m.id); continue; }
        m.link = { ...m.link, integrationIds: rest, status: rest.length === 1 ? (m.link.status === 'matched' ? 'matched' : 'token_reference') : m.link.status, rule: `${m.link.rule}+EXCLUDED` };
      }
      keep(fieldMappings, (m) => !exMap.has(m.id));
      keep(missingMappingLinks, (m) => !exMap.has(m.id));
      const linkById = new Map(fieldMappings.map((m) => [m.id, m.link] as const));
      for (const m of missingMappingLinks) { const l = linkById.get(m.id); if (l) { m.status = l.status; m.candidateIntegrationIds = l.integrationIds; m.rule = l.rule; } }
      for (const e of entityMappings) e.integrationIds = e.integrationIds.filter((id) => !exInt.has(id));
      // evidence referenced only by excluded claims
      const stillUsed = new Set(integrations.flatMap((x) => x.evidenceIds));
      for (const id of exEvidence) if (!stillUsed.has(id)) evidence.delete(id);
      for (const [id, c] of conflicts) {
        c.claims = c.claims.filter((cl) => !cl.integrationId || !exInt.has(cl.integrationId));
        if (c.claims.length < 2) conflicts.delete(id);
      }
      const gone = new Set([...exInt, ...exMap, ...exCh, ...exSys]);
      for (const [id, r] of reviewQueue) {
        if (gone.has(r.subjectId)) { reviewQueue.delete(id); continue; }
        r.relatedIds = r.relatedIds.filter((x) => !gone.has(x));
      }
      for (const r of records) if (r.systemId && exSys.has(r.systemId)) r.systemId = null;
      for (const g of grants) { if (g.callerSystemId && exSys.has(g.callerSystemId)) g.callerSystemId = null; if (g.providerSystemId && exSys.has(g.providerSystemId)) g.providerSystemId = null; }
      for (const mt of matches) if (mt.systemId && exSys.has(mt.systemId)) mt.systemId = null;
      for (const key of excluded.systems) systems.delete(key);
      excluded.integrations = before.ints - integrations.length;
      excluded.fieldMappings = before.maps - fieldMappings.length;
      excluded.evidence = before.ev - evidence.size;
    }
  }

  // ------------------------------------------------------------------ finalize
  for (const d of input.decisions) if (!usedDecisions.has(d.id)) warnings.push(`decision ${d.id} (${d.subjectType}:${d.subjectKey}) did not match any current record`);
  const systemList = [...systems.values()].sort(byId);
  const reviewList = [...reviewQueue.values()].sort(byId);
  const conflictList = [...conflicts.values()].sort(byId);
  const evidenceList = [...evidence.values()].sort(byId);
  channels.sort(byId); flows.sort(byId);
  integrations.forEach((x) => { x.corroboration.counterpartIds.sort(); });

  const count = <T,>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((acc, x) => { const k = f(x); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
  const linkCounts = count(fieldMappings, (f) => f.link.status);
  const counts: Record<string, number> = {
    'systems.total': systemList.length,
    'systems.audited_complete': systemList.filter((s) => s.coverage === 'complete').length,
    'systems.audited_partial': systemList.filter((s) => s.coverage === 'partial').length,
    'systems.not_audited': systemList.filter((s) => s.coverage === 'not_audited').length,
    'source.systems': cSystems.length,
    'source.integration_claims': cInts.length,
    'source.field_mapping_rows': cMaps.length,
    'integrations.total': integrations.length,
    'integrations.inter_system': integrations.filter((x) => x.scope === 'inter_system').length,
    'integrations.intra_system': integrations.filter((x) => x.scope === 'intra_system').length,
    'integrations.unresolved': integrations.filter((x) => x.scope === 'unresolved').length,
    'channels.total': channels.length,
    'channels.two_sided': channels.filter((c) => c.corroboration === 'two_sided').length,
    'flows.total': flows.length,
    'fieldMappings.total': fieldMappings.length,
    ...Object.fromEntries(Object.entries(linkCounts).map(([k, v]) => [`fieldMappings.${k}`, v])),
    'evidence.total': evidenceList.length,
    'conflicts.total': conflictList.length,
    'reviewQueue.total': reviewList.length,
    'withheld.secret': withheldCount.secret,
    'withheld.security_finding': withheldCount.security_finding,
    ...(excluded.systems.length ? {
      'excluded.systems': excluded.systems.length,
      'excluded.integrations': excluded.integrations,
      'excluded.fieldMappings': excluded.fieldMappings,
      'excluded.evidence': excluded.evidence,
    } : {}),
  };
  const meta: Dataset['meta'] = {
    schemaVersion: SCHEMA_VERSION,
    inventoryVersion: `audit-${generatedAt}+${input.archiveSha256.slice(0, 12)}`,
    generatedAt, reviewedAt: null, importerVersion: IMPORTER_VERSION, gitSha: null,
    sourceRefs: [{ name: input.archiveName, sha256: input.archiveSha256, members: input.memberNames.length }],
    counts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => cmp(a, b))),
    notes: [
      'All integration, evidence and field claims are agent-reported (Replit project agents, 2026-11-22). None is independently verified by this importer.',
      'Registry apps/grants/health are transcribed from the Registry admin UI: configuration and a monitor snapshot, not proof of data movement or live health.',
      'Payments, Auth and Registry repositories were not code-audited; Chat Center audit is partial.',
      ...(excluded.systems.length
        ? [`Excluded from the map by reviewed decision (${excluded.decisions.join(', ')}): ${excluded.systems.join(', ')} with ${excluded.integrations} claims and ${excluded.fieldMappings} field-mapping rows that touch them. The archive itself is unchanged.`]
        : []),
    ],
  };
  const dataset: Dataset = {
    meta, systems: systemList, integrations, channels, flows, entityMappings, fieldMappings, evidence: evidenceList,
    registry: { records, grants, matches }, conflicts: conflictList, reviewQueue: reviewList,
  };
  const provenanceIndex: ImportOutput['provenanceIndex'] = {};
  const addProv = (type: string, xs: { id: string; provenance: ProvRef[] }[]) => xs.forEach((x) => { provenanceIndex[x.id] = { type, provenance: x.provenance }; });
  addProv('system', systemList); addProv('integration', integrations); addProv('fieldMapping', fieldMappings); addProv('evidence', evidenceList);
  addProv('entityMapping', entityMappings); addProv('registryRecord', records); addProv('registryGrant', grants); addProv('registrationMatch', matches);
  const sortedIndex = Object.fromEntries(Object.keys(provenanceIndex).sort(cmp).map((k) => [k, provenanceIndex[k]!]));

  return { dataset, provenanceIndex: sortedIndex, missingMappingLinks, report: renderReport(dataset, counts, warnings), warnings };
}

function renderReport(d: Dataset, counts: Record<string, number>, warnings: string[]): string {
  const c = (k: string) => counts[k] ?? 0;
  const byKind = <T,>(xs: T[], f: (x: T) => string) => Object.entries(xs.reduce<Record<string, number>>((a, x) => { const k = f(x); a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort(([a], [b]) => (a < b ? -1 : 1));
  const lines = [
    '# Reconciliation report (generated — do not edit)',
    '',
    `Snapshot: \`${d.meta.inventoryVersion}\` · importer ${d.meta.importerVersion} · schema ${d.meta.schemaVersion}`,
    '',
    '## Source accounting',
    '',
    '| Source | Rows in archive | Preserved in candidate |',
    '|---|---|---|',
    `| consolidated-systems.json | ${c('source.systems')} | ${c('systems.audited_complete') + c('systems.audited_partial')} audited systems |`,
    `| consolidated-integrations.json | ${c('source.integration_claims')} | ${c('integrations.total')} claims (${c('integrations.inter_system')} inter-system, ${c('integrations.intra_system')} intra-system, ${c('integrations.unresolved')} with an unresolved end) |`,
    `| consolidated-field-mappings.json | ${c('source.field_mapping_rows')} | ${c('fieldMappings.total')} rows |`,
    '',
    '## Field-mapping link classes',
    '',
    '| Class | Rows | Meaning |',
    '|---|---|---|',
    `| matched | ${c('fieldMappings.matched')} | integrationId equals one of the reporter's own integration ids |`,
    `| token_reference | ${c('fieldMappings.token_reference')} | free-text reference naming exactly one own integration id — needs review |`,
    `| multi_integration | ${c('fieldMappings.multi_integration')} | reference names 2+ own integration ids (incl. ranges) — needs review |`,
    `| unmatched_reference | ${c('fieldMappings.unmatched_reference')} | reference names no own integration id (flow description, "ALL", "none") |`,
    `| missing_integration_id | ${c('fieldMappings.missing_integration_id')} | no integrationId in the source row |`,
    '',
    'Non-matched rows are listed in `missing-mapping-links.json`; they are never rendered as confirmed field exchanges.',
    '',
    '## Graph derivation',
    '',
    `- Channels: ${c('channels.total')} (${c('channels.two_sided')} two-sided by endpoint match). Flows: ${c('flows.total')}.`,
    `- Systems: ${c('systems.total')} (${c('systems.audited_complete')} complete, ${c('systems.audited_partial')} partial, ${c('systems.not_audited')} not audited incl. external providers / registry-only / SDK).`,
    `- Conflicts: ${c('conflicts.total')}. Review items: ${c('reviewQueue.total')}.`,
    '',
    '| Review item kind | Count |', '|---|---|',
    ...byKind(d.reviewQueue, (r) => r.kind).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '| Unresolved endpoint class | Count |', '|---|---|',
    ...byKind(d.integrations.flatMap((x) => [x.source, x.target]).filter((e) => e.unresolved), (e) => e.unresolved!.class).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '| Claim evidence level (agent-reported) | Count |', '|---|---|',
    ...byKind(d.integrations, (x) => x.evidence.level).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## Excluded / withheld content',
    '',
    `- Secret-like values withheld: ${c('withheld.secret')}. Security-finding text withheld: ${c('withheld.security_finding')}.`,
    '- Not read at all: `_tools/` (scripts), `_raw/` transcripts, `audit-prompt.txt`, `registry-screenshots/`, `integration-discrepancies.md` (mixes integration reconciliation with restricted security findings), `tracking.csv`.',
    '- Project inventory `creator` column (personal usernames) is not imported.',
    ...(c('excluded.systems')
      ? [`- Excluded by reviewed decision (\`data/private/reviewed/decisions.json\`): ${c('excluded.systems')} systems, ${c('excluded.integrations')} claims, ${c('excluded.fieldMappings')} field-mapping rows, ${c('excluded.evidence')} evidence records that only those claims referenced. See meta notes for the system keys.`]
      : []),
    '',
    '## Warnings',
    '',
    ...(warnings.length ? warnings.map((w) => `- ${w}`) : ['- none']),
    '',
  ];
  return lines.join('\n');
}
