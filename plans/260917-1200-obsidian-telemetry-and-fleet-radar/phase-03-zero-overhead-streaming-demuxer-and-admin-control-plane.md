---
phase: 3
title: "Zero-Overhead Streaming Demuxer & Admin Control Plane"
status: planned
priority: P1
effort: "0.5d"
dependencies: [
  "phase-01-resilient-persistence-layer-and-schema-evolution.md",
  "phase-02-os-process-containment-pid-binding-and-token-speedometer.md"
]
---

# Phase 3: Zero-Overhead Streaming Demuxer & Admin Control Plane

## 1. Requirements

### 1.1. Functional Requirements
1. **Hook Streaming Demuxer to Telemetry Lifecycle:**
   - In `apps/gateway/src/api/routes/openai-chat.ts`, hook incoming chat completion requests into `ExecutionRegistry`, `ThinkingDemuxer`, and `TelemetryPersistQueue`.
   - Before launching the process, calculate prompt tokens via `estimatePromptTokens(messages)` and register the stream in the `ExecutionRegistry`.
   - Route `onThoughtDelta` and `onContentDelta` callbacks to accumulate token counts via `estimateTextTokensAdaptive` and update the ring buffer.
   - Record exact TTFR (Time To First Reasoning token) and TTFT (Time To First Content token).
2. **Micro-Throttled SSE Telemetry Pulse Broadcaster:**
   - Emitting an SSE message for every individual text chunk (which can exceed 100 deltas/sec) would saturate browser render threads and cause Event Loop jitter.
   - Implement a $100\text{ms}$ micro-throttled heartbeat loop (`TelemetryBroadcaster`).
   - Discrete events (`telemetry:request:start`, `telemetry:request:complete`, `telemetry:failover`, `telemetry:process:killed`) are emitted immediately.
   - High-frequency token progress is aggregated and emitted as `telemetry:pulse` once every $100\text{ms}$ only while active streams exist.
3. **Snapshot Hydration on SSE Connection:**
   - When a management console connects or reconnects (e.g. browser refresh F5) to `GET /api/admin/events`, the Gateway must immediately emit a `radar:snapshot` event containing:
     - All in-flight execution records from `ExecutionRegistry`.
     - Active slot capacity and cooldown status per CLI adapter.
     - Recent failover events.
   - Guarantees zero blank screen states upon initial load.
4. **Dynamic Failover Trail Breadcrumb Interception:**
   - In `apps/gateway/src/router/pipeline-executor.ts`, when a candidate target fails during the $250\text{ms}$ spawn-probe window, record a structured breadcrumb in the request's execution record and broadcast `telemetry:failover`.
   - Format: `[P0: codex-acc-1 (RateLimit 429) +142ms] ➔ [P1: gemini-acc-2 (Healthy 200) +780ms]`.
5. **Control Plane REST Endpoints (`/api/admin/telemetry/*`):**
   - `GET /api/admin/telemetry/active`: Returns real-time snapshot of active streams.
   - `GET /api/admin/telemetry/summary?window=5m|1h|24h|all`: Returns aggregated KPI counters.
   - `GET /api/admin/telemetry/breakdown?window=5m|1h|24h|all`: Returns consumption breakdown by provider and model.
   - `GET /api/admin/telemetry/ledger`: Paginated historical records from SQLite with full text search and filters.
   - `POST /api/admin/telemetry/abort/:requestId`: Emergency kill switch endpoint triggering immediate process tree termination and slot reclamation.

### 1.2. Non-Functional & Reliability Requirements
- **Streaming Latency Overhead:** Telemetry hooks must add $< 0.1\text{ms}$ processing latency per SSE chunk sent to OpenAI IDE clients.
- **Micro-Throttle Efficiency:** Event Loop utilization for SSE telemetry broadcasting must remain $< 1.5\%$ under 20 concurrent streams.
- **Emergency Abort Responsiveness:** Submitting an abort request must return HTTP 200 and terminate the target process in $< 200\text{ms}$.

