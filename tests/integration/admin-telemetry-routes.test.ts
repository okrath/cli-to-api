import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { globalExecutionRegistry } from "../../apps/gateway/src/telemetry/execution-registry.js";
import { globalTelemetryQueue } from "../../apps/gateway/src/telemetry/persist-queue.js";
import { sqlite } from "../../apps/gateway/src/db/index.js";
import type { FastifyInstance } from "fastify";

describe("Admin Telemetry Routes & Control Plane", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    runMigrations();
    server = createGatewayServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    globalExecutionRegistry.clear();
    globalTelemetryQueue.clear();
    sqlite.prepare("DELETE FROM request_metrics WHERE request_id LIKE 'integ-req-%'").run();
  });

  it("GET /api/admin/telemetry/active should return current in-flight streams", async () => {
    globalExecutionRegistry.register({
      requestId: "integ-req-active-1",
      pid: 1234,
      accountId: "acc-1",
      adapterId: "codex-cli",
      modelRequested: "gpt-4o",
      modelExecuted: "gpt-4o",
      sandboxDir: "/tmp/sb-1",
      promptTokens: 250,
      reasoningTokens: 50,
      completionTokens: 100,
      totalTokens: 400,
      startedAt: Date.now() - 1500,
      status: "STREAMING",
    });

    const res = await server.inject({
      method: "GET",
      url: "/api/admin/telemetry/active",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.count).toBe(1);
    expect(body.activeStreams.length).toBe(1);
    expect(body.activeStreams[0].requestId).toBe("integ-req-active-1");
    expect(body.activeStreams[0].adapterId).toBe("codex-cli");
    expect(body.activeStreams[0].promptTokens).toBe(250);
  });

  it("POST /api/admin/telemetry/abort/:requestId should abort and return 200", async () => {
    const controller = new AbortController();
    globalExecutionRegistry.register({
      requestId: "integ-req-abort-1",
      pid: null,
      accountId: "acc-2",
      adapterId: "gemini-cli",
      modelRequested: "gemini-2.5-flash",
      modelExecuted: "gemini-2.5-flash",
      sandboxDir: "/tmp/sb-2",
      promptTokens: 100,
      reasoningTokens: 0,
      completionTokens: 0,
      totalTokens: 100,
      startedAt: Date.now(),
      status: "STREAMING",
      abortController: controller,
    });

    const res = await server.inject({
      method: "POST",
      url: "/api/admin/telemetry/abort/integ-req-abort-1",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.requestId).toBe("integ-req-abort-1");
    expect(controller.signal.aborted).toBe(true);
  });

  it("POST /api/admin/telemetry/abort/:requestId should return 404 for unknown request", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/admin/telemetry/abort/unknown-req-id",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("GET /api/admin/telemetry/ledger should return paginated historical audit records", async () => {
    // Populate sample records
    globalTelemetryQueue.enqueue({
      id: `m-integ-1-${Date.now()}`,
      requestId: "integ-req-ledger-1",
      adapterId: "codex-cli",
      accountId: "acc-codex-1",
      modelRequested: "gpt-4o",
      modelExecuted: "gpt-4o",
      promptTokens: 500,
      reasoningTokens: 100,
      completionTokens: 250,
      totalTokens: 850,
      ttftMs: 350,
      totalDurationMs: 1500,
      statusCode: 200,
      status: "SUCCESS",
      createdAt: Math.floor(Date.now() / 1000),
    });

    globalTelemetryQueue.enqueue({
      id: `m-integ-2-${Date.now()}`,
      requestId: "integ-req-ledger-2",
      adapterId: "claude-cli",
      accountId: "acc-claude-1",
      modelRequested: "claude-3-7-sonnet",
      modelExecuted: "claude-3-7-sonnet",
      promptTokens: 300,
      reasoningTokens: 0,
      completionTokens: 150,
      totalTokens: 450,
      ttftMs: 220,
      totalDurationMs: 900,
      statusCode: 200,
      status: "SUCCESS",
      createdAt: Math.floor(Date.now() / 1000),
    });

    globalTelemetryQueue.flushSync();

    const res = await server.inject({
      method: "GET",
      url: "/api/admin/telemetry/ledger?search=ledger&limit=10",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(body.records.length).toBeGreaterThanOrEqual(2);
    expect(body.records.some((r: any) => r.request_id === "integ-req-ledger-1")).toBe(true);
    expect(body.records.some((r: any) => r.request_id === "integ-req-ledger-2")).toBe(true);
  });

  it("GET /api/admin/telemetry/summary and /breakdown should return aggregated token stats", async () => {
    globalTelemetryQueue.enqueue({
      id: `m-integ-sum-${Date.now()}`,
      requestId: "integ-req-summary-1",
      adapterId: "codex-cli",
      modelRequested: "gpt-4o",
      modelExecuted: "gpt-4o",
      promptTokens: 1000,
      reasoningTokens: 200,
      completionTokens: 400,
      totalTokens: 1600,
      totalDurationMs: 2000,
      statusCode: 200,
      status: "SUCCESS",
      createdAt: Math.floor(Date.now() / 1000),
    });

    globalTelemetryQueue.flushSync();

    const sumRes = await server.inject({
      method: "GET",
      url: "/api/admin/telemetry/summary?window=1h",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(sumRes.statusCode).toBe(200);
    const summary = JSON.parse(sumRes.body);
    expect(summary.total_requests).toBeGreaterThanOrEqual(1);
    expect(summary.total_prompt_tokens).toBeGreaterThanOrEqual(1000);

    const bdRes = await server.inject({
      method: "GET",
      url: "/api/admin/telemetry/breakdown?window=1h",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(bdRes.statusCode).toBe(200);
    const breakdown = JSON.parse(bdRes.body);
    expect(breakdown.byProvider.length).toBeGreaterThanOrEqual(1);
    expect(breakdown.byModel.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/admin/telemetry/probe should return valid probe structure", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/admin/telemetry/probe",
      headers: { authorization: "Bearer sk-cta-admin-token" },
      payload: { type: "code" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.probeType).toBe("code");
    expect(body.promptText).toContain("TypeScript");
  });
});
