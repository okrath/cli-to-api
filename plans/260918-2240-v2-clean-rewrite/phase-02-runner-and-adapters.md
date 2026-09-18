# Phase 02 — CLI runner and adapters

Status: pending · Depends on: 01 · Effort: 1.5d · Can run in parallel with 03

## Context

This is the layer v1 got wrong. Every CLI here has a machine-readable JSONL
mode; adapters consume **only** that. Real recorded output for Claude Code
2.1.276 and Codex 0.154.0 is committed under `tests/fixtures/` (see
"Fixtures" below) and is the source of truth for `parseLine`. Do not invent
event shapes: when a shape is unknown, record it first with the CLI, commit the
fixture, then write the parser.

## Requirements

### Runner `apps/gateway/src/runner/run-cli.ts`

```ts
export function runCli(opts: {
  adapter: Adapter; args: string[]; promptVia: "argv" | "stdin"; prompt: string;
  env: NodeJS.ProcessEnv; cwd: string; timeoutMs: number; signal: AbortSignal; log: Logger;
}): { pid: Promise<number>; events: AsyncIterable<CliEvent> }
```

- `child_process.spawn(executable, args, { cwd, env, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe","pipe","pipe"] })`. For `promptVia: "stdin"` write the prompt then `end()`; for `argv` the prompt is already the last arg.
- Read stdout line by line (`readline` on the stream, `crlfDelay: Infinity`). For each non-empty line call `adapter.parseLine(line)`; yield each event. A `parseLine` that throws is a bug: catch, log at `error` with the offending line (truncated to 500 chars), continue.
- Accumulate stderr (cap 64 KB). On exit: if no `error` and no `done` were emitted and exit code != 0 → emit `error` from `adapter.parseStderr?.(stderr)` if it yields one, else `{ kind: "crash", message: last 500 chars of stderr }`. Then emit `done` if not yet emitted. **Exactly one `done`, always last.**
- Timeout → `killTree(pid)` then `error { kind: "timeout" }` + `done`. `signal.aborted` → `killTree(pid)`, emit nothing further except `done { stopReason: "error" }`.
- Expose `pid` for the live view.

### Kill tree `apps/gateway/src/runner/kill-tree.ts`

- Windows: `spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"])`.
- POSIX: `process.kill(-pid, "SIGTERM")`, then `SIGKILL` after 300 ms if still alive.
- Never throw; log failures.

### Sandbox `apps/gateway/src/runner/sandbox.ts`

- `ensureSandbox(dataDir, adapterId, accountId)` creates and returns `{ accountDir, homeDir, configDir, workspaceDir }` = `${dataDir}/sandboxes/${adapterId}/${accountId}/{home,config,workspace}`.
- `baseEnv(sandbox)`: copy of `process.env` with `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` pointed at `homeDir` (APPDATA/LOCALAPPDATA at `homeDir/AppData/Roaming|Local`), plus `CI=1`, `NO_COLOR=1`, `FORCE_COLOR=0`, `TERM=dumb`. `PATH` untouched. Adapter `buildEnv` is merged on top.

### Transcript rendering `apps/gateway/src/runner/render-transcript.ts`

As specified in `plan.md` §4.1. Pure function; unit-tested.

### Adapter registry `apps/gateway/src/adapters/index.ts`

- `adapters: Record<AdapterId, Adapter>` and `detectAdapters(): Promise<Array<{ id, executable, installed: boolean, version?: string, path?: string }>>` — resolve with `where`/`which` semantics via spawning `<exe> --version` with a 5 s timeout, cache result for 60 s, expose a `refresh()`.
- Test-only adapter `fake` (executable `node`, args `[tests/fake-cli/fake-cli.mjs, ...]`) is registered **only** when `process.env.CTA_ENABLE_FAKE_ADAPTER === "1"`.

### Adapters (each one file, ≤ 200 lines, no shared base class)

**`claude-code.ts`** (verified against Claude Code 2.1.276)

- `buildArgs`: `["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--model", model, "--max-turns", "1", "--disable-slash-commands"]`
  + `["--effort", effort]` when effort is set and not `none`
  + `["--system-prompt", systemPrompt]` when provided and not resuming
  + `allowTools ? ["--dangerously-skip-permissions"] : ["--tools", ""]`
  + resume ? `["--resume", cliSessionId]` : `["--session-id", randomUUID()]`
  Prompt via **stdin** (`-p` reads stdin when no positional prompt; avoids Windows argv limits).
