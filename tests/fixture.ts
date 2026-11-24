/**
 * Synthetic audit archive encoding PRD §12 verification scenarios. Systems are fictional (PROV, CONS).
 */
import { buildDataset } from '../scripts/lib/importer.ts';
import type { Decision } from '../shared/schema.ts';
import { fixtureFiles } from './helpers.ts';

const sys = (id: string, name: string) => ({
  systemId: id, replitProject: id, applicationName: name, aliases: [], registryAppCodeClaimed: id, authAppCode: null,
  purpose: `${name} purpose text used for the hover description in tests only`, category: 'Internal business application',
  auditCompleteness: 'COMPLETE', partsCollected: 1, truncationNotes: [], coordinatorRepairs: [], collectedAt: ['2026-11-22T10:00:00Z'],
  sourceFile: `individual-audits/${id.toLowerCase()}.integration-audit.json`, registryRecord: null,
});

const int = (reportedBy: string, id: string, o: Record<string, unknown>) => ({
  integrationKey: `${reportedBy}::${id}`, reportedBy, agentIntegrationId: id, category: 'internalIntegrations', name: o.name ?? id,
  sourceRaw: o.src, destinationRaw: o.dst, source: o.src, destination: o.dst, direction: o.direction, mechanism: o.mechanism ?? 'direct API',
  registryAssisted: o.registryAssisted ?? false, registryRole: o.registryRole ?? null, registryGrantCheck: null, endpoints: o.endpoints ?? null,
  trigger: o.trigger ?? null, frequency: o.frequency ?? null, auth: o.auth ?? null, status: 'ACTIVE', verification: o.verification ?? 'CODE_OBSERVED', codeRefs: o.codeRefs ?? null,
});

const fm = (reportedBy: string, id: string, integrationId: string | null, sourceField: string | null, destinationField: string | null, dataType: string, extra: Record<string, unknown> = {}) => ({
  reportedBy, agentMappingId: id, integrationId, entity: extra.entity ?? 'units', direction: extra.direction ?? null, sourceField, destinationField,
  dataType, required: extra.required ?? null, transformation: extra.transformation ?? 'none', usage: null, ...(extra.verification ? { verification: extra.verification } : {}),
});