```gherkin
Feature: Streaming Demuxer Hooks and Admin Control Plane
  Scenario: Real-time Thinking and Content Token Tallying
    Given A streaming request routed to a CoT model
    When The model emits thinking chunks inside <think> tags
    Then The execution record status is "REASONING"
    And reasoningTokens increments while completionTokens remains 0
    When The model closes </think> and emits answer text
    Then The execution record status transitions to "STREAMING"
    And completionTokens increments and TTFT is recorded

  Scenario: Snapshot Hydration on Console Connect
    Given Two CLI requests currently in-flight
    When A user loads the Web Console and connects to /api/admin/events
    Then The first received SSE event is "radar:snapshot"
    And The snapshot payload contains both active requests with PIDs and current token counts

  Scenario: Emergency Abort via REST API
    Given An active request "chatcmpl-test-123" with PID 4567
    When POST /api/admin/telemetry/abort/chatcmpl-test-123 is invoked
    Then The API returns { success: true, pid: 4567, killed: true }
    And The client HTTP stream terminates
    And The account slot is freed
```

---

## 2. Architecture

### 2.1. Telemetry Ingress, Demuxer Wiring & SSE Event Flow

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ CLIENT INGRESS (/v1/chat/completions)                                       │
 │                                                                             │
 │  1. estimatePromptTokens(messages) ──► promptTokens                         │
 │  2. globalExecutionRegistry.register({ id, promptTokens, ... })             │
 │  3. globalAdminEventBus.broadcast("telemetry:request:start", ...)           │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ EXECUTION & DEMUXER STREAMING (pipe-executor / ThinkingDemuxer)             │
 │                                                                             │
 │  onSpawn(pid) ──► globalExecutionRegistry.bindPid(id, pid)                 │
 │                                                                             │
 │  onThoughtDelta(chunk)                                                      │
 │    ├── estimateTextTokensAdaptive(chunk)                                    │
 │    ├── globalExecutionRegistry.recordTokenChunk(id, tok, "reasoning")       │
 │    └── globalTelemetryBroadcaster.markDirty()                               │
 │                                                                             │
 │  onContentDelta(chunk)                                                      │
 │    ├── estimateTextTokensAdaptive(chunk)                                    │
 │    ├── globalExecutionRegistry.recordTokenChunk(id, tok, "content")         │
 │    └── globalTelemetryBroadcaster.markDirty()                               │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
              ┌─────────────────────────┴─────────────────────────┐
              ▼                                                   ▼
 ┌──────────────────────────────────────┐    ┌─────────────────────────────────┐
 │ TELEMETRY BROADCASTER (100ms Pulse)  │    │ STREAM COMPLETION & PERSIST     │
 │                                      │    │                                 │
 │  setInterval(100ms):                 │    │  finally:                       │
 │   if (hasActiveStreams && isDirty)   │    │   1. registry.complete(id)      │
 │     broadcast("telemetry:pulse", {   │    │   2. globalTelemetryQueue       │
 │       activeStreams: getSnapshot(),  │    │        .enqueue(metric)         │
 │     })                               │    │   3. accountPool.releaseSlot()  │
 └──────────────────┬───────────────────┘    │   4. broadcast("complete")      │
                    │                        └─────────────────────────────────┘
                    ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ ADMIN SSE EVENT BUS (/api/admin/events)                                     │
 │                                                                             │
 │  On Client Connect:                                                         │
 │    1. Write "connected"                                                     │
 │    2. Write "radar:snapshot" { activeStreams, adapterSlots, recentFailovers }│
 │                                                                             │
 │  Continuous Push:                                                           │
 │    - telemetry:pulse (100ms throttled)                                      │
 │    - telemetry:failover (instant)                                           │
 │    - telemetry:kill (instant)                                               │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Related Code Files

| File Path | Status | Purpose |
|---|---|---|
| `apps/gateway/src/telemetry/telemetry-broadcaster.ts` | **CREATED** | 100ms micro-throttled SSE pulse engine and snapshot hydration generator. |
| `apps/gateway/src/api/routes/admin-telemetry.ts` | **CREATED** | Admin REST endpoints for active snapshot, metrics summary, breakdown, ledger, and abort. |
| `apps/gateway/src/api/routes/openai-chat.ts` | **MODIFIED** | Connect prompt estimator, demuxer callbacks, PID binding, and persist queue enqueuing. |
| `apps/gateway/src/api/routes/admin-events.ts` | **MODIFIED** | Deliver `radar:snapshot` immediately on new client SSE connection. |
| `apps/gateway/src/router/pipeline-executor.ts` | **MODIFIED** | Intercept 429 spawn failovers and register breadcrumbs into `ExecutionRegistry`. |
| `apps/gateway/src/api/server.ts` | **MODIFIED** | Register `adminTelemetryRoutes` and add shutdown cleanup hooks. |
| `tests/unit/admin-telemetry-routes.test.ts` | **CREATED** | Unit tests for admin REST endpoints, ledger filtering, and emergency abort. |

