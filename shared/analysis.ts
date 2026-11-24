/**
 * Search (PRD §3.3) and field-path helpers. Impact rings live in `atlas.ts`.
 */
import type { Dataset, FieldMapping } from './schema.ts';
import type { Index } from './graph.ts';

export function fieldLeaf(p: string | null): string | null {
  if (!p) return null;
  const leaf = p.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/)[0]?.split(/[.:/]/).filter(Boolean).at(-1)?.replace(/\[\d*\]$/, '').replace(/[^A-Za-z0-9_]/g, '');
  return leaf && leaf.length >= 2 ? leaf : null;
}

export type SearchHit =
  | { type: 'system'; id: string; label: string; detail: string }
  | { type: 'integration'; id: string; label: string; detail: string; systemId: string }
  | { type: 'entity'; id: string; label: string; detail: string; systemId: string; integrationId: string | null }
  | { type: 'field'; id: string; label: string; detail: string; systemId: string; integrationId: string | null; mapping: FieldMapping };

const norm = (s: string) => s.toLowerCase().normalize('NFKC');

/** Search by system name/alias/code, integration name/purpose/endpoint, entity name or exact field path. */
export function search(d: Dataset, idx: Index, q: string, limit = 40): SearchHit[] {
  const query = norm(q.trim());
  if (query.length < 2) return [];
  const hits: SearchHit[] = [];
  const sysName = (id: string | null) => (id ? idx.systems.get(id)?.key ?? '' : '؟');
  for (const s of d.systems) {
    const hay = [s.displayName, s.key, s.agentName ?? '', ...s.aliases, ...s.codes.map((c) => c.value), s.domainName ?? ''];
    const hit = hay.find((h) => norm(h).includes(query));
    if (hit) hits.push({ type: 'system', id: s.id, label: s.displayName, detail: hit === s.displayName ? s.key : `${s.key} · ${hit}` });
  }
  for (const x of d.integrations) {
    if (x.scope === 'negative_finding') continue;
    const hay = [x.name ?? '', x.purpose ?? '', x.agentIntegrationId, ...x.endpoints.map((e) => e.path)];
    if (!hay.some((h) => norm(h).includes(query))) continue;
    hits.push({
      type: 'integration', id: x.id, label: x.name ?? x.purpose ?? x.agentIntegrationId,
      detail: `${sysName(x.source.systemId)} ← → ${sysName(x.target.systemId)} · ${x.agentIntegrationId}`, systemId: x.reportedBySystemId,
    });
  }
  const seenEnt = new Set<string>();
  for (const e of d.entityMappings) {
    for (const name of [e.sourceEntity, e.destinationEntity]) {
      if (!name || !norm(name).includes(query)) continue;
      const k = `${e.reportedBySystemId}|${name}`;
      if (seenEnt.has(k)) continue; seenEnt.add(k);
      hits.push({ type: 'entity', id: e.id, label: name, detail: idx.systems.get(e.reportedBySystemId)?.key ?? '', systemId: e.reportedBySystemId, integrationId: e.integrationIds[0] ?? null });
    }
  }
  for (const m of d.fieldMappings) {
    const p = [m.sourcePath, m.destinationPath].find((x) => x && norm(x).includes(query));
    if (!p) continue;
    hits.push({
      type: 'field', id: m.id, label: p, detail: `${idx.systems.get(m.reportedBySystemId)?.key ?? ''} · ${m.entity ?? 'غير موثق'}${m.link.status === 'matched' ? '' : ' · رابط غير مؤكد'}`,
      systemId: m.reportedBySystemId, integrationId: m.link.status === 'matched' ? m.link.integrationIds[0]! : null, mapping: m,
    });
    if (hits.length > limit * 3) break;
  }
  const rank = { system: 0, integration: 1, entity: 2, field: 3 } as const;
  return hits.sort((a, b) => rank[a.type] - rank[b.type]).slice(0, limit);
}
