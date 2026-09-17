import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TelemetryPersistQueue } from "../../apps/gateway/src/telemetry/persist-queue.js";
import { TelemetryStore } from "../../apps/gateway/src/telemetry/telemetry-store.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { sqlite } from "../../apps/gateway/src/db/index.js";
import { InsertRequestMetric } from "../../apps/gateway/src/db/schema.js";

describe("TelemetryPersistQueue & TelemetryStore", () => {
  let queue: TelemetryPersistQueue;
  const store = new TelemetryStore();

  beforeEach(() => {
    runMigrations();
    // Clean test records
    sqlite.prepare("DELETE FROM request_metrics WHERE request_id LIKE 'test-req-%'").run();
  });

  afterEach(() => {
    if (queue) {
      queue.clear();
    }
    sqlite.prepare("DELETE FROM request_metrics WHERE request_id LIKE 'test-req-%'").run();
  });

  it("should flush immediately when queue depth reaches batchSize", async () => {
    queue = new TelemetryPersistQueue({ batchSize: 3, flushIntervalMs: 5000 });

    const createMetric = (idx: number): InsertRequestMetric => ({
      id: `m-test-${idx}-${Date.now()}`,
      requestId: `test-req-${idx}-${Date.now()}`,
      adapterId: "codex-cli",
      modelRequested: "gpt-4o",
      modelExecuted: "gpt-4o",
      promptTokens: 100,
      reasoningTokens: 50,
      completionTokens: 200,
      totalTokens: 350,
      totalDurationMs: 1200,
      status: "SUCCESS",
      statusCode: 200,
      createdAt: Math.floor(Date.now() / 1000),
    });

    queue.enqueue(createMetric(1));
    queue.enqueue(createMetric(2));
    expect(queue.getQueueLength()).toBe(2);

    // 3rd item triggers immediate batch flush
    queue.enqueue(createMetric(3));

    // Wait microtask tick for async flush to settle
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(queue.getQueueLength()).toBe(0);

    const { records, total } = store.queryLedger({ search: "test-req-", limit: 10 });
    expect(total).toBe(3);
    expect(records.length).toBe(3);
  });

  it("should flush via debounce timer when batchSize is not reached", async () => {
    queue = new TelemetryPersistQueue({ batchSize: 10, flushIntervalMs: 150 });

    const metric: InsertRequestMetric = {
      id: `m-test-timer-${Date.now()}`,
      requestId: `test-req-timer-${Date.now()}`,
      adapterId: "gemini-cli",
      modelRequested: "gemini-2.5-pro",
      modelExecuted: "gemini-2.5-pro",
      promptTokens: 500,
      reasoningTokens: 120,
      completionTokens: 300,
      totalTokens: 920,
      totalDurationMs: 2500,
      status: "SUCCESS",
      statusCode: 200,
      createdAt: Math.floor(Date.now() / 1000),
    };

    queue.enqueue(metric);
    expect(queue.getQueueLength()).toBe(1);

    // Wait for debounce timer (150ms + buffer)
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(queue.getQueueLength()).toBe(0);

    const { total } = store.queryLedger({ search: "test-req-timer-", limit: 10 });
    expect(total).toBe(1);
  });

  it("should enforce maxQueueDepth safeguard by dropping oldest record", () => {
    queue = new TelemetryPersistQueue({ batchSize: 50, flushIntervalMs: 10000, maxQueueDepth: 2 });

    queue.enqueue({
      id: "m-drop-1",
      requestId: "test-req-drop-1",
      modelRequested: "gpt-4o",
      totalDurationMs: 100,
      status: "SUCCESS",
    });

    queue.enqueue({
      id: "m-drop-2",
      requestId: "test-req-drop-2",
      modelRequested: "gpt-4o",
      totalDurationMs: 100,
      status: "SUCCESS",
    });

    expect(queue.getQueueLength()).toBe(2);

    // 3rd item exceeds maxQueueDepth of 2 -> drops oldest (m-drop-1)
    queue.enqueue({
      id: "m-drop-3",
      requestId: "test-req-drop-3",
      modelRequested: "gpt-4o",
      totalDurationMs: 100,
      status: "SUCCESS",
    });

    expect(queue.getQueueLength()).toBe(2);
  });

  it("should synchronously flush remaining queue items on flushSync()", () => {
    queue = new TelemetryPersistQueue({ batchSize: 50, flushIntervalMs: 10000 });

    queue.enqueue({
      id: `m-test-sync-1-${Date.now()}`,
      requestId: `test-req-sync-1-${Date.now()}`,
      adapterId: "claude-cli",
      modelRequested: "claude-3-7-sonnet",
      modelExecuted: "claude-3-7-sonnet",
      promptTokens: 200,
      completionTokens: 400,
      totalTokens: 600,
      totalDurationMs: 3100,
      status: "SUCCESS",
      statusCode: 200,
    });

    expect(queue.getQueueLength()).toBe(1);
    queue.flushSync();
    expect(queue.getQueueLength()).toBe(0);

    const { total } = store.queryLedger({ search: "test-req-sync-", limit: 10 });
    expect(total).toBe(1);
  });

  it("should accurately aggregate summary metrics and provider breakdown in TelemetryStore", () => {
    queue = new TelemetryPersistQueue({ batchSize: 50, flushIntervalMs: 10000 });

    const now = Math.floor(Date.now() / 1000);
    queue.enqueue({
      id: `m-test-agg-1-${Date.now()}`,
      requestId: `test-req-agg-1-${Date.now()}`,
      adapterId: "codex-cli",
      modelRequested: "gpt-4o",
      modelExecuted: "gpt-4o",
      promptTokens: 1000,
      reasoningTokens: 200,
      completionTokens: 500,
      totalTokens: 1700,
      ttftMs: 300,
      totalDurationMs: 2000,
      status: "SUCCESS",
      statusCode: 200,
      createdAt: now,
    });

    queue.enqueue({
      id: `m-test-agg-2-${Date.now()}`,
      requestId: `test-req-agg-2-${Date.now()}`,
      adapterId: "gemini-cli",
      modelRequested: "gemini-2.5-flash",
      modelExecuted: "gemini-2.5-flash",
      promptTokens: 400,
      reasoningTokens: 0,
      completionTokens: 300,
      totalTokens: 700,
      ttftMs: 200,
      totalDurationMs: 1000,
      status: "ERROR",
      statusCode: 500,
      createdAt: now,
    });

    queue.flushSync();

    const summary = store.getSummary(3600);
    expect(summary.total_requests).toBeGreaterThanOrEqual(2);
    expect(summary.total_prompt_tokens).toBeGreaterThanOrEqual(1400);
    expect(summary.total_reasoning_tokens).toBeGreaterThanOrEqual(200);

    const breakdown = store.getBreakdown(3600);
    expect(breakdown.byProvider.length).toBeGreaterThanOrEqual(2);
    expect(breakdown.byModel.length).toBeGreaterThanOrEqual(2);
  });
});
