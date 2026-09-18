import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { rmSync } from "node:fs";
import { z } from "zod";
import { adapters } from "../../adapters/index.js";
import type { GatewayConfig } from "../../config.js";
import type { DbHandle } from "../../db/db.js";
import { accountRateLimits, accounts, groupTargets, sessions } from "../../db/schema.js";
import { getActiveCount } from "../../router/slots.js";
import { ensureSandbox } from "../../runner/sandbox.js";
import { parseBody, sendAdminError, slugify } from "./shared.js";

const createAccountSchema = z.object({
  adapterId: z.string().min(1),
  name: z.string().min(1).max(128),
  maxConcurrent: z.number().int().positive().optional(),
  useHostProfile: z.boolean().optional(),
});

const patchAccountSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  maxConcurrent: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
});

type RateLimitRow = {
  name: string;
  utilization: number;
  resetsAt: number;
  observedAt: number;
};

function listRateLimitsForAccounts(handle: DbHandle, accountIds: string[]): Map<string, RateLimitRow[]> {
  const map = new Map<string, RateLimitRow[]>();
  for (const id of accountIds) {
    map.set(id, []);
  }
  if (accountIds.length === 0) {
    return map;
  }

  const rows = handle.db
    .select({
      accountId: accountRateLimits.accountId,
      name: accountRateLimits.windowName,
      utilization: accountRateLimits.utilization,
      resetsAt: accountRateLimits.resetsAt,
      observedAt: accountRateLimits.observedAt,
    })
    .from(accountRateLimits)
    .where(inArray(accountRateLimits.accountId, accountIds))
    .all();

  for (const row of rows) {
    map.get(row.accountId)!.push({
      name: row.name,
      utilization: row.utilization,
      resetsAt: row.resetsAt,
      observedAt: row.observedAt,
    });
  }
  return map;
}

function listRateLimits(handle: DbHandle, accountId: string): RateLimitRow[] {
  return listRateLimitsForAccounts(handle, [accountId]).get(accountId) ?? [];
}

function serializeAccount(
  row: typeof accounts.$inferSelect,
  active: number,
  rateLimits: ReturnType<typeof listRateLimits>,
) {
  return {
    id: row.id,
    adapterId: row.adapterId,
    name: row.name,
    sandboxDir: row.sandboxDir,
    maxConcurrent: row.maxConcurrent,
    cooldownUntil: row.cooldownUntil,
    cooldownReason: row.cooldownReason,
    enabled: row.enabled,
    useHostProfile: row.useHostProfile,
    createdAt: row.createdAt,
    active,
    rateLimits,
  };
}

export function registerAccountRoutes(
  app: FastifyInstance,
  handle: DbHandle,
  config: GatewayConfig,
): void {
  app.get("/accounts", async () => {
    const rows = handle.db.select().from(accounts).all();
    const rateLimitsByAccount = listRateLimitsForAccounts(
      handle,
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      serializeAccount(row, getActiveCount(row.id), rateLimitsByAccount.get(row.id) ?? []),
    );
  });

  app.post("/accounts", async (request, reply) => {
    const body = parseBody(createAccountSchema, request.body, reply);
    if (!body) {
      return;
    }

    if (!(body.adapterId in adapters)) {
      sendAdminError(reply, 400, `Unknown adapter: ${body.adapterId}`);
      return;
    }

    const useHostProfile = body.useHostProfile ?? false;
    if (useHostProfile) {
      const existingHost = handle.db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.adapterId, body.adapterId), eq(accounts.useHostProfile, true)))
        .get();
      if (existingHost) {
        sendAdminError(
          reply,
          409,
          `A host-profile account already exists for adapter ${body.adapterId}: ${existingHost.id}`,
        );
        return;
      }
    }

    const id = `${body.adapterId}-${slugify(body.name)}`;
    const existing = handle.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).get();
    if (existing) {
      sendAdminError(reply, 409, `Account already exists: ${id}`);
      return;
    }

    const sandbox = ensureSandbox(config.dataDir, body.adapterId, id);
    const now = Date.now();
    handle.db
      .insert(accounts)
      .values({
        id,
        adapterId: body.adapterId,
        name: body.name,
        sandboxDir: sandbox.accountDir,
        maxConcurrent: body.maxConcurrent ?? 1,
        enabled: true,
        useHostProfile,
        createdAt: now,
      })
      .run();

    const row = handle.db.select().from(accounts).where(eq(accounts.id, id)).get()!;
    reply.code(201).send(serializeAccount(row, 0, []));
  });

  app.patch("/accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = parseBody(patchAccountSchema, request.body, reply);
    if (!body) {
      return;
    }

    const row = handle.db.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!row) {
      sendAdminError(reply, 404, "Account not found");
      return;
    }

    const patch: Partial<typeof accounts.$inferInsert> = {};
    if (body.name !== undefined) {
      patch.name = body.name;
    }
    if (body.maxConcurrent !== undefined) {
      patch.maxConcurrent = body.maxConcurrent;
    }
    if (body.enabled !== undefined) {
      patch.enabled = body.enabled;
    }

    if (Object.keys(patch).length > 0) {
      handle.db.update(accounts).set(patch).where(eq(accounts.id, id)).run();
    }

    const updated = handle.db.select().from(accounts).where(eq(accounts.id, id)).get()!;
    return serializeAccount(updated, getActiveCount(id), listRateLimits(handle, id));
  });

  app.post("/accounts/:id/reset-cooldown", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = handle.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).get();
    if (!row) {
      sendAdminError(reply, 404, "Account not found");
      return;
    }

    handle.db
      .update(accounts)
      .set({ cooldownUntil: null, cooldownReason: null })
      .where(eq(accounts.id, id))
      .run();

    const updated = handle.db.select().from(accounts).where(eq(accounts.id, id)).get()!;
    return serializeAccount(updated, getActiveCount(id), listRateLimits(handle, id));
  });

  app.delete("/accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { purge?: string };
    const row = handle.db.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!row) {
      sendAdminError(reply, 404, "Account not found");
      return;
    }

    handle.db.transaction((tx) => {
      tx.update(groupTargets).set({ accountId: null }).where(eq(groupTargets.accountId, id)).run();
      tx.delete(sessions).where(eq(sessions.accountId, id)).run();
      tx.delete(accountRateLimits).where(eq(accountRateLimits.accountId, id)).run();
      tx.delete(accounts).where(eq(accounts.id, id)).run();
    });

    if (query.purge === "1") {
      try {
        rmSync(row.sandboxDir, { recursive: true, force: true });
      } catch {
        // Best effort; row is already deleted.
      }
    }

    reply.code(204).send();
  });
}
