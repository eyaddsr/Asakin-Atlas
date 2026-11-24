/** PRD §12 verification scenarios + brief acceptance 5–11 on a synthetic fixture archive. */
import { describe, expect, it } from 'vitest';
import { buildIndex, tooltipWords, isolationLabel } from '../shared/graph.ts';
import { search } from '../shared/analysis.ts';
import { buildModel, buildThreads, impactRings, lensFor, lineage, systemStats } from '../shared/atlas.ts';
import { validateDataset } from '../shared/validate.ts';
import { WITHHELD } from '../shared/sensitive.ts';
import { importFixture } from './fixture.ts';

const out = importFixture();
const d = out.dataset;
const idx = buildIndex(d);
const model = buildModel(d, idx);
const S = (key: string) => idx.systemByKey.get(key)!;
const claim = (rep: string, id: string) => d.integrations.find((x) => x.reportedBySystemId === S(rep).id && x.agentIntegrationId === id)!;

describe('fixture import', () => {
  it('produces a valid dataset', () => {
    const v = validateDataset(d);
    expect(v.ok ? [] : v.issues).toEqual([]);
  });
});

describe('PRD scenario 1 / acceptance 7: three channels with mixed directions between one pair', () => {
  const pairInts = d.integrations.filter((x) => [x.source.systemId, x.target.systemId].includes(S('PROV').id) && [x.source.systemId, x.target.systemId].includes(S('CONS').id));
  const threads = buildThreads(model).filter((t) => [t.from, t.to].includes(S('PROV').id) && [t.from, t.to].includes(S('CONS').id));
  it('the atlas draws at most one thread per caller → callee orientation', () => {
    expect(threads.map((t) => t.id).sort()).toEqual([S('CONS').id + '>' + S('PROV').id, S('PROV').id + '>' + S('CONS').id].sort());
    expect(threads.every((t) => t.reciprocal)).toBe(true);
  });
  it('keeps every claim inside the threads (none dropped by grouping)', () => {
    expect(threads.flatMap((t) => t.intIds).sort()).toEqual(pairInts.map((x) => x.id).sort());
  });
  it('keeps three independently inspectable channels', () => {
    expect(new Set(pairInts.map((x) => x.channelId)).size).toBe(3);
  });
  it('never turns opposite directions into a single bidirectional flow (lens keeps per-claim direction)', () => {
    const lens = lensFor(model, S('CONS').id);
    const rows = [...lens.incoming, ...lens.outgoing].filter((r) => r.other === S('PROV').id);
    const ids = (side: 'in' | 'out') => rows.filter((r) => r.side === side).map((r) => r.x.agentIntegrationId).sort();
    expect(ids('in')).toEqual(['INT-1', 'INT-1', 'INT-9']);   // PROV → CONS data (pull + webhook)
    expect(ids('out')).toEqual(['INT-2']);                     // CONS → PROV write
    expect(rows.every((r) => !(r.fwd && r.back))).toBe(true);
  });
});

describe('PRD scenario 4 / acceptance 6: consumer-initiated GET', () => {
  const x = claim('CONS', 'INT-1');
  it('data flows producer PROV -> consumer CONS', () => {
    expect(x.source.systemId).toBe(S('CONS').id);
    expect(x.direction.data).toBe('target_to_source');
  });
  it('request initiator retained separately (CONS)', () => expect(x.direction.requestInitiator).toBe('source'));
  it('the flow record has producer PROV, consumer CONS, initiator CONS', () => {
    const f = d.flows.find((fl) => fl.channelId === x.channelId)!;
    expect([f.producerSystemId, f.consumerSystemId, f.requestInitiatorSystemId]).toEqual([S('PROV').id, S('CONS').id, S('CONS').id]);
  });
  it('Registry token endpoint does not turn the GET into a write', () => expect(x.direction.rule).toBe('D7-outbound-get'));
});

describe('two-sided reconciliation preserves both claims', () => {
  it('matches CONS::INT-1 with PROV::INT-1 by endpoint path', () => {
    const a = claim('CONS', 'INT-1'); const b = claim('PROV', 'INT-1');
    expect(a.channelId).toBe(b.channelId);
    expect(a.corroboration.state).toBe('two_sided');
    expect(idx.channels.get(a.channelId!)!.claimIds).toHaveLength(2);
  });
  it('keeps one-sided claims one-sided', () => expect(claim('CONS', 'INT-2').corroboration.state).toBe('one_sided'));
});