- `buildEnv`: `{ CLAUDE_CONFIG_DIR: configDir }`.
- `parseLine`:
  - `type:"system", subtype:"init"` → `session { cliSessionId: session_id }`
  - `type:"rate_limit_event"` → `rate_limit { windows: from rate_limit_info.unifiedWindows (name, utilization, resetsAt), limited: rate_limit_info.status !== "allowed" }`
  - `type:"stream_event"`: `event.type === "content_block_delta"` → `delta.type === "thinking_delta"` → `thinking_delta`; `"text_delta"` → `text_delta`. `event.type === "message_delta"` with `usage` → `usage` (input_tokens, cache_read_input_tokens, cache_creation_input_tokens, output_tokens, output_tokens_details.thinking_tokens).
  - `type:"result"`: emit final `usage` from `usage` + `total_cost_usd` (authoritative; downstream keeps the last usage event). If `is_error` → `error` with kind by message: `/rate limit|usage limit|resets in/i` → `rate_limit`; `/not logged in|login|unauthor|api key/i` → `auth`; else `unknown`. Then `done` with `stop_reason: "max_tokens"` → `max_tokens`, error → `error`, else `end_turn`.
  - Everything else (`assistant`, `user`, hook events, `system/status`) → `[]`.
- `parseStderr`: `/not logged in|please run \/login|invalid api key/i` → `auth`.

**`codex.ts`** (verified against Codex 0.154.0)

- `buildArgs`: new: `["exec", "--json", "--skip-git-repo-check", "--color", "never", "-m", model]`; resume: `["exec", "resume", cliSessionId, "--json", "--skip-git-repo-check", "-m", model]` (`codex exec resume --help` on 0.154.0 confirms `--json`, `-m`, `-c`, `--skip-git-repo-check`, `--dangerously-bypass-approvals-and-sandbox` are accepted; `--color` is **not** listed for `resume`, so omit it there).
  + `["-c", `model_reasoning_effort="${effort}"`]` when effort set and not `none` (`xhigh` passes through; Codex supports it)
  + `allowTools ? ["--dangerously-bypass-approvals-and-sandbox"] : ["--sandbox", "read-only"]`
  + `"-"` last → prompt via **stdin**.
  Codex has no system-prompt flag: `render-transcript` places the system prompt as a leading `<system>...</system>` block on **new** sessions only.
- `buildEnv`: `{ CODEX_HOME: configDir }`.
- `parseLine`:
  - `thread.started` → `session { cliSessionId: thread_id }`
  - `item.completed` with `item.type === "agent_message"` → `text_delta { text: item.text }` (Codex emits the whole message at once; no token streaming — accepted)
  - `item.completed` with `item.type === "reasoning"` → `thinking_delta { text: item.text }`
  - `item.completed` with `item.type === "error"` → **only** if `/rate limit|usage limit|quota|too many requests/i` → `error rate_limit`; `/login|unauthor|auth/i` → `error auth`; otherwise ignore (Codex emits informational "errors", e.g. skills budget warnings — see fixture).
  - `turn.completed` → `usage` (input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_output_tokens) then `done end_turn`.
  - `turn.failed` (confirm name at implementation) → `error` (kind by message) + `done error`.

**`agy.ts`** (Antigravity CLI, verified against agy 1.2.6 — fixture `agy-1.2.6-pong.jsonl`)

- `buildArgs`: `["--print", prompt, "--output-format", "stream-json", "--disable-slash-commands"]` + `["--model", model]` + `["--effort", clamp(effort)]` where `xhigh → high`, `none` → omit + resume ? `["--conversation", cliSessionId]` : [] + `allowTools ? ["--dangerously-skip-permissions"] : []`. Prompt via **argv** (`--print` takes the text). If the rendered prompt exceeds 6000 chars, use `--input-format stream-json` and write one NDJSON user message to stdin — record a fixture for that input mode before relying on it. agy has no system-prompt flag: `render-transcript` prepends the `<system>` block as for Codex.
- `buildEnv`: `{}` beyond the sandbox `HOME`/`APPDATA` override (agy stores config under the user profile; verify the login lands inside `homeDir` in the report).
- `parseLine`:
  - `event:"init"` → `session { cliSessionId: conversation_id }`
  - `event:"step_update"` with `step_update.step_type === "agent_response"` and a string `text_delta` → `text_delta` (the `state: "DONE"` step also carries a final `text_delta`, usually `"\n"`, and a `usage` object → also emit `usage`)
  - `event:"result"`: `usage` from `result.usage` (`input_tokens`, `output_tokens`, `thinking_tokens` → reasoning, `cache_read_tokens` → cachedInput, cacheWrite 0) then `done end_turn` when `status === "SUCCESS"`; any other status → `error` (kind by message, default `unknown`) + `done error`.
  - anything else → `[]`. Thinking text is not exposed by agy in this mode; only `thinking_tokens` counts are.

