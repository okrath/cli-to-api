---
title: "Kill only our own live CLI processes: no raw-PID kills, no stale timers"
status: in_progress
priority: P0
effort: "0.5d"
branch: main
implementer: Cursor Composer 2.5 Fast
reviewer: Claude (Fable 5.1)
created: 2026-09-19
depends_on: plans/260919-1840-codex-context-usage (completed)
tags: [gateway, runner, safety, windows]
---

# Safe process kill

## 1. Outcome

The gateway never terminates a process it did not start and that is not still
running. Every kill goes through a closure bound to the `ChildProcess` that is
a no-op once the child has exited; the request timeout is cancelled the moment
the child exits; a parked run whose CLI exits is cleaned up at once (slot
freed, live entry removed, bridge closed) instead of lingering until expiry;
Windows kills no longer block the event loop.

## 2. Evidence (this host, 2026-09-19 evening)

- A process listing caught the running gateway (`node dist/index.js`,
  PID 24596) executing `taskkill /PID 24000 /T /F` while 24000 was not a CLI
  it had started. In the same minute the reviewer's vitest run and PowerShell
  session died without output; several earlier test runs died the same way,
  and the gateway process itself was gone shortly after. With no gateway
  running, `pnpm test` passed 214/214 on the first try.
- The admin API stopped answering while `taskkill` ran: `killTree` uses
  `spawnSync` on Windows and blocks the event loop.
- Windows reuses PIDs within seconds; `taskkill /T` kills the whole process
  tree of whatever owns the PID now.

## 3. Root causes (all pre-existing)

| # | Where | Problem |
|---|---|---|
| 1 | `runner/run-cli.ts` | `killTree(child.pid)` in the timeout and abort paths does not check whether the child already exited. |
| 2 | `runner/run-cli.ts` | The timeout timer is cleared only in the generator's `finally`. When the client disconnects mid-stream, Fastify calls `.return()` on the serializer; `mergeEvents`/`continueStream` in the router pull the inner iterator with manual `.next()`, so `.return()` never reaches the run-cli generator, its `finally` never runs, and the timer fires `request_timeout_sec` later against a PID that is long gone. omp aborts requests often (compaction loops), so this fires regularly. |
| 3 | `router/tool-bridge.ts sweepExpiredBridges` | Kills `parked.pid` by number. A parked CLI can exit on its own (its MCP tool timeout, a crash); nothing notices, the entry stays `waiting_tool_result` until expiry, then the stale PID is killed. Seen today as a 24-minute-old parked entry with a dead pid. |
| 4 | `router/live.ts abortRequest` | Kills `entry.pid` by number in addition to aborting the controller. |
| 5 | `runner/kill-tree.ts` | `spawnSync("taskkill")` blocks the event loop; a hung `taskkill` freezes the gateway. |
| 6 | `apps/gateway/tests/router/route-request.test.ts` | `beforeEach`/`afterEach` kill live entries by raw PID the same way. |

## 4. Design

```ts
// runner/run-cli.ts — return type gains two members
{
  pid: Promise<number>;
  events: AsyncIterable<CliEvent>;
  timeout: { pause(): void; reset(): void };
  kill(): void;                     // kills the child's tree only while it is still running; no-op afterwards
  exited: Promise<number | null>;   // resolves with the exit code once the child has ended
}
```

- `child.once("exit", …)` sets an `exited` flag, cancels the timeout timer,
  resolves `exited`. `timeout.reset()` after exit is a no-op.
- Every internal kill site in run-cli (timeout fired, abort signal, aborted
  before spawn) calls `kill()`; `kill()` is the only caller of `killTree` in
  the whole gateway.
- `ParkedRun` gains `kill(): void` and `exited: Promise<number | null>`
  (`pid` stays for display). `sweepExpiredBridges(now, log, retention?)`
  calls `parked.kill()` — the `kill` parameter is removed.
- `parkRun(bridge, run)` registers `run.exited.then(() => …)`: if
  `bridge.parked === run` when the child exits, the bridge is closed the same
  way an expired one is (release slot, remove live entry, delete ephemeral
  artifacts, reject pending MCP calls, delete the bridge). A later round-2
  request then takes the existing fallback path (fresh run with the tool
  history rendered as text).
- `abortRequest(requestId, log)` only aborts the controller; the run-cli abort
  listener does the (guarded) kill. `LiveEntry` is unchanged.
- `router/execute-candidate.ts continueStream`: `try { … } finally { await iterator.return?.(); }`
  so a consumer that stops early releases the run-cli generator (its own
  `finally` closes readline/stdout). `mergeEvents` already uses `yield*`.
- `killTree` on Windows: `spawn("taskkill", [...])` (async, `windowsHide`),
  log a `warn` on non-zero exit; POSIX branch unchanged.

## 5. Non-goals

- Changing how the timeout duration or tool-result expiry are configured.
- Verifying process identity beyond "still our running child" (no start-time
  comparison; the closure makes it unnecessary).
- Touching the web console.

## 6. Phase

Single phase: [phase-01-safe-kill.md](./phase-01-safe-kill.md).

## 7. Acceptance criteria

- [ ] AC-1 `grep -rn "killTree(" apps/gateway/src` shows exactly one call site: inside run-cli's `kill()`.
- [ ] AC-2 run-cli: after the fake CLI exits normally, firing the abort signal or letting a short timeout elapse does not invoke `killTree` (spy), and `exited` resolved with code 0; the existing abort/timeout tests (kill while alive) still pass.
- [ ] AC-3 tool-bridge: an expired bridge calls `parked.kill()` once; a parked run whose `exited` resolves is cleaned up immediately (bridge removed, `release()` called, live entry gone) and `kill()` is **not** called.
- [ ] AC-4 route-request: the tool-bridging integration tests pass with the test hooks no longer killing by raw PID; e2e "parked run expiry fallback" still passes.
- [ ] AC-5 `pnpm lint`, `pnpm test` (run with no gateway on this host), `pnpm build` green.

## 8. Review protocol and risks

Cursor implements, writes `reports/phase-01-report.md`, commits on `main`
without pushing; Claude reviews.

| Risk | Mitigation |
|---|---|
| `exited` fires before `parkRun` registers the handler | The handler is attached in `parkRun`; a promise that already resolved still runs `.then` on the next microtask, after `parkRun` has set `bridge.parked`, so the check `bridge.parked === run` holds. |
| Async `taskkill` means a run may still be alive for a few ms after `kill()` returns | Callers never depended on synchronous death; tests that assert death already poll. |
| `iterator.return()` on a bridged run | After a `done tool_use` round the bridge-events generator has already returned; `.return()` on a finished generator is a no-op and does not touch the parked run's source. |
