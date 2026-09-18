# Phase 01 — Contracts, protocol layer, adapters' tool-call parsers

Status: pending · Depends on: — · Effort: 1d

## Context

Everything in this phase is pure code with unit tests: the internal contracts
grow (plan §4.1), both API dialects learn to read tool definitions / tool
history and to write tool calls, transcript rendering and session fingerprints
cover tool messages, and the `claude-code` / `codex` parsers emit `tool_call`
events from the **committed fixtures**. No bridge yet: at the end of this phase
a request with tools still fails, but with the new `tools_unsupported` error
from `route-request.ts` instead of the old normaliser 400.

Fixtures (source of truth, do not edit):

- `tests/fixtures/claude-code-2.1.277-mcp-tool.jsonl` — one run, two assistant
  messages. Message 1: text block, then `tool_use` block
  `{ id: "toolu_01JJ34tJuBR3PqWDnnoHDkDk", name: "mcp__cta__get_weather", input: { city: "Hanoi" } }`,
  `message_delta { stop_reason: "tool_use", usage: { input_tokens: 2, cache_creation_input_tokens: 15038, cache_read_input_tokens: 0, output_tokens: 75 } }`.
  Then a `user` line with the `tool_result`, message 2: thinking + text,
  `message_delta { stop_reason: "end_turn", usage: { input_tokens: 2, cache_creation_input_tokens: 141, cache_read_input_tokens: 15038, output_tokens: 156 } }`,
  and one `result` with the run-total usage
  `{ input_tokens: 4, cache_creation_input_tokens: 15179, cache_read_input_tokens: 15038, output_tokens: 231, output_tokens_details: { thinking_tokens: 67 } }`.
- `tests/fixtures/codex-0.155.0-mcp-tool-approval-blocked.jsonl` —
  `item.started { item: { id: "item_4", type: "mcp_tool_call", server: "cta", tool: "get_weather", arguments: { city: "Hanoi" }, status: "in_progress" } }`
  followed by `item.completed` with `status: "failed"` (approval denied; phase 03 fixes the flags).

## Requirements

### 1. Contracts — `apps/gateway/src/core/types.ts`

Implement plan §4.1 verbatim: `Role` gains `"tool"`; `ToolCall`,
`ToolDefinition`; `ChatMessage.toolCalls / toolCallId / isError`;
`ChatRequest.tools / toolChoice`; `CliEvent` `tool_call` variant and
`done.stopReason` `"tool_use"`; `Adapter.clientTools?` and the `tools` /
`env` additions to `buildArgs`. Nothing else changes.

### 2. OpenAI normaliser — `protocol/normalize-openai.ts`

Body schema additions (zod):

- `tools?: Array<{ type: "function"; function: { name: string; description?: string; parameters?: Record<string, unknown> } }>` — `name` must match `/^[a-zA-Z0-9_-]{1,64}$/` (400 `invalid_request_error` "invalid tool name" otherwise). Empty array ⇒ no tools.
- `tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } }` — `required` / object ⇒ 400 `tool_choice must be "auto" or "none"`. `none` ⇒ `toolChoice: "none"` and `tools` omitted from the `ChatRequest`.
- `parallel_tool_calls?: boolean` — accepted, ignored.
- Assistant messages: `content: string | text parts | null`, `tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>`. `arguments` must parse as a JSON object (`""` counts as `{}`); otherwise 400 "tool call arguments must be a JSON object". Store the **re-serialised** object (`JSON.stringify(JSON.parse(...))`) so fingerprints are stable.
- Tool messages: `{ role: "tool"; tool_call_id: string; content: string | text parts }` → `{ role: "tool", toolCallId, content }`. A tool message whose id does not appear in an earlier assistant `tool_calls` ⇒ 400 "tool message without a matching tool call".
- `functions` / `response_format` ⇒ 400 "not supported by this gateway" (unchanged). The old blanket rejection of `tools` is removed.

`ChatRequest.tools` = `[{ name, description, parameters: parameters ?? { type: "object", properties: {} } }]`.

### 3. Anthropic normaliser — `protocol/normalize-anthropic.ts`

