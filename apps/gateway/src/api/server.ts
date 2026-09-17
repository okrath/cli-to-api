import Fastify, { FastifyInstance, FastifyError } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";
import { registerOpenAiModelsRoutes } from "./routes/openai-models.js";
import { registerOpenAiChatRoutes } from "./routes/openai-chat.js";
import { registerAdminAccountsRoutes } from "./routes/admin-accounts.js";
import { registerAdminAdaptersRoutes } from "./routes/admin-adapters.js";
import { registerAdminEventsRoutes } from "./routes/admin-events.js";
import { registerAdminGroupsRoutes } from "./routes/admin-groups.js";
import { registerAdminTelemetryRoutes } from "./routes/admin-telemetry.js";
import { registerWebShellWs } from "./ws/webshell.js";
import { globalTelemetryQueue } from "../telemetry/persist-queue.js";
import { projectRoot } from "../config/paths.js";

export function createGatewayServer(): FastifyInstance {
  const fastify = Fastify({
    logger: false,
    disableRequestLogging: true,
  });

  // Global plugins
  fastify.register(cors, {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  });
  fastify.register(websocket);

  // Content type parser: allow empty body with Content-Type: application/json without FST_ERR_CTP_EMPTY_JSON_BODY error
  fastify.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body: string, done) => {
    if (!body || body.trim().length === 0) {
      done(null, {});
      return;
    }
    try {
      const json = JSON.parse(body);
      done(null, json);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      (error as FastifyError).statusCode = 400;
      done(error as FastifyError, undefined);
    }
  });

  // Global error handler
  fastify.setErrorHandler(errorHandler);

  // Static web console assets if built
  const webDist = path.join(projectRoot, "apps", "web", "dist");
  if (fs.existsSync(webDist)) {
    fastify.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
    });
  }

  // Health check (no auth required)
  fastify.get("/healthz", async () => ({ status: "ok", uptime: process.uptime() }));
  fastify.get("/api/health", async () => ({ status: "ok", uptime: process.uptime() }));

  // Auth guard hook for API routes
  fastify.addHook("onRequest", async (req, reply) => {
    // 1. Never block CORS preflight OPTIONS requests
    if (req.method === "OPTIONS") {
      return;
    }

    // 2. Skip static assets, health checks, websockets, and event stream
    if (
      req.url === "/" ||
      req.url.startsWith("/assets") ||
      req.url.startsWith("/favicon") ||
      req.url === "/healthz" ||
      req.url.startsWith("/api/health") ||
      req.url.startsWith("/api/ws") ||
      req.url.startsWith("/api/admin/events")
    ) {
      return;
    }

    await authMiddleware(req, reply);
  });

  // Register route groups
  registerOpenAiModelsRoutes(fastify);
  registerOpenAiChatRoutes(fastify);
  registerAdminAccountsRoutes(fastify);
  registerAdminAdaptersRoutes(fastify);
  registerAdminEventsRoutes(fastify);
  registerAdminGroupsRoutes(fastify);
  registerAdminTelemetryRoutes(fastify);
  fastify.register(registerWebShellWs);

  fastify.addHook("onClose", async () => {
    globalTelemetryQueue.flushSync();
  });
  return fastify;
}
