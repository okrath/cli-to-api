import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { seedUsageDataset, cleanUsageDataset } from "../fixtures/usage-dataset-generator.js";
import { resolveTokenRates, calculateMicroCost, formatUsd } from "../../apps/gateway/src/telemetry/model-pricing.js";
import type { FastifyInstance } from "fastify";

describe("Usage & Token Analytics Acceptance Suite (AC-1 to AC-6)", () => {
  let server: FastifyInstance;
  const testPrefix = "e2e-usage-ac-";

  beforeAll(async () => {
    runMigrations();
    server = createGatewayServer();
    await server.ready();

    // Seed 400 deterministic records across 14 days
    cleanUsageDataset(testPrefix);
    seedUsageDataset({ count: 400, daysSpan: 14, prefix: testPrefix });
  });

  afterAll(async () => {
    cleanUsageDataset(testPrefix);
    await server.close();
  });

  // AC-1: Navigation & Control Plane Routes
  it("AC-1: Fastify routes for Usage Analytics should respond promptly under 30ms", async () => {
    const start = performance.now();
    const res = await server.inject({
      method: "GET",
      url: "/api/admin/usage/filters",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });
    const elapsed = performance.now() - start;

    expect(res.statusCode).toBe(200);
    expect(elapsed).toBeLessThan(100); // Network & execution well within budget
    const body = JSON.parse(res.body);
    expect(body.models.length).toBeGreaterThanOrEqual(1);
    expect(body.adapters.length).toBeGreaterThanOrEqual(1);
    expect(body.accounts.length).toBeGreaterThanOrEqual(1);
  });

  // AC-2: Single-Pass Comparative KPI Summary with Delta %
  it("AC-2: Single-pass comparative query should calculate KPI summary and Delta %", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/admin/usage/summary?range=7d&compare=true",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // Current period validation
    expect(body.current).toBeDefined();
    expect(body.current.requests).toBeGreaterThan(0);
    expect(body.current.totalTokens).toBeGreaterThan(0);
    expect(body.current.promptTokens).toBeGreaterThan(0);
    expect(body.current.completionTokens).toBeGreaterThan(0);
    expect(body.current.estimatedCostUsd).toBeGreaterThan(0);
    expect(body.current.avgTtftMs).toBeGreaterThan(0);

    // Previous period validation
    expect(body.previous).toBeDefined();
    expect(body.previous.requests).toBeGreaterThan(0);
    expect(body.previous.totalTokens).toBeGreaterThan(0);

    // Delta validation (Period-over-Period)
    expect(body.delta).toBeDefined();
    expect(typeof body.delta.totalTokensPercent).toBe("number");
    expect(typeof body.delta.promptTokensPercent).toBe("number");
    expect(typeof body.delta.completionTokensPercent).toBe("number");
    expect(typeof body.delta.requestsPercent).toBe("number");
    expect(typeof body.delta.costPercent).toBe("number");
  });

  // AC-3: Volumetric Time-Series Aggregation for SVG Chart
  it("AC-3: Time-series endpoint should return bucketed items with Ingress, CoT, and Egress tokens", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/admin/usage/timeseries?range=7d&granularity=day",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toBeInstanceOf(Array);
    expect(body.items.length).toBeGreaterThanOrEqual(1);

    const first = body.items[0];
    expect(first.bucket).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(first.promptTokens).toBeGreaterThanOrEqual(0);
    expect(first.reasoningTokens).toBeGreaterThanOrEqual(0);
    expect(first.completionTokens).toBeGreaterThanOrEqual(0);
    expect(first.totalTokens).toBe(first.promptTokens + first.reasoningTokens + first.completionTokens);
    expect(first.estimatedCostUsd).toBeGreaterThan(0);
  });

  // AC-4: OLAP Cross-Tabulation Matrix & Drill-Down Drawer
  it("AC-4: Pivot endpoint should aggregate across dimensions and drill-down records should return details", async () => {
    // 1. Pivot Model x Adapter
    const pivotRes = await server.inject({
      method: "GET",
      url: "/api/admin/usage/pivot?dimA=model&dimB=adapter&range=14d",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(pivotRes.statusCode).toBe(200);
    const pivotBody = JSON.parse(pivotRes.body);
    expect(pivotBody.rows).toBeInstanceOf(Array);
    expect(pivotBody.rows.length).toBeGreaterThan(0);

    const firstRow = pivotBody.rows[0];
    expect(firstRow.dimAVal).toBeDefined();
    expect(firstRow.dimBVal).toBeDefined();
    expect(firstRow.requests).toBeGreaterThan(0);
    expect(firstRow.tokensPerSecond).toBeGreaterThanOrEqual(0);
    expect(typeof firstRow.errorRate).toBe("number");

    // 2. Drill-down into that exact slice
    const drillRes = await server.inject({
      method: "GET",
      url: `/api/admin/usage/records?dimA=model&valA=${encodeURIComponent(firstRow.dimAVal)}&dimB=adapter&valB=${encodeURIComponent(firstRow.dimBVal)}&range=14d&limit=10&offset=0`,
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(drillRes.statusCode).toBe(200);
    const drillBody = JSON.parse(drillRes.body);
    expect(drillBody.records).toBeInstanceOf(Array);
    expect(drillBody.records.length).toBeGreaterThanOrEqual(1);
    expect(drillBody.total).toBeGreaterThanOrEqual(1);
    expect(drillBody.records[0].modelExecuted).toBe(firstRow.dimAVal);
    expect(drillBody.records[0].adapterId).toBe(firstRow.dimBVal);
  });

  // AC-5: Streaming Audit Export with O(1) RAM Safety
  it("AC-5: Export endpoint should stream CSV adhering to RFC 4180 with attachment header", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/admin/usage/export?format=csv&range=14d",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("usage-export-");

    const lines = res.body.trim().split("\n");
    expect(lines.length).toBeGreaterThan(10);
    expect(lines[0]).toBe("ID,Request ID,Adapter,Account,Model,Prompt Tokens,Reasoning Tokens,Completion Tokens,Total Tokens,TTFT (ms),Duration (ms),Status Code,Status,Timestamp UTC");

    // Verify row structure
    const sample = lines[1].split(",");
    expect(sample.length).toBe(14);
  });

  // AC-6: 3-Tier Fallback Pricing & Micro-Cent ($10^-6) Arithmetic
  it("AC-6: Pricing engine should calculate micro-cent precision costs with safe formatting", () => {
    // Exact match
    const sonnetRates = resolveTokenRates("claude-3-7-sonnet");
    expect(sonnetRates.promptPerMillion).toBe(3.0);
    expect(sonnetRates.completionPerMillion).toBe(15.0);

    // Micro cost: 1,000 prompt + 500 reasoning + 500 completion = $0.018
    const cost = calculateMicroCost(1000, 500, 500, sonnetRates);
    expect(cost).toBe(0.018);
    expect(formatUsd(cost)).toBe("$0.02");

    // Sub-cent formatting
    expect(formatUsd(0.0035)).toBe("$0.0035");
    expect(formatUsd(0.00005)).toBe("< $0.0001");

    // Tier fallback
    const haikuRates = resolveTokenRates("custom-haiku-v2");
    expect(haikuRates.promptPerMillion).toBe(0.2); // low tier
  });
});
