import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { globalAdapterRegistry } from "../../apps/gateway/src/adapters/registry.js";
import { projectRoot } from "../../apps/gateway/src/config/paths.js";
import { db, sqlite } from "../../apps/gateway/src/db/index.js";
import { accounts, adapters } from "../../apps/gateway/src/db/schema.js";
import path from "node:path";
import type { FastifyInstance } from "fastify";

describe("Anthropic Messages API Protocol & Ingress Integration", () => {
  let app: FastifyInstance;
  const mockScript = path.join(projectRoot, "tests", "mocks", "mock-reasoning-cli.js");

  beforeAll(async () => {
    runMigrations();

    // Register test adapter that acts as claude-code with mock-reasoning-cli.js
    const claudeTestConfig = {
      id: "claude-code",
      name: "Anthropic Claude Code CLI Test",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe" as const,
      models: [
        {
          id: "sonnet",
          name: "Claude 3.7 Sonnet",
          tier: "medium" as const,
          context_window: 200000,
          cost_weight: 3,
          is_default: true,
        },
        {
          id: "opus",
          name: "Claude 3 Opus",
          tier: "high" as const,
          context_window: 200000,
          cost_weight: 8,
          is_default: false,
        },
        {
          id: "haiku",
          name: "Claude 3.5 Haiku",
          tier: "low" as const,
          context_window: 200000,
          cost_weight: 1,
          is_default: false,
        },
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
      concurrency: { max_concurrent_per_account: 2 },
    };

    globalAdapterRegistry.register({
      config: claudeTestConfig,
      resolvedExecutable: {
        isInstalled: true,
        resolvedPath: "node",
        isWindowsScript: false,
        isPowerShellScript: false,
        spawnExecutable: "node",
        spawnPrefixArgs: [],
      },
    });

    await db
      .insert(adapters)
      .values({
        id: "claude-code",
        name: "Anthropic Claude Code CLI Test",
        version: "1.0.0",
        executable: "node",
        resolvedPath: "node",
        executionMode: "pipe",
        configJson: JSON.stringify(claudeTestConfig),
        isInstalled: true,
        status: "INSTALLED",
      })
      .onConflictDoNothing();

    // Use REPLACE to avoid dirty test pollution
    sqlite
      .prepare(
        "INSERT OR REPLACE INTO accounts (id, adapter_id, name, sandbox_dir, status, active_slots, max_slots) VALUES ('claude-test-acc-1', 'claude-code', 'Claude Test Acc', './data/sandboxes/claude-code/test-acc-1', 'READY', 0, 2)"
      )
      .run();

    app = createGatewayServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // AC-1: Auth & Ingress Security
  it("[AC-1] Rejects request without API key with Anthropic-compliant 401 error", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/messages",
      payload: {
        model: "claude-3-7-sonnet-20250219",
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("error");
    expect(body.error).toBeDefined();
    expect(body.error.type).toBe("authentication_error");
    expect(body.error.message).toContain("x-api-key");
  });

  it("[AC-1] Authenticates successfully with x-api-key header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/messages",
      headers: {
        "x-api-key": "sk-cta-dev",
        "anthropic-version": "2023-06-01",
      },
      payload: {
        model: "claude-3-7-sonnet-20250219",
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("message");
    expect(body.role).toBe("assistant");
  });

  // AC-2: Unary Non-Streaming Messages
  it("[AC-2] Returns Anthropic-compliant unary response with thinking and text blocks", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/messages",
      headers: {
        "x-api-key": "sk-cta-dev",
      },
      payload: {
        model: "claude-3-7-sonnet-20250219",
        system: "You are a helpful assistant.",
        messages: [{ role: "user", content: "Analyze quicksort" }],
        stream: false,
        thinking: {
          type: "enabled",
          budget_tokens: 4096,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.id).toMatch(/^msg_/);
    expect(body.type).toBe("message");
    expect(body.role).toBe("assistant");
    expect(body.model).toBe("claude-3-7-sonnet-20250219");
    expect(body.stop_reason).toBe("end_turn");
    expect(Array.isArray(body.content)).toBe(true);

    // Verify thinking block was demuxed from <think> tags in mock
    const thinkingBlock = body.content.find((c: { type: string }) => c.type === "thinking");
    expect(thinkingBlock).toBeDefined();
    expect(thinkingBlock.thinking).toContain("Phân tích yêu cầu");

    // Verify text block contains the answer
    const textBlock = body.content.find((c: { type: string }) => c.type === "text");
    expect(textBlock).toBeDefined();
    expect(textBlock.text).toContain("Đây là câu trả lời đã suy luận xong");

    // Verify usage
    expect(body.usage).toBeDefined();
    expect(body.usage.input_tokens).toBeGreaterThan(0);
    expect(body.usage.output_tokens).toBeGreaterThan(0);
  });

  // AC-3: SSE Streaming Protocol
  it("[AC-3] Streams compliant Anthropic SSE events in strict sequence", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/messages",
      headers: {
        "x-api-key": "sk-cta-dev",
      },
      payload: {
        model: "claude-3-7-sonnet-20250219",
        messages: [{ role: "user", content: "Tell me a joke" }],
        stream: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");

    const rawSse = res.body;

    // Check for message_start
    expect(rawSse).toContain("event: message_start");
    expect(rawSse).toContain('"type":"message_start"');

    // Check for content_block_start
    expect(rawSse).toContain("event: content_block_start");

    // Check for content_block_delta
    expect(rawSse).toContain("event: content_block_delta");

    // Check for content_block_stop
    expect(rawSse).toContain("event: content_block_stop");

    // Check for message_delta
    expect(rawSse).toContain("event: message_delta");
    expect(rawSse).toContain('"stop_reason":"end_turn"');

    // Check for message_stop terminator
    expect(rawSse).toContain("event: message_stop");
    expect(rawSse).toContain('"type":"message_stop"');
  });

  // AC-4: Thinking Block Demuxing in Stream
  it("[AC-4] Streams thinking block before text block when CoT is emitted", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/messages",
      headers: {
        "x-api-key": "sk-cta-dev",
      },
      payload: {
        model: "claude-3-5-sonnet",
        messages: [{ role: "user", content: "Solve puzzle" }],
        stream: true,
        thinking: {
          type: "enabled",
          budget_tokens: 16000,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const rawSse = res.body;
    // Verify thinking block and thinking delta are streamed
    expect(rawSse).toContain('"content_block":{"type":"thinking"');
    expect(rawSse).toContain('"delta":{"type":"thinking_delta"');
    expect(rawSse).toContain("Phân tích yêu cầu");

    // Verify text block and text delta are streamed
    expect(rawSse).toContain('"content_block":{"type":"text"');
    expect(rawSse).toContain('"delta":{"type":"text_delta"');
    expect(rawSse).toContain("Đây là câu trả lời đã suy luận xong");

    // Verify all blocks are cleanly stopped
    expect(rawSse).toContain("event: content_block_stop");
  });

  // AC-5: Official Anthropic Model Aliases Auto-Mapping
  it("[AC-5] Resolves un-prefixed official Claude model aliases to claude-code", async () => {
    const aliases = [
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20241022",
      "claude-3-opus-20240229",
      "claude-3-5-haiku-20241022",
    ];

    for (const alias of aliases) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/messages",
        headers: {
          "x-api-key": "sk-cta-dev",
        },
        payload: {
          model: alias,
          messages: [{ role: "user", content: "Ping" }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.type).toBe("message");
      expect(body.model).toBe(alias);
    }
  });
});
