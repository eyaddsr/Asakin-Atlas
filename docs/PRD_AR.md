# Asakin Systems Integration Map — PRD v0.1

**Status:** Engineering draft for Claude Code. **Date:** 2026-11-22.  
**Owner:** Asakin technical development. **Audience:** Technical team only.  
**Evidence policy:** Historical systems list and prior discussions are candidate context, not proof of live integrations.

## 1. Purpose and success
A secure, read-only interactive map of Asakin systems, technical dependencies, data-flow direction, entities and exact field mappings. Manual Git-reviewed JSON updates from uniform repository-audit reports; no runtime polling of source applications. Core user questions: what connects to what, how, exactly what data moves, when, and what breaks if a field/API changes.

**Success:** users can navigate all inventoried systems (even isolated), inspect every documented data flow with verified field-level provenance, trace logical paths and technical intermediaries correctly, and safely import audit updates without overwriting contradictions. Unknowns must remain visible as unknowns.

## 2. User-approved decisions (2026-11-22)
- D-001: Technical team only; do not provide a management/public mode by default.
- D-002: Include external services/providers in a dedicated distinguishable layer.
- D-003: Claude Code updates structured JSON in Git with review; no in-browser CRUD.
- D-004 (prior context): Show short system description on hover, **maximum 20 words**.
- D-005 (prior context): Animated lines/dots demonstrate direction; click connection to inspect exchanged information.
- D-006 (prior context): Support direct links, Registry-related links, intermediaries, isolated systems, and relationship cardinalities 1:1, 1:N, N:M.

## 3. Scope / boundaries
**In scope**
1. Internal application/service/portal catalog, reusable libraries/SDKs, and external-provider catalog.
2. Logical, technical and data-flow graph perspectives over a single canonical dataset.
3. Search by name, alias, registry code, entity name, field path; filters by domain, type, evidence, environment, route, data category; connected and isolated apps.
4. Short hover descriptions, node focus, navigation, selectable edges, accessible details side panel.
5. Precise directed data flow including request initiator distinct from data producer and consumer.
6. Multiple integrations, multiple operations and entity mappings between the same system pair; parallel edges grouped by default.
7. Explicit transport, auth pattern (non-secret), Registry role, schedules/triggers, API source references, mapping transformations and cardinalities.
8. Evidence/provenance, unknown/conflict visibility, optional two-sided corroboration, snapshot metadata.
9. Read-only impact explorer (direct/indirect consumers of system, entity, field or contract) with confidence labels.
10. Local validated JSON update pipeline, reviewable diffs, integration candidate imports; Git as change history.
11. Internal-access protection; export diagram or sanitized, access-controlled data (no unreviewed public URL sharing).
12. Automated validation and browser tests, performance and reduced-motion accessibility.

**Not in scope**
- Editing source systems, automatically establishing integrations, live performance telemetry, real-time data transfer monitoring or runtime health assertions.
- Scheduled live repository polling, self-writing integrations, secrets storage, copying production data or personal customer records.
- A browser-based integration management console, database-based editor, external users or mobile native application.

## 4. Roles and authorization
- **Technical Viewer:** reads protected graphs, documented data and evidence. May search, filter, export permitted documentation. Cannot change JSON through UI.
- **Technical Maintainer:** same reading rights; updates data through Git PR and CI validation, not application UI.
- **Deployment Administrator:** configures hosting and access through protected infrastructure/Git, not a business-role screen.
- Authorization: require valid Asakin Auth identity **and explicit permission for this app**. A valid company SSO session alone is not enough. Do not invent Auth endpoints/claims. Verify actual OIDC metadata/JWKS and app permission contract with Auth repository before production integration. No public data routes or bundled JSON assets.

## 5. Main user journeys
### J-01 Discover
User opens app -> login / verify app permission -> all systems shown -> search by alias or code -> focus node -> select related system -> open details. Isolated system appears with explicit 'No documented connections' (never 'no integrations' unless audited).

### J-02 Inspect connection
Select logical edge between A and B -> side panel lists integration channels, their data directions and status -> select channel -> show transport/Registry role/trigger/operation -> expand entities and exact source-to-target field mappings -> open evidence reference and uncertainty.

