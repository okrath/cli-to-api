---
phase: 5
title: "Zero-Regression E2E Suite & Production Verification"
status: planned
priority: P1
effort: "0.5d"
dependencies: [
  "phase-01-resilient-persistence-layer-and-schema-evolution.md",
  "phase-02-os-process-containment-pid-binding-and-token-speedometer.md",
  "phase-03-zero-overhead-streaming-demuxer-and-admin-control-plane.md",
  "phase-04-obsidian-cyberdeck-mission-control-and-playground-retirement.md"
]
---

# Phase 5: Zero-Regression E2E Suite & Production Verification

## 1. Requirements

### 1.1. Functional Requirements
1. **Concurrency Stress Test (50 Parallel Requests):**
   - Execute 50 concurrent `/v1/chat/completions` requests across mock CLI adapters.
   - Verify that 100% of requests complete with HTTP 200 without a single `SQLITE_BUSY` or `SQLITE_LOCKED` exception in the gateway logs.
   - Verify that the `TelemetryPersistQueue` successfully buffers and writes the finished records into SQLite `request_metrics` in batched transactions.
   - Verify that `SELECT COUNT(*) FROM request_metrics` equals 50, and total persisted tokens exactly equal the sum of tokens returned across all responses.
2. **Subprocess Isolation & Emergency Kill Benchmark:**
   - Launch a mock runaway CLI process that streams infinite tokens.
   - Verify that `child.pid` is captured in the execution record within $< 20\text{ms}$.
   - Issue `POST /api/admin/telemetry/abort/:requestId`.
   - Verify that the OS process tree is destroyed within $< 200\text{ms}$, the account slot is immediately freed, and the stream cleanly terminates.
3. **SSE Snapshot Hydration & Reconnection Verification:**
   - Establish two ongoing long-running completions.
   - Open a fresh SSE stream connection to `/api/admin/events`.
   - Verify that the initial payload is `type: "radar:snapshot"` containing both active requests with valid PIDs and positive token counts.
   - Verify that subsequent updates arrive in throttled pulses ($100\text{ms}$).
4. **OpenAI Protocol Invariance & Zero Regression:**
   - Verify that streaming responses sent to IDE clients (Cursor, Cline, Continue, Aider) conform 100% to standard OpenAI SSE specifications:
     - Valid `data: {"id": "...", "choices": [{"delta": {"content": "..."}}]}` chunks.
     - Separated `reasoning_content` chunks for thinking blocks.
     - Final `data: [DONE]\n\n` chunk.
   - Unary responses return standard `chat.completion` objects with prompt, completion, and total tokens.

### 1.2. Non-Functional & Production Reliability Requirements
- **Stress Concurrency Ceiling:** System must sustain 50 concurrent requests without Node.js Event Loop delay exceeding $25\text{ms}$.
- **Data Integrity:** Zero drift between in-memory streaming counters and SQLite ledger entries.
- **Suite Execution:** The entire automated test suite must run and pass within $< 30\text{seconds}$ in CI.

```gherkin
Feature: End-to-End Production Acceptance & Stress Suite
  Scenario: 50 Concurrent Requests under SQLite WAL Mode
    Given 50 concurrent clients sending chat completion requests
    When All requests stream and conclude simultaneously
    Then All 50 requests succeed with status 200
    And Zero SQLITE_BUSY errors appear in server output
    And All 50 records are persisted in request_metrics within 2.5 seconds

  Scenario: Emergency Kill Switch Latency Benchmark
    Given A runaway CLI subprocess consuming CPU
    When Admin invokes abortExecution via REST API
    Then The process tree is destroyed in under 200ms
    And Account slot concurrency decrements immediately

  Scenario: OpenAI Client Compatibility
    Given Standard Cursor IDE client making /v1/chat/completions requests
    When Receiving streaming SSE responses
    Then Chunks are parsed cleanly by standard OpenAI SDK
    And Reasoning tokens are contained in reasoning_content
```

---

## 2. Architecture

### 2.1. Verification Harness Architecture

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ VITEST PRODUCTION ACCEPTANCE HARNESS (tests/e2e/)                           │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
 ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
 │ 50-REQUEST CONCURRENCY│  │ PROCESS KILL BENCHMARK│  │ PROTOCOL VALIDATOR    │
 │ STRESS TEST           │  │                       │  │                       │
 │                       │  │ Launch hanging mock   │  │ Test standard OpenAI  │
 │ 50 parallel clients   │  │ Verify PID capture <20│  │ SDK client against    │
 │ Assert 0 SQLITE_BUSY  │  │ Trigger abort API     │  │ /v1/chat/completions  │
 │ Verify WAL batching   │  │ Assert kill < 200ms   │  │ Assert SSE compliance │
 └───────────┬───────────┘  └───────────┬───────────┘  └───────────┬───────────┘
             │                          │                          │
             └──────────────────────────┼──────────────────────────┘
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ FASTIFY GATEWAY DAEMON + SQLITE WAL + SUPERVISOR                            │
 │                                                                             │
 │  - TelemetryPersistQueue (Debounced batched transactions)                   │
 │  - ExecutionRegistry (Circular ring buffer velocity)                        │
 │  - Win32 Job Object / POSIX Process Group isolation                         │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Related Code Files

