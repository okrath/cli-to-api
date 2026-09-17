import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { globalAdapterRegistry } from "../../apps/gateway/src/adapters/registry.js";
import { projectRoot } from "../../apps/gateway/src/config/paths.js";
import { db } from "../../apps/gateway/src/db/index.js";
import { accounts, adapters } from "../../apps/gateway/src/db/schema.js";
import path from "node:path";
import { FastifyInstance } from "fastify";

describe("OpenAI API Protocol & Chat Completions E2E", () => {
  let app: FastifyInstance;
  const mockScript = path.join(projectRoot, "tests", "mocks", "mock-spinner-cli.js");

  beforeAll(async () => {
    runMigrations();

    // Register test adapter pointing to mock-spinner-cli.js
    const testConfig = {
      id: "mock-provider",
      name: "Mock Provider CLI",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe" as const,
      models: [
        { id: "mock-fast", name: "Mock Fast", tier: "low" as const, context_window: 64000, cost_weight: 1, is_default: true },
        { id: "mock-deep", name: "Mock Deep", tier: "xhigh" as const, context_window: 128000, cost_weight: 5, is_default: true },
      ],
      invocation: {
        args_template: [mockScript, "{prompt}"],
        prompt_transport: "auto" as const,
        prompt_threshold_chars: 4000,
        working_dir_template: "{account_dir}/workspace",
        timeout_seconds: 30,
      },
      environment_isolation: { home_dir_override: true, xdg_override: true, env_overrides: {} },
      output_parser: { type: "regex_stream" as const, strip_ansi: true, resolve_carriage_return: true, chunk_regex: "(?s)(.*)" },
      error_handling: { rate_limit_patterns: [], fatal_error_patterns: [] },
      concurrency: { max_concurrent_per_account: 1 },
    };

    globalAdapterRegistry.register({
      config: testConfig,
      resolvedExecutable: { resolvedPath: "node", isWindowsScript: false, isPowerShellScript: false, spawnExecutable: "node", spawnPrefixArgs: [] },
    });

    await db.insert(adapters).values({
      id: "mock-provider",
      name: "Mock Provider CLI",
      version: "1.0.0",
      executable: "node",
      resolvedPath: "node",
      executionMode: "pipe",
      configJson: JSON.stringify(testConfig),
    }).onConflictDoNothing();

    await db.insert(accounts).values({
      id: "mock-acc-01",
      adapterId: "mock-provider",
      name: "Mock Account 01",
      sandboxDir: "./data/sandboxes/mock-provider/mock-acc-01",
      status: "READY",
      maxSlots: 1,
      activeSlots: 0,
    }).onConflictDoNothing();

    app = createGatewayServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /healthz returns status ok without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
  });

  it("GET /v1/models rejects request with missing auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/models",
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("GET /v1/models returns complete list of models with Bearer auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/models?include_auto=true",
      headers: { authorization: "Bearer sk-cta-dev" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.object).toBe("list");
    const ids = body.data.map((m: any) => m.id);

    expect(ids).toContain("auto");
    expect(ids).toContain("auto-low");
    expect(ids).toContain("auto-xhigh");
    expect(ids).toContain("mock-provider/mock-fast");
  });

  it("POST /v1/chat/completions executes non-streaming completion", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: {
        model: "mock-provider/mock-fast",
        messages: [{ role: "user", content: "Hello model" }],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message.content).toContain("Xin chào thế giới 🚀");
    expect(body.usage.total_tokens).toBeGreaterThan(0);
  });

  it("POST /v1/chat/completions streams SSE response chunks", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: {
        model: "auto-low",
        messages: [{ role: "user", content: "Streaming test" }],
        stream: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("data: {\"id\":\"chatcmpl-");
    expect(res.body).toContain("data: [DONE]");
    expect(res.body).toContain("Xin chào thế giới 🚀");
  });
  it("POST /v1/chat/completions handles multimodal array content without 500 error", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: {
        model: "mock-provider/mock-fast",
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: "data:image/webp;base64,123" } },
              { type: "text", text: "Hello model with image" },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message.content).toContain("Xin chào thế giới 🚀");
  });
});
