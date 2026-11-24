/**
 * npm run data:diff — reviewable summary of candidate vs canonical, by record id.
 * Writes data/private/candidate/DIFF_SUMMARY.md and prints it.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANDIDATE_DIR, CANONICAL_DIR, DATASET_FILES, readDatasetDir } from './lib/io.ts';

type Rec = { id: string };
export function diffDatasets(before: Record<string, unknown> | null, after: Record<string, unknown>) {
  const rows: { collection: string; added: string[]; removed: string[]; changed: string[] }[] = [];
  const keys = Object.keys(DATASET_FILES).filter((k) => k !== 'meta');
  for (const k of keys) {
    const flat = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : v && typeof v === 'object' ? Object.values(v).flat() as Rec[] : []);
    const a = new Map(flat(before?.[k]).map((r) => [r.id, JSON.stringify(r)]));
    const b = new Map(flat(after[k]).map((r) => [r.id, JSON.stringify(r)]));
    rows.push({
      collection: k,
      added: [...b.keys()].filter((x) => !a.has(x)).sort(),
      removed: [...a.keys()].filter((x) => !b.has(x)).sort(),
      changed: [...b.keys()].filter((x) => a.has(x) && a.get(x) !== b.get(x)).sort(),
    });
  }
  return rows;
}

if (process.argv[1]?.endsWith('diff.ts')) {
  if (!existsSync(join(CANDIDATE_DIR, 'meta.json'))) { console.error('No candidate. Run npm run data:import first.'); process.exit(1); }
  const after = readDatasetDir(CANDIDATE_DIR) as Record<string, unknown>;
  const before = existsSync(join(CANONICAL_DIR, 'meta.json')) ? readDatasetDir(CANONICAL_DIR) as Record<string, unknown> : null;
  const rows = diffDatasets(before, after);
  const total = rows.reduce((n, r) => n + r.added.length + r.removed.length + r.changed.length, 0);
  const md = [
    '# Candidate vs canonical diff (generated)', '',
    before ? '' : '_No canonical snapshot yet: everything is new._', '',
    '| Collection | Added | Removed | Changed |', '|---|---|---|---|',
    ...rows.map((r) => `| ${r.collection} | ${r.added.length} | ${r.removed.length} | ${r.changed.length} |`), '',
    total === 0 ? '**No record changes.**' : `**${total} record change(s).** Removed records and changed conflicts/review items need explicit reviewer attention.`, '',
    ...rows.filter((r) => r.removed.length || r.changed.length).flatMap((r) => [
      `## ${r.collection}`, '',
      ...r.removed.slice(0, 50).map((x) => `- removed \`${x}\``),
      ...r.changed.slice(0, 50).map((x) => `- changed \`${x}\``), '',
    ]),
  ].join('\n');
  writeFileSync(join(CANDIDATE_DIR, 'DIFF_SUMMARY.md'), `${md}\n`);
  console.log(md);
}
