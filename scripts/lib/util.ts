import { createHash } from 'node:crypto';

/** Stable opaque id: `<prefix>_<12 hex>` from the record's source identity. */
export function stableId(prefix: string, ...parts: (string | number | null | undefined)[]): string {
  const h = createHash('sha256').update([prefix, ...parts.map((p) => (p === null || p === undefined ? '∅' : String(p)))].join('␟')).digest('hex');
  return `${prefix}_${h.slice(0, 12)}`;
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Deterministic JSON (2-space, trailing newline). Key order follows construction; arrays are pre-sorted. */
export function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const uniqSorted = (xs: Iterable<string>) => [...new Set(xs)].sort(cmp);

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((x) => x !== '')) rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** Flatten any agent-written value to a single display string. */
export function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function firstDefined(obj: Record<string, unknown> | undefined, ...keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** First N words (PRD D-004: hover description max 20 words). */
export function firstWords(s: string | null, n = 20): string | null {
  if (!s) return null;
  const words = s.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= n) return words.join(' ');
  return `${words.slice(0, n).join(' ')}…`;
}
