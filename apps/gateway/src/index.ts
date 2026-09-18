import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { refreshAdapterDetection } from "./adapters/index.js";
import { bootstrapApiKeyIfEmpty } from "./auth/api-key-auth.js";
import { purgeExpiredCache } from "./cache/response-cache.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db/db.js";
import { runMigrations } from "./db/migrate.js";
import { purgeExpiredSessions } from "./sessions/session-store.js";
import { buildServer } from "./server.js";

function readVersion(): string {
  try {
    const pkgPath = resolve(import.meta.dirname, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  runMigrations(db);

  const app = await buildServer({ config, db, version: readVersion() });
  await bootstrapApiKeyIfEmpty(db, config.dataDir, app.log);

  await app.listen({ port: config.port, host: config.host });

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    purgeExpiredSessions(db, now);
    purgeExpiredCache(db, now);
    refreshAdapterDetection();
  }, 3_600_000);
  cleanupTimer.unref();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    clearInterval(cleanupTimer);
    app.log.info({ signal }, "Shutting down");
    try {
      await app.close();
    } catch (err) {
      app.log.error({ err }, "Error closing server");
    }
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
