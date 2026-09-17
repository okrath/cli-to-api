import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "../../apps/gateway/src/db/index.js";
import { accounts, adapters } from "../../apps/gateway/src/db/schema.js";
import { reconcileLegacyAccounts } from "../../apps/gateway/src/adapters/reconciler.js";
import { eq } from "drizzle-orm";
import { LoadedAdapter } from "../../apps/gateway/src/adapters/loader.js";
import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../../apps/gateway/src/config/paths.js";

describe("Legacy Phantom Account Reconciler", () => {
  const testSandboxBase = path.join(dataDir, "sandboxes", "test-reconciler");

  beforeEach(async () => {
    // Ensure test directory
    await fs.mkdir(testSandboxBase, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test directories
    try {
      await fs.rm(testSandboxBase, { recursive: true, force: true });
    } catch {}
  });

  it("purges zero-request accounts belonging to uninstalled adapters", async () => {
    const uninstalledAdapterId = "mock-uninstalled-cli";
    const phantomAccId = "phantom-test-acc-01";
    const phantomSandbox = path.join(testSandboxBase, "acc-01");
    await fs.mkdir(phantomSandbox, { recursive: true });

    // Seed dummy adapter
    await db.insert(adapters).values({
      id: uninstalledAdapterId,
      name: "Mock Uninstalled",
      executable: "mock-uninstalled",
      resolvedPath: "",
      configJson: "{}",
      isInstalled: false,
      status: "NOT_INSTALLED",
    }).onConflictDoNothing();

    // Seed dummy 0-request account
    await db.insert(accounts).values({
      id: phantomAccId,
      adapterId: uninstalledAdapterId,
      name: "Phantom Account",
      sandboxDir: phantomSandbox,
      totalRequests: 0,
      status: "READY",
    }).onConflictDoNothing();

    const loadedAdapters: LoadedAdapter[] = [
      {
        config: {
          id: uninstalledAdapterId,
          name: "Mock Uninstalled",
          executable: "mock-uninstalled",
        } as any,
        resolvedExecutable: {
          isInstalled: false,
          resolvedPath: null,
          isWindowsScript: false,
          isPowerShellScript: false,
          spawnExecutable: "mock-uninstalled",
          spawnPrefixArgs: [],
        },
      },
    ];

    const result = await reconcileLegacyAccounts(loadedAdapters, dataDir);

    expect(result.purged).toContain(phantomAccId);

    // Verify row deleted from database
    const rows = await db.select().from(accounts).where(eq(accounts.id, phantomAccId));
    expect(rows.length).toBe(0);
  });

  it("preserves active accounts with requests and marks them CLI_MISSING", async () => {
    const activeMissingAdapterId = "active-missing-cli";
    const activeMissingAccId = "active-missing-acc-01";
    const sandboxDir = path.join(testSandboxBase, "acc-02");
    await fs.mkdir(sandboxDir, { recursive: true });

    await db.insert(adapters).values({
      id: activeMissingAdapterId,
      name: "Active Missing",
      executable: "active-missing",
      resolvedPath: "",
      configJson: "{}",
      isInstalled: false,
      status: "NOT_INSTALLED",
    }).onConflictDoNothing();

    await db.insert(accounts).values({
      id: activeMissingAccId,
      adapterId: activeMissingAdapterId,
      name: "Active Missing Account",
      sandboxDir: sandboxDir,
      totalRequests: 15, // Has historical activity
      status: "READY",
    }).onConflictDoNothing();

    const loadedAdapters: LoadedAdapter[] = [
      {
        config: {
          id: activeMissingAdapterId,
          name: "Active Missing",
          executable: "active-missing",
        } as any,
        resolvedExecutable: {
          isInstalled: false,
          resolvedPath: null,
          isWindowsScript: false,
          isPowerShellScript: false,
          spawnExecutable: "active-missing",
          spawnPrefixArgs: [],
        },
      },
    ];

    const result = await reconcileLegacyAccounts(loadedAdapters, dataDir);

    expect(result.preserved).toContain(activeMissingAccId);

    const rows = await db.select().from(accounts).where(eq(accounts.id, activeMissingAccId));
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("ERROR");
    expect(rows[0].cooldownReason).toContain("CLI_MISSING");

    // Clean up
    await db.delete(accounts).where(eq(accounts.id, activeMissingAccId));
  });
});
