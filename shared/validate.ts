/** Strict schema + referential-integrity validation (PRD §10, §11). */
import { Dataset, type Dataset as DatasetT } from './schema.ts';
import { containsSecretValue, WITHHELD } from './sensitive.ts';

export type ValidationIssue = { path: string; message: string };
export type ValidationResult = { ok: true; data: DatasetT } | { ok: false; issues: ValidationIssue[] };

export function validateDataset(input: unknown): ValidationResult {
  const parsed = Dataset.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 200).map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  const d = parsed.data;
  const issues: ValidationIssue[] = [];
  const uniq = (name: string, ids: string[]) => {
    const seen = new Set<string>();
    ids.forEach((v, i) => {
      if (seen.has(v)) issues.push({ path: `${name}[${i}].id`, message: `duplicate id ${v}` });
      seen.add(v);
    });
    return seen;
  };
  const systems = uniq('systems', d.systems.map((s) => s.id));
  uniq('systems.key', d.systems.map((s) => s.key));
  const ints = uniq('integrations', d.integrations.map((x) => x.id));
  const chans = uniq('channels', d.channels.map((x) => x.id));
  uniq('flows', d.flows.map((x) => x.id));
  const maps = uniq('fieldMappings', d.fieldMappings.map((x) => x.id));
  const evs = uniq('evidence', d.evidence.map((x) => x.id));
  uniq('entityMappings', d.entityMappings.map((x) => x.id));
  uniq('conflicts', d.conflicts.map((x) => x.id));
  uniq('reviewQueue', d.reviewQueue.map((x) => x.id));
  const regIds = uniq('registry', [...d.registry.records, ...d.registry.grants, ...d.registry.matches].map((x) => x.id));

  const sys = (path: string, v: string | null) => {
    if (v !== null && !systems.has(v)) issues.push({ path, message: `unknown system ${v}` });
  };
  d.systems.forEach((s, i) => {
    if (s.registryRecordId && !regIds.has(s.registryRecordId)) issues.push({ path: `systems[${i}].registryRecordId`, message: 'unknown registry record' });
    if (s.shortDescription && s.shortDescription.split(/\s+/).filter(Boolean).length > 20) {
      issues.push({ path: `systems[${i}].shortDescription`, message: 'more than 20 words (PRD D-004)' });
    }
  });
  d.integrations.forEach((x, i) => {
    sys(`integrations[${i}].reportedBySystemId`, x.reportedBySystemId);
    sys(`integrations[${i}].source.systemId`, x.source.systemId);
    sys(`integrations[${i}].target.systemId`, x.target.systemId);
    x.source.unresolved?.candidates.forEach((c, j) => sys(`integrations[${i}].source.unresolved.candidates[${j}]`, c));
    x.target.unresolved?.candidates.forEach((c, j) => sys(`integrations[${i}].target.unresolved.candidates[${j}]`, c));
    if (x.scope === 'inter_system' && (!x.source.systemId || !x.target.systemId || x.source.systemId === x.target.systemId)) {
      issues.push({ path: `integrations[${i}].scope`, message: 'inter_system requires two distinct resolved systems' });
    }
    if (x.channelId && !chans.has(x.channelId)) issues.push({ path: `integrations[${i}].channelId`, message: 'unknown channel' });
    if (x.scope === 'inter_system' && !x.channelId) issues.push({ path: `integrations[${i}].channelId`, message: 'inter_system claim without channel' });
    x.sdkSystemIds.forEach((s, j) => sys(`integrations[${i}].sdkSystemIds[${j}]`, s));
    x.evidenceIds.forEach((e, j) => { if (!evs.has(e)) issues.push({ path: `integrations[${i}].evidenceIds[${j}]`, message: 'unknown evidence' }); });
    x.corroboration.counterpartIds.forEach((c, j) => { if (!ints.has(c)) issues.push({ path: `integrations[${i}].corroboration.counterpartIds[${j}]`, message: 'unknown integration' }); });
    if (x.evidence.level === 'production_verified' && x.evidence.basis === 'agent_reported' && !x.evidence.levelsClaimed.includes('production_verified')) {
      issues.push({ path: `integrations[${i}].evidence`, message: 'production_verified without an explicit production claim' });
    }
  });
  const intById = new Map(d.integrations.map((x) => [x.id, x]));
  d.channels.forEach((c, i) => {
    sys(`channels[${i}].systemA`, c.systemA); sys(`channels[${i}].systemB`, c.systemB);
    if (!(c.systemA < c.systemB)) issues.push({ path: `channels[${i}]`, message: 'systemA must sort before systemB' });
    c.claimIds.forEach((cid, j) => {
      const claim = intById.get(cid);
      if (!claim) { issues.push({ path: `channels[${i}].claimIds[${j}]`, message: 'unknown integration' }); return; }
      const pair = [claim.source.systemId, claim.target.systemId].sort().join('|');
      if (pair !== `${c.systemA}|${c.systemB}`) issues.push({ path: `channels[${i}].claimIds[${j}]`, message: 'claim does not connect the channel pair' });
      if (claim.channelId !== c.id) issues.push({ path: `channels[${i}].claimIds[${j}]`, message: 'claim.channelId mismatch' });
    });
  });
  d.flows.forEach((f, i) => {
    if (!chans.has(f.channelId)) issues.push({ path: `flows[${i}].channelId`, message: 'unknown channel' });
    sys(`flows[${i}].producerSystemId`, f.producerSystemId);
    sys(`flows[${i}].consumerSystemId`, f.consumerSystemId);
    sys(`flows[${i}].requestInitiatorSystemId`, f.requestInitiatorSystemId);
    if (f.producerSystemId === f.consumerSystemId) issues.push({ path: `flows[${i}]`, message: 'producer equals consumer' });
    f.claimIds.forEach((c, j) => { if (!ints.has(c)) issues.push({ path: `flows[${i}].claimIds[${j}]`, message: 'unknown integration' }); });
  });
  d.fieldMappings.forEach((m, i) => {
    sys(`fieldMappings[${i}].reportedBySystemId`, m.reportedBySystemId);
    m.link.integrationIds.forEach((c, j) => { if (!ints.has(c)) issues.push({ path: `fieldMappings[${i}].link.integrationIds[${j}]`, message: 'unknown integration' }); });
    if (m.link.status === 'matched' && m.link.integrationIds.length !== 1) issues.push({ path: `fieldMappings[${i}].link`, message: 'matched requires exactly one integration' });
    if (m.link.status === 'token_reference' && m.link.integrationIds.length !== 1) issues.push({ path: `fieldMappings[${i}].link`, message: 'token_reference requires exactly one candidate' });
    if (m.link.status === 'multi_integration' && m.link.integrationIds.length < 2) issues.push({ path: `fieldMappings[${i}].link`, message: 'multi_integration requires two or more candidates' });
    if (m.link.status === 'missing_integration_id' && m.link.integrationIds.length) issues.push({ path: `fieldMappings[${i}].link`, message: 'missing id cannot be linked' });
    if (m.link.status === 'unmatched_reference' && m.link.integrationIds.length) issues.push({ path: `fieldMappings[${i}].link`, message: 'unmatched reference cannot be linked' });
  });
  d.entityMappings.forEach((e, i) => {
    sys(`entityMappings[${i}].reportedBySystemId`, e.reportedBySystemId);
    e.integrationIds.forEach((c, j) => { if (!ints.has(c)) issues.push({ path: `entityMappings[${i}].integrationIds[${j}]`, message: 'unknown integration' }); });
  });
  d.evidence.forEach((e, i) => sys(`evidence[${i}].reportedBySystemId`, e.reportedBySystemId));
  d.registry.records.forEach((r, i) => sys(`registry.records[${i}].systemId`, r.systemId));
  d.registry.grants.forEach((g, i) => { sys(`registry.grants[${i}].callerSystemId`, g.callerSystemId); sys(`registry.grants[${i}].providerSystemId`, g.providerSystemId); });
  d.registry.matches.forEach((m, i) => sys(`registry.matches[${i}].systemId`, m.systemId));
  d.conflicts.forEach((c, i) => c.claims.forEach((cl, j) => {
    if (cl.integrationId && !ints.has(cl.integrationId)) issues.push({ path: `conflicts[${i}].claims[${j}].integrationId`, message: 'unknown integration' });
    cl.mappingIds.forEach((m, k) => { if (!maps.has(m)) issues.push({ path: `conflicts[${i}].claims[${j}].mappingIds[${k}]`, message: 'unknown mapping' }); });
  }));

  // No secret-pattern leaks anywhere in the dataset (PRD §10 validation).
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') {
      if (v !== WITHHELD && containsSecretValue(v)) issues.push({ path, message: 'secret-like value present' });
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  const { meta: _meta, ...content } = d; // meta holds archive hashes, not audit text
  walk(content, '$');

  return issues.length ? { ok: false, issues } : { ok: true, data: d };
}
