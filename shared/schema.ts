/**
 * Canonical domain model for the Asakin Systems Integration Map.
 * PRD §7. Every record keeps provenance back to the source archive member.
 * IDs are opaque and stable (hash of source identity), never display names/URLs/Registry codes.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = '1.0.0';

const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[0-9a-f]{12}$`), `expected ${prefix}_<12 hex>`);
export const SystemId = id('sys');
export const IntegrationId = id('int');
export const ChannelId = id('ch');
export const FlowId = id('flow');
export const MappingId = id('map');
export const EvidenceId = id('ev');
export const EntityMappingId = id('ent');
export const ConflictId = id('cfl');
export const ReviewId = id('rev');
export const RegistryId = id('reg');

/** PRD §7.2 evidence levels. Archive levels are always agent-reported claims. */
export const EvidenceLevel = z.enum([
  'proposed', 'reported', 'code_observed', 'test_verified', 'runtime_verified', 'production_verified', 'unknown',
]);
export type EvidenceLevel = z.infer<typeof EvidenceLevel>;
export const EVIDENCE_RANK: Record<EvidenceLevel, number> = {
  unknown: 0, proposed: 1, reported: 2, code_observed: 3, test_verified: 4, runtime_verified: 5, production_verified: 6,
};

export const EvidenceBasis = z.enum(['agent_reported', 'registry_ui_transcript', 'coordinator_reconciliation', 'human_reviewed']);

export const ProvRef = z.object({
  member: z.string().min(1),          // archive member path, e.g. ASAKIN-INTEGRATION-AUDIT/consolidated-integrations.json
  pointer: z.string(),                 // JSON pointer or CSV row reference
}).strict();
export type ProvRef = z.infer<typeof ProvRef>;

export const Coverage = z.enum(['complete', 'partial', 'not_audited']);
export const CoverageReason = z.enum([
  'audited', 'reply_truncated', 'blocked_agent_busy', 'blocked_view_only', 'registry_only', 'external_provider', 'library',
]);
export const SystemKind = z.enum(['business_app', 'shared_service', 'external_service', 'sdk_library']);
export const Layer = z.enum(['internal', 'external']);
export const DeploymentStatus = z.enum(['active', 'inactive', 'draft', 'deprecated', 'unknown']);

export const CodeRef = z.object({
  namespace: z.enum(['audit', 'registry', 'auth', 'chat_center', 'replit_project', 'domain', 'claimed_in_code']),
  value: z.string().min(1),
  source: z.string(),
}).strict();

export const System = z.object({
  id: SystemId,
  key: z.string().min(1),               // source identity used to derive the id (e.g. audit:APMS)
  displayName: z.string().min(1),
  agentName: z.string().nullable(),      // application name as written by the audit agent
  aliases: z.array(z.string()),
  codes: z.array(CodeRef),
  description: z.string().nullable(),
  shortDescription: z.string().nullable(), // <= 20 words (PRD D-004)
  category: z.string().nullable(),
  domain: z.string(),
  kind: SystemKind,
  layer: Layer,
  coverage: Coverage,
  coverageReason: CoverageReason,
  coverageNote: z.string().nullable(),
  deploymentStatus: DeploymentStatus,
  deploymentStatusSource: z.string().nullable(),
  domainName: z.string().nullable(),     // published host (safe, informational, never fetched)
  registryRecordId: RegistryId.nullable(),
  lastAudit: z.string().nullable(),
  openQuestions: z.array(z.string()),
  provenance: z.array(ProvRef),
}).strict();
export type System = z.infer<typeof System>;

export const UnresolvedClass = z.enum([
  'any_granted_caller', 'unknown', 'multiple_systems', 'operator', 'scheduler', 'end_user', 'navigation_link',
  'indirect_dependency', 'counterpart_not_stated', 'unrecognized',
]);
export type UnresolvedClass = z.infer<typeof UnresolvedClass>;

export const EndRef = z.object({
  systemId: SystemId.nullable(),
  raw: z.string().nullable(),
  qualifier: z.enum(['browser', 'server', 'script']).nullable(),
  unresolved: z.object({ class: UnresolvedClass, candidates: z.array(SystemId) }).strict().nullable(),
  rule: z.string(),
}).strict();
export type EndRef = z.infer<typeof EndRef>;

