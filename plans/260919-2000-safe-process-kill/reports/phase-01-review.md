# Phase 01 review

Verdict: APPROVED — plan complete.

Reviewed commit `c494ed2` against `phase-01-safe-kill.md`.

What was checked:

- `runner/run-cli.ts`: `exited` flag set on the child's `exit`/`error` events, which also cancels the
  timeout timer and resolves the `exited` promise; `kill()` is a no-op once exited; `armTimeout` and
  `timeout.reset()` refuse to re-arm after exit; the three internal kill sites (timeout, abort signal,
  aborted-at-spawn) go through `kill()`. `git grep "killTree("` in `src` shows the single call inside `kill()`.
- `runner/kill-tree.ts`: Windows branch is an async `spawn("taskkill")` with `warn` on non-zero exit or
  spawn error; POSIX branch unchanged. No more event-loop blocking.
- `router/tool-bridge.ts`: `closeBridge(bridge, reason, log, retention)` shared by the expiry sweep and the new
  exit path; `sweepExpiredBridges(now, log, retention?)` calls `parked.kill()`; `parkRun` registers the
  `exited` handler once per run (`exitHandled`) and closes the bridge only while that run is still the
  parked one, so a run that resumed for round 2 is unaffected and a later round-2 request takes the
  existing fallback path.
- `router/execute-candidate.ts`: `ParkedRun` carries `kill`/`exited`; `continueStream` returns the inner
  iterator in `finally`, so a client that disconnects mid-stream lets run-cli's own `finally` run.
- `router/live.ts` / admin abort: controller-only abort; the guarded kill happens in run-cli.
- Tests: `vi.mock` of kill-tree with a delegating spy. I verified with a throwaway test (deleted) that the
  spy still observes a real kill of a live child after `vi.resetModules()`, so the two "not called after
  exit" assertions are meaningful. Bridge test covers close-on-exit (bridge gone, `release` called, live
  entry removed, pending call rejected with "CLI exited", `kill` not called). Route-request hooks now abort
  through `abortRequest` instead of raw PIDs.

Verification by the reviewer, with no gateway running on the host: `pnpm lint` clean, `pnpm test`
217/217, `pnpm build` green.

Follow-up (not blocking): `run-cli.ts` is ~365 lines; extract the child lifetime (exit tracking, `kill`,
timeout arming) into `runner/child-lifetime.ts` in a small refactor commit.
