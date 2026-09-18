# Phase 02 — Host-profile accounts and host-login detection

Status: pending · Depends on: 01 · Effort: 0.5d

## Requirements

### Data model (additive migration)

`accounts.use_host_profile integer not null default 0`. Drizzle column
`useHostProfile: integer("use_host_profile", { mode: "boolean" })`. Generate a new
migration file; do not edit the existing one.

### Runner and terminal

- `runner/sandbox.ts`: add `hostEnv(sandbox)` = `{ ...process.env }` with only
  `CI=1`, `NO_COLOR=1`, `FORCE_COLOR=0`, `TERM=dumb` added (no `HOME`/`APPDATA`/
  XDG overrides). `ensureSandbox` still creates the account dirs; only
  `workspaceDir` is used for host-profile accounts.
- `router/execute-candidate.ts`: `env = account.useHostProfile ? hostEnv(sandbox) : { ...baseEnv(sandbox), ...adapter.buildEnv(sandbox) }`.
  Note `buildEnv` is skipped for host profiles on purpose: `CLAUDE_CONFIG_DIR` /
  `CODEX_HOME` must stay at the user's defaults.
- `api/admin/terminal-ws.ts`: for a host-profile account, env = `process.env`
  (interactive, so no `CI`), cwd = workspace, banner says "host profile of
  <adapter> — this shell uses your own login".

### Host-login detection

Add an optional method to the `Adapter` contract:

```ts
detectHostLogin?(run: (file: string, args: string[]) => Promise<{ code: number | null; stdout: string; stderr: string }>):
  Promise<{ status: "logged_in" | "logged_out" | "unknown"; label?: string }>;
```

`run` is provided by `adapters/index.ts` (uses `resolveExecutable`, 8 s timeout,
never throws). Implementations:

- claude-code: `claude auth status` → parse JSON, `loggedIn === true` →
  `logged_in`, label = `authMethod` plus email if the JSON has one; JSON with
  `loggedIn: false` → `logged_out`; parse failure → `unknown`.
- codex: `codex login status` → exit 0 and `/logged in/i` in stdout **or stderr**
  → `logged_in` with the matched line as label; `/not logged in/i` → `logged_out`.
- cursor-agent: `cursor-agent status` → `/Logged in as (\S+)/` → `logged_in`,
  label = the email; `/not logged in/i` → `logged_out`.
- agy: return `{ status: "unknown" }` (no known status command).

`detectAdapters()` gains `hostLogin` per row, cached with the same 60 s TTL and
refreshed by `POST /admin/adapters/refresh`. Detection runs the four commands in
parallel and must not block `/v1` requests (it is only awaited by the admin routes).

### Admin API

- `POST /admin/accounts` accepts `useHostProfile?: boolean` (default false). When
  true: reject with 409 if a host-profile account for that adapter already exists;
  `sandboxDir` is still the account dir (workspace lives there).
- `GET /admin/accounts` and account serialisation include `useHostProfile`.
- `GET /admin/adapters` includes `hostLogin` (see above).

### Console

- New account dialog: after choosing the adapter, a radio group
  "Isolated sandbox — log in via the account terminal" (default) /
  "Use this machine's login" with the detected status inline
  (`logged in as x@y`, `not logged in`, `unknown — try it`). The second option is
  disabled when a host-profile account for that adapter already exists (show why).
- Accounts table: a small "host" badge on host-profile rows; the "Open terminal
  to log in" hint after creation is replaced by "Ready — uses your existing login"
  for host-profile accounts.
- Overview: adapter cards show the host-login status line.

### Tests

- Unit: each `detectHostLogin` with canned `run` results (logged in / logged out / garbage → unknown).
- Admin: create host-profile account, second one → 409, list shows the flag.
- Router: with the fake adapter and a host-profile account, the spawned env
  contains the real `USERPROFILE`/`HOME` (assert via the fake CLI argv/env echo)
  and no `CLAUDE_CONFIG_DIR`.

## Validation (reviewer)

- Real run: host-profile `claude-code` account, `POST /v1/chat/completions {model: "claude-code/haiku", messages: [{role: "user", content: "Reply with exactly: pong"}]}` → 200, text "pong", usage with `cache_read` tokens, request row with account id and tokens.
- Real run: host-profile `cursor-agent` account, `model: "cursor-agent/composer-2.5-fast"` → 200 "pong".
- `GET /admin/adapters` shows `logged_in` for claude-code, codex, cursor-agent.

## Report

`reports/phase-02-report.md` in this plan folder.
