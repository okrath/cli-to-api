import { count } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "node:path";
import type { DbHandle } from "./db.js";
import { apiKeys, settings } from "./schema.js";

const DEFAULT_SETTINGS: Record<string, string> = {
  default_cooldown_sec: "1800",
  session_ttl_sec: "86400",
  request_timeout_sec: "600",
};

export function runMigrations(handle: DbHandle): void {
  const migrationsFolder = resolve(import.meta.dirname, "../../drizzle");
  migrate(handle.db, { migrationsFolder });
  seedSettings(handle);
}

function seedSettings(handle: DbHandle): void {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    handle.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoNothing()
      .run();
  }
}

export function countApiKeys(handle: DbHandle): number {
  return handle.db.select({ value: count() }).from(apiKeys).get()?.value ?? 0;
}
