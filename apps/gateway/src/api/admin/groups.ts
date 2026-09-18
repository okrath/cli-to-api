import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { adapters } from "../../adapters/index.js";
import type { DbHandle } from "../../db/db.js";
import { groupTargets, groups } from "../../db/schema.js";
import { effortSchema, parseBody, sendAdminError, slugify } from "./shared.js";

const targetAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const generateTargetId = customAlphabet(targetAlphabet, 12);

const targetSchema = z.object({
  tier: z.number().int().positive().default(1),
  accountId: z.string().nullable().optional(),
  adapterId: z.string().min(1),
  modelId: z.string().min(1),
  effortOverride: effortSchema.nullable().optional(),
  enabled: z.boolean().optional(),
});

const createGroupSchema = z.object({
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  defaultEffort: effortSchema.optional(),
  allowTools: z.boolean().optional(),
  cacheTtlSec: z.number().int().min(0).optional(),
  targets: z.array(targetSchema).default([]),
});

const replaceGroupSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().nullable().optional(),
  defaultEffort: effortSchema.nullable().optional(),
  allowTools: z.boolean().optional(),
  cacheTtlSec: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
  targets: z.array(targetSchema).default([]),
});

function validateTargets(
  targets: z.infer<typeof targetSchema>[],
  reply: Parameters<typeof sendAdminError>[0],
): boolean {
  for (const target of targets) {
    if (!(target.adapterId in adapters)) {
      sendAdminError(reply, 400, `Unknown adapter: ${target.adapterId}`);
      return false;
    }
  }
  return true;
}

function loadTargets(handle: DbHandle, groupId: string) {
  return handle.db
    .select()
    .from(groupTargets)
    .where(eq(groupTargets.groupId, groupId))
    .orderBy(asc(groupTargets.tier), asc(groupTargets.id))
    .all()
    .map((row) => ({
      id: row.id,
      tier: row.tier,
      accountId: row.accountId,
      adapterId: row.adapterId,
      modelId: row.modelId,
      effortOverride: row.effortOverride,
      enabled: row.enabled,
    }));
}

function serializeGroup(
  row: typeof groups.$inferSelect,
  targets: ReturnType<typeof loadTargets>,
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    defaultEffort: row.defaultEffort,
    allowTools: row.allowTools,
    cacheTtlSec: row.cacheTtlSec,
    enabled: row.enabled,
    targets,
  };
}

function insertTargets(
  tx: Parameters<Parameters<DbHandle["db"]["transaction"]>[0]>[0],
  groupId: string,
  targets: z.infer<typeof targetSchema>[],
): void {
  for (const target of targets) {
    tx.insert(groupTargets)
      .values({
        id: `tgt_${generateTargetId()}`,
        groupId,
        tier: target.tier,
        accountId: target.accountId ?? null,
        adapterId: target.adapterId,
        modelId: target.modelId,
        effortOverride: target.effortOverride ?? null,
        enabled: target.enabled ?? true,
      })
      .run();
  }
}

export function registerGroupRoutes(app: FastifyInstance, handle: DbHandle): void {
  app.get("/groups", async () => {
    const rows = handle.db.select().from(groups).all();
    return rows.map((row) => serializeGroup(row, loadTargets(handle, row.id)));
  });

  app.post("/groups", async (request, reply) => {
    const body = parseBody(createGroupSchema, request.body, reply);
    if (!body) {
      return;
    }

    const slug = slugify(body.slug);
    const id = `group:${slug}`;
    const existing = handle.db.select({ id: groups.id }).from(groups).where(eq(groups.id, id)).get();
    if (existing) {
      sendAdminError(reply, 409, `Group already exists: ${id}`);
      return;
    }

    if (!validateTargets(body.targets, reply)) {
      return;
    }

    handle.db.transaction((tx) => {
      tx.insert(groups)
        .values({
          id,
          name: body.name,
          description: body.description ?? null,
          defaultEffort: body.defaultEffort ?? null,
          allowTools: body.allowTools ?? false,
          cacheTtlSec: body.cacheTtlSec ?? 0,
          enabled: true,
        })
        .run();
      insertTargets(tx, id, body.targets);
    });

    const row = handle.db.select().from(groups).where(eq(groups.id, id)).get()!;
    reply.code(201).send(serializeGroup(row, loadTargets(handle, id)));
  });

  app.put("/groups/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = parseBody(replaceGroupSchema, request.body, reply);
    if (!body) {
      return;
    }

    const row = handle.db.select().from(groups).where(eq(groups.id, id)).get();
    if (!row) {
      sendAdminError(reply, 404, "Group not found");
      return;
    }

    if (!validateTargets(body.targets, reply)) {
      return;
    }

    handle.db.transaction((tx) => {
      tx.delete(groupTargets).where(eq(groupTargets.groupId, id)).run();
      tx.update(groups)
        .set({
          name: body.name,
          description: body.description ?? null,
          defaultEffort: body.defaultEffort ?? null,
          allowTools: body.allowTools ?? row.allowTools,
          cacheTtlSec: body.cacheTtlSec ?? row.cacheTtlSec,
          enabled: body.enabled ?? row.enabled,
        })
        .where(eq(groups.id, id))
        .run();
      insertTargets(tx, id, body.targets);
    });

    const updated = handle.db.select().from(groups).where(eq(groups.id, id)).get()!;
    return serializeGroup(updated, loadTargets(handle, id));
  });

  app.delete("/groups/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = handle.db.select({ id: groups.id }).from(groups).where(eq(groups.id, id)).get();
    if (!row) {
      sendAdminError(reply, 404, "Group not found");
      return;
    }

    handle.db.transaction((tx) => {
      tx.delete(groupTargets).where(eq(groupTargets.groupId, id)).run();
      tx.delete(groups).where(eq(groups.id, id)).run();
    });

    reply.code(204).send();
  });
}
