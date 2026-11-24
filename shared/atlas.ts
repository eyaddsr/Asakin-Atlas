/**
 * View model for the approved "Atlas → Lens → Integration → Impact" design (docs/DESIGN_REFACTOR_PLAN.md).
 * Pure functions over ONE canonical dataset. Nothing here invents systems, owners or verification:
 * - verification state is a documented derivation of agent-reported evidence (never independent verification);
 * - unresolved counterparts stay unresolved (no nodes for UNKNOWN / ANY-GRANTED-APP / browser / scheduler);
 * - threads are drawn caller → callee; data direction is carried separately (beads), unknown stays unknown;
 * - impact is POTENTIAL reachability; lineage is a POTENTIAL chain by exact field-leaf names.
 */
import type { Dataset, EndRef, FieldMapping, Integration, System } from './schema.ts';
import { EVIDENCE_RANK } from './schema.ts';
import { buildIndex, type Index } from './graph.ts';
import { fieldLeaf } from './analysis.ts';

/* ------------------------------------------------------------------ lanes */

export type LaneId = 'channels' | 'business' | 'core' | 'finance' | 'external';
export const LANES: { id: LaneId; ar: string; en: string; idx: string }[] = [
  { id: 'channels', ar: 'القنوات', en: 'CHANNELS', idx: '01' },
  { id: 'business', ar: 'تطبيقات الأعمال', en: 'BUSINESS APPS', idx: '02' },
  { id: 'core', ar: 'الخدمات المشتركة', en: 'SHARED CORE', idx: '03' },
  { id: 'finance', ar: 'المالية', en: 'FINANCE', idx: '04' },
  { id: 'external', ar: 'مزودون خارجيون', en: 'EXTERNAL', idx: '05' },
];

/**
 * Customer-, investor- or public-facing applications (presentational grouping only; from the audited
 * purpose statements: public website, tenant/owner/investor portals, public marketplace, opportunities).
 */
export const CHANNEL_KEYS: ReadonlySet<string> = new Set(['WEB', 'TENANT', 'OWNER', 'INP', 'INVP', 'ASAR', 'AOP', 'AOPP']);

export function laneOf(s: System): LaneId {
  if (s.kind === 'external_service') return 'external';
  if (s.kind === 'shared_service' || s.kind === 'sdk_library') return 'core';
  if (CHANNEL_KEYS.has(s.key)) return 'channels';
  if (s.domain === 'finance') return 'finance';
  return 'business';
}

/** Short, unique, deterministic monograms (≤ 4 chars) derived from the system key. */
export function monograms(systems: System[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  const sorted = [...systems].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const s of sorted) {
    const k = s.key.replace(/^EXT:/, '').replace(/^ASAKIN-(?=.)/, '').replace(/^SYS-/, '').toUpperCase();
    const parts = k.split(/[-_ ]+/).filter(Boolean);
    let m = k.length <= 4 ? k : parts.length > 1 ? parts.map((p) => p[0]).join('').slice(0, 4) : k.slice(0, 3);
    if (used.has(m)) {
      const base = k.replace(/[^A-Z0-9]/g, '');
      m = [base.slice(0, 4), base.slice(0, 2) + base.slice(-2)].find((c) => !used.has(c)) ?? m;
      for (let i = 2; used.has(m); i++) m = `${m.slice(0, 3)}${i}`;
    }
    used.add(m);
    out.set(s.id, m);
  }
  return out;
}

/** Display name without the parenthetical alias, e.g. "APMP (Asakin Portfolio …)" → "APMP". */
export function shortName(s: System): string {
  const n = s.displayName.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return n || s.displayName;
}

/** Compact tile label: the shared "Asakin" prefix carries no information inside the Asakin map. */
export function tileName(s: System): string {
  const n = shortName(s).replace(/^(?:Asakin|Asaken|أساكن)\s+/i, '').trim();
  return n || shortName(s);
}

/* ----------------------------------------------------------- verification */

export type Verif = 'documented' | 'partial' | 'needs_verification';
export const VERIFS: Verif[] = ['documented', 'partial', 'needs_verification'];
export const ALL_VERIFS: ReadonlySet<Verif> = new Set(VERIFS);