export function fixtureMembers(): Record<string, unknown> {
  const integrations = [
    // Channel 1 (two-sided): CONS pulls units from PROV (consumer-initiated GET).
    int('CONS', 'INT-1', { src: 'CONS', dst: 'PROV', direction: 'outbound', mechanism: 'Registry-assisted direct HTTP via @asakin/tiny', registryAssisted: true,
      registryRole: { discovery: true, authorization: true, routing: false, dataTransfer: false },
      endpoints: [{ method: 'GET', path: '/api/integration/v2/units' }, { target: 'Registry', method: 'POST', path: '/api/auth/token' }], codeRefs: ['E1'] }),
    int('PROV', 'INT-1', { src: 'PROV', dst: 'CONS', direction: 'inbound', mechanism: 'REST/JSON with Registry JWT', endpoints: ['GET /api/integration/v2/units'] }),
    // Channel 2: CONS writes to PROV.
    int('CONS', 'INT-2', { src: 'CONS', dst: 'PROV', direction: 'outbound', endpoints: [{ method: 'POST', path: '/api/integration/v2/requests' }] }),
    // Channel 3: PROV pushes a webhook to CONS.
    int('PROV', 'INT-9', { src: 'PROV', dst: 'CONS', direction: 'outbound', mechanism: 'webhook POST', endpoints: [{ method: 'POST', path: '/hooks/status' }] }),
    // Unknown caller surface and a hostile text field.
    int('PROV', 'INT-SURF', { src: 'UNKNOWN callers (any Registry app with grant)', dst: 'PROV', direction: 'inbound', endpoints: ['GET /api/integration/v2/projects'],
      auth: 'password=hunter2 seeded at startup' }),
    // Registry key fetch (a real call to Registry, not a transport hop for data between apps).
    int('CONS', 'INT-KEY', { src: 'CONS', dst: 'Asakin Registry', direction: 'outbound', mechanism: 'HTTPS GET public key', endpoints: ['GET {registry}/api/auth/public-key'] }),
  ];
  const fieldMappings = [
    fm('PROV', 'M-1', 'INT-1', 'units.status', 'unitStatus', 'string'),
    fm('PROV', 'M-2', 'INT-1', 'units.id', 'id', 'string (uuid)'),
    fm('CONS', 'M-1', 'INT-1', 'unitStatus', 'local_units.unit_status', 'integer'),
    fm('CONS', 'M-2', 'INT-1', 'items[].projectRef', 'local_units.project_ref', 'string'),
    fm('CONS', 'M-3', 'INT-1', 'id', null, 'string'),
    fm('CONS', 'M-4', null, 'cfg.redirectUri', 'redirect_uri', 'string URL'),
    fm('CONS', 'M-5', 'INT-1 and INT-2', 'a', 'b', 'string'),
    fm('CONS', 'M-6', 'browser form -> API -> table', 'form.x', 'table.x', 'string'),
    fm('CONS', 'M-7', 'INT-2 (write path)', 'req.body.note', 'requests.note', 'text', { transformation: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc' }),
  ];
  const audit = (id: string, extra: Record<string, unknown>) => ({
    schemaVersion: '1.0', application: { name: id }, internalIntegrations: integrations.filter((x) => x.reportedBy === id).map((x) => ({ id: x.agentIntegrationId, name: x.name })),
    externalIntegrations: [], entities: [], unresolvedQuestions: ['Which apps call this?', 'Is the seeded default password still used?'], evidence: [], recordRelationships: [], ...extra,
    _collection: { slug: id.toLowerCase(), partsCollected: 1, truncationNotes: [], hasAllTopLevelKeys: true },
    // hostile key must be dropped by the parser
    __proto__: { polluted: true },
  });
  return {
    'consolidated-systems.json': { generatedAt: '2026-11-22', note: 'fixture', systems: [sys('PROV', 'Provider App'), sys('CONS', 'Consumer App')] },
    'consolidated-integrations.json': { generatedAt: '2026-11-22', integrations },
    'consolidated-field-mappings.json': { generatedAt: '2026-11-22', fieldMappings },
    'individual-audits/prov.integration-audit.json': JSON.stringify(audit('PROV', {
      recordRelationships: [{ from: 'projects', to: 'units', cardinality: '1:N', key: 'project_id' }],
    })).replace('"__proto__"', '"__proto__"'),
    'individual-audits/cons.integration-audit.json': JSON.stringify(audit('CONS', {
      evidence: [{ id: 'E1', finding: 'Calls PROV units via Tiny', file: 'src/sync.ts', function: 'pull', lines: '10-40', verificationStatus: 'CODE_OBSERVED' }],
    })),
    'project-inventory.csv': [
      'project_name,slug,replit_project_url,creator,publish_status,published_url,created,category,audit_scope,related_primary,audit_status,notes',
      'Provider App,PROV,u,someone,Published,prov.example,x,Provider,PRIMARY,,RESPONSE_COLLECTED,',
      'Consumer App,CONS,u,someone,Published,cons.example,x,Consumer,PRIMARY,,RESPONSE_COLLECTED,',
      'Asakin Registry,Asakin-Registry,u,someone,Draft,,x,Registry/Tiny,PRIMARY,,BLOCKED,view-only workspace',
    ].join('\n'),
    'registry-application-mapping.csv': [
      'replit_project,system_id,app_code_claimed_in_code,where_claimed,auth_app_code,registry_code,registry_name,registry_status,registry_base_url,project_domain,registry_health,match_status,notes',
      'PROV,PROV,PROV,env,,PROV,Provider,ACTIVE,https://prov.example,prov.example,,EXACT_MATCH,',
      'CONS,CONS,CONS,env,,CONS,Consumer,ACTIVE,https://cons.example,cons.example,,EXACT_MATCH,',
      'Asakin-Registry,ASAKIN-REGISTRY,n/a,—,,,,,,,,NOT_REGISTERED,The Registry itself',
    ].join('\n'),
    'registry-data/registry-apps.csv': 'code,name,status,base_url,updated\nPROV,Provider,ACTIVE,https://prov.example,2026-01-01\nCONS,Consumer,ACTIVE,https://cons.example,2026-01-01\nGHOST,Ghost App,ACTIVE,https://ghost.example,2026-01-01\nTEST9,Test thing,INACTIVE,https://t.example,2026-01-01\n',
    'registry-data/registry-grants.csv': 'caller,provider,scopes,grant_status,compatibility,caller_creds,caller_status,provider_status,updated\nCONS,PROV,units:read,ACTIVE,COMPATIBLE,YES,ACTIVE,ACTIVE,2026-01-01\n',
    'registry-data/registry-health.csv': 'code,app_status,api_health,integration_health,last_error,last_checked\nPROV,ACTIVE,HEALTHY 200,HEALTHY 200,,2026-11-22 10:00\n',
  };
}

export function importFixture(decisions: Decision[] = [], members = fixtureMembers()) {
  const { names, files } = fixtureFiles(members);
  return buildDataset({ archiveName: 'fixture.zip', archiveSha256: 'f'.repeat(64), memberNames: names, files, decisions });
}
