---
title: "Codex usage: report the context of the last model call, not the sum of the run"
status: completed
priority: P1
effort: "0.5d"
branch: main
implementer: Cursor Composer 2.5 Fast
reviewer: Claude (Fable 5.1)
created: 2026-09-19
depends_on: plans/260919-1300-data-retention (completed)
tags: [gateway, codex, usage, omp]
---

# Codex context usage

## 1. Outcome

A client that sizes its context window from `prompt_tokens` (omp does) gets a
number that reflects the **context of the last model call** of a Codex run,
not the sum over every internal step. A Codex turn that ran twelve shell
steps of ~30k context each reports ~30k, not ~360k, so omp stops compacting a
conversation that is not large.

## 2. Context (verified on this host, 2026-09-19)

- `codex exec --json` emits usage only once, in `turn.completed.usage`, and
  the numbers are **summed over all model calls** of the turn. A 243 s
  agentic run reported `input_tokens 364281` while each call had ~30k of
  context. omp compared that with `contextWindow: 200000` and paused
  compaction ("the most recent turn alone is too large").
- The rollout file Codex writes for every thread —
  `<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread_id>.jsonl` —
  contains one record **per model call**:

  ```json
  {"timestamp":"2026-09-19T09:43:46.665Z","ordinal":13,"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":28585,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":23,"reasoning_output_tokens":0,"total_tokens":28608},"last_token_usage":{"input_tokens":28585,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":23,"reasoning_output_tokens":0,"total_tokens":28608},"model_context_window":258400},"rate_limits":{...}}}
  ```

  `last_token_usage` of the **last** such record is the context of the final
  call. `codexSessionArtifacts(dirs, threadId)` in `adapters/codex.ts`
  already locates this file.
- The gateway's `runCli` waits for the child to exit before it finishes the
  event stream (`runner/run-cli.ts`, exit-code await), so the rollout is
  complete at that point. Retention deletes the rollout only in
  `finalize-run.ts` after the stream ends, so reading it at exit is safe for
  ephemeral keys too.
- Codex with client tools never emits `usage` before it is parked (the turn
  is still open), so `bridge-events.ts` never subtracts previous rounds for
  Codex; the last-call correction needs no change there.
- Already fixed separately (`dd833f5`): the gateway added
  `cached_input_tokens` on top of `input_tokens` although OpenAI counts the
  cached part inside `input_tokens`.

## 3. Decisions

| Topic | Decision |
|---|---|
| Source of truth | The CLI's own rollout file (JSONL). No estimation, no regex over prose. |
| Which fields change | `input`, `cachedInput`, `cacheWrite` of the run's `usage` event are replaced by the last call's values (`input` = `input_tokens - cached_input_tokens`). `output` and `reasoning` stay as `turn.completed` reported them (the turn's totals). |
| Where | `runCli` holds back the adapter's trailing `usage`/`done` events until the process has exited, then asks the adapter for the last call's usage. Adapters without the hook are untouched, so Claude/agy/Cursor behave exactly as today. |
| Usage history | `requests.input_tokens` for Codex now records the last call's context, not the turn's sum. Accepted: quotas are track-only, Codex rate limits come from its own windows, and the context number is the one clients act on. README says so. |
| Fallback | No rollout, no `token_count` record, or a read error → the `turn.completed` numbers are reported unchanged (today's behaviour) and a `debug` log line says why. Never throws. |

## 4. Contract extension (additive to v2 plan §4.1; report any other deviation)

```ts
// core/types.ts
export interface Adapter {
  /* unchanged */
  // Token usage of the last model call of a finished run, read from the CLI's own
  // session artifacts (called after the process exited). undefined when nothing is
  // recorded; never throws.
  lastCallUsage?(
    dirs: CliDirs,
    cliSessionId: string,
  ): { input: number; cachedInput: number; cacheWrite: number } | undefined;
}
```

`runCli` gains an optional `dirs?: CliDirs` option (passed by
`execute-candidate.ts` from `cliDirs(adapterId, account, sandbox)`).

## 5. Non-goals

- Changing what Claude Code, agy or Cursor report.
- Restricting Codex's built-in shell tools during bridged runs.
- Per-step cost accounting for Codex.

## 6. Phase

Single phase: [phase-01-last-call-usage.md](./phase-01-last-call-usage.md).

## 7. Acceptance criteria

- [x] AC-1 A recorded multi-step Codex rollout fixture (≥ 2 `token_count` records) exists under `tests/fixtures/`, with the matching stdout JSONL of the same run. *(five `token_count` records, codex-cli 0.155.0)*
- [x] AC-2 `codexAdapter.lastCallUsage` returns the last record's `last_token_usage` split as `{input, cachedInput, cacheWrite}` for that fixture; `undefined` when the file is missing or has no `token_count` record.
- [x] AC-3 `runCli` with an adapter that implements `lastCallUsage` yields the `usage` event with the replaced input fields and unchanged `output`/`reasoning`, after all other events and before `done`; with an adapter that does not implement it the event stream is byte-for-byte what it is today (existing run-cli tests unchanged and green).
- [x] AC-4 Live check on this host: a Codex run through the gateway that executes several shell steps returns `prompt_tokens` close to one call's context (~25–35k), not the sum; the number is recorded in the report together with the rollout's last `token_count`. *(24640 reported vs 96654 summed)*
- [x] AC-5 `pnpm lint` and `pnpm test` green; README "Usage"/"Groups"/"Troubleshooting" notes about Codex token sums updated to the new behaviour. *(214/214, reviewer run)*

## 8. Review protocol and risks

Cursor implements, writes `reports/phase-01-report.md`, commits on `main`
without pushing; Claude reviews the diff and report.

| Risk | Mitigation |
|---|---|
| Rollout not flushed when the process exits | Read after the exit-code await; if no record is found, fall back to the stdout numbers and log at `debug`. |
| Holding back `done` adds latency | Codex exits within ~100 ms of `turn.completed`; only adapters with the hook are affected. |
| Large rollout files | Read once at run end; files are a few MB at most. |
| Host-profile accounts | `cliDirs` already resolves `~/.codex` (or `$CODEX_HOME`) for them, the same path retention uses. |
