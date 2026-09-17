# Phase 4: Verification Suite & Acceptance

## Goals
1. Implement comprehensive unit tests for Anthropic normalizer and serializer.
2. Implement integration and end-to-end tests for `POST /v1/messages` verifying Anthropic API compliance.
3. Verify zero regressions across the monorepo test suite.

## Files Created
- `tests/unit/anthropic-normalizer.test.ts`
- `tests/unit/anthropic-serializer.test.ts`
- `tests/integration/anthropic-messages.test.ts`

## Tasks & Steps

### 4.1 Unit Tests (`anthropic-normalizer.test.ts` & `anthropic-serializer.test.ts`)
- Test `anthropic-normalizer`:
  - Parses string message content.
  - Parses multi-block content (text, images).
  - Converts system prompt string and system text blocks.
  - Maps `thinking.budget_tokens` correctly to `low`, `medium`, `high`, `xhigh`.
- Test `anthropic-serializer`:
  - Serializes unary message payload with thinking and text content blocks.
  - Serializes each SSE event frame (`message_start`, `content_block_start`, `content_block_delta`, etc.).

### 4.2 Integration Tests (`anthropic-messages.test.ts`)
- Test AC-1: `POST /v1/messages` rejects request with 401 Anthropic error when API key is missing or invalid.
- Test AC-2: `POST /v1/messages` with `stream: false` returns valid Anthropic message JSON with `content` array, `role: "assistant"`, and token usage.
- Test AC-3: `POST /v1/messages` with `stream: true` streams Anthropic SSE events in correct sequence (`message_start` $\to$ `content_block_start` $\to$ `content_block_delta` $\to$ `content_block_stop` $\to$ `message_delta` $\to$ `message_stop`).
- Test AC-4: Request with `thinking: { type: "enabled", budget_tokens: 16000 }` splits thinking tokens into `type: "thinking"` block and response text into `type: "text"` block.
- Test AC-5: Requesting official Anthropic model IDs (e.g. `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet`) automatically resolves to `claude-code` provider.

### 4.3 Monorepo Regression & Build Check
- Run `pnpm test` ensuring all tests pass (100%).
- Run `pnpm build` ensuring TypeScript compilation passes without errors.

## Verification Gate
- 100% pass across all unit, integration, and E2E suites.
