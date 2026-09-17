import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { globalCooldownTracker } from "../../apps/gateway/src/router/cooldown-tracker.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { db } from "../../apps/gateway/src/db/index.js";
import { adapters, accounts } from "../../apps/gateway/src/db/schema.js";

describe("CooldownTracker State Machine", () => {
  const accountId = "cd-test-acc-1";

  beforeAll(async () => {
    runMigrations();
    await db.insert(adapters).values({
      id: "cd-adapter",
      name: "CD Adapter",
      version: "1.0.0",
      executable: "node",
      resolvedPath: "node",
      executionMode: "pipe",
      configJson: "{}",
    }).onConflictDoNothing();

    await db.insert(accounts).values({
      id: accountId,
      adapterId: "cd-adapter",
      name: "CD Account 1",
      sandboxDir: "./data/sandboxes/cd-adapter/cd-test-acc-1",
      status: "READY",
      maxSlots: 1,
      activeSlots: 0,
    }).onConflictDoNothing();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("transitions account to COOLDOWN with timer and recovers back to READY", async () => {
    vi.useFakeTimers();

    // Trigger cooldown for 1800s (30m)
    await globalCooldownTracker.triggerCooldown(accountId, 1800, "Rate limit reached");

    const inCooldown = await globalCooldownTracker.isAccountInCooldown(accountId);
    expect(inCooldown).toBe(true);

    const remaining = await globalCooldownTracker.getCooldownRemainingSeconds(accountId);
    expect(remaining).toBeGreaterThan(1700);

    // Advance clock by 1800 seconds
    await vi.advanceTimersByTimeAsync(1801 * 1000);

    // Account should be auto-recovered to READY
    const afterCooldown = await globalCooldownTracker.isAccountInCooldown(accountId);
    expect(afterCooldown).toBe(false);
  });

  it("supports manual cooldown clear", async () => {
    await globalCooldownTracker.triggerCooldown(accountId, 3600, "Forced cooldown");
    expect(await globalCooldownTracker.isAccountInCooldown(accountId)).toBe(true);

    await globalCooldownTracker.clearCooldown(accountId);
    expect(await globalCooldownTracker.isAccountInCooldown(accountId)).toBe(false);
  });
});
