# Phase 2: Anthropic Normalizer & SSE Serializer

## Goals
1. Create `anthropic-normalizer.ts` to parse Anthropic Messages API request bodies into internal gateway types (`ChatMessage[]`, `EffortLevel`).
2. Create `anthropic-serializer.ts` to serialize gateway responses into compliant Anthropic unary payloads and SSE event streams.

## Files Created
- `apps/gateway/src/utils/anthropic-normalizer.ts`
- `apps/gateway/src/stream/anthropic-serializer.ts`

## Tasks & Steps

### 2.1 Anthropic Request Normalizer (`anthropic-normalizer.ts`)
- Parse Anthropic `messages`:
  - Support content as raw string: `"content": "hello"`.
  - Support content as array of blocks: `[{"type": "text", "text": "hello"}]`.
  - Support image blocks by preserving description or base64 placeholder.
- Parse `system`:
  - If string or array of text blocks, prepend as system message: `{ role: "system", content: systemText }`.
- Parse `thinking`:
  - If `thinking.type === "enabled"`, map `budget_tokens` to `EffortLevel`:
    - `tokens <= 2048` $\to$ `"low"`
    - `tokens <= 8192` $\to$ `"medium"`
    - `tokens <= 16384` $\to$ `"high"`
    - `tokens > 16384` $\to$ `"xhigh"`
- Extract `user_id` or session conversation context from `metadata`.

### 2.2 Anthropic Event & Envelope Serializer (`anthropic-serializer.ts`)
- Unary envelope serializer `formatAnthropicMessage`:
  - Generates message ID: `msg_${randomUUID()}`.
  - Constructs `content` array:
    - If `thought` exists: `[{ type: "thinking", thinking: thought }, { type: "text", text: content }]`.
    - Otherwise: `[{ type: "text", text: content }]`.
  - Calculates `usage`: `{ input_tokens, output_tokens }`.
- SSE Event Serializer functions:
  - `formatAnthropicMessageStart(id, model, inputTokens)`
  - `formatAnthropicBlockStart(index, type: "thinking" | "text")`
  - `formatAnthropicBlockDelta(index, type: "thinking_delta" | "text_delta", text: string)`
  - `formatAnthropicBlockStop(index)`
  - `formatAnthropicMessageDelta(stopReason: "end_turn", outputTokens: number)`
  - `formatAnthropicMessageStop()`
  - `formatAnthropicError(errorType: string, message: string)`

## Verification Gate
- Unit tests validating normalizer on various message structures (text, blocks, system, thinking).
- Unit tests validating SSE serializer event frames and message formats.