---

## 4. Implementation Steps

### Step 1: Implement Micro-Throttled Telemetry Broadcaster (`apps/gateway/src/telemetry/telemetry-broadcaster.ts`)

```typescript
// apps/gateway/src/telemetry/telemetry-broadcaster.ts
import { globalAdminEventBus } from "../api/routes/admin-events.js";
import { globalExecutionRegistry } from "./execution-registry.js";
import { globalAccountPool } from "../router/account-pool.js";
import { globalTelemetryStore } from "./telemetry-store.js";

export class TelemetryBroadcaster {
  private timer: NodeJS.Timeout | null = null;
  private isDirty = false;
  private readonly pulseIntervalMs = 100;

  constructor() {
    this.startPulseLoop();
  }

  public markDirty(): void {
    this.isDirty = true;
  }

  private startPulseLoop(): void {
    this.timer = setInterval(() => {
      const active = globalExecutionRegistry.getSnapshot();
      if (active.length > 0 && this.isDirty) {
        this.isDirty = false;
        globalAdminEventBus.broadcast("telemetry:pulse", {
          activeStreams: active.map((a) => ({
            requestId: a.requestId,
            pid: a.pid,
            status: a.status,
            adapterId: a.adapterId,
            modelRequested: a.modelRequested,
            modelExecuted: a.modelExecuted,
            accountId: a.accountId,
            promptTokens: a.promptTokens,
            reasoningTokens: a.reasoningTokens,
            completionTokens: a.completionTokens,
            totalTokens: a.totalTokens,
            currentVelocity: a.currentVelocity,
            elapsedMs: Date.now() - a.startedAt,
            ttftMs: a.ttftMs,
            ttfrMs: a.ttfrMs,
            failoverTrail: a.failoverTrail,
          })),
        });
      }
    }, this.pulseIntervalMs);
  }

  public async getFullHydrationSnapshot() {
    const activeStreams = globalExecutionRegistry.getSnapshot();
    const adapterSummary = await globalTelemetryStore.getBreakdown(300); // 5 min summary
    const accounts = await globalAccountPool.getAllAccountsStatus();

    return {
      activeStreams,
      adapterSummary,
      accounts,
      serverTime: Date.now(),
    };
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const globalTelemetryBroadcaster = new TelemetryBroadcaster();
```

### Step 2: Implement Snapshot Hydration in `admin-events.ts`
In `apps/gateway/src/api/routes/admin-events.ts`:

```typescript
// apps/gateway/src/api/routes/admin-events.ts
import { globalTelemetryBroadcaster } from "../../telemetry/telemetry-broadcaster.js";

export function registerAdminEventsRoutes(fastify: FastifyInstance): void {
  fastify.get("/api/admin/events", async (req: FastifyRequest<{ Querystring: { test?: string } }>, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "X-Accel-Buffering": "no",
    });

    // Send initial connected event
    reply.raw.write(`data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`);

    // Hydrate state immediately
    globalTelemetryBroadcaster.getFullHydrationSnapshot().then((snapshot) => {
      reply.raw.write(`data: ${JSON.stringify({ type: "radar:snapshot", timestamp: Date.now(), data: snapshot })}\n\n`);
    }).catch((err) => {
      console.warn("[admin-events] Snapshot hydration error:", err);
    });

    if (req.query?.test === "true") {
      reply.raw.end();
      return;
    }

    const listener = (event: AdminEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    globalAdminEventBus.on("event", listener);

    req.raw.on("close", () => {
      globalAdminEventBus.off("event", listener);
    });
  });
}
```

### Step 3: Wire Streaming Demuxer and Persist Queue into `openai-chat.ts`
Modify `apps/gateway/src/api/routes/openai-chat.ts`:

