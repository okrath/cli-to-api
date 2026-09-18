# Phase 03 review

Reviewer: Claude · Commit reviewed: 0fb2dbb (branch `phase-03`) · Verdict: DONE_WITH_CONCERNS — fix the MUST items on this branch before it is merged.

## Verified independently

- `pnpm lint` green; `pnpm test` 41/41 green in the worktree.
- Normalisers, model resolution table, error mapping table and both non-stream shapes match the phase file.
- Anthropic frame order is accepted by the official SDK parser (good test, keep it).

## Findings

### MUST-1 — request bodies are `.strict()`; real clients will get 400

Both `bodySchema`s use `.strict()`. Cursor, Continue, Open WebUI and the SDKs
routinely send `temperature`, `top_p`, `n`, `stop`, `presence_penalty`,
`frequency_penalty`, `seed`, `logprobs`, `metadata`, `store`, `parallel_tool_calls`
(OpenAI) and `temperature`, `top_p`, `top_k`, `stop_sequences`, `tool_choice`
(Anthropic). Every one of those is rejected today.

Fix: drop `.strict()` on both body schemas (zod strips unknown keys by
default). Keep the explicit 400 for `tools`/`functions`/`response_format`
(OpenAI) and `tools` (Anthropic). Add one test per dialect that a body with
`temperature`, `top_p` and `stop` normalises fine.

### MUST-2 — Anthropic streaming buffers the whole response

`streamAnthropicEvents` collects every event into an array and only then writes
frames, so a client sees nothing until the CLI finishes. Streaming must be
incremental: write `message_start` (usage zeros) as soon as the first event
arrives, open/close content blocks as `thinking_delta` / `text_delta` events
come in, and finish with `message_delta` + `message_stop` on `done`. Reuse the
same code for the test collector by giving `writeAnthropicStream` an
`AsyncIterable<CliEvent>` and making the test wrap `PONG_EVENTS` in an async
generator. The SDK parser test must still pass.

### MUST-3 — stream error before the first token crashes with headers already sent

`handleOpenAiResponse` / `handleAnthropicResponse` call `setStreamHeaders`
(status 200) before any event is read. When the serialiser throws a
`MappedError` before the first frame, the catch block calls
`reply.raw.writeHead(err.status)` on a response whose headers were already sent
→ `ERR_HTTP_HEADERS_SENT`, client gets a broken connection instead of a JSON
error. Fix: do not hijack or write headers until the first frame is about to be
written; on an early error, use the normal `sendMappedError(reply, mapped)`.
Add a route test: streaming request whose event source yields
`{ type: "error", kind: "rate_limit" }` first → HTTP 429 JSON body.

### SHOULD-1 — OpenAI stream heartbeat

The phase file asks for an SSE comment (`: ping`) every 15 s while waiting for
the first event on the OpenAI path too. Only the Anthropic path has it.

### SHOULD-2 — duplicated serialiser code

`serializeOpenAiStream` (sync generator) and `writeOpenAiStream` (async) are the
same 60 lines twice. Keep one async generator `openAiStreamFrames(events: AsyncIterable<CliEvent>, opts)`
and let tests wrap arrays in an async generator. Same idea for Anthropic after MUST-2.

### SHOULD-3 — request id header

Responses carry `x-cta-request-id: <uuid>` while the internal id is
`req_<21 chars>`. Use `chatRequest.requestId` for the header on `/v1` responses
so logs, `requests` rows and client-visible ids match.

### Notes (no action now)

- `STATIC_ADAPTER_MODELS` and `detectInstalledAdapters()` in `model-catalog.ts`
  will be replaced by the phase 02 adapter registry at merge time; do not
  extend them.
- `startHeartbeat(_raw, …)` has an unused parameter; remove it when you touch
  `sse.ts` for SHOULD-1.

## Instructions for the fix-up

1. Work on branch `phase-03` in this worktree only. Apply MUST-1, MUST-2, MUST-3 and the SHOULD items.
2. `pnpm lint` and `pnpm test` green; the Anthropic SDK parser test stays.
3. Append a `## Fix-up` section to `reports/phase-03-report.md`.
4. Commit as `fix(gateway): stream anthropic frames incrementally and accept standard client params`.
5. Start no server; if you do for a manual check, stop it before finishing.
