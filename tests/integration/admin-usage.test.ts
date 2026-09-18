import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { sqlite } from "../../apps/gateway/src/db/index.js";
import type { FastifyInstance } from "fastify";

describe("Admin Usage & Token Analytics Routes (Phase 2 Integration)", () => {
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
    sqlite.prepare("DELETE FROM request_metrics WHERE request_id LIKE 'usage-test-%'").run();
  });

  // Helper to insert test request records with specific timestamps
  function insertTestRecord(data: {
    id: string;
    requestId: string;
    adapterId: string;
    accountId: string;
    model: string;
    prompt: number;
    reasoning: number;
    completion: number;
    ttftMs: number;
    durationMs: number;
    statusCode: number;
    status: string;
    createdAt: number;
  }) {
    sqlite.prepare(`
      INSERT INTO request_metrics (
        id, request_id, adapter_id, account_id,
        model_requested, model_executed,
        prompt_tokens, reasoning_tokens, completion_tokens, total_tokens,
        ttft_ms, total_duration_ms, status_code, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.requestId,
      data.adapterId,
      data.accountId,
      data.model,
      data.model,
      data.prompt,
      data.reasoning,
      data.completion,
      data.prompt + data.reasoning + data.completion,
      data.ttftMs,
      data.durationMs,
      data.statusCode,
      data.status,
      data.createdAt
    );
  }

  it("GET /api/admin/usage/summary should compute single-pass comparative metrics with Delta %", async () => {
    const now = Math.floor(Date.now() / 1000);
    const twoDaysAgo = now - 2 * 86400;
    const nineDaysAgo = now - 9 * 86400;

    // Current period (last 7 days): 2 requests
    insertTestRecord({
      id: "ut-1",
      requestId: "usage-test-1",
      adapterId: "claude-code",
      accountId: "acc-claude-1",
      model: "claude-3-7-sonnet",
      prompt: 1000,
      reasoning: 500,
      completion: 200,
      ttftMs: 350,
      durationMs: 1200,
      statusCode: 200,
      status: "SUCCESS",
      createdAt: twoDaysAgo,
    });

    insertTestRecord({
      id: "ut-2",
      requestId: "usage-test-2",
      adapterId: "codex-cli",
      accountId: "acc-codex-1",
      model: "gpt-4o",
      prompt: 2000,
      reasoning: 0,
      completion: 800,
      ttftMs: 250,
      durationMs: 900,
      statusCode: 200,
      status: "SUCCESS",
      createdAt: twoDaysAgo + 3600,
    });

    // Previous period (8 to 14 days ago): 1 request
    insertTestRecord({
      id: "ut-3",
      requestId: "usage-test-3",
      adapterId: "claude-code",
      accountId: "acc-claude-1",
      model: "claude-3-7-sonnet",
      prompt: 1000,
      reasoning: 200,
      completion: 200,
      ttftMs: 400,
      durationMs: 1500,
      statusCode: 200,
      status: "SUCCESS",
      createdAt: nineDaysAgo,
    });

    const res = await server.inject({
      method: "GET",
      url: "/api/admin/usage/summary?range=7d&compare=true",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.current).toBeDefined();
    expect(body.current.requests).toBeGreaterThanOrEqual(2);
    expect(body.current.promptTokens).toBeGreaterThanOrEqual(3000);
    expect(body.current.reasoningTokens).toBeGreaterThanOrEqual(500);
    expect(body.current.completionTokens).toBeGreaterThanOrEqual(1000);
    expect(body.current.totalTokens).toBeGreaterThanOrEqual(4500);
    expect(body.current.estimatedCostUsd).toBeGreaterThan(0);

    expect(body.previous).toBeDefined();
    expect(body.previous.requests).toBeGreaterThanOrEqual(1);
    expect(body.previous.totalTokens).toBeGreaterThanOrEqual(1400);

    expect(body.delta).toBeDefined();
    expect(typeof body.delta.totalTokensPercent).toBe("number");
    expect(typeof body.delta.requestsPercent).toBe("number");
  });

  it("GET /api/admin/usage/timeseries should return bucketed timeline records", async () => {
    const now = Math.floor(Date.now() / 1000);
    insertTestRecord({
      id: "ut-ts-1",
      requestId: "usage-test-ts-1",
      adapterId: "claude-code",
      accountId: "acc-claude-1",
      model: "claude-3-5-sonnet",
      prompt: 500,
      reasoning: 100,
      completion: 200,
      ttftMs: 300,
      durationMs: 1000,
      statusCode: 200,
      status: "SUCCESS",
      createdAt: now - 3600,
    });

    const res = await server.inject({
      method: "GET",
      url: "/api/admin/usage/timeseries?range=24h&granularity=hour",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toBeInstanceOf(Array);
    expect(body.count).toBeGreaterThanOrEqual(1);

    const match = body.items.find((i: any) => i.promptTokens >= 500);
    expect(match).toBeDefined();
    expect(match.reasoningTokens).toBeGreaterThanOrEqual(100);
    expect(match.completionTokens).toBeGreaterThanOrEqual(200);
    expect(match.totalTokens).toBeGreaterThanOrEqual(800);
    expect(match.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("GET /api/admin/usage/pivot should aggregate 2-axis matrix and support search", async () => {
    const now = Math.floor(Date.now() / 1000);

    insertTestRecord({
      id: "ut-pv-1",
      requestId: "usage-test-pv-1",
      adapterId: "claude-code",
      accountId: "acc-alpha",
      model: "claude-3-7-sonnet",
      prompt: 800,
      reasoning: 200,
      completion: 300,
      ttftMs: 280,
      durationMs: 1100,
      statusCode: 200,
      status: "SUCCESS",
      createdAt: now - 1800,
    });

    insertTestRecord({
      id: "ut-pv-2",
      requestId: "usage-test-pv-2",
      adapterId: "devin-cli",
      accountId: "acc-beta",
      model: "gpt-4o",
      prompt: 1200,
      reasoning: 0,
      completion: 400,
      ttftMs: 200,
      durationMs: 800,
      statusCode: 429,
      status: "RATE_LIMITED",
      createdAt: now - 900,
    });

    // 1. Pivot Model x Adapter
    const res = await server.inject({
      method: "GET",
      url: "/api/admin/usage/pivot?dimA=model&dimB=adapter&range=24h",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.rows).toBeInstanceOf(Array);
    expect(body.rows.length).toBeGreaterThanOrEqual(2);

    const claudeRow = body.rows.find((r: any) => r.dimAVal === "claude-3-7-sonnet");
    expect(claudeRow).toBeDefined();
    expect(claudeRow.dimBVal).toBe("claude-code");
    expect(claudeRow.requests).toBeGreaterThanOrEqual(1);
    expect(claudeRow.promptTokens).toBeGreaterThanOrEqual(800);
    expect(claudeRow.tokensPerSecond).toBeGreaterThan(0);

    // 2. Pivot with Search filter
    const searchRes = await server.inject({
      method: "GET",
      url: "/api/admin/usage/pivot?dimA=model&dimB=adapter&range=24h&search=devin",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });
    const searchBody = JSON.parse(searchRes.body);
    expect(searchBody.rows.every((r: any) => r.dimBVal.includes("devin") || r.dimAVal.includes("devin"))).toBe(true);
  });

  it("GET /api/admin/usage/records should support drilldown filtering and pagination", async () => {
    const now = Math.floor(Date.now() / 1000);
    for (let i = 1; i <= 5; i++) {
      insertTestRecord({
        id: `ut-rec-${i}`,
        requestId: `usage-test-rec-${i}`,
        adapterId: "omp-cli",
        accountId: "acc-gemini",
        model: "gemini-1.5-pro",
        prompt: 100 * i,
        reasoning: 0,
        completion: 50 * i,
        ttftMs: 200,
        durationMs: 700,
        statusCode: 200,
        status: "SUCCESS",
        createdAt: now - i * 60,
      });
    }

    const res = await server.inject({
      method: "GET",
      url: "/api/admin/usage/records?dimA=adapter&valA=omp-cli&limit=2&offset=0&range=24h",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.records).toHaveLength(2);
    expect(body.total).toBeGreaterThanOrEqual(5);
    expect(body.records[0].adapterId).toBe("omp-cli");
    expect(body.records[0].modelRequested).toBe("gemini-1.5-pro");
  });

  it("GET /api/admin/usage/filters should return distinct models, adapters, and accounts", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/admin/usage/filters",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.models).toBeInstanceOf(Array);
    expect(body.adapters).toBeInstanceOf(Array);
    expect(body.accounts).toBeInstanceOf(Array);
  });

  it("GET /api/admin/usage/export should stream RFC 4180 CSV export with proper headers", async () => {
    const now = Math.floor(Date.now() / 1000);
    insertTestRecord({
      id: "ut-exp-1",
      requestId: "usage-test-exp-1",
      adapterId: "codex-cli",
      accountId: "acc-codex-export",
      model: "o1-mini",
      prompt: 1500,
      reasoning: 300,
      completion: 400,
      ttftMs: 450,
      durationMs: 1600,
      statusCode: 200,
      status: "SUCCESS",
      createdAt: now - 300,
    });

    // CSV format
    const csvRes = await server.inject({
      method: "GET",
      url: "/api/admin/usage/export?format=csv&range=24h",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
    expect(csvRes.headers["content-disposition"]).toContain("usage-export-");

    const lines = csvRes.body.split("\n");
    expect(lines[0]).toBe("ID,Request ID,Adapter,Account,Model,Prompt Tokens,Reasoning Tokens,Completion Tokens,Total Tokens,TTFT (ms),Duration (ms),Status Code,Status,Timestamp UTC");
    expect(lines.some((l: string) => l.includes("usage-test-exp-1"))).toBe(true);

    // JSON format
    const jsonRes = await server.inject({
      method: "GET",
      url: "/api/admin/usage/export?format=json&range=24h",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(jsonRes.statusCode).toBe(200);
    expect(jsonRes.headers["content-type"]).toContain("application/json");
    const jsonBody = JSON.parse(jsonRes.body);
    expect(jsonBody.records).toBeInstanceOf(Array);
  });
});
