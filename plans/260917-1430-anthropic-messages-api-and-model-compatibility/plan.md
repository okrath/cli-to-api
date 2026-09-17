---
title: "Anthropic Messages API (POST /v1/messages) & Full Model Compatibility"
description: "Implements full Anthropic Messages API specification (/v1/messages) with x-api-key authentication, thinking blocks, Anthropic SSE streaming format, and auto-mapping for all official Claude model aliases."
status: completed
priority: P1
effort: "4d"
tags: [anthropic, messages-api, claude, load-balancer, sse-serializer, thinking-blocks, stream-demuxer]
branch: main
created: 2026-09-17
---

# Anthropic Messages API & Model Compatibility Plan

## 1. Overview & Business Value

Currently, `cli-to-api` exclusively exposes OpenAI-compliant ingress endpoints (`/v1/chat/completions`, `/v1/models`). However, a massive ecosystem of developer tools—including **Claude Desktop, Cursor (Anthropic provider), Continue.dev (Anthropic provider), LibreChat, Open WebUI, Aider, and the official `@anthropic-ai/sdk`**—natively speak the **Anthropic Messages API protocol** (`POST /v1/messages`).

This feature adds native Anthropic Messages API compatibility to `cli-to-api`:
1. **Endpoint `POST /v1/messages`:** Supports standard Anthropic headers (`x-api-key`, `anthropic-version`), message structures (`system`, `messages`), and token budget controls (`thinking: { type: "enabled", budget_tokens: N }`).
2. **Anthropic SSE Streaming Format:** Emits compliant Anthropic events (`message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`).
3. **Anthropic Unary Format:** Returns message payload with discrete content blocks for thinking and final text.
4. **Full Model Alias Auto-Mapping:** Automatically maps all official Anthropic model IDs (e.g. `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet`, `claude-3-opus`, `claude-3-5-haiku`) to the local `claude-code` provider.
5. **Universal Routing Support:** Clients can also target routing groups (e.g. `group:load-balancer`) or any other provider through `/v1/messages` transparently.

---

## 2. Architecture & File Layout

```
apps/gateway/src/
├── api/
│   ├── middleware/
│   │   └── auth.ts                                [MODIFIED] Support x-api-key header & sk-ant-* keys
│   ├── routes/
│   │   └── anthropic-messages.ts                  [CREATED] POST /v1/messages route handler
│   └── server.ts                                  [MODIFIED] Register anthropic messages route
├── stream/
│   └── anthropic-serializer.ts                    [CREATED] Serializes events into Anthropic SSE protocol
├── utils/
│   └── anthropic-normalizer.ts                    [CREATED] Normalizes Anthropic messages & thinking blocks
└── router/
    ├── load-balancer.ts                           [MODIFIED] Normalize Anthropic official model aliases
    └── model-catalog.ts                           [MODIFIED] Project official Claude aliases into catalog
tests/
├── unit/
│   ├── anthropic-normalizer.test.ts               [CREATED] Test Anthropic payload parsing & thinking mapping
│   └── anthropic-serializer.test.ts               [CREATED] Test Anthropic SSE formatting & message envelope
└── integration/
    └── anthropic-messages.test.ts                 [CREATED] Full E2E & integration suite for POST /v1/messages
```

---

## 3. Phased Implementation Breakdown

### Phase 1: Authentication & Model Alias Auto-Mapping
- Update `apps/gateway/src/api/middleware/auth.ts`:
  - Accept `x-api-key` header in addition to `Authorization: Bearer <token>`.
  - Accept tokens matching `sk-ant-*`, `sk-cta-*`, or configured `DEFAULT_API_KEY`.
  - Return Anthropic-compliant JSON error `{ type: "error", error: { type: "authentication_error", message: "..." } }` on `/v1/messages`.
