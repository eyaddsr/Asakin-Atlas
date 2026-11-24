/**
 * Explicit, documented normalization rules (brief: "Normalize direction, mechanism, verification,
 * status, codes and aliases using explicit documented rules; retain raw source values").
 * Each function returns the rule id that fired so every normalized value is traceable.
 * See docs/DATA_QUALITY_REPORT.md §Normalization rules.
 */
import type { EvidenceLevel, MechanismKind, UnresolvedClass, Cardinality } from '../../shared/schema.ts';

// ---------------------------------------------------------------------------------------------
// Catalog of systems the resolver may name. Keys are source identities (not display names).
// ---------------------------------------------------------------------------------------------
export type CatalogEntry = { key: string; patterns: RegExp[]; family?: string };

/** Internal Asakin systems referenced by agents. Order = tie-break only; earliest match position wins. */
export const INTERNAL_PATTERNS: CatalogEntry[] = [
  { key: 'CHAT-CENTER', patterns: [/chat[\s_-]*center/i, /chat\.asakin/i, /asakinchat/i, /\bCHAT\b/] },
  { key: 'ASAKIN-AUTH', patterns: [/asakin[\s_-]*auth/i, /auth\.asakin/i, /\bAuth\b/, /\bend_session/i, /\bOpenID Provider\b/i, /\bOIDC provider\b/i] },
  { key: 'ASAKIN-REGISTRY', patterns: [/\bregistry\b/i, /ASAKIN_REGISTRY/] },
  { key: 'APMS', patterns: [/\bAPMS\b/i, /Asakin Property Management System/i] },
  { key: 'APMP', patterns: [/\bAPMP\b/i] },
  { key: 'WEB', patterns: [/\bAPP-WEB\b/, /\bWEB\b(?![-_])/, /\(asakin\.sa\)/, /asakin\.sa website/i] },
  { key: 'MARKETERS-LEGACY', patterns: [/MARKETERS-LEGACY/, /AsakinMP/i] },
  { key: 'MARKETERS', patterns: [/\bMARKETERS\b/, /marketeres/i, /marketers\.asakin/i] },
  { key: 'RENT', patterns: [/\bRENT\b/, /rent\.asakin/i] },
  { key: 'ASAR', patterns: [/\bASAR\b/, /\bar\.asakin/i, /\basakin_ar\b/i] },
  { key: 'ASSA', patterns: [/\bASSA\b/, /sales\.asakin/i] },
  { key: 'PPE', patterns: [/\bPPE\b/, /AsakinPPE/i] },
  { key: 'AOP', patterns: [/\bAOP\b/, /\bAO\b/, /ao\.asakin/i] },
  { key: 'MEDIA', patterns: [/\bMEDIA\b/, /media\.asakin/i] },
  { key: 'APPS', patterns: [/\bAPPS\b/, /apps\.asakin/i] },
  { key: 'DOCS', patterns: [/\bAPP-DOCS\b/, /\bDOCS\b/, /docs\.asakin/i] },
  { key: 'CFM', patterns: [/\bCFM\b/] },
  { key: 'PRG', patterns: [/\bPRG\b/, /REPORT_BUILDER/i, /report-builder/i] },
  { key: 'IDP', patterns: [/\bIDP\b/] },
  { key: 'INP', patterns: [/\bINP\b/, /investor portal/i] },
  { key: 'OWNER', patterns: [/\bOWNER\b/, /owners? portal/i, /owners? and tenants? portals?/i, /\bop\.asakin/i] },
  { key: 'TENANT', patterns: [/\bTENANT\b/, /tenants? portal/i, /TENANT[_-]PORTAL/i, /\btp\.asakin/i] },
  { key: 'ACC', patterns: [/\bACC\b/] },
  { key: 'CAL', patterns: [/\bCAL\b/] },
  { key: 'PCC', patterns: [/\bPCC\b/] },
  { key: 'ABP', patterns: [/\bABP\b/] },
  { key: 'FMC', patterns: [/\bFMC\b/] },
  { key: 'BUC', patterns: [/\bBUC\b/] },
  { key: 'PM', patterns: [/\bAPP-PM\b/, /\bPM\b/] },
  { key: 'CONTRACT', patterns: [/\bCONTRACT\b/, /contract-platform/i] },
  { key: 'OPT', patterns: [/\bOPT\b/] },
  { key: 'OSP', patterns: [/\bOSP\b/] },
  { key: 'PPC', patterns: [/\bPPC\b/] },
  { key: 'VIEW', patterns: [/\bVIEW\b/] },
  { key: 'INVP', patterns: [/\bINVP\b/] },
  { key: 'AOPP', patterns: [/\bAOPP\b/] },
  { key: 'PAYMENTS', patterns: [/payments\.asakin/i, /\bPayments\b/] },
  { key: 'ASAKIN-TINY', patterns: [/AsakinTiny/i, /@asakin\/tiny/i] },
];

