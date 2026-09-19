# Phase 01 — Last-call usage for Codex

Status: pending · Effort: 0.5d

## Requirements

### R1 Fixture from the real CLI (do this first)

Record a multi-step run with the host's Codex login (the `codex` account in
this gateway uses the host profile, so `~/.codex` is the right place):

```powershell
Set-Location $env:TEMP
"Run the shell command `dir` and wait for its output. Then run `echo second-step` and wait for its output. Then reply with the single word: ok" |
  codex exec --json --skip-git-repo-check --color never -m gpt-5.6-sol --sandbox read-only - > codex-multistep-stdout.jsonl
```

Take `thread_id` from the first line of the stdout file and copy the matching
`~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread_id>.jsonl`. Keep
only these lines from the rollout, in their original order and unmodified:
the first line (`session_meta`) and every line whose payload type is
`token_count`. There must be at least two `token_count` lines; if the model
answered without running the commands, rerun with a firmer prompt. Save as:

```
tests/fixtures/codex-0.155.0-multistep.jsonl          (stdout, whole file)
tests/fixtures/codex-0.155.0-multistep-rollout.jsonl  (trimmed rollout)
```

Check both files for anything personal before committing (they should hold
paths under `%TEMP%`, model ids, token numbers and rate-limit percentages,
nothing else). Write the sum reported in `turn.completed` and the last
`last_token_usage.input_tokens` into the report — they are the before/after.

### R2 Contract and adapter

- `core/types.ts`: add `lastCallUsage?` to `Adapter` exactly as in `plan.md` §4.
- `adapters/codex.ts`: implement `lastCallUsage(dirs, threadId)`:
  1. `codexSessionArtifacts(dirs, threadId)[0]` — if none, return `undefined`.
  2. Read the file, split lines, parse each line that contains `"token_count"`
     as JSON (skip lines that fail to parse), keep the last one whose
     `payload.type === "token_count"` and has `payload.info.last_token_usage`.
  3. Return `{ input: max(0, input_tokens - cached_input_tokens), cachedInput: cached_input_tokens, cacheWrite: cache_write_input_tokens ?? 0 }`.
  4. Any error → `undefined`. No logging inside the adapter.

### R3 `runCli`

- New option `dirs?: CliDirs`.
- Only when `opts.adapter.lastCallUsage && opts.dirs`:
  - remember `cliSessionId` from `session` events;
  - do not yield `usage` and `done` events coming out of `parseLine`; keep
    the latest `usage` and the `done` in local variables (still set
    `sawDone`); every other event is yielded as today;
  - on the normal path, after the exit-code await and the stderr handling:
    if a held `usage` exists, call `lastCallUsage(dirs, cliSessionId)`
    (only when `cliSessionId` is known); on a result, yield the usage with
    `input`/`cachedInput`/`cacheWrite` replaced, otherwise yield it unchanged
    and log at `debug` (`"no last-call usage in CLI artifacts"` with adapter
    and session id); then yield the held `done` (or `emitDone` as today when
    none was held);
  - on the abort, timeout and spawn-failure paths, yield the held `usage`
    unchanged (if any) before the `done` those paths emit today.
- Adapters without `lastCallUsage` must take exactly the existing code path.
- `router/execute-candidate.ts`: pass `dirs: cliDirs(input.candidate.adapterId, input.account, sandbox)` to `runCliFn` (see how `sessions/retention.ts` builds `dirs`; `cliDirs` is in `runner/sandbox.ts`).

### R4 Tests

- `apps/gateway/tests/adapters/codex.test.ts`: copy the rollout fixture into
  `<tmp>/sessions/2026/09/19/rollout-2026-09-19T00-00-00-<threadId>.jsonl`
  (use the fixture's real thread id), call `lastCallUsage({ configDir: tmp, homeDir: tmp, workspaceDir: tmp }, threadId)` and assert the exact numbers from the last `token_count` line; assert `undefined` for an unknown id and for a file with no `token_count` line. Also assert that parsing the new stdout fixture yields one `usage` whose `input + cachedInput` equals `turn.completed.usage.input_tokens` (the summed number the correction replaces).
- `apps/gateway/tests/runner/run-cli.test.ts`: with the fake CLI (`ok` scenario) and an adapter wrapper that adds `lastCallUsage: () => ({ input: 111, cachedInput: 22, cacheWrite: 3 })`, assert the yielded `usage` has those three fields, unchanged `output`/`reasoning`, and that the event order is `[...others, usage, done]`. Add a second case where `lastCallUsage` returns `undefined` → usage unchanged. Existing tests stay untouched.
- `pnpm test` and `pnpm lint` green.

### R5 Live check (AC-4)

Start your own gateway on `PORT=8090` (see environment rules in
`handoff.md`), create no new accounts — use the existing `codex` host-profile
account through `group:cta-max` or the direct model `codex/gpt-5.6-sol`, send
one chat completion whose prompt makes Codex run two or three shell commands
(same prompt as R1), and record `usage.prompt_tokens` from the response next to
the last `token_count` of the rollout. Stop your gateway afterwards.

### R6 README

Update the three places that describe Codex token sums (search the README for
"summed"): Groups table note under "Prefer Claude Code…", the "Usage" paragraph
in "How routing works", and the Troubleshooting entry about omp's compaction
warning. New wording: for Codex the gateway reports `prompt_tokens` as the
context of the run's last model call, read from Codex's own session file;
`completion_tokens` stays the turn total; the console's usage history shows
the same numbers. Keep the advice that Codex may still take long, multi-step
turns.

## Files

```
apps/gateway/src/core/types.ts
apps/gateway/src/adapters/codex.ts
apps/gateway/src/runner/run-cli.ts
apps/gateway/src/router/execute-candidate.ts
apps/gateway/tests/adapters/codex.test.ts
apps/gateway/tests/runner/run-cli.test.ts
tests/fixtures/codex-0.155.0-multistep.jsonl
tests/fixtures/codex-0.155.0-multistep-rollout.jsonl
README.md
plans/260919-1840-codex-context-usage/reports/phase-01-report.md
```

Do not touch `bridge-events.ts`, `finalize-run.ts`, `record-usage.ts`, the
web console, or other adapters. Files stay under ~300 lines; `run-cli.ts` is
at 312 — if the change pushes it further, move the held-event logic into a
small helper in the same directory rather than growing the file.

## Validation

`pnpm lint`, `pnpm test`, the live check in R5, and a last look at
`git diff --stat` to make sure only the files above changed.

## Report

`reports/phase-01-report.md` in the AGENTS.md format, including the R1 and R5
numbers (sum vs last call) and the exact commands used.
