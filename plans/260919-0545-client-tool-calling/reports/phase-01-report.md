# Phase 01 report

Status: DONE

Built:

- Extended `core/types.ts` per plan §4.1: `Role` includes `"tool"`; `ToolCall`, `ToolDefinition`; tool fields on `ChatMessage` / `ChatRequest`; `CliEvent.tool_call` and `done.stopReason: "tool_use"`; `Adapter.clientTools?` and `buildArgs.tools` / `env`.
- OpenAI normaliser accepts `tools`, `tool_choice` (`auto`/`none` only), `parallel_tool_calls` (ignored), assistant `tool_calls`, and `tool` messages with validation (name pattern, JSON-object arguments, matching tool-call ids). Removed blanket `tools` rejection; `functions` / `response_format` still 400.
- Anthropic normaliser accepts `tools`, `tool_choice` (`auto`/`none` only), `tool_use` / `tool_result` blocks (thinking/redacted_thinking ignored), and matching-id validation.
- OpenAI serialiser emits streaming/non-streaming `tool_calls` and `finish_reason: "tool_calls"`; null `content` when there are tool calls but no text.
- Anthropic serialiser uses a running block index for thinking/text/tool_use; emits `tool_use` blocks and `stop_reason: "tool_use"`.
- `RouteError` code `tools_unsupported` mapped to 400; `route-request.ts` guard throws before cache lookup when `req.tools?.length`.
- `render-transcript.ts` renders tool history and resume-with-trailing-tool-results prompt.
- Session fingerprints include `toolCalls`, `toolCallId`, `isError`.
- `claude-code` adapter: `clientTools: true`; parses mcp-tool fixture (`tool_call`, `done tool_use`, usage, end_turn). `codex` adapter: parses `mcp_tool_call` from approval-blocked fixture; `clientTools` unset.
- Settings: seeded `tool_result_timeout_sec` (300) and `tool_max_turns` (25); exposed via repos and admin `/settings`.

Verified:

```
pnpm lint
# exit 0 — gateway + web tsc --noEmit

pnpm test
# 28 files, 156 tests passed
# includes new normaliser/serialiser/adapter/transcript/fingerprint tests
# routes.test: POST with tools → 400 tools_unsupported (OpenAI + Anthropic)
# claude-code mcp-tool fixture: 1 tool_call, done tool_use after round-1 usage, end_turn final
# codex approval-blocked fixture: 1 tool_call (item_4, get_weather), no error event
# OpenAI + Anthropic SDK stream parsers accept tool-call frames

grep -rn "not supported by this gateway" apps/gateway/src
# only normalize-openai.ts functions/response_format path
```

Deviations:

- None from plan §4.1. Phase-01 routing guard message is `"client tools are not enabled yet"` (per phase file); plan §6 errors lists `"no target in this group supports client tools"` for the phase-03 unsupported-group case — phase 02 will replace the guard.

Concerns / questions for review:

- Anthropic normaliser now **ignores** `thinking` / `redacted_thinking` blocks in assistant replay (intentional per phase; previously 400). Clients replaying tool loops with thinking blocks will succeed.
- Real-CLI smoke not run in this phase (deferred to phase 02 per plan).
- Requests with tools still return 400 (`tools_unsupported`) until the MCP bridge lands in phase 02.
