import fs from "node:fs/promises";
import { db } from "../db/index.js";
import { accounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { LoadedAdapter } from "./loader.js";

export interface ReconcileResult {
  purged: string[];
  preserved: string[];
  restored: string[];
}

/**
 * Sweeps the database for phantom accounts belonging to uninstalled adapters.
 * Accounts with zero total requests are cleanly purged along with their empty sandboxes.
 * Accounts with historical requests are preserved but flagged as CLI_MISSING.
 */
export async function reconcileLegacyAccounts(
  loadedAdapters: LoadedAdapter[],
  dataDir: string
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    purged: [],
    preserved: [],
    restored: [],
  };

  const installedMap = new Map(
    loadedAdapters.map((a) => [a.config.id, a.resolvedExecutable.isInstalled])
  );

  const allAccounts = await db.select().from(accounts);

  for (const acc of allAccounts) {
    // Only evaluate accounts for adapters explicitly managed in this reconciliation pass
    if (!installedMap.has(acc.adapterId)) {
      continue;
    }

    const isInstalled = installedMap.get(acc.adapterId);

    // Scenario A: Adapter is known and verified NOT installed
    if (!isInstalled) {
      if (acc.totalRequests === 0) {
        // Safe to prune: phantom account with zero usage
        await db.delete(accounts).where(eq(accounts.id, acc.id));

        try {
          if (acc.sandboxDir && acc.sandboxDir.startsWith(dataDir)) {
            await fs.rm(acc.sandboxDir, { recursive: true, force: true });
          }
        } catch {
          // Ignore filesystem deletion errors
        }

        result.purged.push(acc.id);
      } else {
        // Preserve user history: flag as ERROR with CLI_MISSING reason
        if (acc.status !== "ERROR" || !acc.cooldownReason?.startsWith("CLI_MISSING")) {
          await db
            .update(accounts)
            .set({
              status: "ERROR",
              cooldownReason: "CLI_MISSING: Host binary is not installed on search paths",
            })
            .where(eq(accounts.id, acc.id));
        }
        result.preserved.push(acc.id);
      }
      continue;
    }

    // Scenario B: Adapter IS installed but account was previously flagged with CLI_MISSING
    if (acc.status === "ERROR" && acc.cooldownReason?.startsWith("CLI_MISSING") && isInstalled) {
      await db
        .update(accounts)
        .set({ status: "READY", cooldownReason: null })
        .where(eq(accounts.id, acc.id));
      result.restored.push(acc.id);
    }
  }

  return result;
}
