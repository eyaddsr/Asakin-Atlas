/** View model for the approved design (shared/atlas.ts) and journey routing, on the real canonical snapshot. */
import { describe, expect, it } from 'vitest';
import { CANONICAL_DIR, readDatasetDir } from '../scripts/lib/io.ts';
import { buildIndex } from '../shared/graph.ts';
import {
  buildModel, buildThreads, fieldTags, impactRings, lensFor, lineage, monograms, orientation, tileName, verifCounts, VERIFS,
} from '../shared/atlas.ts';
import { formatHash, HOME, parseHash } from '../src/client/route.ts';
import { Dataset, type FieldMapping, type Integration } from '../shared/schema.ts';

const d = Dataset.parse(readDatasetDir(CANONICAL_DIR));
const idx = buildIndex(d);
const m = buildModel(d, idx);

describe('verification states', () => {
  it('every claim except negative findings gets exactly one state', () => {
    const c = verifCounts(m);
    expect(VERIFS.reduce((n, v) => n + c[v], 0)).toBe(d.integrations.filter((x) => x.scope !== 'negative_finding').length);
  });
  it('"documented" never rests on unknown/proposed evidence or an unresolved counterpart', () => {
    for (const x of d.integrations.filter((i) => m.verif.get(i.id) === 'documented')) {
      expect(['unknown', 'proposed', 'reported']).not.toContain(x.evidence.level);
      expect(x.source.systemId && x.target.systemId).toBeTruthy();
      expect(x.direction.data).not.toBe('unknown');
      expect(x.evidence.basis).toBe('agent_reported');
    }
  });
  it('unresolved claims always need verification', () => {
    for (const x of d.integrations.filter((i) => i.scope === 'unresolved')) expect(m.verif.get(x.id)).toBe('needs_verification');
  });
});

describe('orientation keeps the request initiator apart from the data direction', () => {
  const pull = { source: { systemId: 'sys_aaaaaaaaaaaa' }, target: { systemId: 'sys_bbbbbbbbbbbb' }, direction: { requestInitiator: 'source', data: 'target_to_source' } } as unknown as Integration;
  const push = { ...pull, direction: { requestInitiator: 'target', data: 'target_to_source' } } as unknown as Integration;
  const unknown = { ...pull, direction: { requestInitiator: 'unknown', data: 'unknown' } } as unknown as Integration;
  it('a consumer-initiated GET is drawn caller → callee with data coming back', () => {
    const o = orientation(pull);
    expect([o.from.systemId, o.to.systemId, o.fwd, o.back]).toEqual(['sys_aaaaaaaaaaaa', 'sys_bbbbbbbbbbbb', false, true]);
  });
  it('a provider push is drawn from the provider with data moving forward', () => {
    const o = orientation(push);
    expect([o.from.systemId, o.fwd, o.back]).toEqual(['sys_bbbbbbbbbbbb', true, false]);
  });
  it('unknown stays unknown (no beads, no invented initiator)', () => {
    const o = orientation(unknown);
    expect([o.initiatorKnown, o.fwd, o.back]).toEqual([false, false, false]);
  });
});

describe('no claim is dropped by the new views', () => {
  it('each system lens lists every claim touching it exactly once', () => {
    for (const s of d.systems) {
      const l = lensFor(m, s.id);
      const ids = [...l.incoming, ...l.outgoing].map((r) => r.x.id).concat(l.internal.map((x) => x.id), l.negative.map((x) => x.id));
      const touching = d.integrations.filter((x) => x.source.systemId === s.id || x.target.systemId === s.id).map((x) => x.id);
      expect(ids.sort()).toEqual([...new Set(touching)].sort());
    }
  });
  it('atlas threads contain every inter-system claim between two resolved systems', () => {
    const inThreads = buildThreads(m).flatMap((t) => t.intIds);
    expect(new Set(inThreads).size).toBe(inThreads.length);
    expect(inThreads.length).toBe(d.integrations.filter((x) => x.scope === 'inter_system' && x.source.systemId && x.target.systemId && x.source.systemId !== x.target.systemId).length);
  });
  it('every non-matched field mapping is reachable from its reporting system', () => {
    const unlinked = [...m.unlinked.values()].flat().length;
    expect(unlinked).toBe(d.fieldMappings.filter((f) => f.link.status !== 'matched').length);
  });
});

