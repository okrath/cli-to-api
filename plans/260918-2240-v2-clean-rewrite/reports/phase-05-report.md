# Phase 05 report

Status: DONE_WITH_CONCERNS

## Built

- `api/admin/shared.ts` — slug helper, zod body parsing, admin error shape.
- `api/admin/accounts.ts` — list/create/patch/reset-cooldown/delete with sandbox creation, active slot counts, rate-limit snapshots, target nulling on delete, optional `purge=1`.
- `api/admin/groups.ts` — list/create/replace/delete groups with nested targets (transactional).
- `api/admin/api-keys.ts` — list/create (plaintext once)/patch/delete.
- `api/admin/usage.ts` — request log with filters, usage summary (`GROUP BY` in SQL by bucket + dimension), per-account quota (windows + today tokens + cooldown).
- `api/admin/system.ts` — adapters + refresh, live requests + abort, settings get/patch (plan §5 keys).
- `api/admin/terminal-ws.ts` — WebSocket PTY bridge for `host` and `account:<id>` targets, resize JSON, 8-session cap, kill on close/shutdown.
- `api/admin/index.ts` — registers all admin routes and `@fastify/websocket`.
- `server.ts` — wires admin routes under `/admin` (replaces placeholder `/admin/x`).
- Dependency: `node-pty@1.1.0`; `pnpm-workspace.yaml` `allowBuilds.node-pty: true`.
- Tests: `tests/admin/{accounts,groups,api-keys,usage,system}.test.ts` — inject-based CRUD, auth rejection, usage summary over seeded rows.

## Verified

```
pnpm lint             # exit 0
pnpm test             # 85 passed (22 files)
```

Admin API scenarios covered by tests:

- Unauthenticated `/admin/*` → 401
- Account CRUD, cooldown reset, delete with target `account_id` nulling
- Group CRUD with target replace in one transaction
- API key create returns plaintext once; list omits plaintext
- Usage summary aggregates seeded request rows by `api_key` with correct token totals
- Adapters list includes static models; settings get/patch

## Deviations

- Manual terminal verification (`wscat` + real `claude login` in sandbox) was not performed in this environment; PTY spawn path is implemented and covered indirectly via server startup/shutdown wiring.
- Settings PATCH exposes only the three keys from plan §5 (`defaultCooldownSec`, `sessionTtlSec`, `requestTimeoutSec`); `queue_timeout_sec` remains read via router defaults when absent from DB (phase 04 behaviour).

## Concerns / questions for review

- After fresh clone, run `pnpm install` (builds `node-pty` via `allowBuilds`) or `pnpm rebuild node-pty` if the native binary is missing for the Node version in use.
- Terminal WebSocket has no automated test (PTY + WS integration); phase 06 console will be the first real UI consumer.
- `GET /admin/adapters` probes installed CLIs on each request (cached 60s); acceptable for admin but may feel slow with many adapters.
