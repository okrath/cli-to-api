import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import { globalAdapterRegistry } from "../../adapters/registry.js";
import { loadAndSyncAllAdapters } from "../../adapters/loader.js";
import { resolveBinary } from "../../adapters/resolver.js";
import { probeExecutable } from "../../adapters/prober.js";
import { reconcileLegacyAccounts } from "../../adapters/reconciler.js";
import { AdapterConfigSchema } from "../../adapters/schema.js";
import { adaptersDir, customAdaptersDir, dataDir } from "../../config/paths.js";
import { db } from "../../db/index.js";
import { accounts, adapters } from "../../db/schema.js";
import { globalAdminEventBus } from "./admin-events.js";
import { provisionSandbox } from "../../supervisor/sandbox.js";
import { eq } from "drizzle-orm";

export function registerAdminAdaptersRoutes(fastify: FastifyInstance): void {
  // GET /api/adapters
  fastify.get("/api/adapters", async (_req: FastifyRequest, reply: FastifyReply) => {
    const list = globalAdapterRegistry.getAllAdapters();
    const dbAccounts = await db.select().from(accounts);
    const dbAdapters = await db.select().from(adapters);
    const dbAdapterMap = new Map(dbAdapters.map((a) => [a.id, a]));

    const formatted = list.map((a) => {
      const dbRecord = dbAdapterMap.get(a.config.id);
      const linkedAccounts = dbAccounts.filter((acc) => acc.adapterId === a.config.id);
      const isInstalled = a.resolvedExecutable.isInstalled ?? Boolean(a.resolvedExecutable.resolvedPath);

      return {
        id: a.config.id,
        name: a.config.name,
        version: a.config.version,
        executable: a.config.executable,
        executionMode: a.config.execution_mode,
        models: a.config.models,
        resolvedPath: a.resolvedExecutable.resolvedPath,
        isInstalled,
        status: isInstalled ? "INSTALLED" : "NOT_INSTALLED",
        detectedVersion: dbRecord?.detectedVersion ?? null,
        lastProbedAt: dbRecord?.lastProbedAt ?? null,
        isCustom: dbRecord?.isCustom ?? false,
        accountsCount: linkedAccounts.length,
        hasHealthyAccounts: linkedAccounts.some((acc) => acc.status === "READY" || acc.status === "COOLDOWN"),
      };
    });

    return reply.send({ adapters: formatted });
  });

  // POST /api/adapters/scan (or /reload)
  fastify.post("/api/adapters/scan", async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const reloaded = await loadAndSyncAllAdapters([adaptersDir, customAdaptersDir]);
      globalAdapterRegistry.registerAll(reloaded);

      // Reconcile accounts with updated adapter installation states
      const reconcileResult = await reconcileLegacyAccounts(reloaded, dataDir);

      let installedCount = 0;
      let missingCount = 0;
      for (const a of reloaded) {
        if (a.resolvedExecutable.isInstalled) {
          installedCount++;
        } else {
          missingCount++;
        }
      }

      globalAdminEventBus.broadcast("adapter:reloaded", {
        scanned: reloaded.length,
        installed: installedCount,
        missing: missingCount,
      });

      return reply.send({
        success: true,
        scanned: reloaded.length,
        installed: installedCount,
        missing: missingCount,
        purgedAccounts: reconcileResult.purged,
        restoredAccounts: reconcileResult.restored,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Scan failed: ${message}` });
    }
  });

  // POST /api/adapters/probe - Test dry-run execution of an adapter manifest
  fastify.post("/api/adapters/probe", async (req: FastifyRequest, reply: FastifyReply) => {
    let parsedConfig: any = req.body;

    if (typeof req.body === "string") {
      try {
        parsedConfig = yaml.parse(req.body);
      } catch (err: unknown) {
        return reply.status(400).send({ error: "Invalid YAML syntax in probe payload" });
      }
    }

    const validated = AdapterConfigSchema.safeParse(parsedConfig);
    if (!validated.success) {
      return reply.status(400).send({
        valid: false,
        error: "Configuration schema validation failed",
        details: validated.error.format(),
      });
    }

    const config = validated.data;
    const resolved = resolveBinary(config.executable, (req.body as any)?.customPath);

    if (!resolved.isInstalled || !resolved.resolvedPath) {
      return reply.send({
        valid: true,
        isInstalled: false,
        resolvedPath: null,
        detectedVersion: null,
        latencyMs: 0,
        error: `Executable '${config.executable}' was not found on host search paths.`,
      });
    }

    // Execute bounded version probe
    const probe = await probeExecutable(resolved, "--version", 2000);

    return reply.send({
      valid: true,
      isInstalled: true,
      resolvedPath: resolved.resolvedPath,
      detectedVersion: probe.detectedVersion,
      latencyMs: probe.latencyMs,
      error: probe.error,
    });
  });

  // POST /api/adapters - Register a new custom adapter
  fastify.post("/api/adapters", async (req: FastifyRequest, reply: FastifyReply) => {
    let parsedConfig: any = req.body;

    if (typeof req.body === "string") {
      try {
        parsedConfig = yaml.parse(req.body);
      } catch {
        return reply.status(400).send({ error: "Invalid YAML syntax" });
      }
    }

    const validated = AdapterConfigSchema.safeParse(parsedConfig);
    if (!validated.success) {
      return reply.status(400).send({
        error: "Schema validation failed",
        details: validated.error.format(),
      });
    }

    const config = validated.data;

    // Ensure custom directory exists
    await fs.mkdir(customAdaptersDir, { recursive: true });

    // Persist YAML file
    const targetYamlFile = path.join(customAdaptersDir, `${config.id}.yaml`);
    const yamlString = yaml.stringify(config);
    await fs.writeFile(targetYamlFile, yamlString, "utf8");

    // Hot-reload registries
    const reloaded = await loadAndSyncAllAdapters([adaptersDir, customAdaptersDir]);
    globalAdapterRegistry.registerAll(reloaded);

    // If installed and no account exists, auto-provision default account
    const loaded = globalAdapterRegistry.getAdapter(config.id);
    let provisionedAccId: string | null = null;

    if (loaded && (loaded.resolvedExecutable.isInstalled ?? Boolean(loaded.resolvedExecutable.resolvedPath))) {
      const existing = await db.select().from(accounts).where(eq(accounts.adapterId, config.id));
      if (existing.length === 0) {
        provisionedAccId = `${config.id}-acc-01`;
        const sandbox = await provisionSandbox({
          dataDir,
          adapterId: config.id,
          accountId: provisionedAccId,
        });

        await db.insert(accounts).values({
          id: provisionedAccId,
          adapterId: config.id,
          name: `Default ${config.name} Account`,
          sandboxDir: sandbox.sandboxDir,
          status: "READY",
          maxSlots: config.concurrency.max_concurrent_per_account,
        });
      }
    }

    return reply.status(201).send({
      success: true,
      adapterId: config.id,
      filePath: targetYamlFile,
      isInstalled: loaded?.resolvedExecutable.isInstalled ?? false,
      provisionedAccountId: provisionedAccId,
    });
  });

  // POST /api/adapters/cleanup-orphans - Run orphan account cleanup
  fastify.post("/api/adapters/cleanup-orphans", async (_req: FastifyRequest, reply: FastifyReply) => {
    const loaded = globalAdapterRegistry.getAllAdapters();
    const result = await reconcileLegacyAccounts(loaded, dataDir);
    return reply.send({
      success: true,
      purged: result.purged,
      preserved: result.preserved,
      restored: result.restored,
    });
  });
}