describe('PRD scenario 2 / acceptance 5: Registry lookup is not a transport hop', () => {
  const reg = S('ASAKIN-REGISTRY').id;
  it('the Registry-assisted exchange is drawn between the two apps, never through the Registry', () => {
    const x = claim('CONS', 'INT-1');
    const ts = buildThreads(model).filter((th) => th.intIds.includes(x.id));
    expect(ts).toHaveLength(1);
    expect([ts[0]!.from, ts[0]!.to]).toEqual([S('CONS').id, S('PROV').id]);
    expect(x.registryRole.discovery).toBe('yes');
  });
  it('a real call to the Registry (key fetch) is its own thread', () => {
    const t = buildThreads(model).find((th) => th.intIds.includes(claim('CONS', 'INT-KEY').id))!;
    expect(t.to).toBe(reg);
  });
  it('no data flow routes through the Registry for the CONS<->PROV exchange', () => {
    const viaRegistry = d.flows.filter((f) => (f.producerSystemId === reg || f.consumerSystemId === reg) && f.claimIds.some((c) => idx.integrations.get(c)!.agentIntegrationId === 'INT-1'));
    expect(viaRegistry).toEqual([]);
    expect(claim('CONS', 'INT-1').registryRole.dataTransfer).toBe('no');
  });
  it('grant status comes from Registry configuration, separately from traffic', () => expect(claim('CONS', 'INT-1').registryGrant.status).toBe('active'));
});

describe('PRD scenario 3 / acceptance 8: entity cardinality is not app connectivity', () => {
  it('projects 1:N units stays 1:N although the pair is a single logical link', () => {
    const rel = d.entityMappings.find((e) => e.kind === 'record_relationship' && e.sourceEntity === 'projects')!;
    expect(rel.cardinality).toBe('1:N');
    expect(buildThreads(model).filter((t) => t.from === S('CONS').id && t.to === S('PROV').id)).toHaveLength(1);
  });
  it('flow entities default to unknown cardinality, never derived from edge counts', () => {
    expect(d.entityMappings.filter((e) => e.kind === 'flow_entity').every((e) => e.cardinality === 'unknown')).toBe(true);
  });
});

describe('PRD scenario 5 / acceptance 9: contradictory field claims become review items', () => {
  it('unitStatus type disagreement -> field_contract_mismatch conflict, status conflict', () => {
    const c = d.conflicts.find((x) => x.kind === 'field_contract_mismatch')!;
    expect(c.summary).toContain('unitStatus');
    expect(c.status).toBe('conflict');
    expect(c.claims.map((cl) => cl.statement)).toEqual(expect.arrayContaining([expect.stringContaining('string'), expect.stringContaining('integer')]));
  });
  it('both mappings are kept unchanged (no merge, no overwrite)', () => {
    const prov = d.fieldMappings.find((m) => m.reportedBySystemId === S('PROV').id && m.agentMappingId === 'M-1')!;
    const cons = d.fieldMappings.find((m) => m.reportedBySystemId === S('CONS').id && m.agentMappingId === 'M-1')!;
    expect([prov.dataType, cons.dataType]).toEqual(['string', 'integer']);
  });
  it('a consumer field the producer never emits is queued for review', () => {
    expect(d.reviewQueue.some((r) => r.kind === 'field_not_found_on_counterpart' && r.note.includes('projectRef'))).toBe(true);
  });
});

