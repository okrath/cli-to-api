import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { globalPipelineStore } from "../../apps/gateway/src/router/pipeline-store.js";
import { db } from "../../apps/gateway/src/db/index.js";
import { adapters, accounts } from "../../apps/gateway/src/db/schema.js";

describe("Routing Groups SQLite Schema & PipelineStore Lifecycle", () => {
  beforeAll(async () => {
    runMigrations();

    // Ensure mock adapter and account exist for target relations
    await db
      .insert(adapters)
      .values({
        id: "test-adapter",
        name: "Test Adapter",
        version: "1.0.0",
        executable: "echo",
        resolvedPath: "echo",
        executionMode: "pipe",
        configJson: "{}",
        isInstalled: true,
        status: "INSTALLED",
      })
      .onConflictDoNothing();

    await db
      .insert(accounts)
      .values({
        id: "test-acc-1",
        adapterId: "test-adapter",
        name: "Test Account 1",
        sandboxDir: "/tmp/sandbox1",
        status: "READY",
        activeSlots: 0,
        maxSlots: 2,
      })
      .onConflictDoNothing();
  });

  it("creates a routing pipeline with targets and retrieves it", async () => {
    const pipelineId = `group:test-flow-${Date.now()}`;
    const created = await globalPipelineStore.createPipeline({
      id: pipelineId,
      name: "Test Flow",
      description: "Pipeline for unit testing",
      virtualModelId: `virt-${Date.now()}`,
      defaultEffortLevel: "high",
      fallbackPolicy: "cascade_failover",
      targets: [
        {
          targetKind: "ACCOUNT",
          priorityTier: 1,
          weight: 70,
          adapterId: "test-adapter",
          modelId: "test-model-a",
          targetAccountId: "test-acc-1",
          effortOverride: "medium",
        },
        {
          targetKind: "CLI",
          priorityTier: 2,
          weight: 30,
          adapterId: "test-adapter",
          modelId: "test-model-b",
          effortOverride: "high",
        },
      ],
    });

    expect(created).toBeDefined();
    expect(created?.id).toBe(pipelineId);
    expect(created?.defaultEffortLevel).toBe("high");
    expect(created?.targets).toHaveLength(2);
    expect(created?.targets[0].priorityTier).toBe(1);
    expect(created?.targets[0].weight).toBe(70);
    expect(created?.targets[0].effortOverride).toBe("medium");

    // Fetch by virtualModelId
    const byVirtual = await globalPipelineStore.getPipelineByVirtualModel(created!.virtualModelId);
    expect(byVirtual).toBeDefined();
    expect(byVirtual?.id).toBe(pipelineId);

    // Update pipeline
    const updated = await globalPipelineStore.updatePipeline(pipelineId, {
      name: "Updated Flow",
      defaultEffortLevel: "low",
      targets: [
        {
          targetKind: "MODEL",
          priorityTier: 1,
          weight: 100,
          adapterId: "test-adapter",
          modelId: "test-model-c",
        },
      ],
    });

    expect(updated?.name).toBe("Updated Flow");
    expect(updated?.defaultEffortLevel).toBe("low");
    expect(updated?.targets).toHaveLength(1);
    expect(updated?.targets[0].modelId).toBe("test-model-c");

    // Test record and list failover events
    await globalPipelineStore.recordFailoverEvent({
      pipelineId,
      requestId: "req-123",
      fromAccountId: "test-acc-1",
      toAccountId: "test-acc-2",
      triggerReason: "SPAWN_RATE_LIMIT",
      failoverLatencyMs: 42,
    });

    const events = await globalPipelineStore.listFailoverEvents(pipelineId);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].triggerReason).toBe("SPAWN_RATE_LIMIT");
    expect(events[0].failoverLatencyMs).toBe(42);

    // Delete pipeline and verify cascade deletion of targets
    const deleted = await globalPipelineStore.deletePipeline(pipelineId);
    expect(deleted).toBe(true);

    const checkGone = await globalPipelineStore.getPipeline(pipelineId);
    expect(checkGone).toBeNull();
  });
});
