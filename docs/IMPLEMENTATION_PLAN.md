# Asakin Systems Integration Map — Implementation Plan

Status date: 2026-11-23. Owner: technical team (internal). Source brief: `CLAUDE_CODE_ASAKIN_INTEGRATION_MAP_START.md` (user-supplied, outside the repo).

## 0. Workspace inspection (Step 0)

| Item | Finding |
|---|---|
| Repository state | Folder contained only `docs/ASAKIN-INTEGRATION-AUDIT.zip` and `docs/CONFIDENTIAL-risk-triage.md`. No source code, no `README`, **no Git repository**. |
| `docs/PRD_AR.md` | Added by the user during Step 0 (PRD v0.1, 2026-11-22). Decisions D-001…D-006, invariants §7.2, state models §8 and verification scenarios §12 are adopted as-is (see §5 below). |
| `Asakin-Payments-OnePage-v1.0.html` | Not present (nothing to ignore). |
| Audit archive | `docs/ASAKIN-INTEGRATION-AUDIT.zip`, 199 members, ~1.43 MB. Read only as untrusted data, never modified, scripts under `_tools/` never executed. |
| Confidential file | Read privately for caveats only. Not graph input, not imported, not referenced by client code, git-ignored. |
| Toolchain | Node v24.14.1, npm 11.11.0 (Windows 11). Python is not used. |

## 1. Architecture

```
server/        Express 5 + TypeScript: auth boundary, protected data API, static client in prod
src/client/    Vite + React (Arabic RTL, approved light design: Atlas → Lens → drawer → Impact)
shared/        Zod domain schemas, view model (atlas.ts: lanes, threads, verification states,
               lens rows, impact rings, field lineage), search (pure, tested)
scripts/       data:import (candidate), data:validate, data:diff, data:promote
data/private/  Server-only data. canonical/ = reviewed snapshot served by the API,
               candidate/ = importer output for review, reviewed/ = human decisions,
               rules/ = documented normalization rules
tests/         Vitest unit + server security tests;  e2e/ Playwright
```

Security boundaries:
- Vite `root` is `src/client`; `server.fs.strict` + deny-list keep `data/`, `docs/`, `*.zip`, `*.md` unreachable in dev. Express rejects those paths before Vite.
- All `/api/*` data routes require an authenticated session **and** the app permission `integration-map:read`.
- Auth modes: `dev-loopback` (fixture identities; fails closed unless `NODE_ENV!=production`, bound to 127.0.0.1, loopback peer, localhost Host header) and `oidc` (**BLOCKED** — Asakin Auth contract not verified; server refuses to start in this mode).
- No runtime calls to Asakin platforms, Registry or external providers.

## 2. Phases and checkpoints

| Phase | Scope | Checkpoint |
|---|---|---|
| 0 | Inspect, scaffold, auth boundary, API shell, test harness, `npm run dev` / `verify` | app starts locally; unauthenticated API → 401 |
| 1 | Zod schemas, ZIP importer (candidate), deterministic IDs, reconciliation, unresolved queues, validator, diff, first canonical snapshot | 31/263/1290 accounted; import twice → zero diff |
| 2 | RTL workspace, logical graph (ELK), search/filter, external layer, grouped edges, tooltip, inspector, keyboard | real snapshot via protected API |
| 3 | Technical + data-flow views, Registry dashed associations, field drill-down, evidence, impact explorer, reduced motion | PRD edge-case tests |
| 4 | Review workflow docs, guarded export, security/a11y/perf checks, runbook, env template | no deploy without authorization |

## 3. Blockers and open decisions

1. ~~`docs/PRD_AR.md` missing~~ — resolved; PRD added 2026-11-23.
2. **Asakin Auth contract unverified.** Audit reports describe OIDC (Authorization Code + PKCE, back-channel logout, `asakin_access` / `asakin_app_code` claims) but these are *agent-reported* from consuming apps; Auth itself was not auditable. Secure deployment is **BLOCKED** until the issuer, client registration, claim names and app-access permission are confirmed by the Auth owner.
3. **Unaudited systems:** Payments, Auth, Registry (blocked); Chat Center partial; PPC registered without an accessible project. Shown as provisional / partial nodes.
4. Git: the folder is not yet a Git repository. Initialising it locally is harmless; committing is left to the user.

## 5. PRD reconciliation

