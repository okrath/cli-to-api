---
phase: 3
title: "OpenAI Ingress & SSE Wire Serializer"
status: completed
priority: P1
effort: "0.25d"
dependencies: [2]
---

# Phase 3: OpenAI Ingress & SSE Wire Serializer

## Goal
Update `sse-serializer.ts` with `reasoning_content` in `ChatDelta`, and update `POST /v1/chat/completions` in `openai-chat.ts` to stream `delta.reasoning_content` chunks during thinking phase, stream `delta.content` chunks during answer phase, and return `reasoning_content` in non-streaming responses. Zero database writes.

---

## Detailed Technical Context & Requirements

1. Wire Serializer (`apps/gateway/src/stream/sse-serializer.ts`):
   ```typescript
   export interface ChatDelta {
     role?: "assistant";
     content?: string;
     reasoning_content?: string;
   }
   ```

2. Fastify Chat Route (`apps/gateway/src/api/routes/openai-chat.ts`):
   - In streaming mode:
     - `onThoughtDelta`: emit `reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { reasoning_content: chunk }))`.
     - `onContentDelta`: emit `reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { content: chunk }))`.
     - Broadcast `chunk:thought` and `chunk:delta` to `globalAdminEventBus`.
   - In non-streaming mode:
     - Return `choices[0].message = { role: "assistant", content: cleanContent, ...(thoughtContent ? { reasoning_content: thoughtContent } : {}) }`.
   - Strictly stateless: No database inserts for thinking.

---

## Tasks Breakdown

- **Task 3.1:** Update `ChatDelta` in `sse-serializer.ts`. [COMPLETED]
- **Task 3.2:** Update `openai-chat.ts` streaming handler to write `reasoning_content` chunks. [COMPLETED]
- **Task 3.3:** Update `openai-chat.ts` non-streaming handler to return `message.reasoning_content`. [COMPLETED]
- **Task 3.4:** Broadcast `chunk:thought` on `globalAdminEventBus`. [COMPLETED]

---

## Verification Commands
```bash
pnpm --filter @cli-to-api/gateway test tests/unit/content-normalizer.test.ts
pnpm --filter @cli-to-api/gateway test tests/e2e/chat-completions.test.ts
```