export type ExternalDef = { key: string; name: string; nameAr: string; patterns: RegExp[]; family?: string; description: string };

/** External third-party providers. A provider becomes a node only when a claim names it. */
export const EXTERNAL_PROVIDERS: ExternalDef[] = [
  { key: 'EXT:GOOGLE-FONTS', name: 'Google Fonts', nameAr: 'خطوط Google', patterns: [/google[\s-]*fonts/i, /fonts\.googleapis/i, /fonts\.gstatic/i], description: 'Font stylesheets and files loaded by browsers.' },
  { key: 'EXT:GOOGLE-MAPS', name: 'Google Maps', nameAr: 'خرائط Google', patterns: [/google maps/i, /MAPS_HOSTS/], description: 'Map links and short-link resolution.' },
  { key: 'EXT:META', name: 'Meta (WhatsApp Cloud / Graph API)', nameAr: 'Meta (واتساب)', patterns: [/graph\.facebook/i, /\bMeta\b/, /whatsapp cloud/i], description: 'WhatsApp Cloud API messaging and webhooks.' },
  { key: 'EXT:SNAPCHAT', name: 'Snapchat', nameAr: 'سناب شات', patterns: [/snapchat/i], description: 'Snapchat lead generation and marketing API.' },
  { key: 'EXT:TIKTOK', name: 'TikTok for Business', nameAr: 'تيك توك للأعمال', patterns: [/tiktok/i], description: 'TikTok lead webhooks.' },
  { key: 'EXT:TAQNYAT', name: 'Taqnyat SMS', nameAr: 'تقنيات SMS', patterns: [/taqnyat/i], description: 'SMS sending and delivery receipts.' },
  { key: 'EXT:AUTHENTICA', name: 'Authentica OTP', nameAr: 'Authentica', patterns: [/authentica/i], description: 'OTP delivery provider.' },
  { key: 'EXT:EXPO-PUSH', name: 'Expo Push', nameAr: 'إشعارات Expo', patterns: [/exp\.host/i, /\bexpo push/i], description: 'Mobile push notification relay.' },
  { key: 'EXT:BROWSER-PUSH', name: 'Browser push services', nameAr: 'خدمات إشعارات المتصفح', patterns: [/push services/i, /web[\s-]*push/i, /\bVAPID\b/i, /fcm\.googleapis/i], description: 'Web Push endpoints operated by browser vendors.' },
  { key: 'EXT:REPLIT-OBJECT-STORAGE', name: 'Replit Object Storage', nameAr: 'تخزين كائنات Replit', family: 'storage', patterns: [/replit object storage/i, /sidecar/i, /object[\s-]*storage/i], description: 'Object storage reached through the Replit sidecar.' },
  { key: 'EXT:GCS', name: 'Google Cloud Storage', nameAr: 'Google Cloud Storage', family: 'storage', patterns: [/storage\.googleapis/i, /google cloud storage/i, /\bGCS\b/], description: 'Google Cloud Storage buckets accessed directly.' },
  { key: 'EXT:ASANA', name: 'Asana', nameAr: 'أسانا', patterns: [/asana/i], description: 'Task management API and webhooks.' },
  { key: 'EXT:OPENAI', name: 'OpenAI', nameAr: 'OpenAI', patterns: [/openai/i], description: 'LLM chat completions API.' },
  { key: 'EXT:TELEGRAM', name: 'Telegram Bot API', nameAr: 'تيليجرام', patterns: [/telegram/i], description: 'Bot notifications API.' },
  { key: 'EXT:UNSPLASH', name: 'Unsplash', nameAr: 'Unsplash', patterns: [/unsplash/i], description: 'Static stock images loaded by browsers.' },
  { key: 'EXT:EJAR', name: 'Ejar', nameAr: 'إيجار', patterns: [/\bejar\b/i], description: 'Saudi rental contracts platform.' },
];

