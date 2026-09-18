import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type { AdminTokenStore } from "../../auth/admin-auth.js";
import type { GatewayConfig } from "../../config.js";
import type { DbHandle } from "../../db/db.js";
import { registerAccountRoutes } from "./accounts.js";
import { registerApiKeyRoutes } from "./api-keys.js";
import { registerGroupRoutes } from "./groups.js";
import { registerSystemRoutes } from "./system.js";
import { registerTerminalWs, killAllTerminals } from "./terminal-ws.js";
import { registerUsageRoutes } from "./usage.js";

export interface AdminRouteDeps {
  config: GatewayConfig;
  db: DbHandle;
  adminTokens: AdminTokenStore;
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  deps: AdminRouteDeps,
): Promise<void> {
  await app.register(websocket);

  registerAccountRoutes(app, deps.db, deps.config);
  registerGroupRoutes(app, deps.db);
  registerApiKeyRoutes(app, deps.db);
  registerUsageRoutes(app, deps.db);
  registerSystemRoutes(app, deps.db);
  registerTerminalWs(app, deps.db, deps.config, deps.adminTokens);

  app.addHook("onClose", async () => {
    killAllTerminals();
  });
}