export const RequestInitiator = z.enum(['source', 'target', 'unknown']);
export const DataDirection = z.enum(['source_to_target', 'target_to_source', 'bidirectional', 'unknown']);

export const MechanismKind = z.enum([
  'sso_oidc', 'oidc_backchannel', 'registry_assisted_api', 'registry_call', 'rest_api', 'webhook', 'sdk_call',
  'object_storage', 'browser_asset', 'navigation_link', 'file_export', 'script', 'manual', 'internal', 'unknown',
]);
export type MechanismKind = z.infer<typeof MechanismKind>;
export const Tri = z.enum(['yes', 'no', 'unknown']);
export const TriggerKind = z.enum(['scheduled', 'on_demand', 'event', 'manual', 'startup', 'unknown']);

export const Endpoint = z.object({
  owner: z.string().nullable(),
  method: z.string().nullable(),
  path: z.string(),
  normalizedPath: z.string().nullable(),
}).strict();

export const Corroboration = z.enum(['one_sided', 'two_sided', 'provider_surface_match', 'conflict']);

export const Integration = z.object({
  id: IntegrationId,
  reportedBySystemId: SystemId,
  agentIntegrationId: z.string(),
  category: z.enum(['internal', 'external']),
  name: z.string().nullable(),
  purpose: z.string().nullable(),
  source: EndRef,
  target: EndRef,
  scope: z.enum(['inter_system', 'intra_system', 'unresolved', 'negative_finding']),
  direction: z.object({
    raw: z.string().nullable(),
    requestInitiator: RequestInitiator,
    data: DataDirection,
    rule: z.string(),
  }).strict(),
  mechanism: z.object({ kind: MechanismKind, raw: z.string().nullable(), rule: z.string() }).strict(),
  registryRole: z.object({
    assistedRaw: z.string().nullable(),
    discovery: Tri, authorization: Tri, routing: Tri, dataTransfer: Tri,
    raw: z.string().nullable(),
  }).strict(),
  registryGrant: z.object({
    status: z.enum(['active', 'revoked', 'none', 'not_applicable', 'not_checkable']),
    grantId: RegistryId.nullable(),
    consolidatorNote: z.string().nullable(),
  }).strict(),
  endpoints: z.array(Endpoint),
  sdkSystemIds: z.array(SystemId),
  trigger: z.object({ kind: TriggerKind, raw: z.string().nullable(), frequency: z.string().nullable() }).strict(),
  auth: z.string().nullable(),           // non-secret auth pattern; sensitive text withheld
  deployment: z.object({
    status: z.enum(['active', 'disabled', 'unused', 'legacy', 'one_off', 'unknown']),
    raw: z.string().nullable(),
  }).strict(),
  evidence: z.object({
    level: EvidenceLevel,
    levelsClaimed: z.array(EvidenceLevel),
    basis: EvidenceBasis,
    raw: z.string().nullable(),
  }).strict(),
  evidenceIds: z.array(EvidenceId),
  corroboration: z.object({
    state: Corroboration,
    counterpartIds: z.array(IntegrationId),
    basis: z.string(),
  }).strict(),
  channelId: ChannelId.nullable(),
  consolidator: z.object({ source: z.string().nullable(), destination: z.string().nullable(), differs: z.boolean() }).strict(),
  withheldFields: z.array(z.string()),
  provenance: z.array(ProvRef),
}).strict();
export type Integration = z.infer<typeof Integration>;

/** A logical channel between two resolved systems: one or more matching claims. */
export const Channel = z.object({
  id: ChannelId,
  systemA: SystemId,                     // lexicographically smaller id
  systemB: SystemId,
  claimIds: z.array(IntegrationId).min(1),
  matchBasis: z.enum(['single_claim', 'endpoint_match', 'reviewed']),
  data: z.enum(['a_to_b', 'b_to_a', 'bidirectional', 'unknown', 'conflict']),
  requestInitiator: z.enum(['a', 'b', 'both', 'unknown', 'conflict']),
  mechanismKinds: z.array(MechanismKind),
  label: z.string(),
  evidenceLevel: EvidenceLevel,
  corroboration: Corroboration,
  registryAssisted: z.boolean(),
  deploymentStatus: z.enum(['active', 'disabled', 'unused', 'legacy', 'one_off', 'unknown', 'mixed']),
}).strict();
export type Channel = z.infer<typeof Channel>;

