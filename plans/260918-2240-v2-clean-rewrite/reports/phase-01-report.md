# Phase 01 report

Status: DONE

## Built

- pnpm monorepo with `apps/gateway` (Fastify 5 gateway) and `apps/web` (placeholder static build).
- Root scripts: `dev`, `dev:web`, `build`, `start`, `lint`, `test`; shared `tsconfig.base.json` and `vitest.config.ts`.
- Gateway config (`config.ts`) with zod validation, root `.env` loading via dotenv, and `.env.example`.
- `core/types.ts` copied verbatim from `plan.md` section 4.1.
- Drizzle schema for all nine SQLite tables from `plan.md` section 5; migration `apps/gateway/drizzle/0000_absent_vertigo.sql`; startup migrator and settings seed defaults.
- `openDb()` with WAL mode and `busy_timeout = 5000`; graceful shutdown closes Fastify then SQLite on SIGINT/SIGTERM.
- Admin auth: `POST /admin/login`, in-memory 12h tokens (`adm_…`), Bearer and `?token=` support, constant-time password compare, protected `/admin/*` stub.
- API-key auth for `/v1/*`: Bearer and `x-api-key` headers, sha256 lookup, bootstrap key on empty DB (warn log + `bootstrap-api-key.txt` at mode 0600).
- `GET /healthz`, static web from `apps/web/dist` with SPA fallback, pino logging, `x-cta-request-id` on every response.
- Tests: `apps/gateway/tests/config.test.ts`, `apps/gateway/tests/auth.test.ts`.
- `pnpm-workspace.yaml` `allowBuilds` for `better-sqlite3` and `esbuild` (pnpm 11 requirement).

## Verified

```
pnpm install          # exit 0
pnpm lint             # exit 0 (tsc --noEmit gateway + web)
pnpm test             # 6 passed (2 files)
pnpm build            # apps/web/dist + apps/gateway/dist
pnpm start            # listens on 127.0.0.1:8080
curl.exe -s http://127.0.0.1:8080/healthz
  → {"ok":true,"version":"0.1.0","uptimeSec":15}
POST /admin/login     # returns adm_ token + expiresAt
GET /                  # serves apps/web/dist/index.html when built
```

Config test confirms missing `ADMIN_PASSWORD` calls `process.exit(1)` with a clear message.

Migration test queries `sqlite_master` and confirms all nine tables plus seeded settings rows.

## Deviations

- None from `plan.md` sections 4.1 or 5.
- Added `apps/web/src/placeholder.ts` so `tsc --noEmit` has an input file for the web placeholder package (phase file lists empty-module lint only).
- Added `allowBuilds` entries in `pnpm-workspace.yaml` for pnpm 11 native script approval (not in phase file; required for install/scripts to succeed on this host).

## Concerns / questions for review

- Manual Ctrl-C shutdown within 2 s was not re-tested interactively in this session; logic follows Fastify `close()` then `db.close()` pattern required for `better-sqlite3` on Node 24.
- `createApiKey(name)` accepts `name` for API symmetry but the caller supplies the DB row name on insert (bootstrap uses `"bootstrap"` explicitly).
