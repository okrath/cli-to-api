import { rmSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GatewayConfig } from "../../src/config.js";
import type { DbHandle } from "../../src/db/db.js";
import { adminHeaders, adminToken, buildAdminApp, makeAdminTestEnv } from "./helpers.js";

describe("admin api-keys routes", () => {
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

  it("creates a key with plaintext once and supports patch/delete", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/admin/api-keys",
      headers: adminHeaders(token),
      payload: { name: "Cursor" },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as { id: string; plaintext: string; prefix: string; name: string };
    expect(created.plaintext.startsWith("sk-cta-")).toBe(true);
    expect(created.prefix).toBe(created.plaintext.slice(0, 12));

    const list = await app.inject({
      method: "GET",
      url: "/admin/api-keys",
      headers: adminHeaders(token),
    });
    const keys = list.json() as Array<{ id: string; plaintext?: string }>;
    expect(keys.some((key) => key.id === created.id)).toBe(true);
    expect(keys.every((key) => key.plaintext === undefined)).toBe(true);

    const patch = await app.inject({
      method: "PATCH",
      url: `/admin/api-keys/${created.id}`,
      headers: adminHeaders(token),
      payload: { enabled: false, name: "Disabled" },
    });
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as { enabled: boolean; name: string }).enabled).toBe(false);

    const del = await app.inject({
      method: "DELETE",
      url: `/admin/api-keys/${created.id}`,
      headers: adminHeaders(token),
    });
    expect(del.statusCode).toBe(204);
  });

  it("creates and patches retention", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/admin/api-keys",
      headers: adminHeaders(token),
      payload: { name: "Ephemeral", retention: "ephemeral" },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as { id: string; retention: string };
    expect(created.retention).toBe("ephemeral");

    const list = await app.inject({
      method: "GET",
      url: "/admin/api-keys",
      headers: adminHeaders(token),
    });
    const keys = list.json() as Array<{ id: string; retention: string }>;
    expect(keys.find((k) => k.id === created.id)?.retention).toBe("ephemeral");

    const patch = await app.inject({
      method: "PATCH",
      url: `/admin/api-keys/${created.id}`,
      headers: adminHeaders(token),
      payload: { retention: "standard" },
    });
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as { retention: string }).retention).toBe("standard");
  });
});
