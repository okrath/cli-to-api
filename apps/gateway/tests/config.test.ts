import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("loadConfig", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = envBackup;
    vi.resetModules();
  });

  it("exits when ADMIN_PASSWORD is missing", async () => {
    delete process.env.ADMIN_PASSWORD;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig({ envFile: false })).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalled();

    exit.mockRestore();
    error.mockRestore();
  });

  it("loads defaults and resolves DATA_DIR under the repo root", async () => {
    process.env.ADMIN_PASSWORD = "secret-password";
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig({ envFile: false });

    expect(config.port).toBe(8080);
    expect(config.host).toBe("127.0.0.1");
    expect(config.logLevel).toBe("info");
    expect(config.dbPath.endsWith("data\\cli-to-api.db") || config.dbPath.endsWith("data/cli-to-api.db")).toBe(
      true,
    );
  });
});

describe("database migrations", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "cli-to-api-test-"));
    process.env.ADMIN_PASSWORD = "secret-password";
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("creates all schema tables and seeds settings defaults", async () => {
    process.env.DATA_DIR = dataDir;
    vi.resetModules();

    const { openDb } = await import("../src/db/db.js");
    const { runMigrations } = await import("../src/db/migrate.js");
    const dbPath = join(dataDir, "cli-to-api.db");
    const handle = openDb(dbPath);
    runMigrations(handle);

    const tables = handle.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((row) => row.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "accounts",
        "account_rate_limits",
        "api_keys",
        "group_targets",
        "groups",
        "requests",
        "response_cache",
        "sessions",
        "settings",
      ]),
    );

    const settings = handle.sqlite.prepare("SELECT key, value FROM settings ORDER BY key").all() as Array<{
      key: string;
      value: string;
    }>;
    expect(settings).toEqual([
      { key: "default_cooldown_sec", value: "1800" },
      { key: "queue_timeout_sec", value: "30" },
      { key: "request_timeout_sec", value: "600" },
      { key: "session_ttl_sec", value: "86400" },
    ]);

    handle.close();
  });
});
