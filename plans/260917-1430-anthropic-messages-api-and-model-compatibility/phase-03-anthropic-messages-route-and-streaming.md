# Phase 3: Anthropic Messages Ingress Route & Streaming

## Goals
1. Implement `POST /v1/messages` handling unary and real-time streaming requests according to the Anthropic Messages API specification.
2. Integrate with `LoadBalancer`, `PipelineExecutor`, `SessionThreadManager`, and telemetry tracking.

## Files Created / Modified
- `apps/gateway/src/api/routes/anthropic-messages.ts` [CREATED]
- `apps/gateway/src/api/server.ts` [MODIFIED]

## Tasks & Steps

### 3.1 Implement Route Handler (`anthropic-messages.ts`)
1. Register `POST /v1/messages` route in Fastify.
2. Validate payload using Zod schema:
   - Validate `model` (required string).
   - Validate `messages` (at least 1 message).
   - Extract `system`, `max_tokens`, `stream`, `thinking`, `metadata`.
3. Resolve session thread context via `globalSessionThreadManager.resolveThread`.
4. Resolve execution target via `globalLoadBalancer.resolveTarget(requestedModel, sessionRes.boundAccountId, effortLevel)`.
5. Check if target is a dynamic pipeline or direct adapter.

### 3.2 Unary Execution Branch (`stream: false`)
- Acquire semaphore slot if direct non-pipeline target.
- Execute via `globalPipelineExecutor.executeWithFailover` or `globalProcessManager.executeStreaming`.
- Extract text content and reasoning/thought content.
- Format response with `formatAnthropicMessage(...)`.
- Enqueue metrics to `globalTelemetryQueue` and broadcast via `globalAdminEventBus`.
- Return HTTP 200 with JSON payload.

### 3.3 Streaming SSE Execution Branch (`stream: true`)
- Write Anthropic SSE headers:
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
- Emit `message_start` event.
- Manage block states:
  - If thinking thought delta arrives:
    - If thinking block not started, emit `content_block_start` (`index: 0`, `type: "thinking"`).
    - Emit `content_block_delta` (`thinking_delta`).
  - When text content delta arrives:
    - If thinking block was open, emit `content_block_stop` (`index: 0`).
    - If text block not started, emit `content_block_start` (`index: 1`, `type: "text"`).
    - Emit `content_block_delta` (`text_delta`).
  - When stream finishes:
    - Close active block with `content_block_stop`.
    - Emit `message_delta` (`stop_reason: "end_turn"`).
    - Emit `message_stop`.
- Integrate failover and error recovery.

### 3.4 Wire Route into Server (`server.ts`)
- Import `registerAnthropicMessagesRoutes`.
- Register in `createGatewayServer`.

## Verification Gate
- Test `POST /v1/messages` with `curl` using both unary and SSE streaming formats.
- Verify Anthropic client receives compliant events without parsing errors.