| PRD rule | Implementation decision |
|---|---|
| §7.2 stable IDs `sys_/int_/flow_/map_/ev_` | Hash of source identity (never display name/URL/Registry code); prefixes as specified, plus `cfl_` (conflict), `rev_` (review item), `ent_` (entity mapping), `reg_` (Registry record/grant). |
| §7.2 evidence levels | `proposed, reported, code_observed, test_verified, runtime_verified, production_verified, unknown`. Every level from the archive keeps `basis: agent_reported`; the UI always says "مُبلّغ من وكيل التدقيق". No claim is promoted to independent verification. |
| §8 review item status | `new, matched, conflict, needs_review, accepted, rejected`; `accepted/rejected` only via `data/private/reviewed/decisions.json` (Git-reviewed). Re-import never overwrites it. |
| §7.2 coverage controls language | `complete` + no edges → «لا توجد اتصالات موثقة»; `not_audited` → «لم يُفحص بعد»; `partial` → «تدقيق جزئي». |
| §7.2 unknown external partner | Not fabricated. Unknown counterparts stay unresolved references (`ANY-GRANTED-APP`, `UNKNOWN`, browser, scheduler, operator) on the claim, listed in the review queue. |
| §6 Registry discovery | Dashed association annotated `discovery`/`token`, never a transport hop. Registry grants are a separate dataset and toggle. |
| §7.1 FieldMapping null target | `destinationPath: null` when not documented; rendered «غير موثق»; source path never copied. |
| §12 scenarios 1–10 | Automated tests (unit fixtures for 1,3,4,5,6,8; server tests for 9; E2E for 2,7,10). |
| §4 auth | Dev fixture mode only; production OIDC BLOCKED until Auth contract verified (§14). |

## 4. Progress log

### 2026-11-23 — WEB shown as «الموقع العام» (reviewed decision DEC-008)

- New `rename` decision for systems (display name only; id, key and endpoint resolution unchanged; old name kept as a search alias). Only `systems.json` changed in the canonical snapshot.

### 2026-11-23 — Seven external providers removed (reviewed decisions)

- New decision type `{ subjectType: "system", decision: "exclude" }` in the importer; DEC-001…DEC-007 remove Replit Object Storage, Browser push services, Ejar, Expo Push, Google Cloud Storage, Google Fonts and Unsplash with all 21 claims touching them (plus their channels, flows, 8 field-mapping rows, 29 claim-only evidence records and 17 review items). Canonical: 48 systems, 242 claims, 1,282 mapping rows. Exclusions are recorded in `meta.json` counts/notes and the reconciliation report; tests assert exact accounting against the archive.

### 2026-11-23 — Follow-up UI changes (user requests)

- Data movement is always animated; the «حركة البيانات» toggle was removed. The operating system's *reduce motion* setting still turns the moving dots off (accessibility).
- «تصدير PDF» replaces the JSON download in the header: it renders exactly what is on screen below the app header (scroll positions, open drawer, hover state included) with the Asakin logo as a simple header, entirely in the browser (html-to-image 1.11.13 + jsPDF 4.2.1, loaded on demand). No data leaves the browser. The server route `/api/export/snapshot.json` is unchanged (still permission-protected) but no longer linked from the UI.
- Thin scrollbars that appear on hover; edge fades on scroll areas; Asakin company logo in the header; focused threads drawn above inactive tiles.

### 2026-11-23 — UI refactor to the approved design (`design/`)

Plan and gap analysis: `docs/DESIGN_REFACTOR_PLAN.md`.

**Works now (verified):**
- Light design tokens, header (logo, search, «حركة البيانات», protected export, user/خروج), breadcrumb + title row, verification legend chips that filter (موثّق / جزئي / يحتاج تحقق, with counts).
- **Atlas**: 5 lanes (القنوات · تطبيقات الأعمال · الخدمات المشتركة · المالية · مزودون خارجيون), 55 tiles with monogram, degree and "needs verification" dot; threads hidden until a system is hovered/focused (or «كلها»); one thread per caller → callee pair (all claims inside), lanes for reciprocal pairs, colour/dash = verification, beads = data direction (static chevrons when motion is off); thread hover card; peek pill; fit + zoom.
- **Lens**: incoming/outgoing by data direction, refocus buttons, unresolved counterparts shown as «طرف غير محدد», focus card (coverage warning, published domain, coverage, deployment, Registry, documentation bar, impact / atlas actions, unlinked fields, intra-system and negative findings, audit open questions).
- **Integration drawer**: caller ⇄ callee wire with returned-data lane, sibling switcher, tabs البيانات المتبادلة (field table, tags, details, potential lineage) / طريقة العمل (direction, trigger, mechanism, endpoints, auth, Registry role — never a hop) / التحقق والأدلة (state basis, checks, evidence records, counterpart claims, open questions); read-only footer instead of the design's edit buttons; unlinked-fields mode.
- **Impact**: outage / data change / API change, two rings, potential wording, unverified count, affected integrations, second-ring chips.
- Hash routing (`#/system/<id>`, `#/impact/<id>/<change>`, `?int=…&tab=…&map=…`) with browser back/forward; only opaque ids accepted.
- Removed React Flow, ELK, the 3-view canvas, filter panel and inspector. `design/` is excluded from lint, Vite serving and the Express path allow-list.