**`omp.ts`** (verified against omp 18.2.0 — fixture `omp-18.2.0-pong.jsonl`)

- `buildArgs`: `["-p", "--mode", "json", "--no-pty", "--profile", configDir, "--model", model]` + `["--system-prompt", systemPrompt]` when provided and not resuming + resume ? `["-r", cliSessionId]` : [] + `[prompt]` last. Prompt via **argv** (`-p` reads the positional prompt; if a stdin form exists, record a fixture before switching). No effort flag: ignore effort.
- `buildEnv`: `{}` (isolation via `--profile` plus the sandbox `HOME`).
- `parseLine`:
  - `type:"session"` → `session { cliSessionId: id }`
  - `type:"message_update"` with `assistantMessageEvent.type === "text_delta"` → `text_delta { text: delta }`; `"thinking_delta"` → `thinking_delta` (name to confirm the first time a reasoning model is used; ignore unknown update types)
  - `type:"message_end"` with `message.role === "assistant"` → `usage { input: usage.input, cachedInput: usage.cacheRead, cacheWrite: usage.cacheWrite, output: usage.output, reasoning: usage.reasoningTokens, costUsd: usage.cost.total }`
  - `type:"agent_end"` → `done end_turn`
  - `type:"error"` (name to confirm) → `error` + `done error`; anything else → `[]`.

## Fixtures (`tests/fixtures/`)

All four fixtures are committed by the plan author, recorded on 2026-09-18 from the real CLIs on the dev host. Expected parse results, to assert in tests:

- `claude-code-2.1.276-pong.jsonl` → one `session`, one `rate_limit` (windows `five_hour` 0.34 and `seven_day` 0.22, `limited: false`), thinking deltas, one `text_delta "pong"`, at least one `usage` whose last value (from the `result` line) is `input 10, cachedInput 21894, cacheWrite 12828, output 43, reasoning 35`, `costUsd ≈ 0.0290`, then `done end_turn`. Zero `error`. Hook lines (`system/hook_started`, `hook_response`) produce nothing.
- `codex-0.154.0-pong.jsonl` → one `session`, zero `error` (the skills-budget warning item is ignored), one `text_delta "pong"`, one `usage { input 23198, cachedInput 6784, cacheWrite 0, output 5, reasoning 0 }` (assert against the committed file), then `done end_turn`.
- `agy-1.2.6-pong.jsonl` → one `session`, `text_delta "pong"` then `text_delta "\n"`, `usage { input 13902, output 23, reasoning 22, cachedInput 0 }`, `done end_turn`, zero `error`.
- `omp-18.2.0-pong.jsonl` → one `session`, one `text_delta "pong"`, one `usage { input 1606, output 25, reasoning 24, cachedInput 0, cacheWrite 0, costUsd ≈ 0.0013 }`, `done end_turn`, zero `error`. The user `message_start`/`message_end` pair produces nothing.

## Fake CLI `tests/fake-cli/fake-cli.mjs`

Node script emitting Claude-style JSONL for tests; behaviour via env:
`FAKE_SCENARIO=ok|rate_limit|crash|hang|slow` and `FAKE_TEXT`. `hang` never exits (tests timeout/abort/kill-tree). Uses the same event shapes as the claude fixture so the `fake` adapter can reuse `claude-code.parseLine`.

## Tests

- `adapters/claude-code.test.ts`, `adapters/codex.test.ts`: feed fixture lines to `parseLine`, assert the lists above; assert malformed line → `[]`.
- `runner/run-cli.test.ts` with fake CLI: ok stream order and exactly one `done`; `crash` → error crash; `hang` + 500 ms timeout → error timeout and process gone; abort → process gone within 500 ms (check via `process.kill(pid, 0)` throwing, and on Windows `tasklist /FI "PID eq <pid>"`).
- `runner/render-transcript.test.ts`.

## Validation

`pnpm test` green. Manual: with a logged-in `claude` account sandbox, `node -e` script calling `runCli` prints deltas and exits.

## Risks / rollback

Flag drift across CLI versions: keep fixtures named with versions; `detectAdapters` shows the version in the admin UI. Rollback: none needed, additive.

## Report

`reports/phase-02-report.md`: fixtures added, which adapters are fully verified vs stubbed, any flag that differed from this file.
