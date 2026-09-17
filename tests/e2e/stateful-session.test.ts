import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { db } from "../../apps/gateway/src/db/index.js";
import { accounts, adapters } from "../../apps/gateway/src/db/schema.js";
import { globalAdapterRegistry } from "../../apps/gateway/src/adapters/registry.js";
import path from "node:path";
import { projectRoot, dataDir } from "../../apps/gateway/src/config/paths.js";
import type { FastifyInstance } from "fastify";

describe("Stateful Web Chat Session Bridging & Multi-Turn Memory (E2E)", () => {
  let app: FastifyInstance;
  const mockCliScript = path.join(projectRoot, "tests", "mocks", "mock-spinner-cli.js");

  beforeAll(async () => {
    runMigrations();

    // Register a mock adapter with session templates
    const mockAdapterConfig = {
      id: "mock-session-cli",
      name: "Mock Session CLI",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe" as const,
      models: [
        {
          id: "session-model",
          name: "Session Model",
          tier: "medium" as const,
          is_default: true,
          context_window: 64000,
          cost_weight: 1,
        },
      ],
      invocation: {
        args_template: [mockCliScript, "{prompt}"],
        args_template_resume: [mockCliScript, "{prompt}"],
        prompt_transport: "auto" as const,
        prompt_threshold_chars: 4000,
        working_dir_template: "{account_dir}/workspace",
        timeout_seconds: 30,
      },
      environment_isolation: { home_dir_override: true, xdg_override: true, env_overrides: {} },
      output_parser: {
        type: "regex_stream" as const,
        strip_ansi: true,
        resolve_carriage_return: true,
        chunk_regex: "(?s)(.*)",
      },
      error_handling: { rate_limit_patterns: [], fatal_error_patterns: [] },
      concurrency: { max_concurrent_per_account: 1 },
    };

    globalAdapterRegistry.register({
      config: mockAdapterConfig,
      resolvedExecutable: {
        isInstalled: true,
        resolvedPath: "node",
        isWindowsScript: false,
        isPowerShellScript: false,
        spawnExecutable: "node",
        spawnPrefixArgs: [],
      },
    });

    await db.insert(adapters).values({
      id: "mock-session-cli",
      name: "Mock Session CLI",
      executable: "node",
      resolvedPath: "node",
      configJson: JSON.stringify(mockAdapterConfig),
      isInstalled: true,
      status: "INSTALLED",
    }).onConflictDoNothing();

    await db.insert(accounts).values({
      id: "mock-session-acc-01",
      adapterId: "mock-session-cli",
      name: "Mock Session Account",
      sandboxDir: path.join(dataDir, "sandboxes", "mock-session-cli", "mock-session-acc-01"),
      status: "READY",
      activeSlots: 0,
      maxSlots: 1,
    }).onConflictDoNothing();

    app = createGatewayServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("identifies Turn 1 as NEW session and Turn 2 as RESUMED session with matching thread ID", async () => {
    // 1. Turn 1: Initial context / outline
    const turn1Payload = {
      model: "mock-session-cli/session-model",
      messages: [
        { role: "user", content: "Dàn ý tiểu thuyết: Tên là Hiệp sĩ Mặt Trời. Chương 1 bắt đầu ở thành phố A." },
      ],
      stream: true,
    };

    const res1 = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: turn1Payload,
    });

    expect(res1.statusCode).toBe(200);
    const sessionStatus1 = res1.headers["x-debug-session-status"];
    const sessionId1 = res1.headers["x-debug-session-id"];

    expect(sessionStatus1).toBe("NEW");
    expect(sessionId1).toBeTruthy();

    // 2. Turn 2: Follow-up command referencing Turn 1
    const turn2Payload = {
      model: "mock-session-cli/session-model",
      messages: [
        { role: "user", content: "Dàn ý tiểu thuyết: Tên là Hiệp sĩ Mặt Trời. Chương 1 bắt đầu ở thành phố A." },
        { role: "assistant", content: "Tôi đã nhận dàn ý của bạn." },
        { role: "user", content: "Dựa vào đó hãy viết chương 1." },
      ],
      stream: true,
    };

    const res2 = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: turn2Payload,
    });

    expect(res2.statusCode).toBe(200);
    const sessionStatus2 = res2.headers["x-debug-session-status"];
    const sessionId2 = res2.headers["x-debug-session-id"];

    // Assert that Turn 2 is detected as RESUMED with the EXACT SAME thread ID!
    expect(sessionStatus2).toBe("RESUMED");
    expect(sessionId2).toBe(sessionId1);
  });
});