- `tools?: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>` (same name rule) → `ToolDefinition` with `parameters = input_schema`.
- `tool_choice?: { type: "auto" } | { type: "none" } | { type: "any" } | { type: "tool"; name }` — `any` / `tool` ⇒ 400; `none` ⇒ drop tools.
- Assistant content blocks: `text`, `tool_use { id, name, input }` → `toolCalls` (`argumentsJson = JSON.stringify(input)`), `content` = joined text. `thinking` / `redacted_thinking` blocks are **ignored** (clients replay them in tool loops; today they 400 — this is an intentional change, note it in the report).
- User content blocks: `text`, `tool_result { tool_use_id, content?: string | Array<{ type: "text"; text }>, is_error? }`. Emit one `tool` message per `tool_result` block (in order, `content` = joined text or `""`, `isError = is_error === true`), then one `user` message with the joined text blocks if any text is present. Other block types ⇒ 400 "only text content is supported" (unchanged).
- Same "tool message without a matching tool call" check.

### 4. OpenAI serialiser — `protocol/serialize-openai.ts`

- Stream: on `tool_call` emit the role chunk first if not yet sent, then one chunk
  `delta: { tool_calls: [{ index: n, id, type: "function", function: { name, arguments: argumentsJson } }] }`
  where `n` counts tool calls in this response from 0. On `done { stopReason: "tool_use" }` emit `finish_reason: "tool_calls"`, then the usage chunk when requested, then `[DONE]`.
- Non-stream: `message: { role: "assistant", content: string | null, tool_calls?: [...] , reasoning_content? }` — `content` is `null` when there is no text and at least one tool call; `finish_reason: "tool_calls"`. Extend the `finish_reason` type and `finishReason()` accordingly.

### 5. Anthropic serialiser — `protocol/serialize-anthropic.ts`

- Replace the fixed block indices (0/1) with a running counter: a block opens on the first event of its kind and closes (`content_block_stop`) when a block of another kind starts or the message ends. Kinds: `thinking`, `text`, `tool_use`.
- `tool_call` → `content_block_start { type: "tool_use", id, name, input: {} }`, `content_block_delta { type: "input_json_delta", partial_json: argumentsJson }`, `content_block_stop`. Each tool call is its own block.
- `done { stopReason: "tool_use" }` → `message_delta.delta.stop_reason: "tool_use"`.
- Non-stream: content gains `{ type: "tool_use", id, name, input: JSON.parse(argumentsJson) }` blocks in event order; `stop_reason: "tool_use"`. Update the exported types.

### 6. Errors — `protocol/errors.ts`

New `RouteError` code `tools_unsupported` → 400, OpenAI body
`{ error: { message, type: "invalid_request_error", code: "tools_unsupported" } }`,
Anthropic `{ type: "error", error: { type: "invalid_request_error", message } }`.
Message: `"no target in this group supports client tools"`.

### 7. Routing guard — `router/route-request.ts`

Until phase 02: if `req.tools?.length` (after `toolChoice: "none"` dropped them) throw
`new RouteError("tools_unsupported", "client tools are not enabled yet")` **before** the cache lookup.
Phase 02 replaces this line with the bridge.

### 8. Transcript rendering — `runner/render-transcript.ts`

Rendering rules for the fresh-session prompt (`<conversation>` block):

```
[assistant]
<text, if any>
[tool_call id=<id> name=<name>]
<argumentsJson>
[tool_result id=<toolCallId>]            ← "[tool_result id=<id> error]" when isError
<content>
```

- The single-turn shortcut (raw user text, no wrapper) applies only when the conversation is exactly one user message.
- `resume: true`: the prompt is the newest user message as today, **unless** the conversation ends with tool messages after the last user message; then the prompt is those trailing `[tool_result …]` blocks joined by newlines followed by the line `Continue with these tool results.`.
- `prependSystemInPrompt` unchanged.

### 9. Fingerprints — `sessions/session-store.ts`

`normalizeMessages` returns `{ role, content: content.trim(), toolCalls, toolCallId, isError }`
(undefined fields are dropped by `JSON.stringify`). `lookupFingerprint` unchanged.

### 10. Adapters

`claude-code.ts`