export type OpenQuestion = { kind: 'review' | 'conflict' | 'mapping_link'; text: string; refId: string };

const OPEN = new Set(['new', 'needs_review', 'conflict']);
/** Review kinds that mean "a detail of this claim is not settled". */
const DOWNGRADING = new Set(['unresolved_endpoint', 'field_not_found_on_counterpart', 'possible_counterpart', 'registry_transport_claim']);

/* ----------------------------------------------------------- orientation */

export type Orientation = {
  /** Caller → callee when the request initiator is known; otherwise the claim's source → target. */
  from: EndRef;
  to: EndRef;
  initiatorKnown: boolean;
  /** data moves from → to */
  fwd: boolean;
  /** data moves to → from (e.g. returned in the response) */
  back: boolean;
};

export function orientation(x: Integration): Orientation {
  const swap = x.direction.requestInitiator === 'target';
  const from = swap ? x.target : x.source;
  const to = swap ? x.source : x.target;
  const d = x.direction.data;
  const sToT = d === 'source_to_target' || d === 'bidirectional';
  const tToS = d === 'target_to_source' || d === 'bidirectional';
  return {
    from, to, initiatorKnown: x.direction.requestInitiator !== 'unknown',
    fwd: swap ? tToS : sToT,
    back: swap ? sToT : tToS,
  };
}

/** Producer → consumer system ids for one-way data; null when bidirectional/unknown/unresolved. */
export function producerConsumer(x: Integration): { producer: string; consumer: string } | null {
  const s = x.source.systemId; const t = x.target.systemId;
  if (!s || !t || s === t) return null;
  if (x.direction.data === 'source_to_target') return { producer: s, consumer: t };
  if (x.direction.data === 'target_to_source') return { producer: t, consumer: s };
  return null;
}

/* ------------------------------------------------------------------ model */

export type Model = {
  d: Dataset;
  idx: Index;
  lane: Map<string, LaneId>;
  mono: Map<string, string>;
  verif: Map<string, Verif>;
  ori: Map<string, Orientation>;
  questions: Map<string, OpenQuestion[]>;
  /** field mappings attached to an integration: matched first, then uncertain links that name it */
  mappings: Map<string, FieldMapping[]>;
  /** mappings reported by a system that are not matched to exactly one integration */
  unlinked: Map<string, FieldMapping[]>;
  /** integrations whose resolved ends include the system */
  touching: Map<string, Integration[]>;
  /** matched mappings by "consumerSystem|destLeaf" and "producerSystem|srcLeaf" for lineage */
  byDest: Map<string, { m: FieldMapping; x: Integration }[]>;
  bySrc: Map<string, { m: FieldMapping; x: Integration }[]>;
};

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

