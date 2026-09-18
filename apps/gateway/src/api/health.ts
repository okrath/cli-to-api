import type { FastifyInstance } from "fastify";

const startedAt = Date.now();

export async function registerHealthRoutes(app: FastifyInstance, version = "0.1.0"): Promise<void> {
  app.get("/healthz", async () => ({
    ok: true,
    version,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  }));
}