**Commands run and results:** `npm run verify:full` → typecheck ✔, eslint ✔, data:validate ✔, vitest 102/102 ✔ (incl. 17 new view-model/routing tests), build ✔, dist leak check ✔, Playwright 18/18 ✔ (Edge, 1366×768 and 1024×700, reduced motion, keyboard, access control). Manual check in the browser pane at 1440×900 and 1366×768.

**Deliberate deviations from the design (see plan §2):** «مؤكد» shown as «موثّق» (agent-reported, PRD §7.2); edit buttons not implemented (PRD D-003 read-only); "owner" replaced by coverage/deployment facts (no owner in the audit); «بيان شخصي» tag is a labelled name-based estimate; lineage is labelled «مسار محتمل».

**Not yet done:** product decision on in-app editing; owner metadata; advanced facet filters (removed per design).

### 2026-11-23 — Phases 0, 1, 2 delivered; parts of 3 and 4 in place

**Works now (verified):**
- Phase 0: Vite + React + TS client (root `src/client`), Express 5 server, loopback-only dev fixture auth with app-permission check, path blocking for `data/`, `docs/`, `*.zip|md|csv|map`, Vite `/@fs` allow-list, strict CSP in dist mode. `npm run dev`, `verify`, `verify:full` all pass.
- Phase 1: Zod schema (`shared/schema.ts`), strict validator with referential integrity and secret-pattern scan, safe in-memory ZIP reader, deterministic importer with explicit rules, two-sided/provider-surface reconciliation, conflicts, review queue, missing-mapping-links queue, provenance index, reconciliation report, diff and promote. Real archive: 263/263 claims, 1,290/1,290 mappings, 31/31 audited systems preserved; second import → zero changes.
- Phase 2: RTL workspace on the real snapshot via the protected API: ELK stress + SPOrE overlap removal (~0.8 s for 54 nodes), grouped pair edges with per-direction counts, floating edges, distinct external layer, tooltip ≤20 words, node focus (click / double-click or D for neighbourhood, Esc clears), resizable inspector with Overview / Data & Fields / Technical / Evidence / Impact, search by name/alias/code/entity/field path, filters (kind, layer, coverage, status, domain, mechanism, corroboration, evidence, direction, isolated).
- Phase 3 (partial): technical view with dashed Registry discovery/token associations, SDK dependency edges, optional Registry grants; data-flow view (producer → consumer, offset reverse edges); impact explorer (system and field, potential with confidence); direction particles only for documented directions, bounded to 40 animated edges, off under reduced motion.
- Phase 4 (partial): access-controlled JSON export, Git review workflow docs, runbook, env template (names only), dist leak check.

**Commands run and results (2026-11-23):**
- `npm run verify` → typecheck ✔, eslint ✔, data:validate ✔ (55 systems, 263 integrations, 1,290 mappings), vitest 76/76 ✔, vite build ✔, dist leak check ✔.
- `npx playwright test` (Edge, built app on :5333) → 16/16 ✔ (1366×768 and 1024×700, reduced motion, keyboard, access control).
- Browser check in the app's preview pane at 1366×768: login gate, workspace, AOP↔APMP inspector showing data APMP → AOP with AOP as request initiator.

**Bugs found by tests and fixed:** React Flow selection ping-pong loop; edges ahead of nodes in tab order (edges now reached through the inspector's connection list); narrow-screen grid collapse; Registry token endpoints skewing method-based direction; consolidator's regex `registryAssisted` trusted despite "not via Registry"; static-only resolver catalog.

**Not yet implemented / next steps:**
1. Asakin Auth OIDC (`AUTH_MODE=oidc`) — BLOCKED on contract verification (runbook §1).
2. Diagram (image) export; review-queue screen in the UI (data is served at `/api/review/missing-mapping-links` but has no dedicated view yet).
3. Group/ungroup toggle for parallel flows in data-flow view; upstream traversal in node focus.
4. Performance test at the PRD target size (60 nodes / 250 integrations / 2,000 mappings) with a synthetic dataset; current real data is 55 / 263 / 1,290.
5. Human review of the 138 review items and 414 unresolved mapping links via `decisions.json`.
6. Known environment note: the desktop app's preview launcher did not start `npm run dev` (process hung without output); running `npm run dev` from a terminal works.