export const Flow = z.object({
  id: FlowId,
  channelId: ChannelId,
  producerSystemId: SystemId,
  consumerSystemId: SystemId,
  requestInitiatorSystemId: SystemId.nullable(),
  claimIds: z.array(IntegrationId).min(1),
  entities: z.array(z.string()),
  triggerKinds: z.array(TriggerKind),
  evidenceLevel: EvidenceLevel,
}).strict();
export type Flow = z.infer<typeof Flow>;

export const Cardinality = z.enum(['1:1', '1:N', 'N:1', 'N:M', 'unknown']);
export type Cardinality = z.infer<typeof Cardinality>;

export const EntityMapping = z.object({
  id: EntityMappingId,
  reportedBySystemId: SystemId,
  kind: z.enum(['record_relationship', 'flow_entity']),
  sourceEntity: z.string(),
  destinationEntity: z.string().nullable(),
  cardinality: Cardinality,
  cardinalityRaw: z.string().nullable(),
  key: z.string().nullable(),
  integrationIds: z.array(IntegrationId),
  sourceOfTruthClaim: z.string().nullable(),
  note: z.string().nullable(),
  provenance: z.array(ProvRef),
}).strict();
export type EntityMapping = z.infer<typeof EntityMapping>;

export const MappingLinkStatus = z.enum(['matched', 'token_reference', 'multi_integration', 'unmatched_reference', 'missing_integration_id']);
export type MappingLinkStatus = z.infer<typeof MappingLinkStatus>;
export const ReviewStatus = z.enum(['new', 'matched', 'conflict', 'needs_review', 'accepted', 'rejected']);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const FieldMapping = z.object({
  id: MappingId,
  reportedBySystemId: SystemId,
  agentMappingId: z.string().nullable(),
  ordinal: z.number().int().nonnegative(),  // row index in consolidated-field-mappings.json
  link: z.object({
    status: MappingLinkStatus,
    raw: z.string().nullable(),
    integrationIds: z.array(IntegrationId),
    rule: z.string(),
  }).strict(),
  entity: z.string().nullable(),
  directionRaw: z.string().nullable(),
  sourcePath: z.string().nullable(),       // exact, as reported; null = غير موثق
  destinationPath: z.string().nullable(),  // never copied from source
  dataType: z.string().nullable(),
  required: z.boolean().nullable(),
  transformation: z.string().nullable(),
  usage: z.string().nullable(),
  evidence: z.object({ level: EvidenceLevel, raw: z.string().nullable(), basis: EvidenceBasis }).strict(),
  reviewStatus: ReviewStatus,
  withheldFields: z.array(z.string()),
  provenance: z.array(ProvRef),
}).strict();
export type FieldMapping = z.infer<typeof FieldMapping>;

export const Evidence = z.object({
  id: EvidenceId,
  reportedBySystemId: SystemId,
  agentEvidenceId: z.string().nullable(),
  kind: z.enum(['code_reference', 'claim_record']),
  finding: z.string().nullable(),
  file: z.string().nullable(),
  symbol: z.string().nullable(),
  lines: z.string().nullable(),
  level: EvidenceLevel,
  levelRaw: z.string().nullable(),
  basis: EvidenceBasis,
  observedAt: z.string().nullable(),
  contentWithheld: z.boolean(),
  provenance: z.array(ProvRef),
}).strict();
export type Evidence = z.infer<typeof Evidence>;

export const RegistryRecord = z.object({
  id: RegistryId,
  code: z.string(),
  name: z.string(),
  status: z.string(),
  baseUrl: z.string().nullable(),
  updated: z.string().nullable(),
  health: z.object({
    api: z.string().nullable(), integration: z.string().nullable(), lastChecked: z.string().nullable(),
    note: z.literal('registry_monitor_snapshot_not_live'),
  }).strict().nullable(),
  systemId: SystemId.nullable(),
  provenance: z.array(ProvRef),
}).strict();
export type RegistryRecord = z.infer<typeof RegistryRecord>;

