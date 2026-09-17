---
phase: 4
title: "OpenAI API Gateway Engine & Intelligent Tier Router"
status: pending
priority: P1
effort: "2d"
dependencies: ["phase-01-substrate-engine-sqlite-wal-adapter-schema", "phase-02-process-supervisor-job-objects-stream-sanitizer", "phase-03-multi-account-sandboxing-concurrency-cooldown"]
---

# Phase 4: OpenAI API Gateway Engine & Intelligent Tier Router

## Goal
Implement the complete OpenAI REST and SSE Streaming protocol (`GET /v1/models`, `POST /v1/chat/completions`) supporting three routing modes: Namespaced Targeting (`provider/model`), Virtual Auto Tiers (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`), and Flat Aliases (`model`) with Least-Connections load balancing.

## Files to Create / Modify
- Create: `apps/gateway/src/router/types.ts`
- Create: `apps/gateway/src/router/model-catalog.ts`
- Create: `apps/gateway/src/router/tier-matcher.ts`
- Create: `apps/gateway/src/router/load-balancer.ts`
- Create: `apps/gateway/src/api/server.ts`
- Create: `apps/gateway/src/api/middleware/auth.ts`
- Create: `apps/gateway/src/api/middleware/error-handler.ts`
- Create: `apps/gateway/src/api/routes/openai-models.ts`
- Create: `apps/gateway/src/api/routes/openai-chat.ts`
- Create: `apps/gateway/src/utils/token-estimator.ts`
- Create: `tests/unit/load-balancer.test.ts`
- Create: `tests/e2e/chat-completions.test.ts`

## Tasks & Steps

### Task 4.1: Unified Model Catalog Engine (`GET /v1/models`)
1. Implement `apps/gateway/src/router/model-catalog.ts`:
   - Assemble all models from active adapter configurations.
   - Synthesize namespaced identifiers: `codex/gpt-5.6-asta`, `opencode/gpt-5.6-asta`, `claude/claude-3-7-sonnet`, `grok/grok-2`.
   - Synthesize virtual tier models:
     - `auto`: Global balance across all healthy models.
     - `auto-low`: Models with `tier === "low"` (e.g. Haiku, Flash, Mini).
     - `auto-medium`: Models with `tier === "medium"` (e.g. Sonnet, GPT-4o).
     - `auto-high`: Models with `tier === "high"` (e.g. Opus, GPT-5.6).
     - `auto-xhigh`: Models with `tier === "xhigh"` (e.g. GPT-5.6 Asta, o3-high).
   - Format response according to OpenAI specification: `{ object: "list", data: [...] }`.

### Task 4.2: Intelligent Load Balancer & Scheduler
1. Implement `apps/gateway/src/router/load-balancer.ts`:
   - Parse requested model:
     - **Namespaced (`provider/model`):** Look up adapter `provider`. Filter accounts assigned to this adapter where `cooldownUntil <= now()`. Apply Least-Connections (`activeSlots` ascending) to select the optimal account.
     - **Virtual Auto Tier (`auto-*`):** Filter all registered models matching requested tier. Query healthy accounts across all corresponding providers. Sort accounts by `activeSlots` ascending, then by average latency.
     - **Flat Alias (`model`):** Look up default provider mapping in `model_aliases` table and resolve recursively.
   - If all accounts are in cooldown or busy, return HTTP 429 with `Retry-After` header matching the earliest cooldown expiration.

### Task 4.3: Fastify Ingress Server & Middleware
1. Implement `apps/gateway/src/api/server.ts`:
   - Register Fastify with plugins: `@fastify/cors`, `@fastify/sensible`.
   - Implement `auth.ts` middleware validating `Authorization: Bearer sk-cta-...`.
   - Implement `error-handler.ts` formatting errors into standard OpenAI envelopes: `{ error: { message, type, code } }`.

### Task 4.4: OpenAI Chat Completions Handler (`POST /v1/chat/completions`)
1. Implement `apps/gateway/src/api/routes/openai-chat.ts`:
   - Validate payload: `model`, `messages`, `stream`.
   - Attach `req.raw.on("close")` listener to an `AbortController`.
   - **Streaming Mode (`stream: true`):**
     - Set headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
     - Emit role chunk: `data: {"id":"chatcmpl-...","choices":[{"delta":{"role":"assistant"}}]}\n\n`.
     - Stream token chunks from `ProcessManager` in real time.
     - Emit terminal `data: [DONE]\n\n` and end response.
   - **Non-Streaming Mode (`stream: false`):**
     - Buffer full generation.
     - Calculate heuristic token usage with `apps/gateway/src/utils/token-estimator.ts`.
     - Return HTTP 200 with full OpenAI `chat.completion` JSON object.

## Todo
- [x] Implement `apps/gateway/src/router/model-catalog.ts` synthesizing namespaced and virtual tier models
- [x] Implement `apps/gateway/src/router/load-balancer.ts` supporting namespaced and tier routing
- [x] Implement `apps/gateway/src/api/server.ts` & middleware (`auth.ts`, `error-handler.ts`)
- [x] Implement `apps/gateway/src/api/routes/openai-models.ts` (`GET /v1/models`)
- [x] Implement `apps/gateway/src/api/routes/openai-chat.ts` (SSE streaming & unary completion)
- [x] Implement `apps/gateway/src/utils/token-estimator.ts`
- [x] Write unit tests for router and load balancer
- [x] Write integration tests for OpenAI endpoints

## Verification
- Send `GET /v1/models` and verify JSON list contains `codex/gpt-5.6-asta`, `opencode/gpt-5.6-asta`, and `auto-*` models.
- Send `POST /v1/chat/completions` with `model: "codex/gpt-5.6-asta"` and verify request executes strictly under a Codex account.
- Send `POST /v1/chat/completions` with `model: "auto-low"` and `stream: true` and verify streaming SSE chunks are received with low latency.