```typescript
// In apps/gateway/src/api/routes/openai-chat.ts
import { estimatePromptTokens, estimateTextTokensAdaptive } from "../../utils/token-estimator.js";
import { globalExecutionRegistry } from "../../telemetry/execution-registry.js";
import { globalTelemetryBroadcaster } from "../../telemetry/telemetry-broadcaster.js";
import { globalTelemetryQueue } from "../../telemetry/persist-queue.js";

// Inside route handler before process execution:
const promptTokens = estimatePromptTokens(messages);

globalExecutionRegistry.register({
  requestId: completionId,
  pid: null,
  accountId: target.account.id,
  adapterId: target.adapter.id,
  modelRequested: requestedModel,
  modelExecuted: target.actualModelId,
  sandboxDir: target.account.sandboxDir,
  promptTokens,
  reasoningTokens: 0,
  completionTokens: 0,
  totalTokens: promptTokens,
  startedAt: startTime,
  status: "PRE_FLIGHT",
  abortController,
});

globalAdminEventBus.broadcast("telemetry:request:start", {
  id: completionId,
  model: requestedModel,
  provider: target.adapter.id,
  accountId: target.account.id,
  promptTokens,
  stream: isStreaming,
});

// Pass onSpawn and token recording into process manager:
const onThoughtDelta = (thought: string) => {
  reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { reasoning_content: thought }));
  const deltaTokens = estimateTextTokensAdaptive(thought);
  globalExecutionRegistry.recordTokenChunk(completionId, deltaTokens, "reasoning");
  globalTelemetryBroadcaster.markDirty();
};

const onContentDelta = (content: string) => {
  reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { content }));
  const deltaTokens = estimateTextTokensAdaptive(content);
  globalExecutionRegistry.recordTokenChunk(completionId, deltaTokens, "content");
  globalTelemetryBroadcaster.markDirty();
};

// Inside finally block:
const duration = Date.now() - startTime;
const finishedRecord = globalExecutionRegistry.complete(completionId, hasError ? "ERROR" : "COMPLETED");

globalTelemetryQueue.enqueue({
  id: randomUUID(),
  requestId: completionId,
  adapterId: activeAdapterId,
  accountId: activeAccountId,
  modelRequested,
  modelExecuted: finishedRecord?.modelExecuted || requestedModel,
  promptTokens: finishedRecord?.promptTokens || promptTokens,
  reasoningTokens: finishedRecord?.reasoningTokens || 0,
  completionTokens: finishedRecord?.completionTokens || 0,
  totalTokens: finishedRecord?.totalTokens || promptTokens,
  ttftMs: finishedRecord?.ttftMs,
  totalDurationMs: duration,
  statusCode: hasError ? 500 : 200,
  status: hasError ? "ERROR" : "SUCCESS",
  errorMessage: hasError ? "Stream completed with error" : null,
  createdAt: Math.floor(Date.now() / 1000),
});
```

### Step 4: Implement Admin Telemetry REST Endpoints (`apps/gateway/src/api/routes/admin-telemetry.ts`)

