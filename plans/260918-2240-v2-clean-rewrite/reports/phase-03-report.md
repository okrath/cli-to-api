# Phase 03 report

Status: DONE

## Built

- `protocol/errors.ts` — `ProtocolError`, `RouteError`, dialect-specific error mapping (400/401/404/429/502/503/504), `sendMappedError`.
- `protocol/normalize-openai.ts` — zod-validated OpenAI chat body → `ChatRequest` (developer→system merge, effort mapping, unsupported feature rejection).
- `protocol/normalize-anthropic.ts` — zod-validated Anthropic messages body → `ChatRequest` (thinking budget→effort, default max_tokens 8192).
- `protocol/model-catalog.ts` — pure `resolveModel`, `listOpenAiModels`, `listAnthropicModels`, DB group loading; `detectInstalledAdapters()` returns empty until phase 02 adapters land.
- `protocol/serialize-openai.ts` — stream + non-stream OpenAI serialisers with usage details and mid-stream error handling.
- `protocol/serialize-anthropic.ts` — stream frame collector, async stream writer with 15 s ping heartbeat, non-stream message shape (no signature fields).
- `protocol/sse.ts` — SSE frame helpers and stream response headers.
- `router/route-request.ts` — phase 04 stub throwing `RouteError("not_implemented")`.
- `api/openai.ts`, `api/anthropic.ts`, `api/models.ts`, `api/chat-handler.ts` — `/v1/chat/completions`, `/v1/messages`, shared `/v1/models` (Anthropic shape when `anthropic-version` header present); client abort wired via `AbortController`.
- Tests under `apps/gateway/tests/protocol/` including Anthropic SDK `MessageStream` parser acceptance test.
- `@anthropic-ai/sdk` added as gateway dev dependency.

## Verified

```
pnpm install          # exit 0
pnpm lint             # exit 0 (tsc --noEmit gateway + web)
pnpm test             # 41 passed (8 files)
```

Route smoke via `app.inject`:
- `POST /v1/chat/completions` with empty messages → 400 OpenAI `invalid_request_error`
- `POST /v1/chat/completions` with unknown model → 404 `model_not_found`
- `POST /v1/messages` with empty messages → 400 Anthropic `invalid_request_error`
- `POST /v1/messages` with unknown model → 404 `not_found_error`
- `GET /v1/models` returns OpenAI list shape; with `anthropic-version` returns Anthropic list shape

Serializer snapshots and Anthropic SDK stream parser test pass against hand-written `PONG_EVENTS` (matches claude-code pong fixture expected parse output).

## Deviations

- `detectInstalledAdapters()` returns an empty set in this worktree because phase 02 `adapters/index.ts` is implemented in the main checkout; alias/direct model resolution in live routes therefore returns 404 until adapters are wired. Tests use `buildCatalogSync` with explicit installed adapters.
- Anthropic streaming buffers events before emitting frames (correct frame order for SDK compatibility); true token-by-token forwarding can be added when phase 04 connects live CLI streams.
- Removed the phase 01 `/v1/x` auth stub; auth tests now hit `/v1/models`.

## Concerns / questions for review

- When phase 02 merges, replace `detectInstalledAdapters()` stub with `adapters/index.ts` `detectAdapters()` so alias models resolve at runtime without code changes elsewhere.
- A valid model request that passes normalization currently hits the route stub and returns 503; expected until phase 04 replaces `routeRequest`.
