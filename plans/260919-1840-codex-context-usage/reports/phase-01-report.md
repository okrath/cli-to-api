# Phase 01 report

Status: DONE

## Built

- Extended `Adapter` with optional `lastCallUsage(dirs, cliSessionId)` and implemented it on `codexAdapter` by reading the last `token_count` line from the rollout JSONL.
- Updated `runCli` to accept `dirs`, hold trailing `usage`/`done` until process exit, apply `lastCallUsage` on the normal path, and yield corrected usage before `done` (helper in `run-cli-held-events.ts`).
- Passed `cliDirs(...)` from `execute-candidate.ts` into `runCli`.
- Recorded fixtures `tests/fixtures/codex-0.155.0-multistep.jsonl` and `codex-0.155.0-multistep-rollout.jsonl` from a real multi-step Codex run (stdout JSON lines only; PowerShell stderr was excluded from the stdout fixture).
- Tests for `lastCallUsage`, stdout sum vs correction, and `runCli` held-usage behaviour; README updates for Codex `prompt_tokens` semantics.

## Verified

Commands (repo root, Windows PowerShell):

```powershell
pnpm lint
pnpm test
# R1 fixture
Set-Location $env:TEMP
"Run the shell command `dir` and wait for its output. Then run `echo second-step` and wait for its output. Then reply with the single word: ok" |
  codex exec --json --skip-git-repo-check --color never -m gpt-5.6-sol --sandbox read-only - 2>$null |
  Where-Object { $_.TrimStart().StartsWith('{') } | Set-Content $env:TEMP\codex-multistep-stdout.jsonl
# R5 live (gateway on 8090; reset codex account cooldown via admin first)
$env:PORT = "8090"; node apps/gateway/dist/index.js
# POST /v1/chat/completions model codex/gpt-5.6-sol with the same multistep user prompt and a fresh `user` id
```

- `pnpm lint`: green (gateway + web `tsc --noEmit`).
- `pnpm test`: green (214 tests, one run).

### R1 before/after (fixture run)

| Source | `input_tokens` (turn sum) | Last call `last_token_usage.input_tokens` |
|---|---:|---:|
| Recorded stdout `turn.completed` / rollout | 115934 | 23663 |

### R5 before/after (live gateway on port 8090)

| Source | Turn sum (last rollout `total_token_usage.input_tokens`) | Gateway `usage.prompt_tokens` | Last `last_token_usage.input_tokens` |
|---|---:|---:|---:|
| Multistep prompt via `POST /v1/chat/completions` | 96654 | 24640 | 24640 |

(`prompt_tokens` reflects last-call context ~25k, not the ~97k turn sum.)

## Deviations

- Stdout fixture excludes non-JSON lines that PowerShell mixed into the redirect; rollout lines are copied verbatim from the CLI session file under `%CODEX_HOME%` (orca runtime home on this host, not `~/.codex`).

## Concerns / questions for review

- Host-profile Codex accounts depend on the gateway process seeing the same `CODEX_HOME` as the Codex child (`hostEnv` spreads `process.env`). If those diverge, `lastCallUsage` falls back to stdout sums (debug log) until the env matches.
- During live debugging, repeated failed requests while the codex account was on cooldown returned 429 immediately; R5 used `POST /admin/accounts/.../reset-cooldown` and a fresh `user` id per attempt.
