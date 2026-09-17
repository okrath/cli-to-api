import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../../db/index.js";
import { accounts, adapters } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { dataDir } from "../../config/paths.js";
import { provisionSandbox } from "../../supervisor/sandbox.js";
import { globalCooldownTracker } from "../../router/cooldown-tracker.js";
import { globalAccountPool } from "../../router/account-pool.js";
import fs from "node:fs/promises";

interface CreateAccountBody {
  id: string;
  adapterId: string;
  name: string;
  maxSlots?: number;
  customEnv?: Record<string, string>;
}

export function registerAdminAccountsRoutes(fastify: FastifyInstance): void {
  // GET /api/accounts
  fastify.get("/api/accounts", async (_req: FastifyRequest, reply: FastifyReply) => {
    const list = await db.select().from(accounts);
    const enriched = await Promise.all(
      list.map(async (acc) => {
        const remainingCooldown = await globalCooldownTracker.getCooldownRemainingSeconds(acc.id);
        const liveActiveSlots = globalAccountPool.getActiveSlots(acc.id);
        return {
          ...acc,
          activeSlots: liveActiveSlots,
          cooldownSecondsRemaining: remainingCooldown,
        };
      })
    );
    return reply.send({ accounts: enriched });
  });

  // POST /api/accounts
  fastify.post("/api/accounts", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as CreateAccountBody;
    if (!body.id || !body.adapterId || !body.name) {
      return reply.status(400).send({ error: "Missing required fields: id, adapterId, name" });
    }

    // Check adapter exists
    const adapter = await db.select().from(adapters).where(eq(adapters.id, body.adapterId));
    if (adapter.length === 0) {
      return reply.status(404).send({ error: `Adapter '${body.adapterId}' not found` });
    }

    // Provision sandbox directory jail
    const sandbox = await provisionSandbox({
      dataDir,
      adapterId: body.adapterId,
      accountId: body.id,
      customEnv: body.customEnv,
    });

    // Insert into SQLite
    await db.insert(accounts).values({
      id: body.id,
      adapterId: body.adapterId,
      name: body.name,
      sandboxDir: sandbox.sandboxDir,
      status: "READY",
      maxSlots: body.maxSlots || 1,
      activeSlots: 0,
    });

    return reply.status(201).send({
      id: body.id,
      sandboxDir: sandbox.sandboxDir,
      status: "READY",
    });
  });

  // POST /api/accounts/:id/reset-cooldown
  fastify.post("/api/accounts/:id/reset-cooldown", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    await globalCooldownTracker.clearCooldown(id);
    return reply.send({ success: true, accountId: id, status: "READY" });
  });

  // DELETE /api/accounts/:id
  fastify.delete("/api/accounts/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const target = await db.select().from(accounts).where(eq(accounts.id, id));
    if (target.length === 0) {
      return reply.status(404).send({ error: `Account '${id}' not found` });
    }

    const sandboxPath = target[0].sandboxDir;
    await db.delete(accounts).where(eq(accounts.id, id));

    try {
      await fs.rm(sandboxPath, { recursive: true, force: true });
    } catch {
      // Ignore directory removal failure
    }

    return reply.send({ success: true, deletedId: id });
  });
}
