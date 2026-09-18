# Phase 03 — Protocol layer (OpenAI + Anthropic)

Status: pending · Depends on: 01 · Effort: 1d · Can run in parallel with 02

## Context

Both public APIs are converted to the internal `ChatRequest` and the internal
`CliEvent` stream is converted back to each dialect. No routing logic here: the
routes call `routeRequest(chatRequest)` (phase 04) which returns
`{ events: AsyncIterable<CliEvent>, meta }`. Until phase 04 lands, wire the
routes to a stub that throws `RouteError("not_implemented")` so this phase is
testable on its own with the serialisers fed by fixture event arrays.

## Requirements

### Normalisers (pure, zod-validated, throw `ProtocolError { status, dialect, code, message }`)

`protocol/normalize-openai.ts` — `POST /v1/chat/completions` body:
- `model: string`, `messages: [{ role: system|developer|user|assistant, content: string | [{type:"text", text}] }]`, `stream?: boolean`, `stream_options?.include_usage`, `reasoning_effort?: minimal|none|low|medium|high|xhigh`, `max_tokens?` / `max_completion_tokens?`, `user?`.
- `developer` → `system`. Multiple system messages → joined with `\n\n` into one at index 0. Non-text content parts → 400 `invalid_request_error` "only text content is supported".
- `tools`, `functions`, `response_format` present → 400 "not supported by this gateway".
- Effort: `minimal` → `low`, others pass through.
- `conversationHint` = header `x-conversation-id` ?? body `user`.

`protocol/normalize-anthropic.ts` — `POST /v1/messages` body:
- `model`, `max_tokens` (required by Anthropic; accept missing and default 8192), `system?: string | [{type:"text", text}]`, `messages: [{ role: user|assistant, content: string | [{type:"text", text}] }]`, `stream?`, `thinking?: { type: "enabled", budget_tokens } | { type: "disabled" }`, `metadata?.user_id`.
- Effort from `budget_tokens`: `≤ 2048 → low`, `≤ 8192 → medium`, `≤ 32000 → high`, `> 32000 → xhigh`; `disabled` → `none`; absent → undefined.
- `tools` present → 400 `invalid_request_error`.
- `conversationHint` = header `x-conversation-id` ?? `metadata.user_id`.

### Model catalog and resolution `protocol/model-catalog.ts` (pure)

`resolveModel(name, catalog) → { kind: "group", groupId } | { kind: "direct", adapterId, modelId } | null`
- `group:<slug>` → group if it exists and is enabled.
- `<adapterId>/<modelId>` → direct when the adapter exists (model id passed through even if not in the static list).
- Aliases: `/^claude-/` → `claude-code` with `opus|sonnet|haiku` chosen by substring (default `sonnet`); `/^(gpt-|o[0-9]|codex)/` → `codex` with the id passed through.
- Otherwise `null` → 404 (`model_not_found` / `not_found_error`).

`listModels(catalog)` → groups first, then `adapter/model` for installed adapters, then the aliases `claude-sonnet-4-5`, `claude-opus-4-1`, `claude-haiku-4-5`, `gpt-5`, so IDE model pickers show something familiar.

### Serialisers (pure generators: `CliEvent` → SSE frames or final JSON)

`protocol/serialize-openai.ts`
- Stream: `data: {chat.completion.chunk}` frames. id `chatcmpl-<requestId>`, `created`, `model` = requested name. First frame `delta: { role: "assistant", content: "" }`. `thinking_delta` → `delta.reasoning_content`; `text_delta` → `delta.content`. On `done` → frame with `finish_reason` (`end_turn → "stop"`, `max_tokens → "length"`, `error → "stop"`), then if `include_usage` a frame with `choices: []` and `usage`, then `data: [DONE]`.
- Usage object: `{ prompt_tokens: input + cachedInput + cacheWrite, completion_tokens: output, total_tokens, prompt_tokens_details: { cached_tokens: cachedInput }, completion_tokens_details: { reasoning_tokens: reasoning } }`.
- Error before first content frame → HTTP status + `{ error: { message, type, code } }`. Error after content started → frame `data: { "error": {...} }` then `[DONE]`.
- Non-stream: `{ id, object: "chat.completion", created, model, choices: [{ index: 0, message: { role, content, reasoning_content? }, finish_reason }], usage }`.

