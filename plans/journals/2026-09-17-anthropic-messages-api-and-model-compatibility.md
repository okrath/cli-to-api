# Technical Journal: Anthropic Messages API & Model Compatibility

**Date:** 2026-09-17  
**Author:** AI Engineer (ak-cook)  
**Topic:** Implementation of Anthropic Messages API (`POST /v1/messages`), Dual-Dialect Authentication, Thinking Blocks, and Official Claude Model Aliases

---

## 1. Problem Statement & Motivation
Prior to this implementation, `cli-to-api` exclusively served the OpenAI wire format (`/v1/chat/completions`). Developer tools requiring the native Anthropic Messages API format (e.g. Claude Desktop, Cursor Anthropic provider, Continue.dev Anthropic mode, and the `@anthropic-ai/sdk`) could not connect directly. Furthermore, requests targeting un-prefixed official Anthropic model identifiers (e.g. `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet`) failed to route without manual provider prefixing.

---

## 2. Architectural Solution & Implementation
1. **Dual-Dialect Authentication (`auth.ts`):**
   - Added support for Anthropic standard `x-api-key` header alongside `Authorization: Bearer <token>`.
   - Validates `sk-ant-*`, `sk-cta-*`, and default admin keys.
   - For endpoints under `/v1/messages`, authentication failures return Anthropic-compliant `{ type: "error", error: { type: "authentication_error", message } }` payloads with HTTP 401.

2. **Model Normalization & Heuristic Catalog Mapping:**
   - In `apps/gateway/src/router/load-balancer.ts`, expanded Claude model aliases to normalize `claude-3-7-sonnet*`, `claude-3-5-sonnet*`, `claude-3-opus*`, and `claude-3-5-haiku*` directly to the `claude-code` provider's internal model IDs (`sonnet`, `opus`, `haiku`).
   - In `apps/gateway/src/adapters/registry.ts`, added heuristics to `getDefaultProviderForModel` so un-prefixed Anthropic models automatically resolve to `claude-code`.

3. **Anthropic Normalizer & Thinking Effort Resolver (`anthropic-normalizer.ts`):**
   - Converts Anthropic `system` prompts (string or text block arrays) and `messages` (string or content block arrays) into normalized internal `ChatMessage[]`.
   - Resolves `thinking: { type: "enabled", budget_tokens: N }` to discrete `EffortLevel` values (`low`, `medium`, `high`, `xhigh`) which feed into the 3-tier effort engine.

4. **Anthropic Wire Protocol Serializer (`anthropic-serializer.ts`):**
   - Implemented compliant unary response envelope (`formatAnthropicMessage`) containing separate `thinking` and `text` content blocks.
   - Implemented compliant SSE streaming events (`message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`).

5. **Ingress Route (`anthropic-messages.ts`):**
   - Handled both unary and SSE streaming branches, integrated with `globalSessionThreadManager`, `globalLoadBalancer`, `globalPipelineExecutor`, semaphore slot locks, and telemetry pipelines.
   - Designed a clean state machine for block management to guarantee strictly non-overlapping, properly closed Anthropic content blocks.

---

## 3. Verification & Metrics
- **Unit Tests:**
  - `tests/unit/anthropic-normalizer.test.ts` (6/6 passing)
  - `tests/unit/anthropic-serializer.test.ts` (4/4 passing)
- **Integration Tests:**
  - `tests/integration/anthropic-messages.test.ts` (6/6 passing): Covers AC-1 through AC-5 (auth 401, valid auth, unary thinking/text demuxing, SSE event ordering, and official model alias resolution).
- **Monorepo Suite:**
  - `pnpm test`: 37/37 test files, 152/152 tests passing (100%).
  - `pnpm build`: Both `gateway` and `web` compile cleanly with 0 TypeScript errors.
- **Live Verification:** Verified with live `curl` against running daemon on port 8080 for both unary and SSE streaming formats.
