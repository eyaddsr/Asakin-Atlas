# Design refactor plan — "Atlas → Focus → Integration → Impact"

Status date: 2026-11-23. Source of truth for UI/UX: `design/Asakin Systems Integration Map-project/` (approved design export, 5 artboards rendered from `Main.dc.html`). The data layer, importer, security boundary and PRD invariants are **unchanged**; this refactor replaces the client experience.

## 1. What the approved design is

| # | Artboard | Purpose | Key UI |
|---|---|---|---|
| 1 | الأطلس — نقطة البداية الهادئة | Calm overview | Light theme; 5 lanes right→left: القنوات · تطبيقات الأعمال · الخدمات المشتركة · المالية · مزودون خارجيون; 200×56 tiles (monogram, Arabic name, mono code, degree pill, orange dot when a link needs verification); **no lines by default** |
| 2 | الروابط تظهر عند التمرير فقط | Progressive reveal | Hover/focus a tile → only its threads appear (others dim); hover a thread → data card (from → to · mechanism, title, up to 4 sent fields, returned fields, "click for all"); bottom "peek" pill (N وارد · M صادر · ثنائي · يحتاج تحقق); mode toggle الخيوط: عند التمرير / كلها |
| 3 | التركيز على نظام — الوارد والصادر | System lens | 3-column grid: incoming rows (right) · focus card (center: monogram, kind badge, name, description, facts, documentation bar, «محاكاة أثر التغيير», «موقعه في الأطلس») · outgoing rows (left); each row = counterpart + mechanism + title + two-way icon + verification line; refocus button |
| 4 | فحص تكامل وتتبّع حقل | Integration drawer | 700 px drawer from the left with scrim; code + verification badge; A ⇄ B line with mechanism pill (second lane when two-way); title + purpose; tabs البيانات المتبادلة / طريقة العمل / التحقق والأدلة; field table (source → destination, type, tags مطلوب/حساس/معرّف, «تتبّع المسار»); field lineage strip across systems |
| 5 | ماذا لو تغيّر نظام؟ | Impact simulation | Change type segmented control (توقف النظام / تغيير بيانات يرسلها / تغيير واجهته البرمجية); summary aside (direct / indirect / unverified counts, warning, affected integrations, second ring chips); radial diagram with 2 dashed rings |

Global chrome: 64 px white header (logo, centred search with typed results نظام / تكامل / حقل / مسار بيانات, «حركة البيانات» toggle), breadcrumb + H1 + subtitle row, verification legend chips that double as filters (with counts and «إظهار الكل»). Line semantics: colour/dash = verification state (solid blue / dashed indigo / dotted orange); moving beads = data direction; two lanes = two-way.

## 2. Gap analysis vs. the current implementation

