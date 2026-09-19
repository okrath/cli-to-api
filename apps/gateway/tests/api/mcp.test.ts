import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GatewayConfig } from "../../src/config.js";
import { openDb, type DbHandle } from "../../src/db/db.js";
import { runMigrations } from "../../src/db/migrate.js";
import { buildServer } from "../../src/server.js";
import {
  createBridge,
  deliverToolResults,
  noteParsedCall,
  resetBridges,
} from "../../src/router/tool-bridge.js";

describe("MCP routes", () => {
  let dataDir: string;
  let db: DbHandle;
  let app: FastifyInstance;

  const config: GatewayConfig = {
    port: 0,
    host: "127.0.0.1",
    dataDir: "",
    adminPassword: "test-admin-password",
    logLevel: "silent",
    dbPath: "",
    repoRoot: join(import.meta.dirname, "../../../.."),
    mcpBaseUrl: "http://127.0.0.1:8080",
  };

  beforeEach(async () => {
    resetBridges();
    dataDir = mkdtempSync(join(tmpdir(), "cli-to-api-mcp-"));
    config.dataDir = dataDir;
    config.dbPath = join(dataDir, "cli-to-api.db");
    db = openDb(config.dbPath);
    runMigrations(db);
    app = await buildServer({ config, db, version: "1.2.3" });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
    resetBridges();
  });

  it("handles initialize, tools/list, tools/call, notifications, unknown method, unknown bridge, GET", async () => {
    const bridge = createBridge(
      [
        {
          name: "get_weather",
          description: "Weather",
          parameters: { type: "object", properties: { city: { type: "string" } } },
        },
      ],
      { baseUrl: "http://127.0.0.1:8080", resultTimeoutMs: 5000 },
    );

    const init = await app.inject({
      method: "POST",
      url: `/mcp/${bridge.id}`,
      payload: {
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test" } },
      },
    });
    expect(init.statusCode).toBe(200);
    expect(init.json()).toMatchObject({
      result: {
        protocolVersion: "2025-11-25",
        serverInfo: { name: "cta", version: "1.2.3" },
      },
    });

    const list = await app.inject({
      method: "POST",
      url: `/mcp/${bridge.id}`,
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(list.json()).toMatchObject({
      result: {
        tools: [
          expect.objectContaining({
            name: "get_weather",
            inputSchema: { type: "object", properties: { city: { type: "string" } } },
          }),
        ],
      },
    });

    noteParsedCall(bridge, {
      id: "toolu_test",
      name: "get_weather",
      argumentsJson: '{"city":"Hanoi"}',
    });

    const callPromise = app.inject({
      method: "POST",
      url: `/mcp/${bridge.id}`,
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "get_weather",
          arguments: { city: "Hanoi" },
          _meta: { "claudecode/toolUseId": "toolu_test" },
        },
      },
    });

    setTimeout(() => {
      deliverToolResults(bridge, [{ toolCallId: "toolu_test", content: "31C", isError: false }]);
    }, 20);

    const call = await callPromise;
    expect(call.json()).toMatchObject({
      result: { content: [{ type: "text", text: "31C" }], isError: false },
    });

    const notification = await app.inject({
      method: "POST",
      url: `/mcp/${bridge.id}`,
      payload: { jsonrpc: "2.0", method: "notifications/initialized" },
    });
    expect(notification.statusCode).toBe(202);

    const unknownMethod = await app.inject({
      method: "POST",
      url: `/mcp/${bridge.id}`,
      payload: { jsonrpc: "2.0", id: 9, method: "nope" },
    });
    expect(unknownMethod.json()).toMatchObject({ error: { code: -32601 } });

    const unknownBridge = await app.inject({
      method: "POST",
      url: "/mcp/unknown-bridge-id",
      payload: { jsonrpc: "2.0", id: 1, method: "ping" },
    });
    expect(unknownBridge.statusCode).toBe(404);
    expect(unknownBridge.json()).toEqual({ error: "unknown bridge" });

    const getRes = await app.inject({ method: "GET", url: `/mcp/${bridge.id}` });
    expect(getRes.statusCode).toBe(405);
  });
});
