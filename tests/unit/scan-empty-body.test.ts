import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { FastifyInstance } from "fastify";

describe("Empty JSON Body Handling on POST Endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    runMigrations();
    app = createGatewayServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/adapters/scan succeeds with Content-Type: application/json and empty body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/adapters/scan",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(typeof body.scanned).toBe("number");
  });

  it("POST /api/adapters/scan succeeds with body: {}", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/adapters/scan",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it("POST /api/adapters/cleanup-orphans succeeds with Content-Type: application/json and empty body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/adapters/cleanup-orphans",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });
});
