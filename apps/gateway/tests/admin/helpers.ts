import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { GatewayConfig } from "../../src/config.js";
import { openDb, type DbHandle } from "../../src/db/db.js";
import { runMigrations } from "../../src/db/migrate.js";
import { buildServer } from "../../src/server.js";

export function makeAdminTestEnv() {
  const dataDir = mkdtempSync(join(tmpdir(), "cli-to-api-admin-"));
  const config: GatewayConfig = {
    port: 0,
    host: "127.0.0.1",
    dataDir,
    adminPassword: "test-admin-password",
    logLevel: "silent",
    dbPath: join(dataDir, "cli-to-api.db"),
    repoRoot: join(import.meta.dirname, "../../../.."),
    mcpBaseUrl: "http://127.0.0.1:0",
  };
  const db = openDb(config.dbPath);
  runMigrations(db);
  return { config, db, dataDir };
}

export async function buildAdminApp(config: GatewayConfig, db: DbHandle): Promise<FastifyInstance> {
  return buildServer({ config, db, version: "test" });
}

export async function adminToken(app: FastifyInstance): Promise<string> {
  const login = await app.inject({
    method: "POST",
    url: "/admin/login",
    payload: { password: "test-admin-password" },
  });
  const body = login.json() as { token: string };
  return body.token;
}

export function adminHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
