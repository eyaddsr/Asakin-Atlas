/**
 * Acceptance 13 (build side): the client bundle must not contain canonical data, archive content,
 * the confidential risk file, or source maps.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './lib/io.ts';

const dist = join(ROOT, 'dist');
if (!existsSync(dist)) { console.error('dist/ missing — run npm run build'); process.exit(1); }

const canonicalIds = JSON.parse(readFileSync(join(ROOT, 'data', 'private', 'canonical', 'systems.json'), 'utf8')).map((s: { id: string }) => s.id) as string[];
const markers: [RegExp, string][] = [
  [/CONFIDENTIAL-risk|risk-triage|Risk triage of v1/i, 'confidential risk file'],
  [/consolidated-integrations\.json|consolidated-field-mappings\.json/, 'archive member names / data'],
  [/"agentIntegrationId"|"reportedBySystemId"/, 'canonical JSON records'],
  [/sys_[0-9a-f]{12}/, 'canonical system ids'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT-like token'],
];
const bad: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const rel = relative(ROOT, p);
    if (/\.(map|zip|md|csv)$/i.test(f)) { bad.push(`${rel}: forbidden file type`); continue; }
    if (!/\.(js|css|html|json|txt|svg)$/i.test(f)) continue;
    const content = readFileSync(p, 'utf8');
    for (const [re, label] of markers) if (re.test(content)) bad.push(`${rel}: contains ${label}`);
    if (canonicalIds.some((id) => content.includes(id))) bad.push(`${rel}: contains a canonical system id`);
  }
};
walk(dist);
if (bad.length) { console.error('dist leak check FAILED:'); bad.forEach((b) => console.error(`  ${b}`)); process.exit(1); }
console.log('dist leak check passed: no private data, archive content, confidential file or source maps in dist/.');
