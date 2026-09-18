# Phase 01 — Popular CLI set: add `cursor-agent`, remove `omp`

Status: pending · Effort: 0.5d

## Requirements

### Add `apps/gateway/src/adapters/cursor-agent.ts`

- `id: "cursor-agent"`, `executable: "cursor-agent"`. Extend the `Adapter["id"]`
  union in `core/types.ts` to `"claude-code" | "codex" | "agy" | "cursor-agent"`
  (omp removed) and update `KNOWN_ADAPTER_IDS`.
- `models` (ids as `cursor-agent models` prints them): `composer-2.5-fast`
  ("Composer 2.5 Fast"), `composer-2.5` ("Composer 2.5"), `gpt-5.3-codex`
  ("Codex 5.3"), `claude-sonnet-5-thinking-high` ("Claude Sonnet 5 Thinking"),
  `claude-opus-5-high` ("Claude Opus 5"), `gemini-3.7-flash-high` ("Gemini 3.7 Flash").
  Any other id the client sends is passed through (`resolveModel` already allows it for `adapter/model`).
- `buildArgs`: `["-p", "--trust", "--output-format", "stream-json", "--stream-partial-output", "--model", model]`
  + `allowTools ? ["--force"] : ["--mode", "ask"]`
  + resume ? `["--resume", cliSessionId]` : []. Prompt via **argv** (runner appends
  it). Effort ignored. No system-prompt flag: `render-transcript` prepends the
  `<system>` block (same `prependSystemInPrompt` path as Codex and agy).
- `buildEnv`: `{ CURSOR_INVOKED_AS: "cursor-agent" }` (the shim sets it; harmless to set ourselves).
- `parseLine` (fixture is the truth):
  - `type:"system" && subtype:"init"` → `session { cliSessionId: session_id }`
  - `type:"thinking" && subtype:"delta"` → `thinking_delta { text }`
  - `type:"assistant"` **with** a numeric `timestamp_ms` → `text_delta` with the
    concatenated `message.content[].text` of `type:"text"` parts
  - `type:"assistant"` **without** `timestamp_ms` → `[]` (aggregate duplicate)
  - `type:"result"` → `usage { input: usage.inputTokens, cachedInput: usage.cacheReadTokens, cacheWrite: usage.cacheWriteTokens, output: usage.outputTokens, reasoning: 0 }` then `done end_turn`; when `is_error` → `error` (kind by message: `/rate limit|usage limit|quota/i` → `rate_limit`, `/not logged in|login|unauthor|auth/i` → `auth`, else `unknown`) and `done error`
  - `user`, `thinking/completed`, `tool_call*`, anything else → `[]`
- `parseStderr`: `/not logged in|please run .*login|unauthor/i` → `auth`;
  `/Workspace Trust Required/i` → `crash` with the message "cursor-agent needs --trust" (should never happen, guards a regression).
- Test `tests/adapters/cursor-agent.test.ts` against the committed fixture:
  one `session`, three `thinking_delta`, exactly two `text_delta` ("p", "ong"),
  one `usage { input 8109, cachedInput 7872, cacheWrite 0, output 39 }`, `done end_turn`, zero `error`.

### Resolver: understand the Cursor shim (`runner/resolve-executable.ts`)

`cursor-agent.cmd` runs `powershell … -File "%SCRIPT_DIR%\cursor-agent.ps1" %*`;
the `.ps1` picks `versions/<latest>/node.exe` + `versions/<latest>/index.js`
(or `node.exe` + `index.js` next to the script). Add a second shim rule: when a
`.cmd` references a sibling `.ps1`, look in the shim's directory for
`node.exe`+`index.js`, else the highest `versions/<YYYY.M.D-…>` directory that
contains both, and return `{ file: node.exe, prefixArgs: [index.js], shell: false }`.
Only if nothing matches fall back to `shell: true` as today. Unit test with a
temp directory replicating this layout (empty `node.exe`/`index.js` files).

### Remove `omp`

Delete `adapters/omp.ts`, `tests/adapters/omp.test.ts`,
`tests/fixtures/omp-18.2.0-pong.jsonl`; remove it from the registry, types,
catalog tests, README adapter table and any alias list. `git rm` the fixture.

### Docs

README adapter table: add the Cursor agent row (version tested, flags, argv
prompt, resume, "tools off via `--mode ask`"), drop omp. Note the Windows shim
resolution in Troubleshooting.

## Validation

- `pnpm lint`, `pnpm build`, `pnpm test` green; `grep -ri omp apps tests README.md` returns nothing but unrelated words.
- Real run by the reviewer: `scripts/smoke-real-cli.mjs --adapter cursor-agent --model composer-2.5-fast` through a **host-profile** account once phase 02 lands; for this phase, the reviewer runs `cursor-agent` through an isolated account and expects the auth error to be classified as `auth`.

## Report

`reports/phase-01-report.md` in this plan folder.
