/** npm run data:validate — strict schema + reference integrity for canonical (and candidate, if present). */
import { existsSync } from 'node:fs';
import { CANDIDATE_DIR, CANONICAL_DIR, readDatasetDir, readDecisions } from './lib/io.ts';
import { validateDataset } from '../shared/validate.ts';

let failed = false;
try {
  const d = readDecisions();
  console.log(`decisions.json: ${d.length} reviewed decision(s) — valid`);
} catch (e) {
  failed = true;
  console.error(`decisions.json invalid: ${(e as Error).message}`);
}
for (const [label, dir] of [['canonical', CANONICAL_DIR], ['candidate', CANDIDATE_DIR]] as const) {
  if (!existsSync(dir) || (label === 'candidate' && !existsSync(`${dir}/meta.json`))) {
    if (label === 'canonical') { console.error('canonical dataset missing'); failed = true; }
    continue;
  }
  try {
    const r = validateDataset(readDatasetDir(dir));
    if (r.ok) console.log(`${label}: valid (${r.data.systems.length} systems, ${r.data.integrations.length} integrations, ${r.data.fieldMappings.length} field mappings)`);
    else { failed = true; console.error(`${label}: INVALID`); r.issues.slice(0, 50).forEach((i) => console.error(`  ${i.path}: ${i.message}`)); }
  } catch (e) { failed = true; console.error(`${label}: ${(e as Error).message}`); }
}
process.exit(failed ? 1 : 0);
