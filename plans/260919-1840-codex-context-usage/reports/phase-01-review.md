# Phase 01 review

Verdict: APPROVED — plan complete.

Reviewed commit `9ff3393` against `phase-01-last-call-usage.md`.

What was checked:

- `core/types.ts`: `lastCallUsage?` added exactly as specified; no other contract change.
- `adapters/codex.ts`: `lastCallUsage` reads the rollout found by `codexSessionArtifacts`, keeps the last
  `token_count` record with `last_token_usage`, returns `input = input_tokens - cached_input_tokens`,
  never throws. Fixture numbers: last call 23663 input / 23168 cached → `{ input: 495, cachedInput: 23168 }`,
  versus the summed 115934 in `turn.completed`.
- `runner/run-cli.ts` + `run-cli-held-events.ts`: usage/done are held only when the adapter has the hook and
  `dirs` is passed; every exit path (normal, abort, timeout, spawn failure) flushes the held events before
  `emitDone`, and `emitDone` is a no-op when a held `done` was already yielded (`sawDone`). Adapters without
  the hook take the unchanged path — the existing run-cli tests pass untouched.
- `router/execute-candidate.ts`: passes `cliDirs(adapterId, account, sandbox)`; host-profile Codex resolves
  `$CODEX_HOME` or `~/.codex` — the same value the child process sees via `hostEnv` (spreads `process.env`),
  so the concern in the report does not apply within one gateway process.
- Fixtures: recorded from codex-cli 0.155.0; rollout trimmed to `session_meta` + five `token_count` lines,
  stdout kept whole. They contain `%TEMP%` paths, model ids, token numbers and rate-limit percentages only.
- Bridged runs: Codex emits `usage` only at `turn.completed`, so `bridge-events` round subtraction is never
  reached for Codex; no change needed there (confirmed against the mcp-tool fixtures).
- Report R5: live `prompt_tokens` 24640 equals the rollout's last `last_token_usage.input_tokens` (turn sum 96654).

Verification by the reviewer: `pnpm lint` clean; `pnpm test` 214/214 green (one run, after stopping the
gateway that was killing test processes — see below); `pnpm build` green.

Finding outside this phase (not caused by it): while reviewing, several test runs died without output and a
process listing showed the user's running gateway executing `taskkill /PID <n> /T /F` on a PID that no longer
belonged to a CLI it started. `sweepExpiredBridges`, `abortRequest` and the run-cli timeout/abort paths kill by
raw PID without checking that the child is still running; on Windows a reused PID means an unrelated process
tree is killed. Tracked as a separate P0 fix.

Nit (no change needed): `drainLines` both checks `holdTerminal && (usage||done)` and relies on
`applyHeldTerminalEvent` returning `undefined` for the same case; one of the two is redundant.
