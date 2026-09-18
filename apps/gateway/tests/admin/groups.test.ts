import { rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GatewayConfig } from "../../src/config.js";
import type { DbHandle } from "../../src/db/db.js";
import { groupTargets } from "../../src/db/schema.js";
import { adminHeaders, adminToken, buildAdminApp, makeAdminTestEnv } from "./helpers.js";

describe("admin groups routes", () => {
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

  it("creates, lists, replaces, and deletes groups with targets", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/admin/groups",
      headers: adminHeaders(token),
      payload: {
        slug: "default",
        name: "Default Group",
        cacheTtlSec: 60,
        targets: [
          { tier: 1, adapterId: "claude-code", modelId: "sonnet", enabled: true },
          { tier: 2, adapterId: "codex", modelId: "gpt-5", enabled: true },
        ],
      },
    });
    expect(create.statusCode).toBe(201);
    const group = create.json() as { id: string; targets: unknown[] };
    expect(group.id).toBe("group:default");
    expect(group.targets.length).toBe(2);

    const list = await app.inject({
      method: "GET",
      url: "/admin/groups",
      headers: adminHeaders(token),
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as unknown[]).length).toBe(1);

    const replace = await app.inject({
      method: "PUT",
      url: `/admin/groups/${group.id}`,
      headers: adminHeaders(token),
      payload: {
        name: "Updated Group",
        targets: [{ tier: 1, adapterId: "claude-code", modelId: "opus", enabled: true }],
      },
    });
    expect(replace.statusCode).toBe(200);
    expect((replace.json() as { name: string; targets: Array<{ modelId: string }> }).name).toBe(
      "Updated Group",
    );
    expect((replace.json() as { targets: Array<{ modelId: string }> }).targets[0]?.modelId).toBe("opus");

    const del = await app.inject({
      method: "DELETE",
      url: `/admin/groups/${group.id}`,
      headers: adminHeaders(token),
    });
    expect(del.statusCode).toBe(204);
    expect(db.db.select().from(groupTargets).where(eq(groupTargets.groupId, group.id)).all()).toEqual([]);
  });
});
