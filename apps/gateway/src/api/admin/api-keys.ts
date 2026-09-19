import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createApiKey, hashKey } from "../../auth/api-key-auth.js";
import type { DbHandle } from "../../db/db.js";
import { apiKeys, requests } from "../../db/schema.js";
import { parseBody, sendAdminError } from "./shared.js";

const createKeySchema = z.object({
  name: z.string().min(1).max(128),
  retention: z.enum(["standard", "ephemeral"]).optional(),
});

const patchKeySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  enabled: z.boolean().optional(),
  retention: z.enum(["standard", "ephemeral"]).optional(),
});

function serializeKey(row: typeof apiKeys.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.keyPrefix,
    enabled: row.enabled,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    retention: row.retention,
  };
}

export function registerApiKeyRoutes(app: FastifyInstance, handle: DbHandle): void {
  app.get("/api-keys", async () => {
    const rows = handle.db.select().from(apiKeys).all();
    return rows.map(serializeKey);
  });

  app.post("/api-keys", async (request, reply) => {
    const body = parseBody(createKeySchema, request.body, reply);
    if (!body) {
      return;
    }

    const created = createApiKey();
    const now = Date.now();
    handle.db
      .insert(apiKeys)
      .values({
        id: created.id,
        keyHash: hashKey(created.plaintext),
        keyPrefix: created.prefix,
        name: body.name,
        enabled: true,
        createdAt: now,
        retention: body.retention ?? "standard",
      })
      .run();

    reply.code(201).send({
      ...serializeKey(
        handle.db.select().from(apiKeys).where(eq(apiKeys.id, created.id)).get()!,
      ),
      plaintext: created.plaintext,
    });
  });

  app.patch("/api-keys/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = parseBody(patchKeySchema, request.body, reply);
    if (!body) {
      return;
    }

    const row = handle.db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
    if (!row) {
      sendAdminError(reply, 404, "API key not found");
      return;
    }

    const patch: Partial<typeof apiKeys.$inferInsert> = {};
    if (body.name !== undefined) {
      patch.name = body.name;
    }
    if (body.enabled !== undefined) {
      patch.enabled = body.enabled;
    }
    if (body.retention !== undefined) {
      patch.retention = body.retention;
    }

    if (Object.keys(patch).length > 0) {
      handle.db.update(apiKeys).set(patch).where(eq(apiKeys.id, id)).run();
    }

    return serializeKey(handle.db.select().from(apiKeys).where(eq(apiKeys.id, id)).get()!);
  });

  app.delete("/api-keys/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = handle.db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.id, id)).get();
    if (!row) {
      sendAdminError(reply, 404, "API key not found");
      return;
    }

    const hasUsage = handle.db
      .select({ id: requests.id })
      .from(requests)
      .where(eq(requests.apiKeyId, id))
      .limit(1)
      .get();
    if (hasUsage) {
      reply.code(409).send({ error: "API key has usage history; disable it instead" });
      return;
    }

    handle.db.delete(apiKeys).where(eq(apiKeys.id, id)).run();
    reply.code(204).send();
  });
}