- `clientTools: true`.
- `parseLine`: `type === "assistant"` → for every `message.content[]` block with `type === "tool_use"` emit
  `{ type: "tool_call", id: block.id, name: stripPrefix(block.name), argumentsJson: JSON.stringify(block.input ?? {}) }`
  where `stripPrefix` removes a leading `mcp__cta__`. Text blocks on `assistant` lines stay ignored (already streamed).
  `stream_event` / `message_delta` with `delta.stop_reason === "tool_use"` → the existing `usage` event **then** `{ type: "done", stopReason: "tool_use" }`.
  `content_block_start` / `input_json_delta` for tool_use blocks → `[]` (the aggregated `assistant` line is the stateless source). `system/status`, `system/hook_*`, `system/thinking_tokens`, `user` lines → `[]`.
- `buildArgs`: **no change in this phase** (phase 02 adds the MCP flags). The `tools` input field exists in the type but is ignored.

`codex.ts`

- `clientTools` stays **unset** until phase 03.
- `parseLine`: `item.started` with `item.type === "mcp_tool_call"` and `item.server === "cta"` →
  `{ type: "tool_call", id: item.id, name: item.tool, argumentsJson: JSON.stringify(item.arguments ?? {}) }`.
  `item.completed` for `mcp_tool_call` → `[]` (result and failure are handled by the bridge / model).

`agy.ts`, `cursor-agent.ts`, fake adapter: untouched (no `clientTools`).

### 11. Settings

`db/migrate.ts` `DEFAULT_SETTINGS` += `tool_result_timeout_sec: "300"`, `tool_max_turns: "25"`.
`db/repos.ts` `SettingsMap` += `toolResultTimeoutSec`, `toolMaxTurns` (same fallbacks).
`api/admin/system.ts` `settingsToResponse` exposes them like the existing keys.

## Files

```
apps/gateway/src/core/types.ts
apps/gateway/src/protocol/normalize-openai.ts
apps/gateway/src/protocol/normalize-anthropic.ts
apps/gateway/src/protocol/serialize-openai.ts
apps/gateway/src/protocol/serialize-anthropic.ts
apps/gateway/src/protocol/errors.ts
apps/gateway/src/router/route-request.ts          (guard only)
apps/gateway/src/runner/render-transcript.ts
apps/gateway/src/sessions/session-store.ts
apps/gateway/src/adapters/claude-code.ts
apps/gateway/src/adapters/codex.ts
apps/gateway/src/db/migrate.ts, apps/gateway/src/db/repos.ts, apps/gateway/src/api/admin/system.ts
apps/gateway/tests/protocol/normalize-openai.test.ts      tool loop body OK; each new 400; tool_choice none drops tools
apps/gateway/tests/protocol/normalize-anthropic.test.ts   tool_use/tool_result mapping incl. order and is_error; thinking blocks ignored; each 400
apps/gateway/tests/protocol/serialize-openai.test.ts      stream + non-stream with a hand-built CliEvent[] containing text, tool_call ×2, done tool_use; frames parsed by the `openai` SDK stream helper
apps/gateway/tests/protocol/serialize-anthropic.test.ts   same, frames accepted by `@anthropic-ai/sdk` MessageStream (existing pattern); block indices 0..n
apps/gateway/tests/runner/render-transcript.test.ts       tool history rendering, resume with trailing tool results
apps/gateway/tests/sessions/fingerprint.test.ts           two histories differing only in toolCalls/toolCallId hash differently
apps/gateway/tests/adapters/claude-code.test.ts           parse the mcp-tool fixture: exactly one tool_call (id/name/args above), a done tool_use right after message 1's usage, thinking+text for message 2, usage values above, final done end_turn, zero errors
apps/gateway/tests/adapters/codex.test.ts                 parse the approval-blocked fixture: one tool_call {item_4, get_weather, {"city":"Hanoi"}}, no error event for the failed item
apps/gateway/tests/protocol/routes.test.ts                POST with tools → 400 tools_unsupported in both dialects
```

## Validation

- `pnpm lint` and `pnpm test` green; existing tests unchanged except where the phase changes behaviour (Anthropic `thinking` blocks no longer 400; a request with tools now returns `tools_unsupported`).
- `grep -rn "not supported by this gateway" apps/gateway/src` shows only the `functions` / `response_format` paths.

## Risks / rollback

Pure additive contract changes; rollback is a revert. The Anthropic serialiser
index rewrite touches the non-tool path — the existing SDK-parser test guards
it.

## Report

`reports/phase-01-report.md`. Call out any deviation from plan §4.1.
