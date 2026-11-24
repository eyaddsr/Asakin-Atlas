import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Dataset } from '../shared/schema.ts';
import { validateDataset } from '../shared/validate.ts';

const FILES = {
  meta: 'meta.json', systems: 'systems.json', integrations: 'integrations.json', channels: 'channels.json', flows: 'flows.json',
  entityMappings: 'entity-mappings.json', fieldMappings: 'field-mappings.json', evidence: 'evidence.json', registry: 'registry.json',
  conflicts: 'conflicts.json', reviewQueue: 'review-queue.json',
} as const;

export type DataState =
  | { ok: true; dataset: Dataset; body: string; missingMappingLinks: unknown[] }
  | { ok: false; error: string; issues: { path: string; message: string }[] };

/** Load + validate the canonical snapshot once. Invalid data never takes the server down (PRD §10). */
export function loadCanonical(dir: string): DataState {
  try {
    const raw: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(FILES)) {
      const p = join(dir, f);
      if (!existsSync(p)) return { ok: false, error: `canonical file missing: ${f}`, issues: [] };
      raw[k] = JSON.parse(readFileSync(p, 'utf8'));
    }
    const v = validateDataset(raw);
    if (!v.ok) return { ok: false, error: 'canonical snapshot failed validation', issues: v.issues.slice(0, 20) };
    const mmlPath = join(dir, 'missing-mapping-links.json');
    const missingMappingLinks = existsSync(mmlPath) ? (JSON.parse(readFileSync(mmlPath, 'utf8')) as unknown[]) : [];
    return { ok: true, dataset: v.data, body: JSON.stringify(v.data), missingMappingLinks };
  } catch (e) {
    return { ok: false, error: `cannot read canonical snapshot: ${(e as Error).message}`, issues: [] };
  }
}
