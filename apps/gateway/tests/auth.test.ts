import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiKey, hashKey } from "../src/auth/api-key-auth.js";
import type { GatewayConfig } from "../src/config.js";
import { openDb, type DbHandle } from "../src/db/db.js";
import { runMigrations } from "../src/db/migrate.js";
import { apiKeys } from "../src/db/schema.js";
import { buildServer } from "../src/server.js";

describe("auth routes", () => {
  let dataDir: string;
  let db: DbHandle;
  let app: FastifyInstance;
  let apiKeyPlaintext: string;

  const config: GatewayConfig = {
    port: 0,
    host: "127.0.0.1",
    dataDir: "",
    adminPassword: "test-admin-password",
    logLevel: "silent",
    dbPath: "",
    repoRoot: join(import.meta.dirname, "../../.."),
  };

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "cli-to-api-auth-"));
    config.dataDir = dataDir;
    config.dbPath = join(dataDir, "cli-to-api.db");
    db = openDb(config.dbPath);
    runMigrations(db);

    const created = createApiKey();
    apiKeyPlaintext = created.plaintext;
    db.db
      .insert(apiKeys)
      .values({
        id: created.id,
        keyHash: hashKey(created.plaintext),
        keyPrefix: created.prefix,
        name: "test",
        enabled: true,
        createdAt: Date.now(),
      })
      .run();

    app = await buildServer({ config, db, version: "test" });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("accepts valid admin login and rejects invalid password", async () => {
    const ok = await app.inject({
      method: "POST",
      url: "/admin/login",
      payload: { password: "test-admin-password" },
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json() as { token: string; expiresAt: number };
    expect(body.token.startsWith("adm_")).toBe(true);
    expect(body.expiresAt).toBeGreaterThan(Date.now());

    const bad = await app.inject({
      method: "POST",
      url: "/admin/login",
      payload: { password: "wrong-password" },
    });
    expect(bad.statusCode).toBe(401);
  });

  it("requires admin token for protected admin routes", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/admin/login",
      payload: { password: "test-admin-password" },
    });
    const { token } = login.json() as { token: string };

    const unauthorized = await app.inject({ method: "GET", url: "/admin/x" });
    expect(unauthorized.statusCode).toBe(401);

    const authorized = await app.inject({
      method: "GET",
      url: "/admin/x",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.headers["x-cta-request-id"]).toBeTruthy();
  });

  it("accepts valid API keys and rejects invalid ones", async () => {
    const unauthorized = await app.inject({ method: "GET", url: "/v1/models" });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toEqual({
      error: { message: "Missing API key", type: "authentication_error" },
    });

    const bad = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer sk-cta-invalid" },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toEqual({
      error: { message: "Invalid API key", type: "authentication_error" },
    });

    const ok = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { "x-api-key": apiKeyPlaintext },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ object: "list" });
  });
});
