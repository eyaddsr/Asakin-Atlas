import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { allowMember, buildDataset, type ImportOutput } from '../scripts/lib/importer.ts';
import { findArchive } from '../scripts/lib/io.ts';
import { sha256 } from '../scripts/lib/util.ts';
import { readZip } from '../scripts/lib/zip.ts';
import type { Decision } from '../shared/schema.ts';

export function archivePath(): string | null {
  try { const p = findArchive(); return existsSync(p) ? p : null; } catch { return null; }
}

/** Import the real audit archive (tests that need it are skipped when it is absent, e.g. in CI without private data). */
export async function importReal(decisions: Decision[] = []): Promise<ImportOutput> {
  const p = archivePath();
  if (!p) throw new Error('archive not available');
  const buf = readFileSync(p);
  const { names, files } = await readZip(buf, allowMember);
  return buildDataset({ archiveName: basename(p), archiveSha256: sha256(buf), memberNames: names, files, decisions });
}

/** Build an in-memory archive (member -> content) for fixture-based importer tests. */
export function fixtureFiles(members: Record<string, unknown>) {
  const files = new Map<string, Buffer>();
  for (const [k, v] of Object.entries(members)) files.set(`AUDIT/${k}`, Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)));
  return { names: [...files.keys()].sort(), files };
}