export const RegistryGrant = z.object({
  id: RegistryId,
  callerCode: z.string(),
  providerCode: z.string(),
  callerSystemId: SystemId.nullable(),
  providerSystemId: SystemId.nullable(),
  scopes: z.array(z.string()),
  status: z.string(),
  compatibility: z.string().nullable(),
  updated: z.string().nullable(),
  provenance: z.array(ProvRef),
}).strict();
export type RegistryGrant = z.infer<typeof RegistryGrant>;

export const RegistrationMatch = z.object({
  id: RegistryId,
  replitProject: z.string().nullable(),
  systemId: SystemId.nullable(),
  registryCode: z.string().nullable(),
  authAppCode: z.string().nullable(),
  claimedInCode: z.string().nullable(),
  matchStatus: z.string(),
  note: z.string().nullable(),
  provenance: z.array(ProvRef),
}).strict();

export const Conflict = z.object({
  id: ConflictId,
  kind: z.enum(['field_contract_mismatch', 'direction_mismatch', 'registry_transport_claim', 'identity_ambiguity']),
  severity: z.enum(['high', 'medium', 'low']),
  summary: z.string(),
  claims: z.array(z.object({
    integrationId: IntegrationId.nullable(),
    mappingIds: z.array(MappingId),
    reportedBySystemId: SystemId.nullable(),
    statement: z.string(),
  }).strict()).min(2),
  status: ReviewStatus,
  decisionId: z.string().nullable(),
}).strict();
export type Conflict = z.infer<typeof Conflict>;

export const ReviewItem = z.object({
  id: ReviewId,
  kind: z.enum([
    'unresolved_endpoint', 'possible_counterpart', 'field_not_found_on_counterpart', 'normalization_differs_from_consolidator',
    'registry_transport_claim',
  ]),
  subjectId: z.string(),
  relatedIds: z.array(z.string()),
  note: z.string(),
  status: ReviewStatus,
  decisionId: z.string().nullable(),
}).strict();
export type ReviewItem = z.infer<typeof ReviewItem>;

export const Snapshot = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  inventoryVersion: z.string(),
  generatedAt: z.string(),                // taken from the archive, never wall-clock (idempotency)
  reviewedAt: z.string().nullable(),
  importerVersion: z.string(),
  gitSha: z.string().nullable(),
  sourceRefs: z.array(z.object({ name: z.string(), sha256: z.string(), members: z.number().int() }).strict()),
  counts: z.record(z.string(), z.number()),
  notes: z.array(z.string()),
}).strict();
export type Snapshot = z.infer<typeof Snapshot>;

export const Dataset = z.object({
  meta: Snapshot,
  systems: z.array(System),
  integrations: z.array(Integration),
  channels: z.array(Channel),
  flows: z.array(Flow),
  entityMappings: z.array(EntityMapping),
  fieldMappings: z.array(FieldMapping),
  evidence: z.array(Evidence),
  registry: z.object({
    records: z.array(RegistryRecord),
    grants: z.array(RegistryGrant),
    matches: z.array(RegistrationMatch),
  }).strict(),
  conflicts: z.array(Conflict),
  reviewQueue: z.array(ReviewItem),
}).strict();
export type Dataset = z.infer<typeof Dataset>;

/** Human-reviewed decisions (Git-reviewed, never written by the importer). */
export const Decision = z.object({
  id: z.string().regex(/^DEC-\d{3,}$/),
  subjectType: z.enum(['conflict', 'review_item', 'endpoint', 'mapping_link', 'system']),
  subjectKey: z.string().min(1),          // stable id (cfl_/rev_/map_), `<int_id>:source|target`, or a system key (subjectType system)
  decision: z.enum(['accepted', 'rejected', 'set_system', 'exclude', 'rename']),
  systemKey: z.string().nullable().optional(),
  displayName: z.string().trim().min(1).max(120).nullable().optional(),   // decision 'rename' (subjectType system)
  rationale: z.string().min(1),
  reviewer: z.string().min(1),
  reviewedAt: z.string().min(1),
}).strict();
export type Decision = z.infer<typeof Decision>;
export const DecisionsFile = z.object({ decisions: z.array(Decision) }).strict();