// ---------------------------------------------------------------------------------------------
// Endpoint resolution
// ---------------------------------------------------------------------------------------------
export type Resolution =
  | { kind: 'system'; key: string; qualifier: 'browser' | 'server' | 'script' | null; rule: string }
  | { kind: 'unresolved'; cls: UnresolvedClass; candidates: string[]; rule: string };

const NEGATED_REGISTRY = /\b(?:not|no|never)\s+(?:a\s+|in\s+(?:the\s+)?|via\s+(?:the\s+)?|through\s+(?:the\s+)?)?(?:Asakin\s+)?registry(?:\s+app)?\b/gi;

type Match = { key: string; pos: number; external: boolean; family?: string };

const uniqKeys = (ms: { key: string }[]) => [...new Set(ms.map((m) => m.key))];

export function findMatches(textIn: string, selfAliases: RegExp[] = [], selfKey?: string, extra: CatalogEntry[] = []): Match[] {
  const t = textIn.replace(NEGATED_REGISTRY, ' ');
  const found = new Map<string, Match>();
  const add = (key: string, pos: number, external: boolean, family?: string) => {
    const prev = found.get(key);
    if (!prev || pos < prev.pos) found.set(key, { key, pos, external, ...(family ? { family } : {}) });
  };
  if (selfKey) for (const re of selfAliases) { const m = re.exec(t); if (m) add(selfKey, m.index, false); }
  for (const e of [...INTERNAL_PATTERNS, ...extra]) for (const re of e.patterns) { const m = re.exec(t); if (m) add(e.key, m.index, false); }
  for (const e of EXTERNAL_PROVIDERS) for (const re of e.patterns) { const m = re.exec(t); if (m) add(e.key, m.index, true, e.family); }
  let list = [...found.values()];
  // Family rule: Replit sidecar storage is backed by GCS; when both are named keep the Replit node.
  if (list.some((m) => m.key === 'EXT:REPLIT-OBJECT-STORAGE')) list = list.filter((m) => m.key !== 'EXT:GCS');
  // Browser push must not be read as the WEB app or the browser qualifier.
  return list.sort((a, b) => a.pos - b.pos || (a.key < b.key ? -1 : 1));
}

/**
 * Resolve an agent-written endpoint description ("Asakin Auth (issuer …)", "UNKNOWN callers", …).
 * Order of rules: R-UNKNOWN, R-ANY, R-OPERATOR, R-SCHEDULER, R-ENDUSER, R-INDIRECT, R-OR, R-SYSTEM(earliest match, self first on ties),
 * R-MULTI ("A and B"), R-BROWSER (qualifier), R-SELF-GENERIC, R-UNRECOGNIZED.
 */
