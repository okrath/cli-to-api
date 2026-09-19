# Phase 01 — Kill through the child handle only

Status: pending · Effort: 0.5d

## Requirements

### R1 `runner/run-cli.ts`

- Track the child's lifetime: `let exited = false;` and
  `child.once("exit", (code) => { exited = true; timeout.pause(); resolveExited(code); })`.
  Return `exited: Promise<number | null>` (resolve `null` immediately on the
  synchronous spawn-failure path, and on the `error` event).
- Add `kill(): void` to the returned object: `if (exited || child.pid == null || child.pid <= 0) return; killTree(child.pid, opts.log);`.
- Replace the three internal `killTree(child.pid, …)` calls (timeout handler,
  `onAbort`, the two "aborted before/at spawn" checks) with `kill()`.
- `timeout.reset()` must not re-arm after `exited`.
- Nothing else in this file changes; the held-usage logic from the previous
  phase stays as is. If the file exceeds ~300 lines, move the child lifetime
  bits (`exited`, `kill`, timeout arming) into `runner/child-lifetime.ts` and
  keep run-cli calling it.

### R2 `runner/kill-tree.ts`

Windows branch: `spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] })`;
collect stderr, log `warn` with `{ pid, code, stderr }` when the exit code is
non-zero, `warn` on the `error` event. Keep the function signature and the
POSIX branch.

### R3 Parked runs and bridges (`router/tool-bridge.ts`, `router/execute-candidate.ts`, `router/route-request.ts`, `router/bridge-events.ts`)

- `ParkedRun`: add `kill(): void; exited: Promise<number | null>;`. Set both
  in `execute-candidate.ts` from the `runCli` result.
- `sweepExpiredBridges(now, log, retention?)`: drop the `kill` parameter, call
  `parked.kill()` instead of `kill(parked.pid, log)`. Update `server.ts`
  (both call sites) and the tests.
- Extract the per-bridge cleanup from `sweepExpiredBridges` into a function
  `closeBridge(bridge, reason: "expired" | "cli_exited", log, retention?)`
  that: releases the parked run, removes its live entry, deletes ephemeral
  artifacts when `cliSessionId` is known, rejects pending MCP calls with
  `Error(reason === "expired" ? "tool result timed out" : "CLI exited")`,
  deletes the bridge. `sweepExpiredBridges` calls `parked.kill()` then
  `closeBridge(..., "expired")`.
- `parkRun(bridge, run)`: after setting `bridge.parked = run`, register
  `void run.exited.then(() => { if (bridge.parked === run) closeBridge(bridge, "cli_exited", …); })`.
  `parkRun` needs `log` (and optionally `retention`) for that — pass what
  `sweepExpiredBridges` receives; `bridge-events.ts` and `route-request.ts`
  already have `log` in scope (route-request has `deps.log`; bridge-events gets
  it from its caller, add a parameter if needed). Register the handler only
  once per run (a run can be parked again in round 2; guard with a flag on
  the run, e.g. `exitHandled`).
- `execute-candidate.ts continueStream`: wrap the loop in `try { … } finally { await iterator.return?.(); }`.

### R4 `router/live.ts` and `api/admin/system.ts`

- `abortRequest(requestId, log)`: abort the controller only; remove the
  `kill` parameter and the `entry.pid` kill. Update the admin route.
- Remove the now-unused `killTree` type import.

### R5 Tests

- `apps/gateway/tests/runner/run-cli.test.ts`
  - Mock `../../src/runner/kill-tree.js` with `vi.mock` so `killTree` is a spy
    that still delegates to the real implementation (`vi.importActual`).
  - New: "does not kill after the child exited" — run the fake `ok` scenario
    with `timeoutMs: 300`, collect all events, `await exited` (expect `0`),
    then call `controller.abort()` and wait 500 ms; expect the spy not called
    and no `error` event.
  - New: "kill() is a no-op after exit" — same setup, call `kill()` after
    `exited`; spy not called.
  - Existing abort/timeout/hang tests unchanged (they kill a live child and
    must still see it die; they may need a short poll because `taskkill` is
    now async — use the existing `isProcessAlive` loop pattern with a 2 s deadline).
- `apps/gateway/tests/router/tool-bridge.test.ts`: adapt the three
  `sweepExpiredBridges` tests to the new signature with a `ParkedRun` stub
  whose `kill` is a `vi.fn()` and whose `exited` is a controllable promise.
  New: "closes the bridge when the parked CLI exits" — resolve `exited`,
  await a microtask, assert bridge gone, `release` called, `removeLive`
  effect visible via `getLiveEntries()`, `kill` not called, pending MCP call
  rejected with "CLI exited".
- `apps/gateway/tests/router/route-request.test.ts`: in the `beforeEach`/`afterEach`
  hooks replace the raw-PID loops with `abortRequest(requestId, log)` for
  each live entry (import from `../../src/router/live.js`); update the
  `sweepExpiredBridges` calls to the new signature. Line ~179 has the same
  raw-PID loop outside the tool-bridging block — same replacement.
- `tests/e2e/acceptance.test.ts`: no change expected; it must stay green.
- Before running the suite, make sure no gateway is running on this host
  (`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` should show only
  your own tooling); a running gateway kills test processes (that is this bug).

### R6 README

In "How routing works" step 4 or the Troubleshooting section, one sentence:
a CLI process is only ever terminated through the handle the gateway holds,
and a parked run whose CLI exits is released immediately. Nothing else.

## Files

```
apps/gateway/src/runner/run-cli.ts            (+ runner/child-lifetime.ts only if needed for size)
apps/gateway/src/runner/kill-tree.ts
apps/gateway/src/router/tool-bridge.ts
apps/gateway/src/router/bridge-events.ts
apps/gateway/src/router/execute-candidate.ts
apps/gateway/src/router/route-request.ts
apps/gateway/src/router/live.ts
apps/gateway/src/server.ts
apps/gateway/src/api/admin/system.ts
apps/gateway/tests/runner/run-cli.test.ts
apps/gateway/tests/router/tool-bridge.test.ts
apps/gateway/tests/router/route-request.test.ts
README.md
plans/260919-2000-safe-process-kill/reports/phase-01-report.md
```

Do not touch adapters, the web console, `finalize-run.ts`, `record-usage.ts`,
or the fixtures.

## Validation

`pnpm lint`, `pnpm test` (no gateway running), `pnpm build`, and
`git grep -n "killTree(" apps/gateway/src` showing the single call inside
run-cli's `kill()`.

## Report

`reports/phase-01-report.md` in the AGENTS.md format; include the `git grep`
output and the test totals.
