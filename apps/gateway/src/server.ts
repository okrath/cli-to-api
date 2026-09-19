import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { registerAnthropicRoutes } from "./api/anthropic.js";
import { registerHealthRoutes } from "./api/health.js";
import { registerMcpRoutes } from "./api/mcp.js";
import { registerModelsRoute } from "./api/models.js";
import { registerOpenAiRoutes } from "./api/openai.js";
import { registerAdminRoutes } from "./api/admin/index.js";
import { registerStaticWeb } from "./api/static-web.js";
import {
  constantTimeEqual,
  createAdminTokenStore,
  issueAdminToken,
  registerAdminAuth,
  type AdminTokenStore,
} from "./auth/admin-auth.js";
import { registerApiKeyAuth } from "./auth/api-key-auth.js";
import type { GatewayConfig } from "./config.js";
import type { DbHandle } from "./db/db.js";
import { expireAllBridges, sweepExpiredBridges } from "./router/tool-bridge.js";
import { killTree } from "./runner/kill-tree.js";

export interface BuildServerDeps {
  config: GatewayConfig;
  db: DbHandle;
  logger?: Logger;
  adminTokens?: AdminTokenStore;
  version?: string;
}

export async function buildServer(deps: BuildServerDeps): Promise<FastifyInstance> {
  const adminTokens = deps.adminTokens ?? createAdminTokenStore();
  const version = deps.version ?? "0.1.0";

  const app = Fastify({
    logger: deps.logger ?? {
      level: deps.config.logLevel,
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    genReqId: () => randomUUID(),
  });

  await app.register(cors, { origin: true });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-cta-request-id", request.chatRequestId ?? request.id);
    return payload;
  });

  await registerHealthRoutes(app, version);
  await registerStaticWeb(app, deps.config.repoRoot);
  registerMcpRoutes(app, { version });

  const bridgeSweepTimer = setInterval(() => {
    sweepExpiredBridges(Date.now(), killTree, app.log as import("pino").Logger);
  }, 5_000);
  bridgeSweepTimer.unref();
  app.addHook("onClose", async () => {
    clearInterval(bridgeSweepTimer);
    const now = Date.now();
    expireAllBridges(now);
    sweepExpiredBridges(now, killTree, app.log as import("pino").Logger);
  });

  app.post("/admin/login", async (request, reply) => {
    const body = request.body as { password?: string };
    if (!body?.password || !constantTimeEqual(body.password, deps.config.adminPassword)) {
      return reply.code(401).send({
        error: { message: "Invalid password", type: "authentication_error" },
      });
    }
    const session = issueAdminToken(adminTokens);
    return { token: session.token, expiresAt: session.expiresAt };
  });

  app.register(
    async (adminScope) => {
      adminScope.addHook("preHandler", registerAdminAuth(adminTokens));
      await registerAdminRoutes(adminScope, {
        config: deps.config,
        db: deps.db,
        adminTokens,
      });
    },
    { prefix: "/admin" },
  );

  app.register(
    async (apiScope) => {
      apiScope.addHook("preHandler", registerApiKeyAuth(deps.db));
      registerModelsRoute(apiScope, deps.db);
      registerOpenAiRoutes(apiScope, deps.db, deps.config);
      registerAnthropicRoutes(apiScope, deps.db, deps.config);
    },
    { prefix: "/v1" },
  );

  app.decorate("gatewayVersion", version);
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    gatewayVersion: string;
  }
}
