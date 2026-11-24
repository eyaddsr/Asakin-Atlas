# Data Quality Report — first canonical snapshot

Snapshot `audit-2026-11-22+ede16c74665f` · importer 1.0.0 · schema 1.0.0 · source `docs/ASAKIN-INTEGRATION-AUDIT.zip` (199 members, sha256 `ede16c74…c25b`).
The full generated accounting is in `data/private/canonical/reconciliation-report.md`; this file explains what the numbers mean.

## 1. Source verification (brief figures recounted)

| Brief figure | Recounted in archive | Status |
|---|---|---|
| 45 projects / 34 primary / 31 audited (30 complete + Chat Center partial) / 3 blocked / 11 out of scope | `project-inventory.csv`: 45 rows; 34 PRIMARY; 31 collected; Payments, Auth, Asakin Registry BLOCKED; 11 NOT_AUDITED | ✅ matches |
| `consolidated-systems.json`: 31 records | 31 | ✅ |
| `consolidated-integrations.json`: 263 (203 internal, 60 external) | 263 (203 / 60) | ✅ |
| `consolidated-field-mappings.json`: 1,290 rows; 876 matched / 191 unmatched / 223 no id | 1,290; 876 / 191 / 223 | ✅ |

## 1a. Reviewed exclusions (2026-11-23)

At the technical team's request, seven external providers were removed from the map by reviewed decisions DEC-001…DEC-007 (`data/private/reviewed/decisions.json`): Replit Object Storage, Browser push services, Ejar, Expo Push, Google Cloud Storage, Google Fonts and Unsplash. The canonical snapshot therefore holds **48 systems, 242 claims and 1,282 field-mapping rows** (21 claims, 8 mapping rows and 29 claim-only evidence records removed; the archive itself is unchanged). The figures in §2 describe the import before these decisions; an import without decisions still preserves all 263 claims and 1,290 rows (tested).

## 2. What was imported and how it is labelled

| Item | Count | Notes |
|---|---|---|
| Systems | 55 | 30 audited complete, 1 partial (Chat Center), 3 blocked (Payments, Auth, Registry), 4 Registry-only (VIEW, INVP, PPC, AOPP), 16 external providers, 1 SDK (AsakinTiny). TEST_APP/TEST1 kept only as Registry records (inactive test entries). |
| Integration claims | 263 (all) | 202 inter-system, 4 intra-system, 56 with an unresolved end, 1 agent negative finding (MARKETERS-LEGACY INT-003 "NOT_FOUND"). |
| Channels (grouped claims) | 201 | 1 two-sided by endpoint match, 35 corroborated by the provider's own surface claim, 165 one-sided. |
| Flows (producer → consumer) | 238 | Only for channels with a documented data direction; 19 channels have direction غير موثق and produce no flow. |
| Field mappings | 1,290 (all) | 876 matched; 414 in `missing-mapping-links.json`: 11 token_reference, 40 multi_integration, 140 unmatched_reference, 223 missing_integration_id. None rendered as a confirmed exchange. |
| Evidence records | 556 | 263 claim records (archive pointers) + 293 agent code references actually cited by claims. Uncited evidence items are not imported. |
| Conflicts | 0 automatic | Direction and field-type contradictions are detected automatically (tested); none fired on this archive. |
| Review queue | 138 | 56 unresolved endpoints, 55 places where this importer disagrees with the archive's consolidator, 27 consumer fields not found on the producer side. |
| Withheld text | 24 fields | 2 secret-like values, 22 security-finding sentences (see §5). |

Evidence levels (agent-reported, none independently verified): code_observed 160 · production_verified 36 · test_verified 14 · reported 13 · runtime_verified 3 · proposed 4 · unknown 33. When an agent qualified a mixed claim (e.g. "health: PRODUCTION_VERIFIED; v2 routes: CODE_OBSERVED") the lower level is used; raw text is always kept.

## 3. Normalization rules (explicit, traceable)

Every normalized value records the rule that produced it (`rule` fields). Source: `scripts/lib/rules.ts`.

