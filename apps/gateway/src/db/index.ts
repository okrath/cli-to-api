import Database, { type Database as DatabaseType } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import { dbFile, dataDir } from "../config/paths.js";
import * as schema from "./schema.js";

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const sqlite: DatabaseType = new Database(dbFile);

// Set high-concurrency PRAGMAs: busy_timeout must be set first to guard against locking contention on Windows
try {
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
} catch {
  // Ignore pragma contention if already in WAL mode from a sibling worker process
}

export const db = drizzle(sqlite, { schema });

/**
 * Gracefully close the database connection and flush pending WAL writes.
 */
export function closeDatabase(): void {
  if (sqlite.open) {
    sqlite.close();
  }
}
