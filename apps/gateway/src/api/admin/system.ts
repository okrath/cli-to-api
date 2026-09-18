import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { z } from "zod";
import { adapters, detectAdapters, refreshAdapterDetection } from "../../adapters/index.js";
import type { DbHandle } from "../../db/db.js";
import { loadSettings } from "../../db/repos.js";
import { settings } from "../../db/schema.js";
import { abortRequest, getLiveEntries } from "../../router/live.js";
import { killTree } from "../../runner/kill-tree.js";
import { parseBody, sendAdminError } from "./shared.js";

const SETTINGS_KEYS = [
  "default_cooldown_sec",
  "session_ttl_sec",
  "request_timeout_sec",
  "queue_timeout_sec",
] as const;

const patchSettingsSchema = z
  .object({
    defaultCooldownSec: z.number().int().positive().optional(),
    sessionTtlSec: z.number().int().positive().optional(),
    requestTimeoutSec: z.number().int().positive().optional(),
    queueTimeoutSec: z.number().int().positive().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one setting must be provided",
  });

function settingsToResponse(values: ReturnType<typeof loadSettings>) {
  return {
    defaultCooldownSec: values.defaultCooldownSec,
    sessionTtlSec: values.sessionTtlSec,
    requestTimeoutSec: values.requestTimeoutSec,
    queueTimeoutSec: values.queueTimeoutSec,
  };
}

async function listAdapters() {
  const detected = await detectAdapters();
  return detected.map((row) => {
    const adapter = adapters[row.id as keyof typeof adapters];
    return {
      id: row.id,
      executable: row.executable,
      installed: row.installed,
      version: row.version,
      path: row.path,
      models: adapter?.models ?? [],
    };
  });
}

export function registerSystemRoutes(app: FastifyInstance, handle: DbHandle): void {
  app.get("/adapters", async () => listAdapters());

  app.post("/adapters/refresh", async () => {
    refreshAdapterDetection();
    return listAdapters();
  });

  app.get("/live", async () => {
    const entries = getLiveEntries();
    return Array.from(entries.entries()).map(([requestId, entry]) => ({
      requestId,
      ...entry,
    }));
  });

  app.post("/live/:requestId/abort", async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    const aborted = abortRequest(requestId, killTree, request.log as Logger);
    if (!aborted) {
      sendAdminError(reply, 404, "Request not found or already finished");
      return;
    }
    return { ok: true };
  });

  app.get("/settings", async () => settingsToResponse(loadSettings(handle)));

  app.patch("/settings", async (request, reply) => {
    const body = parseBody(patchSettingsSchema, request.body, reply);
    if (!body) {
      return;
    }

    const mapping: Array<[keyof z.infer<typeof patchSettingsSchema>, (typeof SETTINGS_KEYS)[number]]> = [
      ["defaultCooldownSec", "default_cooldown_sec"],
      ["sessionTtlSec", "session_ttl_sec"],
      ["requestTimeoutSec", "request_timeout_sec"],
      ["queueTimeoutSec", "queue_timeout_sec"],
    ];

    for (const [field, key] of mapping) {
      const value = body[field];
      if (value === undefined) {
        continue;
      }
      handle.db
        .insert(settings)
        .values({ key, value: String(value) })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: String(value) },
        })
        .run();
    }

    return settingsToResponse(loadSettings(handle));
  });
}