export function buildModel(d: Dataset, idx: Index = buildIndex(d)): Model {
  const lane = new Map(d.systems.map((s) => [s.id, laneOf(s)] as const));
  const mono = monograms(d.systems);

  const mappings = new Map<string, FieldMapping[]>();
  const unlinked = new Map<string, FieldMapping[]>();
  for (const m of d.fieldMappings) {
    if (m.link.status === 'matched') push(mappings, m.link.integrationIds[0]!, m);
    else push(unlinked, m.reportedBySystemId, m);
  }
  for (const m of d.fieldMappings) {
    if (m.link.status === 'matched') continue;
    for (const iid of m.link.integrationIds) push(mappings, iid, m);
  }

  const questions = new Map<string, OpenQuestion[]>();
  const downgraded = new Set<string>();
  const conflicted = new Set<string>();
  const mapToInts = new Map(d.fieldMappings.map((m) => [m.id, m.link.integrationIds] as const));
  for (const r of d.reviewQueue) {
    if (!OPEN.has(r.status)) continue;
    const ints = r.subjectId.startsWith('int_') ? [r.subjectId] : r.subjectId.startsWith('map_') ? mapToInts.get(r.subjectId) ?? [] : [];
    for (const iid of ints) {
      push(questions, iid, { kind: 'review', text: r.note, refId: r.id });
      if (DOWNGRADING.has(r.kind)) downgraded.add(iid);
    }
  }
  for (const c of d.conflicts) {
    if (!OPEN.has(c.status)) continue;
    for (const cl of c.claims) if (cl.integrationId) { push(questions, cl.integrationId, { kind: 'conflict', text: c.summary, refId: c.id }); conflicted.add(cl.integrationId); }
  }
  for (const [iid, ms] of mappings) {
    const n = ms.filter((m) => m.link.status !== 'matched').length;
    if (n) push(questions, iid, { kind: 'mapping_link', text: `${n} ${n === 1 ? 'حقل مرتبط' : 'حقول مرتبطة'} بهذا التكامل بإشارة غير مؤكدة (تحتاج مراجعة)`, refId: iid });
  }

  const verif = new Map<string, Verif>();
  const ori = new Map<string, Orientation>();
  const touching = new Map<string, Integration[]>();
  for (const x of d.integrations) {
    ori.set(x.id, orientation(x));
    const resolved = !!x.source.systemId && !!x.target.systemId && x.scope !== 'unresolved';
    let v: Verif;
    if (!resolved || x.evidence.level === 'unknown' || x.evidence.level === 'proposed' || conflicted.has(x.id)) v = 'needs_verification';
    else if (x.scope === 'inter_system' && x.direction.data !== 'unknown' && EVIDENCE_RANK[x.evidence.level] >= EVIDENCE_RANK.code_observed && !downgraded.has(x.id)) v = 'documented';
    else v = 'partial';
    verif.set(x.id, v);
    const ends = new Set([x.source.systemId, x.target.systemId].filter((s): s is string => !!s));
    for (const s of ends) push(touching, s, x);
  }

  const byDest = new Map<string, { m: FieldMapping; x: Integration }[]>();
  const bySrc = new Map<string, { m: FieldMapping; x: Integration }[]>();
  for (const m of d.fieldMappings) {
    if (m.link.status !== 'matched') continue;
    const x = idx.integrations.get(m.link.integrationIds[0]!);
    const pc = x ? producerConsumer(x) : null;
    if (!x || !pc) continue;
    const sl = fieldLeaf(m.sourcePath); const dl = fieldLeaf(m.destinationPath);
    if (dl) push(byDest, `${pc.consumer}|${dl.toLowerCase()}`, { m, x });
    if (sl) push(bySrc, `${pc.producer}|${sl.toLowerCase()}`, { m, x });
  }
  return { d, idx, lane, mono, verif, ori, questions, mappings, unlinked, touching, byDest, bySrc };
}

export const verifOf = (m: Model, id: string): Verif => m.verif.get(id) ?? 'needs_verification';

/** Integration title: name, else the first words of its purpose, else the agent id. */
export function intTitle(x: Integration): string {
  if (x.name) return x.name;
  if (x.purpose) { const w = x.purpose.split(/\s+/); return w.length > 9 ? `${w.slice(0, 9).join(' ')}…` : x.purpose; }
  return x.agentIntegrationId;
}

export function verifCounts(m: Model): Record<Verif, number> {
  const c: Record<Verif, number> = { documented: 0, partial: 0, needs_verification: 0 };
  for (const x of m.d.integrations) if (x.scope !== 'negative_finding') c[verifOf(m, x.id)]++;
  return c;
}

/* ---------------------------------------------------------------- threads */

export type Thread = {
  id: string;                 // `${from}>${to}`
  from: string;
  to: string;
  intIds: string[];
  verif: Verif;               // strongest state among the visible integrations
  fwd: boolean;
  back: boolean;
  reciprocal: boolean;        // a thread exists in the opposite orientation
  needs: number;              // visible integrations that need verification
};

const STRENGTH: Record<Verif, number> = { documented: 2, partial: 1, needs_verification: 0 };

