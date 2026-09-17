import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { globalAdapterRegistry } from "../../apps/gateway/src/adapters/registry.js";
import { projectRoot } from "../../apps/gateway/src/config/paths.js";
import { db } from "../../apps/gateway/src/db/index.js";
import { accounts, adapters } from "../../apps/gateway/src/db/schema.js";
import path from "node:path";
import { FastifyInstance } from "fastify";

describe("Deep Reasoning Stream Demuxing E2E Tests", () => {
  let app: FastifyInstance;
  const mockReasonerScript = path.join(projectRoot, "tests", "mocks", "mock-reasoning-cli.js");

  beforeAll(async () => {
    runMigrations();

    const reasonerConfig = {
      id: "mock-reasoner",
      name: "Mock Reasoner CLI",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe" as const,
      models: [
        { id: "r1-reasoning", name: "R1 Deep Reasoning", tier: "xhigh" as const, context_window: 128000, cost_weight: 5, is_default: true },
      ],
      invocation: {
        args_template: [mockReasonerScript, "{prompt}"],
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
      config: reasonerConfig,
      resolvedExecutable: { resolvedPath: "node", isWindowsScript: false, isPowerShellScript: false, spawnExecutable: "node", spawnPrefixArgs: [] },
    });

    await db.insert(adapters).values({
      id: "mock-reasoner",
      name: "Mock Reasoner CLI",
      version: "1.0.0",
      executable: "node",
      resolvedPath: "node",
      executionMode: "pipe",
      configJson: JSON.stringify(reasonerConfig),
    }).onConflictDoNothing();

    await db.insert(accounts).values({
      id: "mock-reasoner-acc-01",
      adapterId: "mock-reasoner",
      name: "Mock Reasoner Acc 01",
      sandboxDir: "./data/sandboxes/mock-reasoner/mock-reasoner-acc-01",
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

  it("streams reasoning_content chunks followed by content chunks without tag leaks", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: {
        model: "mock-reasoner/r1-reasoning",
        messages: [{ role: "user", content: "Solve logic puzzle" }],
        stream: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");

    const lines = res.body.split("\n");
    let accumulatedReasoning = "";
    let accumulatedContent = "";

    for (const line of lines) {
      if (line.startsWith("data: ") && !line.includes("[DONE]")) {
        try {
          const parsed = JSON.parse(line.replace("data: ", ""));
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.reasoning_content) {
            accumulatedReasoning += delta.reasoning_content;
          }
          if (delta?.content) {
            accumulatedContent += delta.content;
          }
        } catch {}
      }
    }

    // Verify thoughts contain reasoning text
    expect(accumulatedReasoning).toContain("Bước 1: Phân tích yêu cầu.");
    expect(accumulatedReasoning).toContain("Bước 2: Tìm lời giải tối ưu.");

    // Verify content contains clean answer
    expect(accumulatedContent).toContain("Bắt đầu thực thi: ");
    expect(accumulatedContent).toContain("Đây là câu trả lời đã suy luận xong 🚀");

    // Verify zero leaked tags in content
    expect(accumulatedContent).not.toContain("<think>");
    expect(accumulatedContent).not.toContain("</think>");
    expect(accumulatedContent).not.toContain("<thi");
    expect(accumulatedContent).not.toContain("</thi");

    // Verify [DONE] present
    expect(res.body).toContain("data: [DONE]");
  });

  it("returns reasoning_content in non-streaming responses", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: {
        model: "mock-reasoner/r1-reasoning",
        messages: [{ role: "user", content: "Solve logic puzzle non-streaming" }],
        stream: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message.role).toBe("assistant");
    expect(body.choices[0].message.content).toContain("Đây là câu trả lời đã suy luận xong 🚀");
    expect(body.choices[0].message.content).not.toContain("<think>");
    expect(body.choices[0].message.reasoning_content).toContain("Bước 1: Phân tích yêu cầu.");
  });
});
