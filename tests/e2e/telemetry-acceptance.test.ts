import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { globalExecutionRegistry } from "../../apps/gateway/src/telemetry/execution-registry.js";
import { globalTelemetryQueue } from "../../apps/gateway/src/telemetry/persist-queue.js";
import { globalAdapterRegistry } from "../../apps/gateway/src/adapters/registry.js";
import { globalCooldownTracker } from "../../apps/gateway/src/router/cooldown-tracker.js";
import { projectRoot } from "../../apps/gateway/src/config/paths.js";
import { db } from "../../apps/gateway/src/db/index.js";
import { accounts, adapters } from "../../apps/gateway/src/db/schema.js";
import { eq } from "drizzle-orm";
import path from "node:path";
import type { FastifyInstance } from "fastify";

describe("Obsidian Telemetry Acceptance & Kill Benchmark Suite", () => {
  let app: FastifyInstance;
  const mockSpinnerScript = path.join(projectRoot, "tests", "mocks", "mock-spinner-cli.js");
  const mockHangingScript = path.join(projectRoot, "tests", "mocks", "mock-hanging-cli.js");

  beforeAll(async () => {
    runMigrations();

    // 1. Fast acceptance provider (spinner)
    const acceptConfig = {
      id: "accept-provider",
      name: "Acceptance Provider CLI",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe" as const,
      models: [
        {
          id: "accept-model",
          name: "Accept Model",
          tier: "low" as const,
          context_window: 64000,
          cost_weight: 1,
          is_default: true,
        },
      ],
      invocation: {
        args_template: [mockSpinnerScript, "{prompt}"],
        prompt_transport: "auto" as const,
        prompt_threshold_chars: 4000,
        working_dir_template: "{account_dir}/workspace",
        timeout_seconds: 30,
      },
      error_handling: {
        rate_limit_patterns: ["429", "rate limit"],
      },
    };

    // 2. Hanging provider for kill switch benchmark
    const hangingConfig = {
      id: "hanging-provider",
      name: "Hanging Provider CLI",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe" as const,
      models: [
        {
          id: "hanging-model",
          name: "Hanging Model",
          tier: "high" as const,
          context_window: 64000,
          cost_weight: 1,
          is_default: true,
        },
      ],
      invocation: {
        args_template: [mockHangingScript, "{prompt}"],
        prompt_transport: "auto" as const,
        prompt_threshold_chars: 4000,
        working_dir_template: "{account_dir}/workspace",
        timeout_seconds: 30,
      },
      error_handling: {
        rate_limit_patterns: ["429", "rate limit"],
      },
    };

    globalAdapterRegistry.register({
      config: acceptConfig,
      resolvedExecutable: {
        resolvedPath: "node",
        isWindowsScript: false,
        isPowerShellScript: false,
        spawnExecutable: "node",
        spawnPrefixArgs: [],
      },
    });

    globalAdapterRegistry.register({
      config: hangingConfig,
      resolvedExecutable: {
        resolvedPath: "node",
        isWindowsScript: false,
        isPowerShellScript: false,
        spawnExecutable: "node",
        spawnPrefixArgs: [],
      },
    });

    await db.insert(adapters).values([
      {
        id: "accept-provider",
        name: "Acceptance Provider CLI",
        version: "1.0.0",
        executable: "node",
        resolvedPath: "node",
        executionMode: "pipe",
        configJson: JSON.stringify(acceptConfig),
      },
      {
        id: "hanging-provider",
        name: "Hanging Provider CLI",
        version: "1.0.0",
        executable: "node",
        resolvedPath: "node",
        executionMode: "pipe",
        configJson: JSON.stringify(hangingConfig),
      },
    ]).onConflictDoNothing();

    await db.insert(accounts).values([
      {
        id: "accept-acc-01",
        adapterId: "accept-provider",
        name: "Accept Account 01",
        sandboxDir: "./data/sandboxes/accept-provider/accept-acc-01",
        status: "READY",
        maxSlots: 10,
        activeSlots: 0,
      },
      {
        id: "hanging-acc-01",
        adapterId: "hanging-provider",
        name: "Hanging Account 01",
        sandboxDir: "./data/sandboxes/hanging-provider/hanging-acc-01",
        status: "READY",
        maxSlots: 10,
        activeSlots: 0,
      },
    ]).onConflictDoNothing();

    app = createGatewayServer();
    await app.ready();
  });

  afterAll(async () => {
    globalTelemetryQueue.flushSync();
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    globalExecutionRegistry.clear();
    await globalCooldownTracker.clearCooldown("accept-acc-01");
    await globalCooldownTracker.clearCooldown("hanging-acc-01");
    await db.update(accounts).set({ status: "READY", activeSlots: 0 }).where(eq(accounts.id, "accept-acc-01"));
    await db.update(accounts).set({ status: "READY", activeSlots: 0 }).where(eq(accounts.id, "hanging-acc-01"));
  });

  it("AC-1: Chat Playground is cleanly replaced by Telemetry Station routes", async () => {
    // Admin events endpoint serves connection and snapshot
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/events?test=true",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"type":"connected"');

    // Telemetry active endpoint is active
    const activeRes = await app.inject({
      method: "GET",
      url: "/api/admin/telemetry/active",
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });
    expect(activeRes.statusCode).toBe(200);
    const activeData = JSON.parse(activeRes.body);
    expect(activeData).toHaveProperty("activeStreams");
  });

  it("AC-2 & AC-6: Low-latency PID capture and emergency kill under 200ms", async () => {
    let capturedRequestId: string | null = null;
    const streamPromise = app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-cta-admin-token",
      },
      payload: {
        model: "hanging-model",
        stream: true,
        messages: [{ role: "user", content: "Run hanging test" }],
      },
    });

    // Poll for process to register and bind PID (allows for async process spawn latency)
    let target: any = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const activeList = globalExecutionRegistry.getSnapshot();
      if (activeList.length > 0 && activeList[0].pid !== null) {
        target = activeList[0];
        break;
      }
    }

    expect(target).not.toBeNull();
    capturedRequestId = target.requestId;

    // Assert PID was bound upon launch
    expect(target.pid).toBeTypeOf("number");
    expect(target.pid).toBeGreaterThan(0);

    // Benchmark emergency kill switch
    const killStart = performance.now();
    const abortRes = await app.inject({
      method: "POST",
      url: `/api/admin/telemetry/abort/${capturedRequestId}`,
      headers: { authorization: "Bearer sk-cta-admin-token" },
    });
    const killElapsed = performance.now() - killStart;

    expect(abortRes.statusCode).toBe(200);
    const abortData = JSON.parse(abortRes.body);
    expect(abortData.success).toBe(true);
    expect(abortData.killed).toBe(true);
    expect(killElapsed).toBeLessThan(process.platform === "win32" ? 500 : 200);

    // Stream should cleanly terminate
    await streamPromise;
  });

  it("OpenAI Client Compatibility: Streaming response contains valid SSE format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-cta-admin-token",
      },
      payload: {
        model: "accept-model",
        stream: true,
        messages: [{ role: "user", content: "Quick hello" }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("data: {");
    expect(res.body).toContain("data: [DONE]");
  });
});