`protocol/serialize-anthropic.ts`
- Stream events in order: `message_start` (usage `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` from the first `usage` if already known else 0), for thinking: `content_block_start {type:"thinking"}` → `content_block_delta {thinking_delta}` → `content_block_stop`; then text block the same way with `text_delta`; `message_delta { delta: { stop_reason, stop_sequence: null }, usage: { output_tokens, input_tokens, cache_read_input_tokens, cache_creation_input_tokens } }`; `message_stop`. Every frame is `event: <type>\ndata: <json>\n\n`. Send `event: ping` every 15 s while waiting for the first event.
- Stop reasons: `end_turn`, `max_tokens`; error after start → `event: error` with `{ type: "error", error: { type, message } }`.
- Non-stream: `{ id: "msg_<requestId>", type: "message", role: "assistant", model, content: [ {type:"thinking", thinking}?, {type:"text", text} ], stop_reason, stop_sequence: null, usage }`.
- Do not emit `signature` fields.

### Error mapping `protocol/errors.ts`

| internal | HTTP | OpenAI `type`/`code` | Anthropic `type` |
|---|---|---|---|
| bad body | 400 | invalid_request_error | invalid_request_error |
| bad/missing key | 401 | authentication_error / invalid_api_key | authentication_error |
| unknown model | 404 | invalid_request_error / model_not_found | not_found_error |
| all targets rate-limited / cooling | 429 + `Retry-After` | rate_limit_error | rate_limit_error |
| all targets busy (queue timeout) | 503 + `Retry-After: 5` | server_error | overloaded_error |
| CLI not authenticated | 502 | server_error / upstream_auth | api_error |
| CLI crash / unknown | 502 | server_error | api_error |
| CLI timeout | 504 | server_error / upstream_timeout | api_error |

### Routes

`api/openai.ts`: `POST /v1/chat/completions`, `GET /v1/models`.
`api/anthropic.ts`: `POST /v1/messages`. `GET /v1/models` is shared: return the Anthropic list shape when the `anthropic-version` header is present, else the OpenAI shape.
Both routes: set `x-cta-request-id`; for streams set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`, write via `reply.raw`, flush per frame; wire `request.raw.on("close")` → `AbortController.abort()` → `ChatRequest.clientAbort`.

## Files

```
apps/gateway/src/protocol/normalize-openai.ts
apps/gateway/src/protocol/normalize-anthropic.ts
apps/gateway/src/protocol/model-catalog.ts
apps/gateway/src/protocol/serialize-openai.ts
apps/gateway/src/protocol/serialize-anthropic.ts
apps/gateway/src/protocol/errors.ts
apps/gateway/src/protocol/sse.ts                 writeFrame(reply, event?, data), heartbeat helper
apps/gateway/src/api/openai.ts
apps/gateway/src/api/anthropic.ts
apps/gateway/src/api/models.ts
apps/gateway/tests/protocol/*.test.ts            normalisers (valid + each 400), resolveModel table, serialisers snapshot from a fixed CliEvent[] (use the claude fixture parsed via phase 02 adapter when available, else a hand-written CliEvent[] identical to that fixture's expected output)
```

## Validation

- `pnpm test` green.
- With the phase-04 stub, `curl -N localhost:8080/v1/chat/completions -d '{"model":"x","messages":[]}'` returns a well-formed 400/404 in each dialect.
- Snapshot of Anthropic stream is accepted by `@anthropic-ai/sdk`'s `MessageStream` parser in a test (install as dev dep, feed the frames through a mock fetch).

## Risks / rollback

Cursor, Claude Desktop and Continue are strict about frame order. The SDK-parser test above is the guard. Rollback: additive.

## Report

`reports/phase-03-report.md`.