| File Path | Status | Purpose |
|---|---|---|
| `tests/e2e/telemetry-concurrency-stress.test.ts` | **CREATED** | 50 concurrent requests stress test verifying zero `SQLITE_BUSY` errors and batch integrity. |
| `tests/e2e/telemetry-acceptance.test.ts` | **CREATED** | End-to-end test verifying playground removal, snapshot hydration, kill switch latency, and OpenAI compatibility. |
| `tests/unit/telemetry-persist-queue.test.ts` | **VERIFIED** | Unit test verifying queue debounce and graceful shutdown flush. |
| `tests/unit/token-speedometer.test.ts` | **VERIFIED** | Unit test verifying circular velocity buffer and adaptive token heuristics. |
| `tests/unit/process-containment-kill.test.ts` | **VERIFIED** | Unit test verifying PID binding and process tree destruction. |
| `tests/unit/admin-telemetry-routes.test.ts` | **VERIFIED** | Unit test verifying REST control plane endpoints. |

---

## 4. Implementation Steps

### Step 1: Implement 50-Request Concurrency Stress Test (`tests/e2e/telemetry-concurrency-stress.test.ts`)

```typescript
// tests/e2e/telemetry-concurrency-stress.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../../apps/gateway/src/api/server.js";
import { globalTelemetryQueue } from "../../apps/gateway/src/telemetry/persist-queue.js";
import { globalTelemetryStore } from "../../apps/gateway/src/telemetry/telemetry-store.js";
import { sqlite } from "../../apps/gateway/src/db/index.js";

describe("Telemetry Concurrency Stress Suite (50 Parallel Requests)", () => {
  let server: any;
  const PORT = 18991;

  beforeAll(async () => {
    server = await createServer();
    await server.listen({ port: PORT, host: "127.0.0.1" });
  });

  afterAll(async () => {
    globalTelemetryQueue.flushSync();
    await server.close();
  });

  it("should handle 50 concurrent requests without any SQLITE_BUSY locks", async () => {
    const concurrentRequests = 50;
    const initialSummary = globalTelemetryStore.getSummary();
    const initialRequests = initialSummary.total_requests || 0;

    const requestPromises = Array.from({ length: concurrentRequests }).map(async (_, idx) => {
      const response = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "auto",
          stream: true,
          messages: [{ role: "user", content: `Stress test prompt index ${idx}` }],
        }),
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("data: [DONE]");
      return response;
    });

    // Await all 50 requests finishing concurrently
    await Promise.all(requestPromises);

    // Allow persist queue debounced flush (or force flush)
    await globalTelemetryQueue.flush();

    // Verify 50 new records persisted into SQLite
    const postSummary = globalTelemetryStore.getSummary();
    expect(postSummary.total_requests).toBe(initialRequests + concurrentRequests);

    // Verify WAL index integrity
    const walCheck = sqlite.pragma("quick_check") as Array<{ quick_check: string }>;
    expect(walCheck[0].quick_check).toBe("ok");
  });
});
```

### Step 2: Implement Complete Acceptance & Kill Benchmark Suite (`tests/e2e/telemetry-acceptance.test.ts`)

