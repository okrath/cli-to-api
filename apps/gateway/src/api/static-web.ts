import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";

export async function registerStaticWeb(app: FastifyInstance, repoRoot: string): Promise<void> {
  const webDist = resolve(repoRoot, "apps/web/dist");

  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      wildcard: false,
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return reply.callNotFound();
      }
      if (request.url.startsWith("/v1/") || request.url.startsWith("/admin/")) {
        return reply.callNotFound();
      }
      return reply.sendFile("index.html");
    });
    return;
  }

  app.get("/", async (_request, reply) => {
    return reply.type("text/plain").send("cli-to-api gateway — see /healthz");
  });
}
