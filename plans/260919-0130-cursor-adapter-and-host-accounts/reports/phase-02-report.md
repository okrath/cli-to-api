# Phase 02 report
Status: DONE

Built:
- Added `accounts.use_host_profile` column with Drizzle migration `0001_first_susan_delgado.sql`.
- `runner/sandbox.ts`: `hostEnv()` keeps the real process profile and only adds `CI`, `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb`.
- `router/execute-candidate.ts`: host-profile accounts use `hostEnv()` and skip `adapter.buildEnv()`.
- `api/admin/terminal-ws.ts`: host-profile terminals use `process.env`, workspace cwd, and a host-profile banner.
- Optional `Adapter.detectHostLogin` on claude-code, codex, cursor-agent, and agy; `detectAdapters()` returns `hostLogin` per row (60 s cache, refreshed by `POST /admin/adapters/refresh`).
- `POST /admin/accounts` accepts `useHostProfile`; rejects a second host-profile account for the same adapter with 409; list/create serialization includes the flag.
- Web console: login-mode radio in new-account dialog, host badge on accounts table, host-login hints, overview adapter cards with host-login status.
- Gateway build script runs `rimraf dist` before `tsc` so removed adapters do not linger in `dist`.
- Tests: host-login unit tests, sandbox/host-env unit tests, admin host-profile 409 test, execute-candidate host-profile env test; fake-cli echoes env when `FAKE_ECHO_ENV=1`.

Verified:
- `pnpm lint` — gateway and web TypeScript clean.
- `pnpm test` — 117/117 passed (28 files).
- `pnpm build` — web and gateway build green; `apps/gateway/dist` no longer contains stale `omp` artifacts.

Deviations:
- None.

Concerns / questions for review:
- Real-CLI validation (host-profile claude-code/cursor-agent pong, `GET /admin/adapters` logged_in on dev host) was not run in this session; reviewer should re-run smoke before phase 03.
- Host-profile accounts share the machine login's rate limits with interactive CLI use; documented in plan §2, not duplicated in UI beyond the dialog copy.