export function resolveEndpoint(raw: string | null, reporterKey: string, selfAliases: RegExp[], extra: CatalogEntry[] = []): Resolution | null {
  if (raw === null) return null;
  const primary = raw.split(/->|→/)[0]!.trim();
  const t = primary;
  const matches = () => findMatches(t, selfAliases, reporterKey, extra);

  if (/^\s*(?:UNKNOWN|unknown)\b/.test(t) || /^\s*none\b/i.test(t) && !/file/i.test(t)) {
    const cands = matches().filter((m) => m.key !== reporterKey).map((m) => m.key);
    if (/\bany\b|grant|registered|callers?\b/i.test(t)) return { kind: 'unresolved', cls: 'any_granted_caller', candidates: cands, rule: 'R-ANY' };
    return { kind: 'unresolved', cls: 'unknown', candidates: cands, rule: 'R-UNKNOWN' };
  }
  if (/^\s*any\b|registered application|destination application|calling asakin app|consumer or browser|caller-chosen|any registry|any asakin|registry-authori[sz]ed asakin caller/i.test(t)) {
    return { kind: 'unresolved', cls: 'any_granted_caller', candidates: [], rule: 'R-ANY' };
  }
  if (/operator/i.test(t)) return { kind: 'unresolved', cls: 'operator', candidates: [], rule: 'R-OPERATOR' };
  if (/scheduler|scheduled deployment|\bcron\b/i.test(t)) return { kind: 'unresolved', cls: 'scheduler', candidates: [], rule: 'R-SCHEDULER' };
  if (/end user|file output|file download/i.test(t)) return { kind: 'unresolved', cls: 'end_user', candidates: [], rule: 'R-ENDUSER' };
  if (/wa\.me|instagram/i.test(t)) return { kind: 'unresolved', cls: 'navigation_link', candidates: [], rule: 'R-NAVIGATION' };
  if (/\b(?:via|behind|through)\s+(?:the\s+)?chat\s*center/i.test(t)) {
    return { kind: 'unresolved', cls: 'indirect_dependency', candidates: [], rule: 'R-INDIRECT' };
  }
  const ms = matches();
  const others = uniqKeys(ms.filter((m) => m.key !== reporterKey));
  if (ms.length && ((/\bor\b/i.test(t) && (others.length >= 2 || /unknown|\bany\b|monitor|reader/i.test(t))) || /monitor|platform,|operators/i.test(t))) {
    return { kind: 'unresolved', cls: 'unknown', candidates: ms.map((m) => m.key).filter((k) => k !== reporterKey), rule: 'R-OR' };
  }
  const browser = /\bbrowser\b|end-user/i.test(t) && !ms.some((m) => m.key === 'EXT:BROWSER-PUSH');
  if (ms.length) {
    const distinctInternal = ms.filter((m) => !m.external && m.key !== reporterKey);
    if (distinctInternal.length >= 2 && /\band\b|&|\+/.test(t)) {
      return { kind: 'unresolved', cls: 'multiple_systems', candidates: distinctInternal.map((m) => m.key), rule: 'R-MULTI' };
    }
    const first = ms[0]!;
    return { kind: 'system', key: first.key, qualifier: browser ? 'browser' : /script/i.test(t) ? 'script' : null, rule: first.key === reporterKey ? 'R-SELF' : 'R-SYSTEM' };
  }
  if (browser) return { kind: 'system', key: reporterKey, qualifier: 'browser', rule: 'R-BROWSER-OF-REPORTER' };
  if (/\bapi-server\b|artifacts\/|\bthis app\b|^app\./i.test(t)) return { kind: 'system', key: reporterKey, qualifier: 'server', rule: 'R-SELF-GENERIC' };
  return { kind: 'unresolved', cls: 'unrecognized', candidates: [], rule: 'R-UNRECOGNIZED' };
}

// ---------------------------------------------------------------------------------------------
// Direction: request initiator vs data direction (PRD §7.2: producer -> consumer; initiator independent)
// ---------------------------------------------------------------------------------------------
export type DirectionOut = { initiator: 'reporter' | 'other' | 'unknown'; data: 'reporter_to_other' | 'other_to_reporter' | 'bidirectional' | 'unknown'; rule: string };

