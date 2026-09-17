import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import EventEmitter from "node:events";
import { globalTelemetryBroadcaster } from "../../telemetry/telemetry-broadcaster.js";
export interface AdminEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export class AdminEventBus extends EventEmitter {
  public broadcast(type: string, data: Record<string, unknown>): void {
    this.emit("event", {
      type,
      timestamp: Date.now(),
      data,
    });
  }
}

export const globalAdminEventBus = new AdminEventBus();

export function registerAdminEventsRoutes(fastify: FastifyInstance): void {
  fastify.get("/api/admin/events", async (req: FastifyRequest<{ Querystring: { test?: string } }>, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "X-Accel-Buffering": "no",
    });

    // Send initial connected event
    reply.raw.write(`data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`);

    // Hydrate active state immediately
    globalTelemetryBroadcaster
      .getFullHydrationSnapshot()
      .then((snapshot) => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(`data: ${JSON.stringify({ type: "radar:snapshot", timestamp: Date.now(), data: snapshot })}\n\n`);
        }
      })
      .catch((err) => {
        console.warn("[admin-events] Snapshot hydration error:", err);
      });
    if (req.query?.test === "true") {
      reply.raw.end();
      return;
    }

    const listener = (event: AdminEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    globalAdminEventBus.on("event", listener);

    req.raw.on("close", () => {
      globalAdminEventBus.off("event", listener);
    });
  });
}
