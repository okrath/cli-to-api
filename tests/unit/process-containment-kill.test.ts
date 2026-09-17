import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionRegistry } from "../../apps/gateway/src/telemetry/execution-registry.js";

describe("ExecutionRegistry & Process Containment", () => {
  let registry: ExecutionRegistry;

  beforeEach(() => {
    registry = new ExecutionRegistry();
  });

  it("should register in-flight request and bind OS PID immediately", () => {
    const record = registry.register({
      requestId: "chatcmpl-test-1",
      pid: null,
      accountId: "acc-1",
      adapterId: "codex-cli",
      modelRequested: "gpt-4o",
      modelExecuted: "gpt-4o",
      sandboxDir: "/tmp/sandbox/1",
      promptTokens: 150,
      reasoningTokens: 0,
      completionTokens: 0,
      totalTokens: 150,
      startedAt: Date.now(),
      status: "PRE_FLIGHT",
    });

    expect(record.pid).toBeNull();
    expect(record.status).toBe("PRE_FLIGHT");

    // Simulate onSpawn callback with OS PID
    registry.bindPid("chatcmpl-test-1", 12345);
    const updated = registry.get("chatcmpl-test-1");
    expect(updated?.pid).toBe(12345);
  });

  it("should separate reasoning and content tokens and compute TTFR/TTFT", () => {
    const startedAt = Date.now() - 500;
    registry.register({
      requestId: "chatcmpl-test-cot",
      pid: 23456,
      accountId: "acc-2",
      adapterId: "claude-code",
      modelRequested: "claude-3-7-sonnet",
      modelExecuted: "claude-3-7-sonnet",
      sandboxDir: "/tmp/sandbox/2",
      promptTokens: 200,
      reasoningTokens: 0,
      completionTokens: 0,
      totalTokens: 200,
      startedAt,
      status: "PRE_FLIGHT",
    });

    // 1. Thinking chunk arrives
    registry.recordTokenChunk("chatcmpl-test-cot", 50, "reasoning", startedAt + 200);
    let item = registry.get("chatcmpl-test-cot");
    expect(item?.status).toBe("REASONING");
    expect(item?.reasoningTokens).toBe(50);
    expect(item?.ttfrMs).toBe(200);
    expect(item?.ttftMs).toBeUndefined();

    // 2. Content chunk arrives
    registry.recordTokenChunk("chatcmpl-test-cot", 30, "content", startedAt + 450);
    item = registry.get("chatcmpl-test-cot");
    expect(item?.status).toBe("STREAMING");
    expect(item?.completionTokens).toBe(30);
    expect(item?.ttftMs).toBe(450);
    expect(item?.totalTokens).toBe(280); // 200 prompt + 50 reasoning + 30 content
  });

  it("should capture failover breadcrumbs when fallback occurs", () => {
    registry.register({
      requestId: "chatcmpl-test-failover",
      pid: 34567,
      accountId: "acc-primary",
      adapterId: "codex-cli",
      modelRequested: "group:code",
      modelExecuted: "gpt-4o",
      sandboxDir: "/tmp/sandbox/primary",
      promptTokens: 100,
      reasoningTokens: 0,
      completionTokens: 0,
      totalTokens: 100,
      startedAt: Date.now(),
      status: "PRE_FLIGHT",
    });

    registry.addFailoverBreadcrumb("chatcmpl-test-failover", {
      attempt: 1,
      fromAccountId: "acc-primary",
      toAccountId: "acc-fallback",
      reason: "429 RateLimit",
      latencyMs: 142,
    });

    const item = registry.get("chatcmpl-test-failover");
    expect(item?.failoverTrail.length).toBe(1);
    expect(item?.failoverTrail[0].reason).toBe("429 RateLimit");
    expect(item?.failoverTrail[0].toAccountId).toBe("acc-fallback");
  });

  it("should trigger abortController and transition to TERMINATED on abortExecution", async () => {
    const controller = new AbortController();
    registry.register({
      requestId: "chatcmpl-test-kill",
      pid: null, // No real OS PID to kill in unit test
      accountId: "acc-3",
      adapterId: "gemini-cli",
      modelRequested: "gemini-2.5-flash",
      modelExecuted: "gemini-2.5-flash",
      sandboxDir: "/tmp/sandbox/3",
      promptTokens: 100,
      reasoningTokens: 0,
      completionTokens: 0,
      totalTokens: 100,
      startedAt: Date.now(),
      status: "STREAMING",
      abortController: controller,
    });

    expect(controller.signal.aborted).toBe(false);

    const res = await registry.abortExecution("chatcmpl-test-kill");
    expect(res.success).toBe(true);
    expect(controller.signal.aborted).toBe(true);

    const item = registry.get("chatcmpl-test-kill");
    expect(item?.status).toBe("TERMINATED");
  });

  it("should produce a clean snapshot of all in-flight executions", () => {
    registry.register({
      requestId: "req-snap-1",
      pid: 111,
      accountId: "acc-1",
      adapterId: "codex-cli",
      modelRequested: "gpt-4o",
      modelExecuted: "gpt-4o",
      sandboxDir: "/tmp/1",
      promptTokens: 100,
      reasoningTokens: 0,
      completionTokens: 0,
      totalTokens: 100,
      startedAt: Date.now(),
      status: "PRE_FLIGHT",
    });

    registry.register({
      requestId: "req-snap-2",
      pid: 222,
      accountId: "acc-2",
      adapterId: "gemini-cli",
      modelRequested: "gemini-2.5-pro",
      modelExecuted: "gemini-2.5-pro",
      sandboxDir: "/tmp/2",
      promptTokens: 200,
      reasoningTokens: 0,
      completionTokens: 0,
      totalTokens: 200,
      startedAt: Date.now(),
      status: "STREAMING",
    });

    const snapshot = registry.getSnapshot();
    expect(snapshot.length).toBe(2);
    expect(snapshot.map((s) => s.requestId)).toContain("req-snap-1");
    expect(snapshot.map((s) => s.requestId)).toContain("req-snap-2");
  });
});