/** One thread per caller → callee pair of resolved systems (all claims kept inside, none dropped). */
export function buildThreads(m: Model, visible: ReadonlySet<Verif> = ALL_VERIFS, ints: readonly Integration[] = m.d.integrations): Thread[] {
  const map = new Map<string, Thread>();
  for (const x of new Set(ints)) {
    if (x.scope !== 'inter_system') continue;
    const v = verifOf(m, x.id);
    if (!visible.has(v)) continue;
    const o = m.ori.get(x.id)!;
    const a = o.from.systemId; const b = o.to.systemId;
    if (!a || !b || a === b) continue;
    const id = `${a}>${b}`;
    let t = map.get(id);
    if (!t) { t = { id, from: a, to: b, intIds: [], verif: v, fwd: false, back: false, reciprocal: false, needs: 0 }; map.set(id, t); }
    t.intIds.push(x.id);
    if (STRENGTH[v] > STRENGTH[t.verif]) t.verif = v;
    t.fwd ||= o.fwd; t.back ||= o.back;
    if (v === 'needs_verification') t.needs++;
  }
  for (const t of map.values()) t.reciprocal = map.has(`${t.to}>${t.from}`);
  return [...map.values()].sort((p, q) => (p.id < q.id ? -1 : 1));
}

/* ------------------------------------------------------------------- lens */

export type LensRow = {
  x: Integration;
  other: string | null;       // counterpart system id (null = unresolved)
  otherEnd: EndRef;
  side: 'in' | 'out';
  verif: Verif;
  fwd: boolean;               // data flows towards the focus system (in) / away from it (out)
  back: boolean;              // data also flows the opposite way
  reciprocal: boolean;        // another integration exists in the opposite orientation
};

export type Lens = { incoming: LensRow[]; outgoing: LensRow[]; internal: Integration[]; negative: Integration[] };

/**
 * Rows by DATA direction relative to the focus system: «الوارد» = data arrives at it, «الصادر» = it sends data.
 * Two-way or undocumented data is placed by who initiates (caller → outgoing).
 */
export function lensFor(m: Model, sysId: string, visible: ReadonlySet<Verif> = ALL_VERIFS): Lens {
  const incoming: LensRow[] = []; const outgoing: LensRow[] = []; const internal: Integration[] = []; const negative: Integration[] = [];
  const orientations = new Set<string>();
  const list = m.d.integrations.filter((x) => x.source.systemId === sysId || x.target.systemId === sysId);
  for (const x of list) { const o = m.ori.get(x.id)!; orientations.add(`${o.from.systemId}>${o.to.systemId}`); }
  for (const x of list) {
    if (x.scope === 'negative_finding') { negative.push(x); continue; }
    if (x.scope === 'intra_system' || (x.source.systemId === sysId && x.target.systemId === sysId)) { internal.push(x); continue; }
    const v = verifOf(m, x.id);
    if (!visible.has(v)) continue;
    const o = m.ori.get(x.id)!;
    const isFrom = o.from.systemId === sysId;
    const otherEnd = isFrom ? o.to : o.from;
    // data towards the focus system?
    const inData = isFrom ? o.back : o.fwd;
    const outData = isFrom ? o.fwd : o.back;
    const side: 'in' | 'out' = inData && !outData ? 'in' : outData && !inData ? 'out' : isFrom ? 'out' : 'in';
    const row: LensRow = {
      x, other: otherEnd.systemId, otherEnd, side, verif: v,
      fwd: side === 'in' ? inData : outData, back: side === 'in' ? outData : inData,
      reciprocal: !!otherEnd.systemId && orientations.has(`${o.to.systemId}>${o.from.systemId}`),
    };
    (side === 'in' ? incoming : outgoing).push(row);
  }
  const name = (r: LensRow) => (r.other ? m.idx.systems.get(r.other)?.displayName ?? '' : `~${r.otherEnd.raw ?? ''}`);
  const sort = (a: LensRow, b: LensRow) => name(a).localeCompare(name(b)) || intTitle(a.x).localeCompare(intTitle(b.x)) || (a.x.id < b.x.id ? -1 : 1);
  return { incoming: incoming.sort(sort), outgoing: outgoing.sort(sort), internal, negative };
}

