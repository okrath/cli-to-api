# Phase 01 report

Status: DONE_WITH_CONCERNS

Built:
- `run-cli.ts`: `kill()` closure and `exited` promise; child `exit` clears the timeout timer; all internal kills go through `kill()`.
- `kill-tree.ts`: Windows uses async `spawn("taskkill", …)` with warn logging on failure.
- `tool-bridge.ts`: `closeBridge`, `parkRun` watches `run.exited`, `sweepExpiredBridges` calls `parked.kill()` (no raw PID parameter).
- `execute-candidate.ts`: passes `kill`/`exited` on `ParkedRun`; `continueStream` always `return()`s the inner iterator.
- `live.ts` / admin abort: controller-only abort (no PID kill).
- `bridge-events.ts`, `route-request.ts`, `server.ts` updated for new signatures.
- Tests for post-exit no-kill, bridge cleanup on CLI exit, and integration hooks via `abortRequest`.
- README sentence on handle-only termination and immediate parked cleanup.

Verified:
- `pnpm lint` — green
- `pnpm test` — 32 files, 217 passed, 0 errors
- `pnpm build` — green
- `git grep -n "killTree(" apps/gateway/src`:
  ```
  apps/gateway/src/runner/kill-tree.ts:13:export function killTree(...)
  apps/gateway/src/runner/run-cli.ts:96:    killTree(child.pid, opts.log);
  ```
  (single production call site, inside `run-cli` `kill()`.)

Deviations: None.

Concerns / questions for review: `run-cli.ts` is ~365 lines (phase suggested `child-lifetime.ts` above ~300); split can follow in a small follow-up if desired.
