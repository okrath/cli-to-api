# Final review (after phase 07)

Reviewer: Claude · Commit reviewed: d319132 · Verdict: DONE_WITH_CONCERNS — two MUST items found by a real-CLI smoke test; fix them, then the plan is complete.

## Verified independently

- `pnpm lint`, `pnpm build` (web split into main + terminal + usage chunks), `pnpm test` 92/92 green (23 files) including the AC-1…AC-5 and AC-7 e2e suite.
- `.gitattributes`, CI workflow, README, `queue_timeout_sec` seed, lazy-loaded pages, 401 → `/login` redirect all present.
- No processes left running.

## Real-CLI smoke test (reviewer, built gateway, isolated sandbox, real `claude` binary)

Steps: start `node apps/gateway/dist/index.js` on a random port with a temp `DATA_DIR`; admin login; `POST /admin/accounts {claude-code, "smoke"}`; `POST /admin/groups {default, target claude-code/haiku}`; `GET /v1/models` with the bootstrap key; `POST /v1/chat/completions {model: "group:default"}`.

Observed:

```
adapters: claude-code=undefined, codex=codex-cli 0.154.0, agy=1.2.6, omp=omp/18.2.0
models: group:default, claude-code/sonnet, … (19 ids)          ← OK
chat status=502 in 22ms  body: {"error":{"message":"Upstream CLI crashed","type":"server_error"}}
account after: cooldownReason: 'crash'
requests log: (empty)                                             ← BUG
```

`where claude` on this host returns `…\AppData\Roaming\npm\claude` (extensionless bash shim) first and `…\npm\claude.cmd` second. The `.cmd` shim runs `"%dp0%\node_modules\@anthropic-ai\claude-code\bin\claude.exe" %*`. `codex`, `agy` and `omp` resolve directly to `.exe` files. Node's `spawn()` cannot execute the extensionless shim or a `.cmd` without a shell, so every real Claude request fails before the CLI starts, and detection reports no version for the same reason.

## Findings

### MUST-1 — resolve the real executable on Windows (runner and detection)

Add `runner/resolve-executable.ts` (pure apart from `where`/fs reads):

1. Run `where <name>` (POSIX: `which`). Collect all lines.
2. Prefer the first candidate ending in `.exe`.
3. Else, for a `.cmd`/`.bat` candidate, read the file and look for a quoted target `"%dp0%\<relative path>"` (npm shim format); resolve `%dp0%` to the shim's directory; if the target exists, use it. If the target is a `.js` file, return `{ file: process.execPath, prefixArgs: [target] }`.
4. Else fall back to the `.cmd` with `{ shell: true }` and log a warning (args are then joined by Node without escaping; acceptable only because prompts go through stdin for claude and codex, and agy/omp resolve to `.exe`).
5. Cache per adapter for 60 s; expose `refresh()`.

Return type `{ file: string; prefixArgs: string[]; shell: boolean; path: string }`.
Use it in **both** places: `adapters/index.ts` `detectAdapters()` (probe `--version` with the resolved file) and `runner/run-cli.ts` (spawn `file` with `[...prefixArgs, ...argv]`). `runCli` takes the resolved executable from the caller (`execute-candidate.ts` looks it up via the registry); keep `adapter.executable` as the logical name only.
Test: unit test for the `.cmd` parser with the exact shim text above written to a temp dir (expect the `claude.exe` path), and a detection test on Windows asserting `claude-code` reports a version string.

### MUST-2 — record a `requests` row when routing fails

`routeRequest` throws `RouteError` after candidates were tried (all rate-limited, upstream crash/auth/timeout, queue timeout) and nothing writes the `requests` row, so failures are invisible in the admin log and usage. In `chat-handler.ts` (or a small helper in `usage/`), on `RouteError` **after** model resolution succeeded, call `recordUsage` with `status: "error"`, `errorKind` = the route error code, `failoverCount` from the error (add it to `RouteError` when thrown from the failover loop), `accountId` null, `durationMs`. Validation errors (400/401/404 model_not_found) stay unrecorded. Test: e2e or route test asserting a `requests` row with `status = "error"` after the dual-crash scenario.

### SHOULD-1 — cooldown reason for a spawn failure

A spawn failure is recorded as `crash` and cools the account for 60 s. That is fine, but make the error message say the executable could not be started (include the `spawn` error code such as `ENOENT`/`EINVAL`) so the admin sees the real cause in the requests log.

## Instructions for the fix-up

1. Apply MUST-1, MUST-2, SHOULD-1 with the tests named above.
2. `pnpm lint`, `pnpm build`, `pnpm test` green.
3. Append a `## Fix-up` section to `reports/phase-07-report.md`.
4. Commit as `fix(gateway): resolve windows cli shims to real executables, record failed requests`.
5. Start no server; the reviewer re-runs the real-CLI smoke afterwards.
