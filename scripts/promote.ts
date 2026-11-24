/**
 * npm run data:promote — copy a VALID candidate into data/private/canonical.
 * The resulting change is reviewed and committed through Git (PRD D-003); nothing is deployed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANDIDATE_DIR, CANONICAL_DIR, DATASET_FILES, EXTRA_FILES, readDatasetDir, writeFiles } from './lib/io.ts';
import { validateDataset } from '../shared/validate.ts';

if (!existsSync(join(CANDIDATE_DIR, 'meta.json'))) { console.error('No candidate. Run npm run data:import first.'); process.exit(1); }
const v = validateDataset(readDatasetDir(CANDIDATE_DIR));
if (!v.ok) { console.error('Candidate is invalid; refusing to promote.'); v.issues.slice(0, 30).forEach((i) => console.error(`  ${i.path}: ${i.message}`)); process.exit(1); }
const files: Record<string, string> = {};
for (const f of [...Object.values(DATASET_FILES), ...EXTRA_FILES]) files[f] = readFileSync(join(CANDIDATE_DIR, f), 'utf8');
const changed = writeFiles(CANONICAL_DIR, files);
console.log(changed.length ? `Canonical updated: ${changed.join(', ')}\nReview with: git diff -- data/private/canonical` : 'Canonical already identical to candidate.');
