/**
 * Acceptance 2, 3, 4, 10 against the REAL audit archive (skipped when the private archive is absent).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { archivePath, importReal } from './helpers.ts';
import { validateDataset } from '../shared/validate.ts';
import { buildIndex } from '../shared/graph.ts';
import { buildModel, buildThreads, LANES } from '../shared/atlas.ts';
import { CANONICAL_DIR, readDatasetDir, readDecisions } from '../scripts/lib/io.ts';
import { safeJsonParse } from '../scripts/lib/zip.ts';

const hasArchive = !!archivePath();

describe.skipIf(!hasArchive)('real archive import', async () => {
  const out = hasArchive ? await importReal(readDecisions()) : null!;
  const d = out?.dataset;
  // The same archive with NO human decisions: the importer itself must preserve every source row.
  const full = hasArchive ? (await importReal()).dataset : null!;

  it('validates strictly', () => {
    const v = validateDataset(d);
    expect(v.ok ? [] : v.issues.slice(0, 5)).toEqual([]);
  });

  it('acceptance 2: all 31 audited systems keep their original identity', () => {
    const audited = d.systems.filter((s) => s.coverage !== 'not_audited');
    expect(audited).toHaveLength(31);
    for (const s of audited) expect(s.codes.find((c) => c.namespace === 'audit')?.value).toBe(s.key);
    expect(new Set(d.systems.map((s) => s.id)).size).toBe(d.systems.length);
    // distinct apps with similar names are not merged
    expect(d.systems.some((s) => s.key === 'MARKETERS') && d.systems.some((s) => s.key === 'MARKETERS-LEGACY')).toBe(true);
    expect(d.systems.some((s) => s.key === 'AOP') && d.systems.some((s) => s.key === 'AOPP')).toBe(true);
    expect(d.systems.some((s) => s.key === 'PCC') && d.systems.some((s) => s.key === 'PPC')).toBe(true);
  });

  it('blocked and registry-only systems are honest provisional nodes', () => {
    for (const k of ['PAYMENTS', 'ASAKIN-AUTH', 'ASAKIN-REGISTRY']) {
      const s = d.systems.find((x) => x.key === k)!;
      expect(s.coverage).toBe('not_audited');
      expect(s.coverageReason).toMatch(/^blocked_/);
    }
    expect(d.systems.find((x) => x.key === 'CHAT-CENTER')!.coverage).toBe('partial');
    expect(d.systems.find((x) => x.key === 'PPC')!.coverageReason).toBe('registry_only');
  });

  it('isolated systems still render', () => {
    const idx = buildIndex(d);
    const m = buildModel(d, idx);
    expect(m.lane.get(idx.systemByKey.get('SYS-DESIGN-SYSTEM')!.id)).toBe('business');
    expect(m.lane.get(idx.systemByKey.get('PAYMENTS')!.id)).toBe('finance');
    expect(m.lane.size).toBe(d.systems.length);
    expect(new Set(m.mono.values()).size).toBe(d.systems.length);
    for (const l of LANES) expect([...m.lane.values()]).toContain(l.id);
    const threaded = new Set(buildThreads(m).flatMap((t) => t.intIds));
    for (const x of d.integrations.filter((i) => i.scope === 'inter_system' && i.source.systemId !== i.target.systemId)) expect(threaded.has(x.id)).toBe(true);
  });

  it('acceptance 3: all 263 claims are traceable to raw evidence and none is dropped by grouping', () => {
    const raw = (safeJsonParse(readArchiveMember('consolidated-integrations.json')) as { integrations: unknown[] }).integrations;
    expect(raw).toHaveLength(263);
    expect(full.integrations).toHaveLength(263);
    for (const x of full.integrations) {
      expect(x.provenance[0]!.member).toMatch(/consolidated-integrations\.json$/);
      expect(x.evidenceIds.length).toBeGreaterThan(0);
    }
    const inChannels = new Set(d.channels.flatMap((c) => c.claimIds));
    for (const x of d.integrations.filter((i) => i.scope === 'inter_system')) expect(inChannels.has(x.id)).toBe(true);
    // grouping never invents a reverse flow: every flow direction is backed by a claim with that direction
    const idx = buildIndex(d);
    for (const f of d.flows) {
      const backed = f.claimIds.some((cid) => {
        const x = idx.integrations.get(cid)!;
        if (x.direction.data === 'bidirectional') return true;
        const prod = x.direction.data === 'source_to_target' ? x.source.systemId : x.direction.data === 'target_to_source' ? x.target.systemId : null;
        return prod === f.producerSystemId;
      });
      expect(backed).toBe(true);
    }
  });

  it('acceptance 4: all 1,290 mapping rows accounted for, with exact unresolved classes', () => {
    expect(full.fieldMappings).toHaveLength(1290);
    const c = (s: string) => full.fieldMappings.filter((m) => m.link.status === s).length;
    expect(c('matched')).toBe(876);
    expect(c('missing_integration_id')).toBe(223);
    expect(c('token_reference') + c('multi_integration') + c('unmatched_reference')).toBe(191);
    expect(full.fieldMappings.filter((m) => m.link.status !== 'matched')).toHaveLength(1290 - 876);
  });

  it('reviewed system exclusions are exact, traceable and leave no dangling references', () => {
    const k = d.meta.counts;
    expect(d.integrations.length + (k['excluded.integrations'] ?? 0)).toBe(263);
    expect(d.fieldMappings.length + (k['excluded.fieldMappings'] ?? 0)).toBe(1290);
    expect(d.systems.length + (k['excluded.systems'] ?? 0)).toBe(full.systems.length);
    const keys = new Set(d.systems.map((s) => s.key));
    for (const dec of readDecisions().filter((x) => x.subjectType === 'system')) expect(keys.has(dec.subjectKey)).toBe(false);
    const gone = new Set(full.systems.filter((s) => !keys.has(s.key)).map((s) => s.id));
    for (const x of d.integrations) for (const id of [x.source.systemId, x.target.systemId, ...x.sdkSystemIds]) expect(id && gone.has(id)).toBeFalsy();
    expect(d.meta.notes.join(' ')).toMatch(/Excluded from the map by reviewed decision/);
    // DEC-008: WEB is shown as «الموقع العام»; the archive name stays searchable
    const web = d.systems.find((s) => s.key === 'WEB')!;
    expect(web.displayName).toBe('الموقع العام');
    expect(web.aliases).toContain(full.systems.find((s) => s.key === 'WEB')!.displayName);
    expect(web.id).toBe(full.systems.find((s) => s.key === 'WEB')!.id);
    expect(out.missingMappingLinks).toHaveLength(d.fieldMappings.filter((m) => m.link.status !== 'matched').length);
  });

  it('agent-reported levels are never promoted', () => {
    expect(d.integrations.every((x) => x.evidence.basis === 'agent_reported')).toBe(true);
    for (const x of d.integrations.filter((i) => i.evidence.level === 'production_verified')) expect(x.evidence.levelsClaimed).toContain('production_verified');
  });

  it('no manufactured UNKNOWN / ANY / browser / scheduler nodes', () => {
    expect(d.systems.filter((s) => s.layer === 'internal' && /UNKNOWN|ANY-GRANTED|browser|scheduler|operator/i.test(s.key)).map((s) => s.key)).toEqual([]);
    expect(d.systems.filter((s) => /^(UNKNOWN|ANY|BROWSER|SCHEDULER)$/i.test(s.key.replace(/^EXT:/, ''))).map((s) => s.key)).toEqual([]);
  });

  it('acceptance 10: importing the unchanged archive twice yields identical output', async () => {
    const again = await importReal(readDecisions());
    expect(JSON.stringify(again.dataset)).toBe(JSON.stringify(d));
  });

  it('the committed canonical snapshot equals a fresh import (no unreviewed drift)', () => {
    const canonical = readDatasetDir(CANONICAL_DIR);
    expect(JSON.stringify(canonical)).toBe(JSON.stringify(JSON.parse(JSON.stringify(d))));
  });

  it('confidential and secret material is absent', () => {
    const s = JSON.stringify(d);
    expect(s).not.toMatch(/CONFIDENTIAL-risk|risk-triage|D-07|D-20/i);
    expect(s).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
  });
});

function readArchiveMember(name: string): string {
  // re-read through the same safe reader used by the importer
  const p = archivePath()!;
  const buf = readFileSync(p);
  const idx = buf.indexOf(Buffer.from(name));
  expect(idx).toBeGreaterThan(0);
  return syncRead(name);
}
let cache: Map<string, Buffer> | null = null;
function syncRead(name: string): string {
  if (!cache) throw new Error('cache not ready');
  for (const [k, v] of cache) if (k.endsWith(name)) return v.toString('utf8');
  throw new Error(`missing ${name}`);
}
if (hasArchive) {
  const { readZip } = await import('../scripts/lib/zip.ts');
  const { allowMember } = await import('../scripts/lib/importer.ts');
  cache = (await readZip(readFileSync(archivePath()!), allowMember)).files;
}
