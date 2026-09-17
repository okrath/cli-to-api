import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { globalTelemetryQueue } from "../../apps/gateway/src/telemetry/persist-queue.js";
import { globalTelemetryStore } from "../../apps/gateway/src/telemetry/telemetry-store.js";
import { globalAdapterRegistry } from "../../apps/gateway/src/adapters/registry.js";
import { db, sqlite } from "../../apps/gateway/src/db/index.js";
import { accounts, adapters } from "../../apps/gateway/src/db/schema.js";
import { globalCooldownTracker } from "../../apps/gateway/src/router/cooldown-tracker.js";
import { eq } from "drizzle-orm";
import { projectRoot } from "../../apps/gateway/src/config/paths.js";
import path from "node:path";
import type { FastifyInstance } from "fastify";

describe("Telemetry Concurrency Stress Suite (50 Parallel Requests)", () => {
  let app: FastifyInstance;
  const mockScript = path.join(projectRoot, "tests", "mocks", "mock-spinner-cli.js");

  beforeAll(async () => {
    runMigrations();

    // Register high-capacity mock adapter
    const testConfig = {
      id: "stress-provider",
      name: "Stress Provider CLI",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe" as const,
      models: [
        {
          id: "stress-model",
          name: "Stress Model",
          tier: "low" as const,
          context_window: 64000,
          cost_weight: 1,
          is_default: true,
        },
      ],
      invocation: {
        args_template: [mockScript, "{prompt}"],
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
      config: testConfig,
      resolvedExecutable: { resolvedPath: "node", isWindowsScript: false, isPowerShellScript: false, spawnExecutable: "node", spawnPrefixArgs: [] },
    });

    await db.insert(adapters).values({
      id: "stress-provider",
      name: "Stress Provider CLI",
      version: "1.0.0",
      executable: "node",
      resolvedPath: "node",
      executionMode: "pipe",
      configJson: JSON.stringify(testConfig),
    }).onConflictDoNothing();
    await db.delete(accounts).where(eq(accounts.id, "stress-acc-01"));
    await globalCooldownTracker.clearCooldown("stress-acc-01");
    sqlite.prepare("DELETE FROM request_metrics WHERE adapter_id = 'stress-provider'").run();

    await db.insert(accounts).values({
      id: "stress-acc-01",
      adapterId: "stress-provider",
      name: "Stress Account 01",
      sandboxDir: "./data/sandboxes/stress-provider/stress-acc-01",
      status: "READY",
      maxSlots: 100, // High slot capacity for concurrency test
      activeSlots: 0,
    }).onConflictDoNothing();

    app = createGatewayServer();
    await app.ready();
  });

  afterAll(async () => {
    globalTelemetryQueue.flushSync();
    if (app) {
      await app.close();
    }
  });

  it("should handle 50 concurrent requests without any SQLITE_BUSY locks", async () => {
    const concurrentRequests = 50;
    const initialSummary = globalTelemetryStore.getSummary();
    const initialRequests = initialSummary.total_requests || 0;

    const requestPromises = Array.from({ length: concurrentRequests }).map(async (_, idx) => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-cta-admin-token",
        },
        payload: {
          model: "stress-model",
          stream: true,
          messages: [{ role: "user", content: `Stress test prompt index ${idx}` }],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("data: [DONE]");
      return res;
    });

    // Await all 50 requests finishing concurrently
    await Promise.all(requestPromises);

    // Flush persist queue
    await globalTelemetryQueue.flush();

    // Verify 50 new records persisted into SQLite
    const ledger = globalTelemetryStore.queryLedger({ adapterId: "stress-provider", limit: 100 });
    expect(ledger.total).toBe(concurrentRequests);

    // Verify SQLite WAL integrity
    const walCheck = sqlite.pragma("quick_check") as Array<{ quick_check: string }>;
    expect(walCheck[0].quick_check).toBe("ok");
  }, 30000);
});