```typescript
// apps/gateway/src/api/routes/admin-telemetry.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { globalExecutionRegistry } from "../../telemetry/execution-registry.js";
import { globalTelemetryStore } from "../../telemetry/telemetry-store.js";
import { globalAdminEventBus } from "./admin-events.js";

export function registerAdminTelemetryRoutes(fastify: FastifyInstance): void {
  // GET /api/admin/telemetry/active
  fastify.get("/api/admin/telemetry/active", async () => {
    return {
      activeStreams: globalExecutionRegistry.getSnapshot(),
      count: globalExecutionRegistry.getSnapshot().length,
    };
  });

  // GET /api/admin/telemetry/summary
  fastify.get("/api/admin/telemetry/summary", async (req: FastifyRequest<{ Querystring: { window?: string } }>) => {
    let windowSeconds: number | undefined;
    if (req.query.window === "5m") windowSeconds = 300;
    else if (req.query.window === "1h") windowSeconds = 3600;
    else if (req.query.window === "24h") windowSeconds = 86400;

    const summary = globalTelemetryStore.getSummary(windowSeconds);
    return summary;
  });

  // GET /api/admin/telemetry/breakdown
  fastify.get("/api/admin/telemetry/breakdown", async (req: FastifyRequest<{ Querystring: { window?: string } }>) => {
    let windowSeconds: number | undefined;
    if (req.query.window === "5m") windowSeconds = 300;
    else if (req.query.window === "1h") windowSeconds = 3600;
    else if (req.query.window === "24h") windowSeconds = 86400;

    return globalTelemetryStore.getBreakdown(windowSeconds);
  });

  // GET /api/admin/telemetry/ledger
  fastify.get("/api/admin/telemetry/ledger", async (req: FastifyRequest<{
    Querystring: {
      limit?: string;
      offset?: string;
      search?: string;
      adapterId?: string;
      model?: string;
      status?: string;
      window?: string;
    };
  }>) => {
    let windowSeconds: number | undefined;
    if (req.query.window === "5m") windowSeconds = 300;
    else if (req.query.window === "1h") windowSeconds = 3600;
    else if (req.query.window === "24h") windowSeconds = 86400;

    return globalTelemetryStore.queryLedger({
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
      search: req.query.search,
      adapterId: req.query.adapterId,
      model: req.query.model,
      status: req.query.status,
      timeWindowSeconds: windowSeconds,
    });
  });

  // POST /api/admin/telemetry/abort/:requestId
  fastify.post("/api/admin/telemetry/abort/:requestId", async (req: FastifyRequest<{ Params: { requestId: string } }>, reply: FastifyReply) => {
    const { requestId } = req.params;
    const result = await globalExecutionRegistry.abortExecution(requestId);

    if (!result.success) {
      return reply.status(404).send({ error: `Request '${requestId}' not found or already completed.` });
    }

    globalAdminEventBus.broadcast("telemetry:process:killed", {
      requestId,
      pid: result.pid,
      timestamp: Date.now(),
    });

    return {
      success: true,
      requestId,
      pid: result.pid,
      killed: result.killed,
      message: `Execution '${requestId}' aborted and process tree terminated.`,
    };
  });
}
```

---

## 5. Todo List

- [ ] Create `apps/gateway/src/telemetry/telemetry-broadcaster.ts` with $100\text{ms}$ pulse loop and hydration snapshot compiler.
- [ ] Update `apps/gateway/src/api/routes/admin-events.ts` to emit `radar:snapshot` on new connection.
- [ ] Modify `apps/gateway/src/api/routes/openai-chat.ts` to wire `estimatePromptTokens`, `onThoughtDelta`, `onContentDelta`, and enqueue to `globalTelemetryQueue`.
- [ ] Connect failover breadcrumb tracking in `apps/gateway/src/router/pipeline-executor.ts` to `globalExecutionRegistry`.
- [ ] Create `apps/gateway/src/api/routes/admin-telemetry.ts` and expose active snapshot, summary, breakdown, ledger, and abort routes.
- [ ] Register routes in `apps/gateway/src/api/server.ts`.
- [ ] Write unit test in `tests/unit/admin-telemetry-routes.test.ts` verifying all REST endpoints and emergency abort behavior.

---

## 6. Success Criteria

1. Streaming completion requests incrementally count thinking and content tokens and compute instantaneous velocity.
2. Fastify SSE pushes `telemetry:pulse` exactly once every $100\text{ms}$ without per-chunk spamming.
3. Connecting to `/api/admin/events` immediately pushes `radar:snapshot` containing all active processes.
4. Calling `POST /api/admin/telemetry/abort/:requestId` terminates the target process and returns within $< 200\text{ms}$.
5. `tests/unit/admin-telemetry-routes.test.ts` passes with 100% assertions.

---

## 7. Risk Assessment & Mitigation

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **SSE connection drops during heavy stream** | Low (UI disconnects) | Frontend SSE auto-reconnects with exponential backoff; Gateway immediately resends `radar:snapshot` upon reconnection. |
| **High request volume causing SSE queue buildup** | Medium (Memory leak) | Fastify EventBus uses `raw.write()` with `cork()` / non-blocking writes; if client socket is closed, listener is immediately unregistered. |
| **Abort called on already-exited process** | Low (Harmless) | `killProcessTree` wraps OS system calls in `try/catch` and silently ignores `ESRCH` (no such process). |

---

## 8. Verification Commands

```bash
# 1. Run admin telemetry routes unit tests
pnpm test tests/unit/admin-telemetry-routes.test.ts

# 2. Verify server starts and registers new telemetry endpoints
pnpm --filter @cli-to-api/gateway start
```