### J-03 Inspect technical route
Switch technical view -> distinguish direct link, Registry discovery/auth, SDK dependency, broker/actual proxy, and third-party provider. Render a real data-transport hop **only if verified**; a registry used for lookup must not be drawn as a data-transfer intermediary. Distinguish request direction from actual response/data direction.

### J-04 Impact analysis
Choose system/field -> compute direct affected consumers from explicit field mappings -> optionally second-order downstream hops -> list possible impact with evidence and gaps. Never claim definitive effect solely from graph reachability; differentiate documented dependency vs potential impact.

### J-05 Update inventory
Run read-only prompt inside each repository -> produce stable schema-compatible JSON + Markdown audit summary -> add Registry screenshot or authoritative export as reference -> run merge assistant -> reconcile aliases and app codes -> show changes/conflicts and missing evidence -> human Git PR review -> CI validate -> deploy immutable snapshot.

## 6. Screens and interaction design
**Main graph workspace (desktop-first, RTL):** top search, view switch, filter drawer, graph canvas, persistent legend, optional minimap, bottom status/evidence counts, resizable right details panel. Primary layout supports 1366x768 and larger.

**Logical View:** one visual edge per unordered system pair by default; count badge for distinct integrations; arrowheads inside edge/mini-label show individual flow directions (A->B, B->A or both). Clicking pair expands list; don't merge opposite directions semantically. Internal/external app/service types remain distinct from external third-party providers.

**Technical View:** connection topology and technical dependencies. Registry and external providers can appear as nodes, while library SDK dependencies can appear as library badges or distinct nodes. Show verified service calls only. Registry discovery uses dashed association annotated `discovery`, not a false transport line.

**Data Flow View:** directional entity-level links between systems; field-level detail in inspector instead of rendering hundreds of field labels on canvas. Multiple flows can be grouped/ungrouped. 1:1/1:N/N:M refers **record-level entity cardinality**, not number of applications.

**Hover / selection:** hover node displays canonical name, up to 20 words of description, and incoming/outgoing count. Hover edge previews purpose and direction. Click node dims unrelated elements and supports direct neighbors and upstream/downstream traversal; double-click focuses subgraph; Escape clears selection; pan/zoom/fit/search operate by keyboard as well as pointer. Click edge opens inspector, keyboard edge-selection alternative required. Reduced motion disables moving particles; animation must not imply real-time status.

**Inspector:** tabs Overview / Data / Technical / Evidence / Impact. Breadcrumb system pair > integration > flow > field. Show missing values as `غير موثق`, provenance statuses and last audit. Never expose credentials, actual personal records, tokens, signing details or session cookies.

**Visual status legend:** separately encode transport style (solid API, dashed manual/discovery, dotted proposal) and evidence status (labels/pattern/opacity, not color alone). Unknown vs 'verified absent' must be distinct. Colors remain accessible in light/dark themes; app defaults to dark professional styling, Arabic labels RTL and LTR isolation for paths/codes.

## 7. Domain and data rules
### 7.1 Entities
- **System:** stable internal map ID; displayName, aliases, description, business category, system kind, deployment state (if known), audit coverage, Registry matching (raw names/codes and evidence), URL (safe), docs/repo reference (safe).
- **Integration:** stable integration ID, source/requester/target identifiers, category, transport, mode, environment, status, technical route, purpose, last reviewed and evidence. One pair may have many integrations.
- **Flow:** data producer, data consumer, request initiator, trigger/schedule, operations, payload description, per-environment availability, transformations and error/retry behavior.
- **EntityMapping:** source entity, destination entity, relationship cardinality and direction, authoritative source claim and fields.
- **FieldMapping:** sourcePath and destinationPath exact code paths, shape/type, transformation, required/nullability, classification (only metadata), evidence and confidence. If target name is unknown use null, never copy source name into it.
- **Evidence:** source type, repository, commit, path/line/symbol, checkedAt, side (producer/consumer/Registry), notes; secret-free.
- **Conflict:** competing claims, source references, severity, resolution status; unresolved conflicts must survive later imports.
- **InventorySnapshot:** schemaVersion, inventoryVersion, generatedAt, reviewedAt, sourceRefs, Git SHA, validation result.