export type SystemStats = { incoming: number; outgoing: number; total: number; counts: Record<Verif, number>; reciprocalPeers: number };

export function systemStats(m: Model, sysId: string): SystemStats {
  const l = lensFor(m, sysId);
  const rows = [...l.incoming, ...l.outgoing];
  const counts: Record<Verif, number> = { documented: 0, partial: 0, needs_verification: 0 };
  for (const r of rows) counts[r.verif]++;
  const peers = new Set(rows.filter((r) => r.other && (r.reciprocal || (r.fwd && r.back))).map((r) => r.other));
  return { incoming: l.incoming.length, outgoing: l.outgoing.length, total: rows.length, counts, reciprocalPeers: peers.size };
}

/* ----------------------------------------------------------------- impact */

export type ChangeKind = 'outage' | 'data' | 'api';
export type Impact = {
  ring1: string[]; ring2: string[];
  ring1Ints: Integration[]; ring2Ints: Integration[];
  unverified: number;
};

function consumersOf(m: Model, s: string): { sys: string; x: Integration }[] {
  const out: { sys: string; x: Integration }[] = [];
  for (const x of m.touching.get(s) ?? []) {
    if (x.scope !== 'inter_system') continue;
    const o = m.ori.get(x.id)!;
    const a = o.from.systemId; const b = o.to.systemId;
    if (!a || !b) continue;
    if (a === s && o.fwd) out.push({ sys: b, x });
    else if (b === s && o.back) out.push({ sys: a, x });
  }
  return out;
}

/**
 * Potential impact rings (design artboard 5):
 * outage = every system exchanging with it; data = consumers of the data it sends; api = systems that call it.
 * Ring 2 = consumers of the data sent by ring-1 internal systems. Unknown directions are never promoted.
 */
export function impactRings(m: Model, sysId: string, change: ChangeKind): Impact {
  const ring1Ints: Integration[] = []; const ring1: string[] = [];
  const add1 = (sys: string, x: Integration) => { ring1Ints.push(x); if (!ring1.includes(sys)) ring1.push(sys); };
  for (const x of m.touching.get(sysId) ?? []) {
    if (x.scope !== 'inter_system') continue;
    const o = m.ori.get(x.id)!;
    const a = o.from.systemId; const b = o.to.systemId;
    if (!a || !b || a === b) continue;
    const other = a === sysId ? b : a;
    if (change === 'outage') add1(other, x);
    else if (change === 'data' && ((a === sysId && o.fwd) || (b === sysId && o.back))) add1(other, x);
    else if (change === 'api' && b === sysId && o.initiatorKnown) add1(other, x);
  }
  const ring2: string[] = []; const ring2Ints: Integration[] = [];
  for (const s1 of ring1) {
    if (m.lane.get(s1) === 'external') continue;
    for (const c of consumersOf(m, s1)) {
      if (c.sys === sysId || ring1.includes(c.sys)) continue;
      ring2Ints.push(c.x);
      if (!ring2.includes(c.sys)) ring2.push(c.sys);
    }
  }
  const byName = (p: string, q: string) => (m.idx.systems.get(p)?.displayName ?? p).localeCompare(m.idx.systems.get(q)?.displayName ?? q);
  ring1.sort(byName); ring2.sort(byName);
  const unverified = new Set([...ring1Ints, ...ring2Ints].filter((x) => verifOf(m, x.id) === 'needs_verification').map((x) => x.id)).size;
  return { ring1, ring2, ring1Ints, ring2Ints, unverified };
}

/* ----------------------------------------------------------------- fields */

export type FieldTag = 'required' | 'identifier' | 'personal' | 'uncertain_link' | 'withheld';

const PERSONAL = /(national|nationalid|id_?number|idnumber|iqama|passport|mobile|phone|msisdn|whatsapp|wa_id|e_?mail|iban|birth|dob|full_?name|first_?name|last_?name|address)/i;
const IDENT = /(^id$|_id$|Id$|^uuid$|_uuid$|^ref$|_ref$|Ref$|^code$|_code$|Code$|^key$|_key$)/;