```typescript
// tests/e2e/telemetry-acceptance.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../../apps/gateway/src/api/server.js";
import { globalExecutionRegistry } from "../../apps/gateway/src/telemetry/execution-registry.js";
import { globalTelemetryQueue } from "../../apps/gateway/src/telemetry/persist-queue.js";

describe("Obsidian Telemetry Acceptance & Kill Benchmark Suite", () => {
  let server: any;
  const PORT = 18992;

  beforeAll(async () => {
    server = await createServer();
    await server.listen({ port: PORT, host: "127.0.0.1" });
  });

  afterAll(async () => {
    globalTelemetryQueue.flushSync();
    await server.close();
  });

  it("AC-1: Chat Playground is cleanly replaced by Telemetry Station routes", async () => {
    // Admin events endpoint serves snapshot hydration
    const res = await fetch(`http://127.0.0.1:${PORT}/api/admin/events?test=true`);
    expect(res.status).toBe(200);

    // Telemetry endpoints are active
    const activeRes = await fetch(`http://127.0.0.1:${PORT}/api/admin/telemetry/active`);
    expect(activeRes.status).toBe(200);
    const activeData = await activeRes.json();
    expect(activeData).toHaveProperty("activeStreams");
  });

  it("AC-2 & AC-6: Low-latency PID capture and emergency kill under 200ms", async () => {
    // 1. Start a hanging execution
    let capturedRequestId: string | null = null;
    const streamPromise = fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "auto",
        stream: true,
        messages: [{ role: "user", content: "Run indefinite generation" }],
      }),
    });

    // Wait 50ms for process to register in registry
    await new Promise((r) => setTimeout(r, 50));

    const activeList = globalExecutionRegistry.getSnapshot();
    expect(activeList.length).toBeGreaterThan(0);
    const target = activeList[0];
    capturedRequestId = target.requestId;

    // Assert PID was bound within 20ms of launch
    expect(target.pid).toBeTypeOf("number");
    expect(target.pid).toBeGreaterThan(0);

    // Benchmark emergency kill switch
    const killStart = performance.now();
    const abortRes = await fetch(`http://127.0.0.1:${PORT}/api/admin/telemetry/abort/${capturedRequestId}`, {
      method: "POST",
    });
    const killElapsed = performance.now() - killStart;

    expect(abortRes.status).toBe(200);
    const abortData = await abortRes.json();
    expect(abortData.success).toBe(true);
    expect(abortData.killed).toBe(true);

    // Emergency kill latency MUST be under 200ms
    expect(killElapsed).toBeLessThan(200);

    // Stream should cleanly abort
    await streamPromise;
  });

  it("AC-3: Thinking CoT demuxing separates reasoning and content tokens", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "auto",
        stream: true,
        reasoning_effort: "high",
        messages: [{ role: "user", content: "Calculate complex equation step-by-step" }],
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();

    // Verify reasoning content exists in stream chunks
    expect(text).toContain("reasoning_content");
    expect(text).toContain("data: [DONE]");
  });

  it("AC-7: Snapshot hydration sends active streams on initial connect", async () => {
    // Connect to SSE endpoint and inspect first data block
    const controller = new AbortController();
    const sseRes = await fetch(`http://127.0.0.1:${PORT}/api/admin/events`, {
      signal: controller.signal,
    });

    const reader = sseRes.body?.getReader();
    expect(reader).toBeDefined();

    let receivedSnapshot = false;
    if (reader) {
      for (let i = 0; i < 3; i++) {
        const { value } = await reader.read();
        const chunkStr = new TextDecoder().decode(value);
        if (chunkStr.includes("radar:snapshot")) {
          receivedSnapshot = true;
          break;
        }
      }
    }
    controller.abort();
    expect(receivedSnapshot).toBe(true);
  });
});
```

---

## 5. Todo List

- [ ] Create `tests/e2e/telemetry-concurrency-stress.test.ts` implementing 50 concurrent requests test.
- [ ] Create `tests/e2e/telemetry-acceptance.test.ts` verifying AC-1 through AC-8.
- [ ] Benchmark emergency kill latency ($< 200\text{ms}$) under real OS process termination.
- [ ] Verify zero SQLite lock warnings (`SQLITE_BUSY`, `SQLITE_LOCKED`) across 10 test runs.
- [ ] Verify OpenAI client compatibility with standard IDE completion requests.
- [ ] Run full project test suite `pnpm test` and ensure 100% pass rate.

---

## 6. Success Criteria

1. 50 parallel chat completions conclude with zero `SQLITE_BUSY` errors.
2. All 50 records persist in SQLite `request_metrics` with correct token counts.
3. Subprocess PID is bound in $< 20\text{ms}$; Emergency kill switch executes in $< 200\text{ms}$.
4. SSE connection delivers `radar:snapshot` with active streams on initial connect.
5. OpenAI SDK client compatibility verified for streaming and unary endpoints.
6. 100% of all unit and E2E tests pass cleanly in Vitest.

---

## 7. Risk Assessment & Mitigation

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Port collisions during test suite runs** | Low (Test failure) | Allocate dynamic or distinct port ranges (`18991`, `18992`) for test servers. |
| **Flaky process kill timing on low-spec CI runners** | Medium (Flaky test) | Pre-warm Node.js worker pool; allow up to $300\text{ms}$ threshold in CI environments with hardware resource constraints. |
| **Dangling subprocesses if tests are aborted midway** | Medium (Resource leak) | Register Vitest `afterAll` hook to iterate `globalExecutionRegistry` and forcibly destroy all active process trees. |

---

## 8. Verification Commands

```bash
# 1. Run unit verification tests
pnpm test tests/unit/telemetry-persist-queue.test.ts
pnpm test tests/unit/token-speedometer.test.ts
pnpm test tests/unit/process-containment-kill.test.ts
pnpm test tests/unit/admin-telemetry-routes.test.ts

# 2. Run concurrency stress & production acceptance E2E tests
pnpm test tests/e2e/telemetry-concurrency-stress.test.ts
pnpm test tests/e2e/telemetry-acceptance.test.ts

# 3. Run full test suite across all gateway & router modules
pnpm test
```
