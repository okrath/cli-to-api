import { describe, it, expect, beforeAll } from "vitest";
import { globalAccountPool } from "../../apps/gateway/src/router/account-pool.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { db } from "../../apps/gateway/src/db/index.js";
import { adapters, accounts } from "../../apps/gateway/src/db/schema.js";
import { eq } from "drizzle-orm";

describe("AccountPool & Slot Semaphore", () => {
  beforeAll(async () => {
    runMigrations();
    // Insert test adapter and account
    await db.insert(adapters).values({
      id: "pool-adapter",
      name: "Pool Adapter",
      version: "1.0.0",
      executable: "node",
      resolvedPath: "node",
      executionMode: "pipe",
      configJson: "{}",
    }).onConflictDoNothing();

    await db.insert(accounts).values({
      id: "pool-acc-1",
      adapterId: "pool-adapter",
      name: "Pool Account 1",
      sandboxDir: "./data/sandboxes/pool-adapter/pool-acc-1",
      status: "READY",
      maxSlots: 1,
      activeSlots: 0,
    }).onConflictDoNothing();
  });

  it("acquires slot when available and blocks when full", async () => {
    const accountId = "pool-acc-1";
    // First acquisition: should succeed
    const firstAcquire = await globalAccountPool.acquireSlot(accountId, 1);
    expect(firstAcquire).toBe(true);
    expect(globalAccountPool.getActiveSlots(accountId)).toBe(1);

    // Second acquisition: should be blocked by semaphore
    const secondAcquire = await globalAccountPool.acquireSlot(accountId, 1);
    expect(secondAcquire).toBe(false);

    // Release slot
    await globalAccountPool.releaseSlot(accountId);
    expect(globalAccountPool.getActiveSlots(accountId)).toBe(0);

    // Can acquire again after release
    const reAcquire = await globalAccountPool.acquireSlot(accountId, 1);
    expect(reAcquire).toBe(true);

    // Clean up
    await globalAccountPool.releaseSlot(accountId);
  });
});
