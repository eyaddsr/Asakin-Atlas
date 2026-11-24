# Deployment runbook — status: BLOCKED

**Nothing has been deployed. Do not publish this app until every item in §1 is done and explicitly authorized.**

## 1. Blocking prerequisites

| # | Prerequisite | Owner | Status |
|---|---|---|---|
| 1 | Verify the Asakin Auth OIDC contract from the Auth repository: issuer, discovery URL, JWKS, signing algs, client registration for this app, redirect URI, back-channel logout, session lifetime | Auth owner | ❌ not verified (Auth repo was view-only during the audit) |
| 2 | Define the app-level permission (`integration-map:read`) and how it appears in the ID token/userinfo (claim name, values). A valid company session alone must not grant access. | Auth owner + tech lead | ❌ |
| 3 | Implement `AUTH_MODE=oidc` in `server/auth.ts` against the verified contract (Authorization Code + PKCE, server-side session, CSRF, logout) and add tests with a local stand-in provider | Dev | ❌ (server refuses to start in `oidc` mode today) |
| 4 | Choose the deployment URL and the technical maintainer access list (PRD §14) | Tech lead | ❌ |
| 5 | Security review of the deployed configuration (headers, TLS, cookie `Secure`, no public static data) | Security | ❌ |

## 2. Environment variables (names only — see `.env.example`)

`NODE_ENV`, `PORT`, `HOST`, `AUTH_MODE`, `DATA_DIR`, `SESSION_SECRET`, `ASAKIN_AUTH_ISSUER`, `ASAKIN_AUTH_CLIENT_ID`, `ASAKIN_AUTH_CLIENT_SECRET`, `ASAKIN_AUTH_REDIRECT_URI`. Never commit values.

## 3. Fail-closed behaviour already in place

- `AUTH_MODE=dev-loopback` refuses to start when `NODE_ENV=production`, when `HOST` is not loopback, or when hosted/preview variables are present (`REPL_ID`, `REPLIT_DEPLOYMENT`, `REPLIT_DEV_DOMAIN`, `VERCEL`, `RENDER`, `FLY_APP_NAME`, `K_SERVICE`, `CODESPACES`).
- Every request in dev mode must come from a loopback peer with a `localhost`/`127.0.0.1` Host header (also blocks DNS rebinding).
- `AUTH_MODE=oidc` refuses to start until implemented and verified.

## 4. Snapshot and rollback

- The served data is the Git-committed `data/private/canonical/` directory, validated at startup; an invalid snapshot yields a recoverable 503, not a crash.
- Release = a Git tag on a commit whose `npm run verify:full` passed; record the tag/SHA in the release notes (`meta.gitSha` can be filled at promote time).
- Rollback = redeploy the previous tag (or `git revert` the canonical change and redeploy). No database migration exists.

## 5. Local run (development only)

```powershell
npm install
npm run dev        # http://127.0.0.1:5317 (loopback only, fixture sign-in)
npm run verify     # typecheck + lint + data validation + tests + build + dist leak check
npm run verify:full  # + Playwright E2E using the installed Microsoft Edge
```