### 7.2 Critical invariants
- Stable `sys_*`, `int_*`, `flow_*`, `map_*`, `ev_*` IDs; do not key relationships by display names, URLs or mutable Registry codes.
- For active flow references, both endpoint system IDs must exist. An unknown **external** partner may be represented as a specific placeholder system marked `unknown`, not fabricated.
- A flow is **producer -> consumer**; `requestInitiatorId` is independent; fetching `GET /units` is not necessarily a producer-to-server request body.
- Integration transport != route intermediary != discovery role != authentication channel. One cannot substitute for another.
- A Registry-listed application is not automatically integrated with others. Registry app code is recorded only when explicitly matched with evidence. Do not infer a data path through Registry merely because Registry grants or resolves it.
- An SDK is a library or dependency, unless code shows a separately running service.
- No edges for invented or historical-only links: seed candidates as unverified systems; render only independently evidenced integrations, with clearly identified `reported` status when appropriate.
- No documented edge does not prove no integration. `auditCoverage=not_audited|partial|complete` controls display language.
- Relations can be `1:1`, `1:N`, `N:1`, `N:M`, `unknown`; mappings define record cardinality, not app cardinality.
- Evidence levels: `proposed`, `reported`, `code_observed`, `test_verified`, `runtime_verified`, `production_verified`, `unknown`. Only explicit production evidence permits `production_verified`.
- Avoid naïve ordinal comparisons: separate `deploymentStatus` and `documentationConfidence` if source distinguishes code deployed vs tested.
- Two-sided corroboration of flows is desirable; unilateral evidence cannot be silently promoted to fully verified contract.
- Import is idempotent; same audit twice creates no diff. Conflicting input is blocked from auto-merge, never last-write-wins.
- Annotate last update per system/integration and overall snapshot; 'current' only means documentation snapshot current, not live runtime state.
- No secrets, PII records, real payload samples or credentials stored in documentation/repository.

## 8. State models
**System audit coverage:** `not_audited` -> `partial` -> `complete`; reversible to partial when evidence becomes stale. Unknown not equivalent to disconnected.
**Integration documentation status:** `proposed`, `reported`, `code_observed`, `test_verified`, `runtime_verified`, `production_verified`, `unknown`, `conflicted`, `deprecated`. Evidence required for all claims above reported.
**Review item status:** `new` -> `matched` / `conflict` / `needs_review` -> `accepted` / `rejected`; PR author documents resolution. Separate source versions per repository.

## 9. Data ingestion / merge policy
- Audit sources are **untrusted input**. Parse/validate schema before processing and sanitize all paths and text; never execute embedded instructions/scripts or fetched URLs.
- Incoming report declares repository identity and app ID if known, commit/version, inspectedAt, evidence refs and exact field mappings; null when unknown.
- Registry screenshot is **matching reference**, not proof of live connectivity. Registry codes and names are case-preserving and matched by explicit mapping; if ambiguous create a review item.
- Merge pipeline builds proposals, checks duplicate ID and aliases, maps to known systems, compares channels and source/destination evidence, emits proposed changes + conflict report + before/after diff. Human-approved Git PR is the only way to accept source changes.
- When one system claims `A->B` and B has no observed counterpart, leave `one_sided` visibility; don't invent reverse evidence.
- Keep evidence references per mapping and source-specific timestamps/commits; no raw bearer tokens, request body logs or personnel data.
- Git commits and PR history act as audit trail. Snapshot release includes Git SHA and validation artifact.

