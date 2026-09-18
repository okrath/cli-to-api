import { rmSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GatewayConfig } from "../../src/config.js";
import type { DbHandle } from "../../src/db/db.js";
import { adminHeaders, adminToken, buildAdminApp, makeAdminTestEnv } from "./helpers.js";

describe("admin system routes", () => {
  let config: GatewayConfig;
  let db: DbHandle;
  let dataDir: string;
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    ({ config, db, dataDir } = makeAdminTestEnv());
    app = await buildAdminApp(config, db);
    token = await adminToken(app);
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns adapters, settings, and live requests", async () => {
    const adapters = await app.inject({
      method: "GET",
      url: "/admin/adapters",
      headers: adminHeaders(token),
    });
    expect(adapters.statusCode).toBe(200);
    const adapterRows = adapters.json() as Array<{ id: string; models: unknown[] }>;
    expect(adapterRows.some((row) => row.id === "claude-code")).toBe(true);
    expect(adapterRows[0]?.models.length).toBeGreaterThan(0);

    const refresh = await app.inject({
      method: "POST",
      url: "/admin/adapters/refresh",
      headers: adminHeaders(token),
    });
    expect(refresh.statusCode).toBe(200);

    const settings = await app.inject({
      method: "GET",
      url: "/admin/settings",
      headers: adminHeaders(token),
    });
    expect(settings.statusCode).toBe(200);
    expect((settings.json() as { defaultCooldownSec: number }).defaultCooldownSec).toBe(1800);

    const patch = await app.inject({
      method: "PATCH",
      url: "/admin/settings",
      headers: adminHeaders(token),
      payload: { sessionTtlSec: 7200 },
    });
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as { sessionTtlSec: number }).sessionTtlSec).toBe(7200);

    const live = await app.inject({
      method: "GET",
      url: "/admin/live",
      headers: adminHeaders(token),
    });
    expect(live.statusCode).toBe(200);
    expect(Array.isArray(live.json())).toBe(true);
  });
});
