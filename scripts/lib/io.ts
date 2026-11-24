import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Dataset } from '../../shared/schema.ts';
import { DecisionsFile, type Decision } from '../../shared/schema.ts';
import { toJson } from './util.ts';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const DATA_ROOT = join(ROOT, 'data', 'private');
export const CANONICAL_DIR = join(DATA_ROOT, 'canonical');
export const CANDIDATE_DIR = join(DATA_ROOT, 'candidate');
export const DECISIONS_FILE = join(DATA_ROOT, 'reviewed', 'decisions.json');

/** File layout of a dataset directory (canonical or candidate). */
export const DATASET_FILES = {
  meta: 'meta.json', systems: 'systems.json', integrations: 'integrations.json', channels: 'channels.json', flows: 'flows.json',
  entityMappings: 'entity-mappings.json', fieldMappings: 'field-mappings.json', evidence: 'evidence.json', registry: 'registry.json',
  conflicts: 'conflicts.json', reviewQueue: 'review-queue.json',
} as const satisfies Record<keyof Dataset, string>;
export const EXTRA_FILES = ['provenance-index.json', 'missing-mapping-links.json', 'reconciliation-report.md'] as const;

export function readDatasetDir(dir: string): unknown {
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(DATASET_FILES)) {
    const p = join(dir, f);
    if (!existsSync(p)) throw new Error(`missing dataset file ${p}`);
    out[k] = JSON.parse(readFileSync(p, 'utf8'));
  }
  return out;
}

/** Writes files and returns the list of files whose content changed. */
export function writeFiles(dir: string, files: Record<string, string>): string[] {
  mkdirSync(dir, { recursive: true });
  const changed: string[] = [];
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, name);
    const before = existsSync(p) ? readFileSync(p, 'utf8') : null;
    if (before !== content) { writeFileSync(p, content, 'utf8'); changed.push(name); }
  }
  return changed.sort();
}

export function datasetToFiles(d: Dataset): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [k, f] of Object.entries(DATASET_FILES)) files[f] = toJson((d as Record<string, unknown>)[k]);
  return files;
}

export function readDecisions(): Decision[] {
  if (!existsSync(DECISIONS_FILE)) return [];
  return DecisionsFile.parse(JSON.parse(readFileSync(DECISIONS_FILE, 'utf8'))).decisions;
}

/** Latest ASAKIN-INTEGRATION-AUDIT*.zip under docs/ (by name, then mtime-independent for determinism). */
export function findArchive(): string {
  const docs = join(ROOT, 'docs');
  const zips = existsSync(docs) ? readdirSync(docs).filter((f) => /^ASAKIN-INTEGRATION-AUDIT.*\.zip$/i.test(f)).sort() : [];
  if (!zips.length) throw new Error('No docs/ASAKIN-INTEGRATION-AUDIT*.zip found. Pass --archive <path>.');
  return join(docs, zips[zips.length - 1]!);
}