- **Endpoint resolution** (R-*): UNKNOWN/any-caller → unresolved `any_granted_caller`/`unknown`; operator/scheduler/end-user/navigation → unresolved classes (never nodes); "via Chat Center" → `indirect_dependency`; "A or B" with uncertainty → `unknown` with candidates; "A and B" → `multiple_systems`; otherwise the earliest named system wins, with the reporter's own aliases checked so that, e.g., `marketers-platform api-server` resolves to MARKETERS-LEGACY, not MARKETERS. Browser of the reporting app → the reporting system with qualifier `browser`. Negated phrases ("not in Registry") are removed before matching. Every imported system key and Registry code is resolvable (dynamic catalog).
- **Direction** (D1–D9): request initiator and data direction are derived separately, reporter-relative, from the raw direction text, documented HTTP methods (Registry discovery/token/key endpoints excluded) and mechanism. Example: AOP `outbound` + `GET` → initiator AOP, data APMP → AOP.
- **Mechanism** (M1–M14): back-channel logout, OIDC, call-to-Registry, navigation link, browser asset, webhook, Registry-assisted API, file, script, manual, object storage, SDK, API. The consolidator's regex-based `registryAssisted=true` is ignored when the agent's text negates Registry (e.g. per-app HS256 secrets for Chat Center).
- **Registry role** is four separate facets (discovery, authorization, routing, dataTransfer). Registry is never drawn as a transport hop; a claim stating Registry carries data becomes a review item.
- **Grants** are matched from `registry-grants.csv` (caller = request initiator) and shown as configuration, never as traffic.
- **Two-sided reconciliation**: claims from both systems of a pair are merged into one channel only when a normalized endpoint path matches; both claims are preserved. Caller claims that match a provider's "unknown callers" surface by path are marked `provider_surface_match`. Same pair without paths → `possible_counterpart` review item.
- **Mapping links** (L0–L3): exact own integration id → matched; free text naming one/several own ids (incl. ranges "INT-004 to INT-008") → token_reference / multi_integration; otherwise unmatched_reference; null → missing_integration_id.
- **Deterministic IDs**: `sys_/int_/ch_/flow_/map_/ev_/ent_/cfl_/rev_/reg_` + 12 hex of sha256 over source identity; duplicate mapping tuples get an occurrence index. No timestamps; sorted output.

## 4. Consolidator defects found and corrected (kept visible as review items)

The archive's own `consolidated-integrations.json` normalisation (regex over agent text) mislabelled several peers. The raw values and the consolidator's value are retained on each claim (`consolidator`), and each difference is a `normalization_differs_from_consolidator` review item (55). Notable cases:

| Claim | Consolidator | This importer | Why |
|---|---|---|---|
| MARKETERS INT-006 | → ASAKIN-REGISTRY | → CHAT-CENTER | raw: "Chat Center (chat.asakin.sa; not in Registry)" |
| MARKETERS-LEGACY INT-001/002 | MARKETERS → | MARKETERS-LEGACY → | reporter's own alias; the two apps must not be merged |
| WEB INT-OUT-CHATCENTER-EMBED | CHAT-CENTER → CHAT-CENTER | WEB → CHAT-CENTER | self-loop artefact |
| MARKETERS EXT-003, RENT EXT-WEBPUSH | → WEB | → Browser push services | "web-push" is not the WEB app |
| INP EXT-001 | → DOCS | unresolved (unknown) | raw: "UNKNOWN (docs mention WhatsApp)" |
| APMP INT-01 | PPE → APMP | unresolved caller (candidate PPE) | raw: "UNKNOWN (only PPE evidenced)" |
| WEB INT-OUT-PEER-MEDIA | → APMP | unresolved `multiple_systems` (APMP, AOP) | raw names two systems |
| ~30 external claims | UNKNOWN → UNKNOWN | provider resolved from id/name (e.g. Telegram, Ejar, Google Fonts) | consolidator ignored `name`/`id` |

## 5. Excluded or withheld content

- Not read: `_tools/` (scripts, never executed), `_raw/` transcripts, `audit-prompt.txt`, `registry-screenshots/`, `tracking.csv`, `integration-discrepancies.md` (its integration table is useful, but it is interleaved with restricted security findings; reconciliation is recomputed from structured data instead).
- `project-inventory.csv` `creator` usernames are not imported.
- Free text matching secret-value patterns (JWT, long keys, password assignments) or security-finding language (unauthenticated endpoints, default credentials, plaintext secrets, etc.) is replaced with «محجوب» and the field name recorded. Security findings belong to the restricted workflow (`CONFIDENTIAL-risk-triage.md`, which is not graph input, not in Git, and not reachable by the app).

## 6. Known gaps and blockers

1. Payments, Auth and Registry repositories were not code-audited; Chat Center is partial. Their edges exist only as other apps' claims.
2. Only one channel is two-sided by endpoint path; most corroboration is via provider surfaces. Many providers report generic "any granted caller" surfaces, so caller identity relies on the caller's own claim.
3. 19 channels have no documented data direction; 33 claims have no evidence level.
4. Field-level evidence: rows carry their own level only when the agent gave one (≈130 rows); otherwise the integration's evidence applies (shown as «مستوى التكامل»).
5. Cardinality is only known where agents documented record relationships; flow entities are `unknown` by design.
6. PPC appears in the Registry with grants but has no accessible project; VIEW/INVP are Registry-only. Their identity is provisional.
