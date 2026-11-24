/**
 * npm run data:import [-- --archive <zip>] [--out <dir>]
 * Writes a CANDIDATE dataset only (data/private/candidate). Canonical data changes only through
 * `npm run data:promote` followed by a reviewed Git diff.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { allowMember, buildDataset } from './lib/importer.ts';
import { CANDIDATE_DIR, datasetToFiles, findArchive, readDecisions, writeFiles } from './lib/io.ts';
import { sha256, toJson } from './lib/util.ts';
import { readZip } from './lib/zip.ts';
import { validateDataset } from '../shared/validate.ts';

export async function runImport(archivePath: string, outDir: string) {
  const buf = readFileSync(archivePath);
  const { names, files } = await readZip(buf, allowMember);
  const out = buildDataset({ archiveName: basename(archivePath), archiveSha256: sha256(buf), memberNames: names, files, decisions: readDecisions() });
  const v = validateDataset(out.dataset);
  if (!v.ok) {
    console.error('Candidate dataset failed validation:');
    for (const i of v.issues.slice(0, 50)) console.error(`  ${i.path}: ${i.message}`);
    process.exitCode = 1;
    return null;
  }
  const changed = writeFiles(outDir, {
    ...datasetToFiles(out.dataset),
    'provenance-index.json': toJson(out.provenanceIndex),
    'missing-mapping-links.json': toJson(out.missingMappingLinks),
    'reconciliation-report.md': out.report,
  });
  return { out, changed };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}` || process.argv[1]?.endsWith('import.ts')) {
  const { values } = parseArgs({ options: { archive: { type: 'string' }, out: { type: 'string' } } });
  const archive = values.archive ?? findArchive();
  const res = await runImport(archive, values.out ?? CANDIDATE_DIR);
  if (res) {
    const c = res.out.dataset.meta.counts;
    console.log(`Archive: ${basename(archive)} (${res.out.dataset.meta.inventoryVersion})`);
    console.log(`Claims ${c['source.integration_claims']} -> integrations ${c['integrations.total']} | mappings ${c['source.field_mapping_rows']} -> ${c['fieldMappings.total']} | systems ${c['systems.total']}`);
    console.log(`Channels ${c['channels.total']} | flows ${c['flows.total']} | conflicts ${c['conflicts.total']} | review items ${c['reviewQueue.total']}`);
    for (const w of res.out.warnings) console.warn(`warning: ${w}`);
    console.log(res.changed.length ? `Candidate files changed: ${res.changed.join(', ')}` : 'Candidate unchanged (idempotent).');
    console.log('Next: npm run data:diff, review, then npm run data:promote.');
  }
}
