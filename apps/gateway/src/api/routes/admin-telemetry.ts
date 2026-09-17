import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { globalExecutionRegistry } from "../../telemetry/execution-registry.js";
import { globalTelemetryStore } from "../../telemetry/telemetry-store.js";
import { globalAdminEventBus } from "./admin-events.js";

export function registerAdminTelemetryRoutes(fastify: FastifyInstance): void {
  // GET /api/admin/telemetry/active
  fastify.get("/api/admin/telemetry/active", async () => {
    const activeStreams = globalExecutionRegistry.getSnapshot();
    return {
      activeStreams,
      count: activeStreams.length,
    };
  });

  // GET /api/admin/telemetry/summary
  fastify.get(
    "/api/admin/telemetry/summary",
    async (req: FastifyRequest<{ Querystring: { window?: string } }>) => {
      let windowSeconds: number | undefined;
      if (req.query.window === "5m") windowSeconds = 300;
      else if (req.query.window === "1h") windowSeconds = 3600;
      else if (req.query.window === "24h") windowSeconds = 86400;

      const summary = globalTelemetryStore.getSummary(windowSeconds);
      return summary;
    }
  );

  // GET /api/admin/telemetry/breakdown
  fastify.get(
    "/api/admin/telemetry/breakdown",
    async (req: FastifyRequest<{ Querystring: { window?: string } }>) => {
      let windowSeconds: number | undefined;
      if (req.query.window === "5m") windowSeconds = 300;
      else if (req.query.window === "1h") windowSeconds = 3600;
      else if (req.query.window === "24h") windowSeconds = 86400;

      return globalTelemetryStore.getBreakdown(windowSeconds);
    }
  );

  // GET /api/admin/telemetry/ledger
  fastify.get(
    "/api/admin/telemetry/ledger",
    async (
      req: FastifyRequest<{
        Querystring: {
          limit?: string;
          offset?: string;
          search?: string;
          adapterId?: string;
          model?: string;
          status?: string;
          window?: string;
        };
      }>
    ) => {
      let windowSeconds: number | undefined;
      if (req.query.window === "5m") windowSeconds = 300;
      else if (req.query.window === "1h") windowSeconds = 3600;
      else if (req.query.window === "24h") windowSeconds = 86400;

      return globalTelemetryStore.queryLedger({
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
        search: req.query.search,
        adapterId: req.query.adapterId,
        model: req.query.model,
        status: req.query.status,
        timeWindowSeconds: windowSeconds,
      });
    }
  );

  // POST /api/admin/telemetry/abort/:requestId
  fastify.post(
    "/api/admin/telemetry/abort/:requestId",
    async (
      req: FastifyRequest<{ Params: { requestId: string } }>,
      reply: FastifyReply
    ) => {
      const { requestId } = req.params;
      const result = await globalExecutionRegistry.abortExecution(requestId);

      if (!result.success) {
        return reply
          .status(404)
          .send({ error: `Request '${requestId}' not found or already completed.` });
      }

      globalAdminEventBus.broadcast("telemetry:process:killed", {
        requestId,
        pid: result.pid,
        timestamp: Date.now(),
      });

      return {
        success: true,
        requestId,
        pid: result.pid,
        killed: result.killed,
        message: `Execution '${requestId}' aborted and process tree terminated.`,
      };
    }
  );

  // POST /api/admin/telemetry/probe
  fastify.post(
    "/api/admin/telemetry/probe",
    async (
      req: FastifyRequest<{
        Body: { type?: "ping" | "code" | "cot"; model?: string };
      }>
    ) => {
      const body = req.body || {};
      const probeType = body.type || "ping";
      let promptText = "Ping test: respond with OK.";
      if (probeType === "code") {
        promptText = "Write a TypeScript function that reverses a string.";
      } else if (probeType === "cot") {
        promptText = "Think step by step: What is 17 * 23?";
      }

      return {
        success: true,
        probeType,
        promptText,
        timestamp: Date.now(),
      };
    }
  );
}
