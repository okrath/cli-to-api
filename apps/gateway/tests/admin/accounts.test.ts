import { rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GatewayConfig } from "../../src/config.js";
import type { DbHandle } from "../../src/db/db.js";
import { groupTargets, groups } from "../../src/db/schema.js";
import {
  adminHeaders,
  adminToken,
  buildAdminApp,
  makeAdminTestEnv,
} from "./helpers.js";

describe("admin accounts routes", () => {
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

  it("rejects unauthenticated access", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/accounts" });
    expect(res.statusCode).toBe(401);
  });

  it("creates, lists, patches, resets cooldown, and deletes accounts", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/admin/accounts",
      headers: adminHeaders(token),
      payload: { adapterId: "claude-code", name: "Primary Account", maxConcurrent: 2 },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as { id: string; adapterId: string; active: number; maxConcurrent: number };
    expect(created.id).toBe("claude-code-primary-account");
    expect(created.adapterId).toBe("claude-code");
    expect(created.active).toBe(0);
    expect(created.maxConcurrent).toBe(2);

    const list = await app.inject({
      method: "GET",
      url: "/admin/accounts",
      headers: adminHeaders(token),
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as unknown[]).length).toBe(1);

    const patch = await app.inject({
      method: "PATCH",
      url: `/admin/accounts/${created.id}`,
      headers: adminHeaders(token),
      payload: { name: "Renamed", enabled: false },
    });
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as { name: string; enabled: boolean }).name).toBe("Renamed");
    expect((patch.json() as { enabled: boolean }).enabled).toBe(false);

    db.db.insert(groups).values({ id: "group:temp", name: "Temp", enabled: true }).run();
    db.db
      .insert(groupTargets)
      .values({
        id: "tgt_test",
        groupId: "group:temp",
        tier: 1,
        accountId: created.id,
        adapterId: "claude-code",
        modelId: "sonnet",
        enabled: true,
      })
      .run();

    const reset = await app.inject({
      method: "POST",
      url: `/admin/accounts/${created.id}/reset-cooldown`,
      headers: adminHeaders(token),
    });
    expect(reset.statusCode).toBe(200);

    const del = await app.inject({
      method: "DELETE",
      url: `/admin/accounts/${created.id}?purge=1`,
      headers: adminHeaders(token),
    });
    expect(del.statusCode).toBe(204);

    const target = db.db.select().from(groupTargets).where(eq(groupTargets.id, "tgt_test")).get();
    expect(target?.accountId).toBeNull();
  });
});