describe('impact rings', () => {
  it('ring 2 never repeats the changed system or ring 1', () => {
    for (const s of d.systems) for (const c of ['outage', 'data', 'api'] as const) {
      const r = impactRings(m, s.id, c);
      expect(r.ring1).not.toContain(s.id);
      expect(r.ring2.filter((x) => x === s.id || r.ring1.includes(x))).toEqual([]);
    }
  });
  it('data-change and api-change rings are subsets of the outage ring', () => {
    for (const s of d.systems) {
      const out = new Set(impactRings(m, s.id, 'outage').ring1);
      for (const c of ['data', 'api'] as const) for (const x of impactRings(m, s.id, c).ring1) expect(out.has(x)).toBe(true);
    }
  });
});

describe('fields and lineage', () => {
  const f = (o: Partial<FieldMapping>) => ({ required: null, sourcePath: null, destinationPath: null, link: { status: 'matched' }, withheldFields: [], ...o }) as FieldMapping;
  it('tags required, identifiers and probable personal data', () => {
    expect(fieldTags(f({ required: true, sourcePath: 'customer.mobile', destinationPath: 'lead.phone' }))).toEqual(['required', 'personal']);
    expect(fieldTags(f({ sourcePath: 'unit_id', destinationPath: 'unitId' }))).toEqual(['identifier']);
    expect(fieldTags(f({ sourcePath: 'x', link: { status: 'unmatched_reference' } as FieldMapping['link'] }))).toContain('uncertain_link');
  });
  it('lineage chains visit distinct systems and only matched mappings', () => {
    let chains = 0;
    for (const fm of d.fieldMappings) {
      const hops = lineage(m, fm);
      if (!hops) continue;
      chains++;
      expect(hops.length).toBeGreaterThanOrEqual(3);
      expect(new Set(hops.map((h) => h.systemId)).size).toBe(hops.length);
      for (const h of hops) if (h.mappingId) expect(d.fieldMappings.find((x) => x.id === h.mappingId)!.link.status).toBe('matched');
    }
    expect(chains).toBeGreaterThan(0);
  });
});

describe('labels', () => {
  it('monograms are unique and short', () => {
    const mono = monograms(d.systems);
    expect(new Set(mono.values()).size).toBe(d.systems.length);
    for (const v of mono.values()) expect(v.length).toBeLessThanOrEqual(4);
  });
  it('tile names drop only the shared Asakin prefix', () => {
    expect(tileName(idx.systemByKey.get('CHAT-CENTER')!)).toBe('Chat Center');
    expect(tileName(idx.systemByKey.get('APMP')!)).toBe('APMP');
  });
});

describe('journey routing', () => {
  it('round-trips every view with drawer state', () => {
    const r = { ...HOME, view: 'impact' as const, sys: 'sys_5a763eb212a5', change: 'api' as const, int: 'int_58e9a5439b38', tab: 'evidence' as const, map: 'map_0123456789ab' };
    expect(parseHash(formatHash(r))).toEqual({ ...r, unlinked: false });
    expect(parseHash('#/system/sys_5a763eb212a5?unlinked=1&map=map_0123456789ab')).toMatchObject({ view: 'lens', unlinked: true, map: 'map_0123456789ab' });
  });
  it('rejects anything that is not an opaque record id', () => {
    expect(parseHash('#/system/<script>')).toEqual(HOME);
    expect(parseHash('#/system/sys_5a763eb212a5?int=javascript:alert(1)').int).toBeNull();
    expect(parseHash('#/impact/sys_5a763eb212a5/drop-table').change).toBe('outage');
  });
});