| Area | Current (v1) | Approved design | Decision |
|---|---|---|---|
| Theme | Dark, dense technical workspace | Light, calm, generous spacing (`#F4F6F9` canvas, `#0E1420` ink, `#2B44D6` accent, `#C24E0A` attention) | Replace tokens; keep local IBM Plex fonts (no Google Fonts call — CSP + no external runtime calls) |
| Main canvas | React Flow + ELK stress layout, all edges always drawn, zoom/pan | Deterministic lane columns, lines only on hover (or «كلها») | Remove React Flow + ELK. New pure lane layout in `shared/atlas.ts`, rendered as positioned buttons + one SVG layer. Fit-to-width scaling + scroll for 55 systems |
| Views | 3 views: logical / technical / data-flow | Journey: Atlas → Lens → Drawer → Impact | Replace view switcher with the journey + breadcrumbs. Technical facts move into the drawer «طريقة العمل»; data direction is carried by beads/arrows everywhere |
| Inspector | Fixed resizable right panel with 5 tabs | Lens page (system) + left drawer (integration) | Replace. System overview → focus card; claim details → drawer tabs; impact → Impact page |
| Filters | 13-facet filter panel | Verification legend chips only | Adopt design. Search covers the rest (systems, integrations, endpoints, field paths, entities) |
| Edge grain | One edge per unordered pair, channels inside | One thread per integration | Atlas/Impact draw one thread per **initiator → callee** pair (integrations aggregated, all listed in the hover card and drawer switcher). Lens and drawer stay per integration (all 263 reachable) |
| Verification | Evidence level (7) + corroboration (4) shown verbatim | 3 states: مؤكد / جزئي / يحتاج تحقق | Derived, documented mapping (§3). Label «مؤكد» becomes **«موثّق»** because PRD §7.2 forbids presenting agent-reported claims as independently verified. Raw level + corroboration stay visible in the evidence tab |
| Direction | Separate request-initiator and producer→consumer facts | Line from caller to callee; beads for data; reverse beads for returned data | Kept truthful: thread drawn initiator → callee; forward beads only when data flows that way, reverse beads when data comes back; no beads when direction is undocumented. Static chevrons when motion is off |
| Field tags | Type / required / evidence | مطلوب / حساس / معرّف + «تتبّع المسار» | مطلوب from `required`; معرّف from path shape; «بيان شخصي (تقدير)» is a name-based heuristic, labelled as an estimate. Lineage = chain of matched mappings whose field leaf names match along documented data direction, labelled «مسار محتمل» |
| Impact | Downstream BFS over flows, in inspector | 3 change types, 2 rings, summary | New `impactRings()` over integrations (outage = all touching; data = consumers of its data; api = callers), ring 2 = consumers of ring 1. Always worded «أثر محتمل» |
| Editing | None (read-only, Git-reviewed decisions) | Buttons «إضافة دليل أو ملاحظة», «تعديل حالة التحقق», «إضافة إجابة», «ابدأ توثيق الحقول» | **Not implemented as actions** — PRD D-003: the app never edits data. Replaced by a read-only note pointing to the Git review workflow. Flagged for product decision |
| Unresolved counterparts | Listed in inspector / review queue | Not in prototype | Never drawn as nodes (PRD). Shown in Lens rows as «طرف غير محدد: …» with «يحتاج تحقق» |
| System facts | coverage, deployment, Registry, domain | host, owner, about | host → published domain; owner is not in the audit data → replaced by «التغطية» and «النشر» (no invented owner) |
| Unlinked field mappings (414) | Review queue only | — | Focus card link «حقول غير مرتبطة بتكامل» opens the drawer in a mapping-list mode |
| Export, session | Status bar | — | Small header actions: protected JSON export, user + خروج |

## 3. Verification-state mapping (per integration)

```
needs_verification (يحتاج تحقق)  scope unresolved | evidence unknown/proposed | open conflict on the claim
documented (موثّق)               both ends resolved, data direction documented, evidence ≥ code_observed,
                                 and no open review item on the claim
partial (جزئي)                   everything else
```
All levels remain *agent-reported*; the evidence tab always says so.

## 4. Implementation steps

1. **Shared view model** `shared/atlas.ts` (pure, unit-tested): lanes, monograms, verification state, orientation (caller/callee, data beads), atlas threads, lens rows, impact rings, field tags, lineage, extended search. Slim `shared/graph.ts` to index + wording helpers.
2. **Design tokens & chrome**: new `styles.css` (light tokens on `:root`), header, breadcrumb/title row, legend chips, motion toggle (defaults off under `prefers-reduced-motion`), login/no-permission cards restyled.
3. **Atlas**: lanes, tiles, hover/focus reveal, thread SVG with beads, hover card, peek pill, mode toggle, fit/zoom, keyboard.
4. **Lens**: incoming/outgoing columns by data direction, focus card, documentation bar, intra-system/negative findings, empty states.
5. **Drawer**: header line(s), sibling-integration switcher, three tabs, field table with tags + row details, lineage strip, evidence records, open questions, read-only footer; unlinked-mappings mode.
6. **Impact**: change types, rings, summary aside, threads, hover card.
7. **Search**: typed results (نظام / تكامل / حقل / كيان) routing into the journey.
8. **Clean-up**: remove React Flow, ELK, old components; update dist leak check.
9. **Tests**: unit tests for the view model (PRD scenarios re-expressed on the new model), Playwright E2E rewritten for the journey (access control unchanged), `npm run verify:full`.
10. **Docs**: README, implementation plan progress log, this file's status.

## 5. Out of scope / follow-ups

- Editing workflows shown in the design (needs a product decision; conflicts with PRD D-003 read-only).
- Real Asakin Auth (still BLOCKED).
- Owner/host metadata beyond the audit archive.
- Advanced facet filters (removed per design; can return as a popover if the team misses them).

## 6. Status

- [x] Design analysed and compared (this document).
- [x] Steps 1–10 implemented and verified on 2026-11-23 (`npm run verify:full`: 102 unit + 18 E2E tests). Results in `docs/IMPLEMENTATION_PLAN.md` §4.
