# Asakin Systems Integration Map

Internal, read-only, Arabic RTL map of Asakin applications, shared services, external providers, directed data flows and exact field mappings — driven by reviewed, Git-versioned JSON derived from the integration audit archive. Technical team only.

UI follows the approved design in `design/` (plan: `docs/DESIGN_REFACTOR_PLAN.md`): **Atlas** (lanes; threads appear on hover) → **System lens** (incoming / outgoing) → **Integration drawer** (fields, how it works, evidence) → **Impact simulation** (potential, two rings). Keyboard: Tab/Enter, `/` search, `Esc` steps back. «تصدير PDF» downloads the current page with the Asakin logo (rendered locally in the browser).

- Product rules: `docs/PRD_AR.md` · Plan & progress: `docs/IMPLEMENTATION_PLAN.md`
- Data quality: `docs/DATA_QUALITY_REPORT.md` · Updating data: `docs/DATA_UPDATE_GUIDE.md`
- Deployment: `docs/DEPLOYMENT_RUNBOOK.md` (**BLOCKED** until the Asakin Auth contract is verified)

## Quick start (local development only)

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:5317 and use the local fixture sign-in (loopback only; refuses to start anywhere else).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Express + Vite on 127.0.0.1:5317 |
| `npm run build` / `npm start` | Production client build / serve `dist` (still dev auth until OIDC is verified) |
| `npm run data:import` | Archive → **candidate** dataset (`data/private/candidate`) |
| `npm run data:diff` | Candidate vs canonical, by record id |
| `npm run data:promote` | Valid candidate → canonical (then review `git diff`) |
| `npm run data:validate` | Zod schema + referential integrity + secret-pattern scan |
| `npm run test` | Vitest: PRD scenarios, real archive, security, ZIP safety |
| `npm run verify` | typecheck + lint + data validation + tests + build + dist leak check |
| `npm run verify:full` | + Playwright E2E (Microsoft Edge) |

## Layout

```
server/   Express API, auth boundary, private path blocking
src/client/  React workspace (views/ Atlas, Lens, Impact · components/ Drawer, SearchBox)
shared/   Zod schema, validator, view model (atlas.ts), search
scripts/  importer (ZIP read as untrusted data), rules, diff, promote, dist check
data/private/  canonical (served), reviewed decisions, candidate (generated)
tests/, e2e/
```

Never commit `docs/*.zip`, `CONFIDENTIAL-*`, `.env*` or candidate output (see `.gitignore`).