- Update `apps/gateway/src/router/load-balancer.ts`:
  - Expand Claude model aliases: `claude-3-7-sonnet*` $\to$ `sonnet`, `claude-3-5-sonnet*` $\to$ `sonnet`, `claude-3-opus*` $\to$ `opus`, `claude-3-5-haiku*` $\to$ `haiku`.
- Update `apps/gateway/src/router/model-catalog.ts`:
  - Register official Claude model aliases with `claude-code` as the default provider.

### Phase 2: Anthropic Normalizer & SSE Serializer
- Create `apps/gateway/src/utils/anthropic-normalizer.ts`:
  - Parse Anthropic request body (`messages`, `system`, `max_tokens`, `thinking`).
  - Convert `thinking.budget_tokens` to gateway `EffortLevel`:
    - $\le 2048 \to$ `low`, $\le 8192 \to$ `medium`, $\le 16384 \to$ `high`, $> 16384 \to$ `xhigh`.
  - Flatten system prompts and multi-modal text blocks into normalized `ChatMessage[]`.
- Create `apps/gateway/src/stream/anthropic-serializer.ts`:
  - Format Anthropic SSE event frames:
    - `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`.
  - Format Anthropic unary response JSON object.

### Phase 3: Anthropic Messages Ingress Route (`POST /v1/messages`)
- Create `apps/gateway/src/api/routes/anthropic-messages.ts`:
  - Validate request payload using Zod schema.
  - Integrate with `globalSessionThreadManager.resolveThread` for conversational memory.
  - Resolve target via `globalLoadBalancer.resolveTarget`.
  - Wire streaming response via `globalPipelineExecutor.executeWithFailover` and `globalProcessManager.executeStreaming`.
  - Wire unary response with thinking block extraction.
  - Enqueue metrics to `globalTelemetryQueue` and emit events to `globalAdminEventBus`.
- Register route in `apps/gateway/src/api/server.ts`.

### Phase 4: Verification Suite & Acceptance
- Implement `tests/unit/anthropic-normalizer.test.ts`:
  - Test thinking budget mapping, system prompt extraction, multi-block parsing.
- Implement `tests/unit/anthropic-serializer.test.ts`:
  - Test exact SSE wire formatting and unary message envelope.
- Implement `tests/integration/anthropic-messages.test.ts`:
  - Test `POST /v1/messages` with `x-api-key`.
  - Test unary response matching Anthropic spec.
  - Test SSE streaming response matching Anthropic spec.
  - Test Anthropic official model alias routing.
  - Test thinking block demuxing into `thinking_delta` and `text_delta`.
- Verify full monorepo tests pass (100%).

---

## 4. Acceptance Criteria (Observable Gates)

- [x] **AC-1 (Auth & Ingress):** `POST /v1/messages` authenticates via `x-api-key: sk-cta-dev` or `x-api-key: sk-ant-dev` and returns 401 Anthropic error when missing.
- [x] **AC-2 (Unary Completion):** `POST /v1/messages` with `stream: false` returns valid Anthropic message object with `role: "assistant"`, `content: [...]`, `stop_reason: "end_turn"`, and `usage`.
- [x] **AC-3 (SSE Streaming Protocol):** `POST /v1/messages` with `stream: true` produces strictly ordered Anthropic SSE events: `message_start` $\to$ `content_block_start` $\to$ `content_block_delta` $\to$ `content_block_stop` $\to$ `message_delta` $\to$ `message_stop`.
- [x] **AC-4 (Thinking Blocks Demuxing):** When thinking is enabled or detected, the stream emits block 0 with `type: "thinking"` and `thinking_delta`, followed by block 1 with `type: "text"` and `text_delta`.
- [x] **AC-5 (Official Claude Model Aliases):** Requesting `claude-3-7-sonnet-20250219` or `claude-3-5-sonnet` without provider prefix automatically routes to `claude-code` provider.
- [x] **AC-6 (Zero Regressions):** All existing 136 tests pass without error, monorepo compiles cleanly with `pnpm build`.
