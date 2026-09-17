import { describe, it, expect } from "vitest";
import { db, sqlite, closeDatabase } from "../../apps/gateway/src/db/index.js";
import { adapters } from "../../apps/gateway/src/db/schema.js";

describe("SQLite & Database Lifecycle Regression Guards", () => {
  it("executes transient statements without crashing during V8 garbage collection", () => {
    // In Node 24 with better-sqlite3 v11, unreferenced Statement objects caused
    // 'Assertion failed: (env) != nullptr' in RemoveEnvironmentCleanupHook during GC.
    // This test verifies statement execution and subsequent GC is safe.
    sqlite.exec("CREATE TABLE IF NOT EXISTS _lifecycle_test (id INTEGER PRIMARY KEY, name TEXT);");

    for (let i = 0; i < 50; i++) {
      const stmt = sqlite.prepare("INSERT INTO _lifecycle_test (name) VALUES (?)");
      stmt.run(`item-${i}`);
    }

    // Run queries in a scoped closure so statement handles become eligible for GC
    (() => {
      for (let i = 0; i < 50; i++) {
        const stmt = sqlite.prepare("SELECT * FROM _lifecycle_test WHERE id = ?");
        const res = stmt.get(i + 1);
        expect(res).toBeDefined();
      }
    })();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const countStmt = sqlite.prepare("SELECT count(*) as count FROM _lifecycle_test");
    const result = countStmt.get() as { count: number };
    expect(result.count).toBeGreaterThanOrEqual(50);

    // Clean up test table
    sqlite.exec("DROP TABLE IF EXISTS _lifecycle_test;");
  });

  it("can query through Drizzle ORM instance safely", async () => {
    const list = await db.select().from(adapters);
    expect(Array.isArray(list)).toBe(true);
  });

  it("exports closeDatabase function for clean shutdown", () => {
    expect(typeof closeDatabase).toBe("function");
    expect(sqlite.open).toBe(true);
  });
});