describe('PRD scenario 6 / acceptance 11: unknown field path stays unknown', () => {
  it('destinationPath null is preserved (not copied from source)', () => {
    const m = d.fieldMappings.find((x) => x.reportedBySystemId === S('CONS').id && x.agentMappingId === 'M-3')!;
    expect(m.destinationPath).toBeNull();
    expect(m.sourcePath).toBe('id');
  });
  it('tooltip text is at most 20 words', () => {
    for (const s of d.systems) expect(tooltipWords(s).split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(20);
  });
});

describe('mapping link classes (acceptance 4)', () => {
  const by = (id: string) => d.fieldMappings.find((m) => m.reportedBySystemId === S('CONS').id && m.agentMappingId === id)!;
  it('classifies every row', () => {
    expect(by('M-1').link.status).toBe('matched');
    expect(by('M-4').link.status).toBe('missing_integration_id');
    expect(by('M-5').link.status).toBe('multi_integration');
    expect(by('M-6').link.status).toBe('unmatched_reference');
    expect(by('M-7').link.status).toBe('token_reference');
  });
  it('non-matched rows are in the missing-mapping-links queue and never confirmed', () => {
    const ids = new Set(out.missingMappingLinks.map((m) => m.id));
    for (const m of d.fieldMappings) expect(ids.has(m.id)).toBe(m.link.status !== 'matched');
    for (const m of d.fieldMappings.filter((x) => x.link.status !== 'matched')) expect(m.reviewStatus).toBe('needs_review');
  });
});

describe('PRD scenario 7: isolated / not-audited language', () => {
  it('registry-only system is provisional and labelled «لم يُفحص بعد»', () => {
    const ghost = S('GHOST');
    expect(ghost.coverage).toBe('not_audited');
    expect(isolationLabel(ghost, false)).toBe('لم يُفحص بعد');
  });
  it('audited system without edges says «لا توجد اتصالات موثقة», never "no integrations"', () => {
    expect(isolationLabel(S('PROV'), false)).toBe('لا توجد اتصالات موثقة');
  });
  it('inactive test records are not catalog nodes', () => expect(idx.systemByKey.has('TEST9')).toBe(false));
});

describe('untrusted input handling', () => {
  it('secret-like and security-finding text is withheld', () => {
    expect(claim('PROV', 'INT-SURF').auth).toBe(WITHHELD);
    const m = d.fieldMappings.find((x) => x.agentMappingId === 'M-7')!;
    expect(m.transformation).toBe(WITHHELD);
    expect(JSON.stringify(d)).not.toContain('hunter2');
    expect(JSON.stringify(d)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });
  it('agent questions mentioning default passwords are not exposed', () => {
    expect(S('PROV').openQuestions).toEqual(['Which apps call this?']);
  });
  it('does not invent nodes for unknown callers', () => {
    expect(d.systems.some((s) => /unknown|any-granted|browser|scheduler/i.test(s.key))).toBe(false);
    expect(claim('PROV', 'INT-SURF').source.unresolved?.class).toBe('any_granted_caller');
  });
});

describe('human-reviewed decisions survive re-import (acceptance 10)', () => {
  it('a conflict decision is applied and the import stays deterministic', () => {
    const conflict = d.conflicts[0]!;
    const decision = { id: 'DEC-001', subjectType: 'conflict' as const, subjectKey: conflict.id, decision: 'accepted' as const, rationale: 'confirmed with owners', reviewer: 'tech-lead', reviewedAt: '2026-11-23' };
    const a = importFixture([decision]); const b = importFixture([decision]);
    expect(JSON.stringify(a.dataset)).toBe(JSON.stringify(b.dataset));
    const after = a.dataset.conflicts.find((c) => c.id === conflict.id)!;
    expect(after.status).toBe('accepted');
    expect(after.decisionId).toBe('DEC-001');
    expect(a.warnings).toEqual([]);
  });
  it('an endpoint decision resolves an unresolved caller without touching the source claim text', () => {
    const surf = claim('PROV', 'INT-SURF');
    const dec = { id: 'DEC-002', subjectType: 'endpoint' as const, subjectKey: `${surf.id}:source`, decision: 'set_system' as const, systemKey: 'CONS', rationale: 'caller confirmed', reviewer: 'tech-lead', reviewedAt: '2026-11-23' };
    const r = importFixture([dec]);
    const x = r.dataset.integrations.find((i) => i.id === surf.id)!;
    expect(x.source.systemId).toBe(S('CONS').id);
    expect(x.source.rule).toBe('REVIEWED:DEC-002');
    expect(x.source.raw).toBe(surf.source.raw);
  });
  it('a system exclusion removes the system and every claim touching it, consistently', () => {
    const dec = { id: 'DEC-010', subjectType: 'system' as const, subjectKey: 'ASAKIN-REGISTRY', decision: 'exclude' as const, rationale: 'out of scope', reviewer: 'tech-lead', reviewedAt: '2026-11-23' };
    const r = importFixture([dec]);
    const x = r.dataset;
    expect(x.systems.some((s) => s.key === 'ASAKIN-REGISTRY')).toBe(false);
    expect(x.integrations.some((i) => i.agentIntegrationId === 'INT-KEY')).toBe(false);
    expect(x.integrations.some((i) => i.agentIntegrationId === 'INT-1')).toBe(true); // Registry-assisted app-to-app claim stays
    expect(x.meta.counts['excluded.integrations']).toBe(1);
    expect(validateDataset(x).ok).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(JSON.stringify(importFixture([dec]).dataset)).toBe(JSON.stringify(x)); // deterministic
  });
  it('a system rename changes only the display name; id, key and resolution stay, old name becomes an alias', () => {
    const r = importFixture([{ id: 'DEC-012', subjectType: 'system', subjectKey: 'PROV', decision: 'rename', displayName: 'المزوّد', rationale: 'x', reviewer: 'y', reviewedAt: 'z' }]);
    const before = S('PROV');
    const after = r.dataset.systems.find((s) => s.key === 'PROV')!;
    expect([after.id, after.displayName]).toEqual([before.id, 'المزوّد']);
    expect(after.aliases).toContain(before.displayName);
    expect(r.dataset.integrations.map((x) => [x.source.systemId, x.target.systemId])).toEqual(d.integrations.map((x) => [x.source.systemId, x.target.systemId]));
    expect(r.warnings).toEqual([]);
  });
  it('an audited reporter cannot be excluded (warning, nothing removed)', () => {
    const r = importFixture([{ id: 'DEC-011', subjectType: 'system', subjectKey: 'CONS', decision: 'exclude', rationale: 'x', reviewer: 'y', reviewedAt: 'z' }]);
    expect(r.dataset.systems.some((s) => s.key === 'CONS')).toBe(true);
    expect(r.warnings.join(' ')).toContain('cannot be excluded');
  });
  it('stale decisions are reported, not silently dropped', () => {
    const r = importFixture([{ id: 'DEC-099', subjectType: 'conflict', subjectKey: 'cfl_000000000000', decision: 'rejected', rationale: 'x', reviewer: 'y', reviewedAt: 'z' }]);
    expect(r.warnings.join(' ')).toContain('DEC-099');
  });
});

describe('impact simulation (potential, design artboard 5)', () => {
  it('outage of PROV reaches CONS directly', () => {
    expect(impactRings(model, S('PROV').id, 'outage').ring1).toContain(S('CONS').id);
  });
  it('a data change reaches the consumers of PROV data only', () => {
    const r = impactRings(model, S('PROV').id, 'data');
    expect(r.ring1).toEqual([S('CONS').id]);
    expect(r.ring1Ints.every((x) => ['INT-1', 'INT-9'].includes(x.agentIntegrationId))).toBe(true);
  });
  it('an API change reaches the systems that call it', () => {
    expect(impactRings(model, S('PROV').id, 'api').ring1).toEqual([S('CONS').id]);
    expect(impactRings(model, S('CONS').id, 'api').ring1).toContain(S('PROV').id); // the webhook calls CONS
  });
});

describe('verification states never claim independent verification', () => {
  it('unresolved counterparts need verification', () => expect(model.verif.get(claim('PROV', 'INT-SURF').id)).toBe('needs_verification'));
  it('code-observed, resolved, directed claims are documented (agent-reported)', () => {
    expect(model.verif.get(claim('CONS', 'INT-2').id)).toBe('documented');
  });
  it('a claim inside an open field-contract conflict needs verification', () => {
    expect(model.verif.get(claim('CONS', 'INT-1').id)).toBe('needs_verification');
    expect(model.questions.get(claim('CONS', 'INT-1').id)?.some((q) => q.kind === 'conflict')).toBe(true);
  });
  it('a resolved claim without a documented data direction is partial', () => {
    const partial = d.integrations.filter((x) => model.verif.get(x.id) === 'partial');
    expect(partial.every((x) => x.direction.data === 'unknown' || x.evidence.level === 'reported' || (model.questions.get(x.id) ?? []).length > 0 || x.scope !== 'inter_system')).toBe(true);
  });
  it('system stats add up', () => {
    const st = systemStats(model, S('CONS').id);
    expect(st.incoming + st.outgoing).toBe(st.total);
    expect(st.counts.documented + st.counts.partial + st.counts.needs_verification).toBe(st.total);
  });
});

describe('field lineage', () => {
  it('is not drawn when the chain does not leave the pair', () => {
    const m = d.fieldMappings.find((x) => x.reportedBySystemId === S('PROV').id && x.agentMappingId === 'M-1')!;
    expect(lineage(model, m)).toBeNull();
  });
});

describe('search by name, code, entity and exact field path', () => {
  it('finds systems, entities and fields', () => {
    expect(search(d, idx, 'Consumer')[0]?.type).toBe('system');
    expect(search(d, idx, '/hooks/status').some((h) => h.type === 'integration')).toBe(true);
    expect(search(d, idx, 'projects').some((h) => h.type === 'entity')).toBe(true);
    expect(search(d, idx, 'local_units.unit_status').some((h) => h.type === 'field')).toBe(true);
  });
});