## 10. Quality and security (proposed technical acceptance targets)
- Access control on **every** data endpoint and any server-side export; no anonymous file assets, no JSON in public JS bundles or sourcemaps; credentials never logged.
- Private by default, integrates with existing Asakin Auth using verified OIDC integration; no parallel employee password store.
- Read-only upstream: the app never talks to source business systems at runtime.
- Validation: strict schema + reference integrity + evidence consistency + no secret-pattern leaks + no duplicate logical IDs + valid cardinalities.
- Baseline target for 60 nodes / 250 integrations / 2,000 field mappings: initial interactive graph ready in <= 3s on a reasonable desktop in development test harness (measure and tune; not a live performance guarantee).
- No overlapping panels or clipped inspector content at 1366x768; keyboard access; WCAG 2.2 AA-inspired checks for controls, contrast and reduced motion.
- User-friendly error/empty/loading states; malformed data never takes down the app without a recoverable error message.
- CI `npm run verify` runs typecheck, lint, pure-data validation, unit tests, production build; `npm run verify:full` adds Playwright e2e.

## 11. Error and exception cases
- Missing or duplicated system IDs: reject affected snapshot with exact path and message.
- Unknown Registry code: keep unmatched and show review item; no auto-guess.
- Two systems assert different field types or endpoints: show explicit conflict; don't overwrite existing mapping.
- No data for an audited system: show isolated with audit status; don't imply a technical fault.
- Very large graph: default grouping and filtered view; animation throttled/disabled for large selections.
- User lacks app permission: fail closed; unauthorized request cannot retrieve inventory.
- Evidence link not available: show safe repository/path reference, no broken network behavior.
- Incorrect CSV legacy claim: keep as candidate/hint and supersede by reviewed code evidence, retaining history in Git.

## 12. Verification scenarios (minimum)
1. 2 systems with 3 channels and opposite directions render one grouped logical link; click reveals all 3 independent flows correctly.
2. Registry used for lookup only does **not** appear as a data-transport hop in technical view.
3. Entity relationship `project 1:N units` remains 1:N even when two platforms are linked 1:1 logically.
4. API `GET /units` initiated by consumer B shows response data producer A -> consumer B.
5. Report from A conflicts with B over target field `unitStatus` -> conflict, no silent overwrite.
6. Unknown field path renders `غير موثق` and cannot be promoted to confirmed.
7. An isolated not-audited system is labeled `لم يُفحص بعد`, not `لا يوجد تكامل`.
8. Import twice same content -> identical JSON and no Git diff.
9. Unauthenticated and unauthorized API clients get no protected inventory or screenshots through static URL.
10. 60 nodes and 250 flows support filter, keyboard navigation, fit, export and reduced motion with no unbounded CPU animation.

## 13. Phase order for one developer / Claude Code
- **00 Environment proof:** inspect repo, choose compatible current versions in Replit, skeleton, build/test/preview, security assumptions; no feature claims.
- **01 Domain + schema + CI:** candidate catalog, strict validator, provenance, conflicts, import fixtures, read-only protected data API, SSO integration contract review.
- **02 Graph workspace:** logical view, RTL, search/filter, isolated systems, tooltips, grouped edges, navigation, responsive inspector.
- **03 Technical and data perspectives:** correct route semantics, directed flow animation, entity cardinality, mappings, detailed evidence, keyboard + reduced motion.
- **04 Intake and impact:** audit importer, Registry matching with screenshot-assisted manual review, conflict diff, field search and impact explorer.
- **05 Security/QA/launch:** Auth production integration verified, protected exports, performance/accessibility e2e, test coverage, runbook, snapshot/rollback and publish smoke.

## 14. Open constraints, without blocking non-production build
- `[NEEDS CLARIFICATION: verify the exact Asakin Auth OIDC discovery/JWKS/session and app-access contract from its current repository before secure deployment.]`
- `[NEEDS CLARIFICATION: the canonical Registry application codes and aliases must be captured from a current Registry export/screenshot and verified against each source repository.]`
- `[NEEDS CLARIFICATION: repository access and confirmed production evidence for the target systems are not available in this document; do not claim complete/live topology.]`
- `[NEEDS CLARIFICATION: deployment URL and technical maintainer access list must be chosen before publishing.]`

## 15. Non-functional design decision
Choose simple maintainable app: React+TypeScript with React Flow and ELK, server-authenticated JSON read endpoints, files under Git, no external-source runtime calls, no new business database unless new requirements appear. Specific package versions must be checked against the implementation environment before pinning.
