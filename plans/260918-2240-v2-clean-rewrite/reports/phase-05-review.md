# Phase 05 review

Reviewer: Claude · Commit reviewed: 813efe1 · Verdict: DONE_WITH_CONCERNS — only SHOULD items; apply them at the start of phase 06 (no separate fix-up cycle).

## Verified independently

- `pnpm lint` green; `pnpm test` 85/85 green (22 files).
- No servers, PTYs or agent processes left running.
- REST surface matches the phase table: accounts (create with sandbox, patch, reset-cooldown, delete with `?purge=1`), groups with atomic target replace, API keys with one-time plaintext, requests log, one-SQL usage summary, quota, adapters, live + abort, settings.
- Terminal bridge: admin token check, 8-session cap, PTY killed on socket close and on shutdown, sandbox env reused from the runner.
- Reviewer smoke test of the WebSocket terminal against a real server: see the "Smoke test" section below (filled in by the reviewer).

## Findings

### SHOULD-1 — interactive sandbox terminal inherits non-interactive env

`baseEnv()` sets `CI=1`, `NO_COLOR=1`, `FORCE_COLOR=0` for the CLI runner. The
account terminal reuses it and only overrides `TERM`. Interactive logins
(`claude login`, `codex login`) may behave as if in CI. In `terminal-ws.ts`,
delete `CI`, `NO_COLOR` and `FORCE_COLOR` from the terminal env after merging
(keep `HOME`/`APPDATA`/config-dir overrides, that is the point of the sandbox).

### SHOULD-2 — deleting an account leaves its session rows behind

`DELETE /admin/accounts/:id` nulls `group_targets.account_id` and removes rate
limits, but `sessions` rows that point at the account stay until they expire.
Delete them in the same transaction.

### SHOULD-3 — `GET /admin/accounts` runs one rate-limit query per account

Fine for a handful of accounts; fold into one query with `inArray` when you
touch the file for SHOULD-2.

### Notes (no action now)

- No automated WS terminal test. Acceptable for v2.0; the reviewer smoke test
  and the phase 06 manual walk-through (AC-6) cover it.
- `queue_timeout_sec` is still not seeded in `settings`; the router defaults to
  30 s. Seed it in the migration defaults during phase 07 cleanup.

## Smoke test (reviewer, 2026-09-19)

Started the gateway from source on a random port with a temp `DATA_DIR`,
obtained an admin token, opened `ws://…/admin/ws/terminal?target=host`, sent
`echo cta-smoke-ok\r`. The PTY (PowerShell via `node-pty` prebuilt for Node 24
on Windows) echoed the command and printed the marker within 2 s. Server and
PTY were killed afterwards; no listener left on the port. Result: **pass**.

## Instructions

Apply SHOULD-1, SHOULD-2 and SHOULD-3 as the first commit of the phase 06 run
(`fix(gateway): interactive env for sandbox terminals, clean sessions on account delete`),
then proceed with the phase 06 file.
