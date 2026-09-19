# Phase 03 review

Final verdict after fix round 2 (`d97962c`): APPROVED — plan complete.
Independently re-ran `pnpm lint` (clean), `pnpm test` (31 files, 194 tests, green), `pnpm build`
(green); the report's Codex loop via `group:codex-tools` now returns round-2 text
(`Hanoi is currently 31C and sunny.`); final omp check on the built gateway
(`omp -p "Use your read tool to open package.json … name" --model cta/group:cta-max`) answered
`cli-to-api` through the bridge with `/admin/live` `[]` afterwards and no orphaned CLI processes
after stopping the gateway. Plan §7 AC-1…AC-8 are all satisfied (AC-6 Codex via a group with
Allow tools, as decided in phase 03). Known limitation to carry into docs later: Codex may
prefer its own web search over a client tool when the prompt is vague.

---

Verdict after fix round 1 (`14988db`): CHANGES REQUESTED once more — one remaining bug (fix 4). Fixes 1–3 are confirmed:
`pnpm lint`/`pnpm test` (192) green, omp round 2 now resumes the parked process (`/admin/live` is `[]`
afterwards) and stopping the gateway leaves no CLI orphans.

4. **Codex round 2 returns empty text (reproduced: `x-cta-session-reused: 1`, `content: ""`, `finish_reason: "stop"`, ~1 s).**
   Cause: when the round ends through the MCP-first timer (`finishMcpFirstRound`), `bridge-events.ts`
   returns while `nextPromise = run.source.next()` is still outstanding. That pull is never awaited,
   but the underlying generator still fulfils it with the **first event produced after the tool
   result** — for Codex that is the final `agent_message` (`item.completed mcp_tool_call` yields no
   event), so round 2 never sees the text. Claude is only unaffected by luck (its first post-result
   event is an empty thinking delta). Fix: keep the outstanding pull on the run
   (`run.pendingNext = nextPromise`) when parking via the timer path, and start the next round from
   it instead of a fresh `next()`. Test: add fake-CLI scenario `tool_call_mcp_first` — identical to
   `tool_call` but without the `message_delta { stop_reason: "tool_use" }` line, so the round ends
   through the MCP-first timer — and assert in `route-request.test.ts` that round 2's text is
   `Result: …`. Re-run the Codex loop via `group:codex-tools` and record the round-2 text.

---

Original verdict (`b88ca5d`): CHANGES REQUESTED — one real bug found in live use (fix 1), two small hardening items.

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
