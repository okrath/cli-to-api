import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiKey, hashKey } from "../../src/auth/api-key-auth.js";
import type { GatewayConfig } from "../../src/config.js";
import type { CliEvent } from "../../src/core/types.js";
import { openDb, type DbHandle } from "../../src/db/db.js";
import { runMigrations } from "../../src/db/migrate.js";
import { apiKeys, groups } from "../../src/db/schema.js";
import { buildServer } from "../../src/server.js";
import * as routeRequestModule from "../../src/router/route-request.js";

describe("protocol routes", () => {
  let dataDir: string;
  let db: DbHandle;
  let app: FastifyInstance;
  let apiKeyPlaintext: string;

  const config: GatewayConfig = {
    port: 0,
    host: "127.0.0.1",
    dataDir: "",
    adminPassword: "test-admin-password",
    logLevel: "silent",
    dbPath: "",
    repoRoot: join(import.meta.dirname, "../../../.."),
  };

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "cli-to-api-protocol-"));
    config.dataDir = dataDir;
    config.dbPath = join(dataDir, "cli-to-api.db");
    db = openDb(config.dbPath);
    runMigrations(db);

    const created = createApiKey();
    apiKeyPlaintext = created.plaintext;
    db.db
      .insert(apiKeys)
      .values({
        id: created.id,
        keyHash: hashKey(created.plaintext),
        keyPrefix: created.prefix,
        name: "test",
        enabled: true,
        createdAt: Date.now(),
      })
      .run();

    app = await buildServer({ config, db, version: "test" });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns OpenAI 400 for empty messages", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { "x-api-key": apiKeyPlaintext },
      payload: { model: "claude-sonnet-4-5", messages: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });

  it("returns OpenAI 404 for unknown model", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { "x-api-key": apiKeyPlaintext },
      payload: { model: "unknown-model", messages: [{ role: "user", content: "hi" }] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { type: "invalid_request_error", code: "model_not_found" },
    });
  });

  it("returns Anthropic 400 for empty messages", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { "x-api-key": apiKeyPlaintext, "anthropic-version": "2023-06-01" },
      payload: { model: "claude-sonnet-4-5", messages: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      type: "error",
      error: { type: "invalid_request_error" },
    });
  });

  it("returns Anthropic 404 for unknown model", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { "x-api-key": apiKeyPlaintext, "anthropic-version": "2023-06-01" },
      payload: {
        model: "unknown-model",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      type: "error",
      error: { type: "not_found_error" },
    });
  });

  it("returns OpenAI 429 JSON when a stream errors before the first frame", async () => {
    db.db
      .insert(groups)
      .values({
        id: "group:stream-test",
        name: "Stream test",
        enabled: true,
        allowTools: false,
        cacheTtlSec: 0,
      })
      .run();

    vi.spyOn(routeRequestModule, "routeRequest").mockResolvedValueOnce({
      events: (async function* (): AsyncGenerator<CliEvent> {
        yield { type: "error", kind: "rate_limit", message: "Rate limited", retryAfterSec: 30 };
      })(),
      meta: {
        adapterId: "claude-code",
        accountId: "acc",
        modelExecuted: "sonnet",
        sessionReused: false,
        cacheHit: false,
        failoverCount: 0,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { "x-api-key": apiKeyPlaintext },
      payload: {
        model: "group:stream-test",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      },
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.json()).toMatchObject({
      error: { type: "rate_limit_error", message: "Rate limited" },
    });
    expect(res.headers["retry-after"]).toBe("30");
  });

  it("returns OpenAI 400 tools_unsupported for requests with tools", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { "x-api-key": apiKeyPlaintext },
      payload: {
        model: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "get_weather" } }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: {
        type: "invalid_request_error",
        code: "tools_unsupported",
        message: "client tools are not enabled yet",
      },
    });
  });

  it("returns Anthropic 400 tools_unsupported for requests with tools", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { "x-api-key": apiKeyPlaintext, "anthropic-version": "2023-06-01" },
      payload: {
        model: "claude-sonnet-4-5",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
        tools: [{ name: "get_weather", input_schema: { type: "object", properties: {} } }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "client tools are not enabled yet",
      },
    });
  });

  it("lists models in OpenAI and Anthropic shapes", async () => {
    const openAi = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { "x-api-key": apiKeyPlaintext },
    });
    expect(openAi.statusCode).toBe(200);
    expect(openAi.json()).toMatchObject({ object: "list" });

    const anthropic = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { "x-api-key": apiKeyPlaintext, "anthropic-version": "2023-06-01" },
    });
    expect(anthropic.statusCode).toBe(200);
    expect(anthropic.json()).toMatchObject({ has_more: false });
  });
});
