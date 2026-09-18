# Phase 01 — Foundation

Status: pending · Depends on: none · Effort: 0.5d

## Context

Empty repo on branch `main` (v1 is archived as git tag `v1`, commit ed457ea,
for reference only; do not copy files from it). Establish the monorepo, the Fastify server, the
SQLite schema from `plan.md` §5, configuration, and both auth schemes so later
phases only add modules.

## Requirements

- pnpm workspace with `apps/gateway` and `apps/web` (web is a placeholder until phase 06).
- Gateway starts with `pnpm dev` (tsx watch) and `pnpm start` (built `dist`).
- Config from env with validation (zod) in `apps/gateway/src/config.ts`:
  `PORT` (8080), `HOST` (127.0.0.1), `DATA_DIR` (`./data`), `ADMIN_PASSWORD` (required, min 8 chars), `LOG_LEVEL` (info).
  Also load `.env` from repo root if present (use `dotenv`). `.env` is git-ignored.
- SQLite at `${DATA_DIR}/cli-to-api.db`, WAL mode, `busy_timeout = 5000`. Drizzle schema exactly as `plan.md` §5. Migrations generated with `drizzle-kit generate` into `apps/gateway/drizzle/` and applied on startup with Drizzle's migrator. Seed `settings` defaults if missing.
- Graceful shutdown on SIGINT/SIGTERM: stop accepting, close DB (required with `better-sqlite3` on Node 24).
- Admin auth: `POST /admin/login { password }` → `{ token, expiresAt }`. Token = `adm_` + 32 random url-safe chars, kept in an in-memory `Map<token, expiresAt>` (12h). Middleware for `/admin/*` (except login) accepts `Authorization: Bearer adm_...` or `?token=` (needed for WebSocket in phase 05). Constant-time password compare.
- API-key auth for `/v1/*`: accept `Authorization: Bearer <key>` or `x-api-key: <key>`. Look up `api_keys` by `sha256(key)`; reject disabled/missing with the dialect-appropriate 401 body (phase 03 owns the exact error shapes; for this phase return `{ error: { message, type: "authentication_error" } }`). Put `apiKeyId` on `request`.
- Bootstrap: when `api_keys` is empty at startup, create a key named `bootstrap`, log the plaintext once at `warn` level, and write it to `${DATA_DIR}/bootstrap-api-key.txt` (0600 where supported).
- `GET /healthz` → `{ ok: true, version, uptimeSec }`.
- Serve `apps/web/dist` at `/` with SPA fallback when the directory exists; otherwise `/` returns a one-line text pointing to `/healthz`.
- Logging with pino; request id header `x-cta-request-id` on every response.

## Files

```
package.json                      pnpm scripts: dev, dev:web, build, start, test, lint (tsc --noEmit for both apps)
pnpm-workspace.yaml
tsconfig.base.json                strict, ES2022, NodeNext
vitest.config.ts                  include apps/**/tests/**/*.test.ts and tests/**/*.test.ts
.gitignore                        node_modules, dist, data/, .env, *.db*
.env.example                      ADMIN_PASSWORD=change-me  PORT=8080
AGENTS.md                         (already present) — keep in sync if commands change
apps/gateway/package.json         fastify ^5, @fastify/cors, @fastify/static, @fastify/websocket ^11, better-sqlite3 ^13, drizzle-orm, drizzle-kit, zod, pino, pino-pretty, nanoid, dotenv, tsx, typescript
apps/gateway/drizzle.config.ts
apps/gateway/src/index.ts         load config → migrate → build server → listen → shutdown hooks
apps/gateway/src/server.ts        buildServer(deps) registers plugins and routes; returns FastifyInstance (used by tests via inject)
apps/gateway/src/config.ts
apps/gateway/src/core/types.ts    contracts from plan.md §4.1, verbatim
apps/gateway/src/db/schema.ts
apps/gateway/src/db/db.ts         openDb(path) → { sqlite, db } ; WAL, busy_timeout, close()
apps/gateway/src/db/migrate.ts
apps/gateway/src/auth/admin-auth.ts
apps/gateway/src/auth/api-key-auth.ts   also: createApiKey(name) → { id, plaintext, prefix }, hashKey()
apps/gateway/src/api/health.ts
apps/gateway/src/api/static-web.ts
apps/gateway/tests/config.test.ts
apps/gateway/tests/auth.test.ts   inject: /admin/login ok/bad, /admin/x without token 401, /v1/x with good/bad key
apps/web/package.json             placeholder with build script producing dist/index.html (real app in phase 06)
```

## Steps

1. Scaffold workspace and both packages; `pnpm install`; `pnpm lint` passes on empty modules.
2. Write `core/types.ts` from `plan.md` §4.1 exactly.
3. Write schema, generate migration, write `db.ts`/`migrate.ts`; start once and confirm tables exist with `sqlite3`-free check (query `sqlite_master` in a test).
4. Implement config, server, health, static, both auth modules, bootstrap key.
5. Tests, then `pnpm dev` and curl `/healthz` and `/admin/login`.

## Validation

- `pnpm test` green; `pnpm lint` green.
- `curl -s localhost:8080/healthz` returns ok.
- Missing `ADMIN_PASSWORD` exits with a clear message and code 1.
- Ctrl-C exits within 2 s with no `Assertion failed` from better-sqlite3.

## Risks / rollback

Low. Pure scaffold; rollback = delete files.

## Report

Write `reports/phase-01-report.md`: commands run, test output summary, any contract deviations.
