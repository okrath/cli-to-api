import { rmSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashKey } from "../../src/auth/api-key-auth.js";
import type { GatewayConfig } from "../../src/config.js";
import type { DbHandle } from "../../src/db/db.js";
import { accounts, apiKeys, requests } from "../../src/db/schema.js";
import { adminHeaders, adminToken, buildAdminApp, makeAdminTestEnv } from "./helpers.js";

describe("admin usage routes", () => {
  let config: GatewayConfig;
  let db: DbHandle;
  let dataDir: string;
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    ({ config, db, dataDir } = makeAdminTestEnv());
    app = await buildAdminApp(config, db);
    token = await adminToken(app);

    const now = Date.now();
    db.db
      .insert(apiKeys)
      .values({
        id: "key_usage",
        keyHash: hashKey("sk-cta-usage-test-key-123456789012345"),
        keyPrefix: "sk-cta-usag",
        name: "Usage Key",
        enabled: true,
        createdAt: now,
      })
      .run();

    db.db
      .insert(accounts)
      .values({
        id: "claude-code-usage",
        adapterId: "claude-code",
        name: "Usage Account",
        sandboxDir: `${dataDir}/sandboxes/claude-code/claude-code-usage`,
        maxConcurrent: 1,
        enabled: true,
        createdAt: now,
      })
      .run();

    db.db
      .insert(requests)
      .values([
        {
          id: "req_1",
          apiKeyId: "key_usage",
          dialect: "openai",
          modelRequested: "group:default",
          groupId: "group:default",
          accountId: "claude-code-usage",
          adapterId: "claude-code",
          modelExecuted: "sonnet",
          status: "ok",
          inputTokens: 100,
          cachedInputTokens: 20,
          cacheWriteTokens: 5,
          outputTokens: 50,
          reasoningTokens: 10,
          costUsd: 0.01,
          createdAt: now - 60_000,
        },
        {
          id: "req_2",
          apiKeyId: "key_usage",
          dialect: "openai",
          modelRequested: "group:default",
          groupId: "group:default",
          accountId: "claude-code-usage",
          adapterId: "claude-code",
          modelExecuted: "sonnet",
          status: "ok",
          inputTokens: 200,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 80,
          reasoningTokens: 0,
          costUsd: 0.02,
          createdAt: now - 30_000,
        },
      ])
      .run();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("lists requests and aggregates usage summary by api key", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/admin/requests?limit=10",
      headers: adminHeaders(token),
    });
    expect(list.statusCode).toBe(200);
    const rows = list.json() as unknown[];
    expect(rows.length).toBe(2);

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const summary = await app.inject({
      method: "GET",
      url: `/admin/usage/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&bucket=day&by=api_key`,
      headers: adminHeaders(token),
    });
    expect(summary.statusCode).toBe(200);
    const buckets = summary.json() as Array<{
      key: string;
      label: string;
      requests: number;
      input: number;
      output: number;
      costUsd: number;
    }>;
    expect(buckets.length).toBeGreaterThan(0);
    const row = buckets.find((entry) => entry.key === "key_usage");
    expect(row).toBeDefined();
    expect(row!.requests).toBe(2);
    expect(row!.input).toBe(300);
    expect(row!.output).toBe(130);
    expect(row!.label).toBe("Usage Key");
    expect(row!.costUsd).toBeCloseTo(0.03);

    const quota = await app.inject({
      method: "GET",
      url: "/admin/usage/quota",
      headers: adminHeaders(token),
    });
    expect(quota.statusCode).toBe(200);
    const quotaRows = quota.json() as Array<{ accountId: string; todayTokens: number }>;
    const accountQuota = quotaRows.find((entry) => entry.accountId === "claude-code-usage");
    expect(accountQuota?.todayTokens).toBe(465);
  });
});