const WRITE = /^(POST|PUT|PATCH|DELETE)$/;
export function classifyMethods(methods: string[]): 'read' | 'write' | 'mixed' | 'none' {
  const ms = methods.flatMap((m) => m.toUpperCase().split(/[|/,\s]+/)).filter((m) => /^(GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(m));
  if (!ms.length) return 'none';
  const w = ms.some((m) => WRITE.test(m)); const r = ms.some((m) => m === 'GET' || m === 'HEAD');
  return w && r ? 'mixed' : w ? 'write' : 'read';
}

/**
 * Reporter-relative direction rules (D1…D9), applied in order on the raw direction text,
 * the HTTP methods documented for the claim, and the mechanism kind.
 */
export function directionRules(rawDir: string | null, methods: string[], mech: MechanismKind): DirectionOut {
  const d = (rawDir ?? '').toLowerCase();
  const m = classifyMethods(methods);
  if (/pulled by/.test(d)) return { initiator: 'other', data: 'reporter_to_other', rule: 'D1-pulled-by-consumer' };
  if (/outbound request.*inbound data|request out.*data in|inbound data|\bpulls?\b|\bpull\b|data flows in|fetched by/.test(d)) {
    return { initiator: 'reporter', data: 'other_to_reporter', rule: 'D2-reporter-pulls' };
  }
  if (/internal|^local|intra/.test(d)) return { initiator: 'unknown', data: 'unknown', rule: 'D0-internal' };
  if (/bidirectional|both ways|read and write|\binbound\b.*\boutbound\b|\boutbound\b.*\binbound\b/.test(d) || d.includes('<->')) {
    return { initiator: mech === 'sso_oidc' ? 'reporter' : 'unknown', data: 'bidirectional', rule: 'D3-bidirectional' };
  }
  if (/inbound|incoming/.test(d)) {
    if (/push/.test(d) || mech === 'webhook' || mech === 'oidc_backchannel') return { initiator: 'other', data: 'other_to_reporter', rule: 'D4-inbound-push' };
    if (m === 'read') return { initiator: 'other', data: 'reporter_to_other', rule: 'D5-inbound-read-surface' };
    if (m === 'write') return { initiator: 'other', data: 'other_to_reporter', rule: 'D5-inbound-write' };
    if (m === 'mixed') return { initiator: 'other', data: 'bidirectional', rule: 'D5-inbound-mixed' };
    return { initiator: 'other', data: 'unknown', rule: 'D5-inbound-no-method' };
  }
  if (/outbound|out\b|browser|navigation| to /.test(d)) {
    if (/redirect|navigation/.test(d) && m === 'none') return { initiator: 'reporter', data: 'unknown', rule: 'D6-redirect' };
    if (m === 'read') return { initiator: 'reporter', data: 'other_to_reporter', rule: 'D7-outbound-get' };
    if (m === 'write') return { initiator: 'reporter', data: 'reporter_to_other', rule: 'D7-outbound-write' };
    if (m === 'mixed') return { initiator: 'reporter', data: 'bidirectional', rule: 'D7-outbound-mixed' };
    if (mech === 'browser_asset') return { initiator: 'reporter', data: 'other_to_reporter', rule: 'D8-asset-download' };
    if (mech === 'webhook' || mech === 'file_export') return { initiator: 'reporter', data: 'reporter_to_other', rule: 'D8-outbound-push' };
    return { initiator: 'reporter', data: 'unknown', rule: 'D8-outbound-no-method' };
  }
  return { initiator: 'unknown', data: 'unknown', rule: 'D9-undocumented' };
}

// ---------------------------------------------------------------------------------------------
// Mechanism
// ---------------------------------------------------------------------------------------------
export function mechanismRule(raw: string, ctx: { targetIsRegistry: boolean; registryAssisted: boolean; name: string }): { kind: MechanismKind; rule: string } {
  const t = `${raw} ${ctx.name}`;
  if (/back-?channel|logout\+jwt|logout[_ ]token/i.test(t)) return { kind: 'oidc_backchannel', rule: 'M1-backchannel' };
  if (/\bOIDC\b|\bSSO\b|openid|end_session|authorization code|PKCE/i.test(t)) return { kind: 'sso_oidc', rule: 'M2-oidc' };
  if (ctx.targetIsRegistry) return { kind: 'registry_call', rule: 'M3-call-to-registry' };
  if (/hyperlink|anchor link|browser navigation|catalog-linkout|\blink-out\b/i.test(t)) return { kind: 'navigation_link', rule: 'M4-navigation' };
  if (/stylesheet|font|static asset|link tags|preconnect/i.test(t)) return { kind: 'browser_asset', rule: 'M5-browser-asset' };
  if (/webhook|signed .*post|inbound push/i.test(t)) return { kind: 'webhook', rule: 'M6-webhook' };
  if (ctx.registryAssisted || /AsakinTiny|@asakin\/tiny|\bTiny\b|Registry JWT|Registry-issued|Registry-assisted/i.test(t)) return { kind: 'registry_assisted_api', rule: 'M7-registry-assisted' };
  if (/\bfile\b|xlsx|excel|download/i.test(t) && !/https?/i.test(raw)) return { kind: 'file_export', rule: 'M8-file' };
  if (/\bscript\b|one-?off|one-?time|migration/i.test(t)) return { kind: 'script', rule: 'M9-script' };
  if (/manual entry|human decision|by manual/i.test(t)) return { kind: 'manual', rule: 'M10-manual' };
  if (/object storage|sidecar|signed url|GCS client/i.test(t)) return { kind: 'object_storage', rule: 'M11-object-storage' };
  if (/\bSDK\b|openai package|connector/i.test(t) && !/https/i.test(raw)) return { kind: 'sdk_call', rule: 'M12-sdk' };
  if (/REST|HTTP|HTTPS|\bAPI\b|fetch|node:https|axios|\bGET\b|\bPOST\b|\bPUT\b|Web Push|JSON/i.test(t)) return { kind: 'rest_api', rule: 'M13-api' };
  if (/storage\.get|internal|local/i.test(t)) return { kind: 'internal', rule: 'M14-internal' };
  return { kind: 'unknown', rule: 'M0-undocumented' };
}

// ---------------------------------------------------------------------------------------------
// Evidence levels (agent claims). DOCUMENTED_ONLY/user-reported -> reported, INFERRED -> proposed.
// When the agent qualifies a multi-level claim (e.g. "health: PRODUCTION_VERIFIED; v2 routes: CODE_OBSERVED")
// the conservative (lowest) level is used; raw text is always retained.
// ---------------------------------------------------------------------------------------------
const LEVEL_TOKENS: [RegExp, EvidenceLevel][] = [
  [/PRODUCTION_VERIFIED/i, 'production_verified'],
  [/RUNTIME_VERIFIED/i, 'runtime_verified'],
  [/TEST_VERIFIED/i, 'test_verified'],
  [/CODE_OBSERVED/i, 'code_observed'],
  [/DOCUMENTED_ONLY|user-reported|confirmed by the owner/i, 'reported'],
  [/INFERRED/i, 'proposed'],
];
const RANK: Record<EvidenceLevel, number> = { unknown: 0, proposed: 1, reported: 2, code_observed: 3, test_verified: 4, runtime_verified: 5, production_verified: 6 };

export function evidenceLevels(raw: string | null): { level: EvidenceLevel; claimed: EvidenceLevel[]; rule: string } {
  if (!raw) return { level: 'unknown', claimed: [], rule: 'E0-none' };
  const claimed = LEVEL_TOKENS.filter(([re]) => re.test(raw)).map(([, l]) => l);
  if (!claimed.length) return { level: 'unknown', claimed: [], rule: 'E0-no-level-token' };
  const sorted = [...claimed].sort((a, b) => RANK[a] - RANK[b]);
  if (claimed.length > 1 && /[:;]|\bfor\b|only|partial|indirect|not re-?run|earlier|synthetic|mock/i.test(raw)) {
    return { level: sorted[0]!, claimed: sorted, rule: 'E2-qualified-min' };
  }
  return { level: sorted[sorted.length - 1]!, claimed: sorted, rule: 'E1-max-claimed' };
}

export function levelFromSingle(raw: string | null): EvidenceLevel {
  return evidenceLevels(raw).level;
}

// ---------------------------------------------------------------------------------------------
// Deployment status of a claim (documentation state, never live health)
// ---------------------------------------------------------------------------------------------
export function deploymentRule(raw: string): 'active' | 'disabled' | 'unused' | 'legacy' | 'one_off' | 'unknown' {
  if (/\bunused\b|no call sites|not wired|placeholder|dormant|not imported|CODE_ONLY|no runtime evidence of use/i.test(raw)) return 'unused';
  if (/disabled|not active|NOT_CONFIGURED|switched off|flag (?:is )?off|rollback path|reachable only/i.test(raw)) return 'disabled';
  if (/one[- ]?(?:time|off)|ONE_TIME|COMPLETED_ONE_OFF/i.test(raw)) return 'one_off';
  if (/legacy|historical|deprecated/i.test(raw)) return 'legacy';
  if (/active|implemented|wired|enabled|ACTIVE_CODE/i.test(raw)) return 'active';
  return 'unknown';
}

export function triggerRule(raw: string): 'scheduled' | 'event' | 'on_demand' | 'manual' | 'startup' | 'unknown' {
  if (/every\b|interval|\bcron\b|daily|hourly|scheduled|schedule|\d+\s?min/i.test(raw)) return 'scheduled';
  if (/webhook|event|outbox|back-?channel|on (?:create|update|change|status)/i.test(raw)) return 'event';
  if (/on demand|request|navigation|page|user|login|sign-?in|click|form|submit|open/i.test(raw)) return 'on_demand';
  if (/manual|operator|script|admin action/i.test(raw)) return 'manual';
  if (/startup|boot/i.test(raw)) return 'startup';
  return 'unknown';
}

export function cardinalityRule(raw: string | null): Cardinality {
  if (!raw) return 'unknown';
  const t = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (/^1:1$|^1-1$|one-?to-?one|^1:0\.\.1$|^0\.\.1:1$/.test(t)) return '1:1';
  if (/^1:(n|m|many|\*|0\.\.n|0\.\.\*)$|one-?to-?many|^1-n$/.test(t)) return '1:N';
  if (/^(n|m|many|\*):1$|many-?to-?one|^n-1$/.test(t)) return 'N:1';
  if (/^(n|m|many|\*):(n|m|many|\*)$|many-?to-?many/.test(t)) return 'N:M';
  return 'unknown';
}

/** Domain taxonomy from agent category/purpose keywords (first match wins). */
export const DOMAIN_RULES: [string, RegExp][] = [
  ['communications', /chat|whatsapp|sms|communication|messag/i],
  ['property_management', /property management|tenant|owner|lease|leasing|renting|rental/i],
  ['investment', /invest|portfolio|opportunit/i],
  ['finance', /financ|budget|debt|cash|cost|calculator|feasib|treasury|payment|pricing/i],
  ['sales_marketing', /sales|crm|marketer|lead|listing|website|market|apartment/i],
  ['projects', /project|construction|off-?plan|media|report/i],
  ['internal_tools', /documentation|calendar|directory|portal|design system|management|contract|knowledge|employee|launcher/i],
];

export function normalizePath(p: string): string | null {
  const m = /(\/[A-Za-z0-9_\-:{}.<>*/[\]]+)/.exec(p.replace(/https?:\/\/[^/\s]+/g, '').replace(/\{[^}]*(?:base|url|registry|issuer)[^}]*\}/gi, ''));
  if (!m) return null;
  let s = m[1]!.split('?')[0]!;
  s = s.replace(/\/:[A-Za-z0-9_]+/g, '/:p').replace(/\/\{[^}]+\}/g, '/:p').replace(/\/<[^>]+>/g, '/:p').replace(/\*[A-Za-z]*/g, '*');
  s = s.toLowerCase().replace(/\/+$/, '');
  return s.length > 1 ? s : null;
}
