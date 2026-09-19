# Phase 03 review

Verdict: CHANGES REQUESTED — one real bug found in live use (fix 1), two small hardening items.

Reviewed commit `b88ca5d` against `phase-03-codex-e2e-docs.md` and plan §7.
Independently re-ran `pnpm lint` (clean), `pnpm test` (31 files, 191 tests, green), `pnpm build`
(green), the real claude-code `--tools` smoke (both dialects, `x-cta-session-reused: 1` on
round 2), and the manual omp check (AC-8, see below).

## Confirmed good

- Codex research table is honest and the decision rule from the phase file is applied: `clientTools: true`, bridging only for groups with `allowTools`, `-c web_search="disabled"`, passing fixture `codex-0.155.0-mcp-tool.*` committed. Codex's `tools/call` carries `_meta.callId`, not a tool-use id, so matching falls back to name + arguments — correct.
- `finalize-run.ts` `fallbackCliSessionId`: the session row is upserted after a multi-round tool loop even though the `session` event only appeared in round 1. Good catch.
- Acceptance tests AC-1…AC-5 exist with the fake MCP client; README Tools section, adapter table column, smoke docs, v2 plan annotation, web settings fields.
- AC-8 (manual, by reviewer): with `supportsTools` removed from `~/.omp/agent/models.yml`, `omp -p "Use your read tool to open package.json … reply with the name" --model cta/group:cta-max` answered `cli-to-api` and the gateway served the `read` call over `/mcp/<id>` — native tool calling works for omp.

## Required fixes

1. **OpenAI streaming never parks the run (observed with omp).** omp's round 2 (`system | user | assistant[calls:toolu_…] | tool[result:toolu_…]`) did not resume the parked process: `/admin/live` kept round 1 in `waiting_tool_result` and round 2 was served by a fresh run (correct answer only because the tool result was rendered as text). Cause: `bridge-events.ts` yields the round's `done { tool_use }` **before** running `endToolUseRound` (lines ~97–98 and ~168–171). `openAiStreamFrames` returns right after `done` (it writes `[DONE]` and stops pulling), so the generator is closed by `return()` and `detachClientAbort` / `timeout.pause` / `parkRun` never execute. Non-stream and Anthropic streaming drain the generator, which is why the smoke passed. Fix: run `endToolUseRound(...)` (it has no yields) **before** yielding the final `done` in both places, then `return`. Add a test that consumes the round exactly like the OpenAI serialiser does (stop after `done`) and asserts the run is parked, the client-abort listener detached and the timeout paused; extend e2e "AC-1 stream isolation" to send round 2 and assert `x-cta-session-reused: 1` and the same pid.
2. **Gateway shutdown orphans parked CLIs.** After stopping the gateway I found four parked `claude … stream-json` processes still alive. `server.ts` `onClose` only clears the sweep timer. Fix: in `onClose`, expire and sweep every bridge (`expireAllBridges(Date.now()); sweepExpiredBridges(...)`) so parked processes are killed and slots released; also make `apps/gateway/src/index.ts` close the app on SIGINT/SIGTERM if it does not already.
3. **`scripts/smoke-real-cli.mjs` cannot target a group.** `--model group:codex-tools` becomes `codex/group:codex-tools` (line 20 prefixes anything without `/`), which routes as a direct model and yields `400 tools_unsupported` — this is how I first reproduced the Codex smoke and got a false failure. Pass `group:*` values verbatim and mention it in the README smoke section.

## Housekeeping (done by the reviewer in this commit)

- `reports/phase-03-report.md` was written to the repo root; moved to `plans/260919-0545-client-tool-calling/reports/`.

## After the fix round

Re-verify with the real CLI: claude-code `--tools` smoke, Codex via `--model group:codex-tools`
(the report's "empty round-2 text" concern should be re-checked there), and the omp command above
— `/admin/live` must be empty afterwards and `x-cta-session-reused: 1` on omp's round 2.
