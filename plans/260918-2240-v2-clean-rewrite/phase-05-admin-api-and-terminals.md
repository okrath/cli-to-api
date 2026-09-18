# Phase 05 — Admin API and terminals

Status: pending · Depends on: 01, 04 · Effort: 0.5d

## Context

Everything the web console needs, as plain JSON REST behind the admin token,
plus a WebSocket PTY bridge for the host shell and per-account sandbox shells
(so `claude login` / `codex login` write credentials into the account's
isolated config dir).

## Requirements

All under `/admin`, zod-validated bodies, errors `{ error: { message } }`.

| Method & path | Purpose |
|---|---|
| `POST /admin/login` | phase 01 |
| `GET /admin/adapters` | `detectAdapters()` + static models; `POST /admin/adapters/refresh` |
| `GET /admin/accounts` | rows + in-memory `active`, plus latest `account_rate_limits` per account |
| `POST /admin/accounts { adapterId, name, maxConcurrent? }` | id = `${adapterId}-${slug(name)}`; creates sandbox dirs |
| `PATCH /admin/accounts/:id { name?, maxConcurrent?, enabled? }` | |
| `POST /admin/accounts/:id/reset-cooldown` | clears `cooldown_until/reason` |
| `DELETE /admin/accounts/:id?purge=1` | deletes row (targets referencing it get `account_id = null`); `purge` also removes the sandbox dir |
| `GET /admin/groups` | groups with nested targets ordered by tier |
| `POST /admin/groups { slug, name, description?, defaultEffort?, allowTools?, cacheTtlSec?, targets: [...] }` | id = `group:<slug>`; atomic insert |
| `PUT /admin/groups/:id` | full replace incl. targets, in one transaction |
| `DELETE /admin/groups/:id` | |
| `GET /admin/api-keys` | id, name, prefix, enabled, lastUsedAt, createdAt |
| `POST /admin/api-keys { name }` | returns `{ ..., plaintext }` once |
| `PATCH /admin/api-keys/:id { enabled?, name? }` · `DELETE` | |
| `GET /admin/requests?limit=50&offset=0&status=&apiKeyId=&accountId=&groupId=` | newest first |
| `GET /admin/usage/summary?from=ISO&to=ISO&bucket=day\|hour&by=api_key\|account\|model\|group` | `[{ bucket, key, label, requests, input, cachedInput, cacheWrite, output, reasoning, costUsd }]` — one SQL `GROUP BY`, no pivoting in JS |
| `GET /admin/usage/quota` | per account: windows `[{ name, utilization, resetsAt, observedAt }]`, cooldown, today's tokens |
| `GET /admin/live` · `POST /admin/live/:requestId/abort` | in-flight requests, kill switch |
| `GET /admin/settings` · `PATCH /admin/settings` | keys from plan §5 |

### WebSocket `GET /admin/ws/terminal?token=<adm>&target=host|account:<id>&cols=&rows=`

- `node-pty` spawn: Windows `powershell.exe -NoLogo`, POSIX `$SHELL || /bin/bash`.
- `host` → cwd = repo root, env = process.env.
- `account:<id>` → cwd = account `workspaceDir`, env = `baseEnv(sandbox)` merged with `adapter.buildEnv(sandbox)` (same env the runner uses, so a login in this shell is the login the runner sees). Print a one-line banner first: `[cli-to-api] sandbox for <adapter>/<account> — run "<executable> login" here`.
- Wire protocol: client → server text frames are keystrokes, except JSON `{ "type": "resize", "cols", "rows" }`. Server → client: raw PTY output as text frames.
- Kill the PTY on socket close; kill all PTYs on server shutdown. Limit 8 concurrent terminals.

## Files

```
apps/gateway/src/api/admin/accounts.ts
apps/gateway/src/api/admin/groups.ts
apps/gateway/src/api/admin/api-keys.ts
apps/gateway/src/api/admin/usage.ts        requests, summary, quota
apps/gateway/src/api/admin/system.ts       adapters, live, settings
apps/gateway/src/api/admin/terminal-ws.ts
apps/gateway/tests/admin/*.test.ts         inject-based CRUD + auth rejection + usage summary over seeded rows
```

## Validation

- `pnpm test` green.
- Manual: `wscat`/browser to the terminal WS, run `claude login` inside an account sandbox, then `GET /admin/accounts` — and a request routed to that account succeeds.

## Risks / rollback

`node-pty` needs a prebuilt binary for the Node version in use; pin a version with prebuilds for Node 22 and document `pnpm rebuild node-pty`. Rollback: additive.

## Report

`reports/phase-05-report.md`.