/** Tags shown on a field row. «بيان شخصي» is a name-based estimate and is labelled as such in the UI. */
export function fieldTags(f: FieldMapping): FieldTag[] {
  const tags: FieldTag[] = [];
  if (f.required) tags.push('required');
  const leaves = [fieldLeaf(f.sourcePath), fieldLeaf(f.destinationPath)].filter((l): l is string => !!l);
  if (leaves.some((l) => IDENT.test(l))) tags.push('identifier');
  if (leaves.some((l) => PERSONAL.test(l))) tags.push('personal');
  if (f.link.status !== 'matched') tags.push('uncertain_link');
  if (f.withheldFields.length) tags.push('withheld');
  return tags;
}

export type Hop = { systemId: string; field: string; intId: string | null; mappingId: string | null };

/**
 * Potential lineage of one matched field mapping: follows matched mappings of one-way integrations whose
 * field leaf names are identical (case-insensitive) upstream and downstream. Returns null when there is
 * nothing beyond the mapping itself.
 */
export function lineage(m: Model, f: FieldMapping, maxHops = 4): Hop[] | null {
  if (f.link.status !== 'matched') return null;
  const x = m.idx.integrations.get(f.link.integrationIds[0]!);
  const pc = x ? producerConsumer(x) : null;
  if (!x || !pc || !f.sourcePath || !f.destinationPath) return null;
  const seen = new Set<string>([f.id]);
  const visited = new Set<string>([pc.producer, pc.consumer]);
  const hops: Hop[] = [
    { systemId: pc.producer, field: f.sourcePath, intId: null, mappingId: null },
    { systemId: pc.consumer, field: f.destinationPath, intId: x.id, mappingId: f.id },
  ];
  // upstream
  let cur = { sys: pc.producer, leaf: fieldLeaf(f.sourcePath)?.toLowerCase() };
  for (let i = 0; i < maxHops && cur.leaf; i++) {
    const cand = (m.byDest.get(`${cur.sys}|${cur.leaf}`) ?? []).filter((c) => !seen.has(c.m.id) && !visited.has(producerConsumer(c.x)!.producer))
      .sort((p, q) => (p.m.id < q.m.id ? -1 : 1))[0];
    if (!cand) break;
    const p = producerConsumer(cand.x)!;
    seen.add(cand.m.id); visited.add(p.producer);
    hops[0] = { ...hops[0]!, intId: cand.x.id, mappingId: cand.m.id };
    hops.unshift({ systemId: p.producer, field: cand.m.sourcePath ?? '', intId: null, mappingId: null });
    cur = { sys: p.producer, leaf: fieldLeaf(cand.m.sourcePath)?.toLowerCase() };
  }
  // downstream
  cur = { sys: pc.consumer, leaf: fieldLeaf(f.destinationPath)?.toLowerCase() };
  for (let i = 0; i < maxHops && cur.leaf; i++) {
    const cand = (m.bySrc.get(`${cur.sys}|${cur.leaf}`) ?? []).filter((c) => !seen.has(c.m.id) && !visited.has(producerConsumer(c.x)!.consumer))
      .sort((p, q) => (p.m.id < q.m.id ? -1 : 1))[0];
    if (!cand) break;
    const p = producerConsumer(cand.x)!;
    seen.add(cand.m.id); visited.add(p.consumer);
    hops.push({ systemId: p.consumer, field: cand.m.destinationPath ?? '', intId: cand.x.id, mappingId: cand.m.id });
    cur = { sys: p.consumer, leaf: fieldLeaf(cand.m.destinationPath)?.toLowerCase() };
  }
  return hops.length >= 3 ? hops : null;
}

/** Integrations between the same two systems (either orientation), excluding `x` itself. */
export function siblings(m: Model, x: Integration): Integration[] {
  const a = x.source.systemId; const b = x.target.systemId;
  if (!a || !b || a === b) return [];
  return m.d.integrations.filter((y) => y.id !== x.id && y.scope === 'inter_system'
    && ((y.source.systemId === a && y.target.systemId === b) || (y.source.systemId === b && y.target.systemId === a)));
}
