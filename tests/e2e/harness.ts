import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { DbHandle } from "../../apps/gateway/src/db/db.js";
import type { GatewayConfig } from "../../apps/gateway/src/config.js";

export interface E2eContext {
  app: FastifyInstance;
  baseUrl: string;
  adminUrl: string;
  dataDir: string;
  db: DbHandle;
  adminToken: string;
  apiKey: string;
  config: GatewayConfig;
}

export function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  if (process.platform === "win32") {
    const result = spawnSync("tasklist", ["/FI", `PID eq ${pid}`], { encoding: "utf8" });
    return result.stdout.includes(String(pid));
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function writeFakeConfig(
  dataDir: string,
  adapterId: string,
  accountId: string,
  scenario: string,
  text?: string,
): void {
  const accountDir = join(dataDir, "sandboxes", adapterId, accountId);
  writeFileSync(join(accountDir, "fake-scenario"), scenario, "utf8");
  if (text != null) {
    writeFileSync(join(accountDir, "fake-text"), text, "utf8");
  }
}

async function adminLogin(baseUrl: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    throw new Error(`Admin login failed: ${res.status}`);
  }
  const body = (await res.json()) as { token: string };
  return body.token;
}

export async function createAccount(
  ctx: E2eContext,
  name: string,
  scenario: string,
  text?: string,
): Promise<string> {
  const res = await fetch(`${ctx.adminUrl}/accounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ adapterId: "fake", name }),
  });
  if (!res.ok) {
    throw new Error(`Create account failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  writeFakeConfig(ctx.dataDir, "fake", body.id, scenario, text);
  return body.id;
}

export interface GroupTargetInput {
  tier: number;
  accountId: string;
  adapterId: string;
  modelId: string;
}

export async function createGroup(
  ctx: E2eContext,
  slug: string,
  targets: GroupTargetInput[],
  options?: { cacheTtlSec?: number; allowTools?: boolean },
): Promise<void> {
  const res = await fetch(`${ctx.adminUrl}/groups`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      slug,
      name: slug,
      cacheTtlSec: options?.cacheTtlSec ?? 0,
      allowTools: options?.allowTools ?? false,
      targets,
    }),
  });
  if (!res.ok) {
    throw new Error(`Create group failed: ${res.status} ${await res.text()}`);
  }
}

export async function createDefaultGroup(
  ctx: E2eContext,
  accountIds: string[],
  cacheTtlSec = 0,
): Promise<void> {
  await createGroup(
    ctx,
    "default",
    accountIds.map((accountId) => ({
      tier: 1,
      accountId,
      adapterId: "fake",
      modelId: "fake",
    })),
    { cacheTtlSec },
  );
}

export async function createAdapterAccount(
  ctx: E2eContext,
  adapterId: string,
  name: string,
): Promise<string> {
  const res = await fetch(`${ctx.adminUrl}/accounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ adapterId, name }),
  });
  if (!res.ok) {
    throw new Error(`Create account failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

export async function patchSettings(
  ctx: E2eContext,
  values: {
    toolResultTimeoutSec?: number;
    toolMaxTurns?: number;
  },
): Promise<void> {
  const res = await fetch(`${ctx.adminUrl}/settings`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${ctx.adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    throw new Error(`Patch settings failed: ${res.status} ${await res.text()}`);
  }
}

export async function fetchLive(ctx: E2eContext): Promise<
  Array<{
    requestId: string;
    state?: string;
    pid?: number;
  }>
> {
  const res = await fetch(`${ctx.adminUrl}/live`, {
    headers: { Authorization: `Bearer ${ctx.adminToken}` },
  });
  if (!res.ok) {
    throw new Error(`Fetch live failed: ${res.status}`);
  }
  return (await res.json()) as Array<{ requestId: string; state?: string; pid?: number }>;
}

export const weatherTool = {
  type: "function" as const,
  function: {
    name: "get_weather",
    description: "Get current weather for a city",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
};

export const anthropicWeatherTool = {
  name: "get_weather",
  description: "Get current weather for a city",
  input_schema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
};

export async function startE2eServer(): Promise<E2eContext> {
  process.env.CTA_ENABLE_FAKE_ADAPTER = "1";

  const { refreshAdapterDetection } = await import("../../apps/gateway/src/adapters/index.js");
  const { resetBridges } = await import("../../apps/gateway/src/router/tool-bridge.js");
  const { resetSlots } = await import("../../apps/gateway/src/router/slots.js");
  refreshAdapterDetection();
  resetBridges();
  resetSlots();

  const { openDb } = await import("../../apps/gateway/src/db/db.js");
  const { runMigrations } = await import("../../apps/gateway/src/db/migrate.js");
  const { buildServer } = await import("../../apps/gateway/src/server.js");
  const { createApiKey, hashKey } = await import("../../apps/gateway/src/auth/api-key-auth.js");
  const { apiKeys } = await import("../../apps/gateway/src/db/schema.js");

  const repoRoot = join(import.meta.dirname, "../..");
  const dataDir = mkdtempSync(join(tmpdir(), "cli-to-api-e2e-"));
  const config: GatewayConfig = {
    port: 0,
    host: "127.0.0.1",
    dataDir,
    adminPassword: "e2e-admin-password",
    logLevel: "silent",
    dbPath: join(dataDir, "cli-to-api.db"),
    repoRoot,
    mcpBaseUrl: "http://127.0.0.1:0",
  };

  const db = openDb(config.dbPath);
  runMigrations(db);

  const created = createApiKey();
  db.db
    .insert(apiKeys)
    .values({
      id: created.id,
      keyHash: hashKey(created.plaintext),
      keyPrefix: created.prefix,
      name: "e2e",
      enabled: true,
      createdAt: Date.now(),
    })
    .run();

  const app = await buildServer({ config, db, version: "test" });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  config.mcpBaseUrl = `http://127.0.0.1:${port}`;
  const baseUrl = config.mcpBaseUrl;
  const adminToken = await adminLogin(baseUrl, config.adminPassword);

  return {
    app,
    baseUrl,
    adminUrl: `${baseUrl}/admin`,
    dataDir,
    db,
    adminToken,
    apiKey: created.plaintext,
    config,
  };
}

export async function stopE2eServer(ctx: E2eContext): Promise<void> {
  await ctx.app.close();
  ctx.db.close();
  try {
    rmSync(ctx.dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may still be releasing sandbox handles */
  }
  delete process.env.CTA_ENABLE_FAKE_ADAPTER;
}
