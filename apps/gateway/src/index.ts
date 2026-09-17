import path from "node:path";
import { createGatewayServer } from "./api/server.js";
import { env } from "./config/env.js";
import { adaptersDir, customAdaptersDir, dataDir } from "./config/paths.js";
import { runMigrations } from "./db/migrate.js";
import { loadAndSyncAllAdapters } from "./adapters/loader.js";
import { globalAdapterRegistry } from "./adapters/registry.js";
import { db, closeDatabase } from "./db/index.js";
import { accounts } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { provisionSandbox } from "./supervisor/sandbox.js";
import { reconcileLegacyAccounts } from "./adapters/reconciler.js";
import { initAdapterWatcher } from "./adapters/watcher.js";

async function bootstrap() {
  console.log("⚡ Starting cli-to-api Gateway...");

  // 1. Run database migrations
  runMigrations();

  // 2. Load and sync all declarative adapters from adapters/
  const loadedAdapters = await loadAndSyncAllAdapters([adaptersDir, customAdaptersDir]);
  globalAdapterRegistry.registerAll(loadedAdapters);
  console.log(`Loaded ${loadedAdapters.length} CLI adapter definitions from ${adaptersDir} and ${customAdaptersDir}`);

  // 3. Reconcile legacy phantom accounts for uninstalled tools
  const reconcileResult = await reconcileLegacyAccounts(loadedAdapters, dataDir);
  if (reconcileResult.purged.length > 0) {
    console.log(`🧹 Purged ${reconcileResult.purged.length} phantom accounts for uninstalled CLIs: ${reconcileResult.purged.join(", ")}`);
  }

  // 4. Ensure each INSTALLED adapter has at least one default account provisioned
  for (const adapter of loadedAdapters) {
    if (!adapter.resolvedExecutable.isInstalled) {
      console.log(`⏩ Skipping account provisioning for '${adapter.config.id}': Binary '${adapter.config.executable}' is not installed on host.`);
      continue;
    }

    const existing = await db.select().from(accounts).where(eq(accounts.adapterId, adapter.config.id));
    if (existing.length === 0) {
      const defaultAccId = `${adapter.config.id}-acc-01`;
      const sandbox = await provisionSandbox({
        dataDir,
        adapterId: adapter.config.id,
        accountId: defaultAccId,
      });

      await db.insert(accounts).values({
        id: defaultAccId,
        adapterId: adapter.config.id,
        name: `Default ${adapter.config.name} Account`,
        sandboxDir: sandbox.sandboxDir,
        status: "READY",
        maxSlots: adapter.config.concurrency.max_concurrent_per_account,
      });
      console.log(`✨ Provisioned verified sandbox for default account: ${defaultAccId}`);
    }
  }

  // 5. Setup dynamic file watcher for adapter hot-reloading
  const unwatch = initAdapterWatcher([adaptersDir, customAdaptersDir], async () => {
    console.log("🔄 Adapter configuration change detected. Hot-reloading registry...");
    const reloaded = await loadAndSyncAllAdapters([adaptersDir, customAdaptersDir]);
    globalAdapterRegistry.registerAll(reloaded);
    await reconcileLegacyAccounts(reloaded, dataDir);
  });

  // 6. Start HTTP & WebSocket server
  const app = createGatewayServer();
  await app.listen({ port: env.PORT, host: env.HOST });
  console.log(`🚀 cli-to-api Gateway listening at http://${env.HOST}:${env.PORT}`);
  console.log(`🔑 Default API Key: Bearer ${env.DEFAULT_API_KEY}`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    try {
      unwatch();
    } catch {
      // Ignore unwatch error
    }
    try {
      await app.close();
    } catch (err) {
      console.error("Error closing gateway HTTP server:", err);
    }
    try {
      closeDatabase();
    } catch (err) {
      console.error("Error closing database:", err);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
