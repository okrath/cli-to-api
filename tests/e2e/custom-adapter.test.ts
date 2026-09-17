import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { customAdaptersDir } from "../../apps/gateway/src/config/paths.js";
import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import yaml from "yaml";

describe("Custom Adapters, Dynamic Prober & Terminal Ticket API (E2E)", () => {
  let app: FastifyInstance;
  const testCustomAdapterFile = path.join(customAdaptersDir, "test-e2e-custom.yaml");

  beforeAll(async () => {
    runMigrations();
    app = createGatewayServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    try {
      await fs.unlink(testCustomAdapterFile);
    } catch {}
  });

  it("POST /api/adapters/probe detects uninstalled executable gracefully", async () => {
    const draftYaml = `
id: "uninstalled-probe-test"
name: "Uninstalled Probe Test"
version: "1.0.0"
executable: "completely-nonexistent-executable-12345"
execution_mode: "pipe"
models:
  - id: "m1"
    name: "Model 1"
    tier: "low"
    is_default: true
invocation:
  args_template: ["exec", "{prompt}"]
  prompt_transport: "auto"
output_parser:
  type: "regex_stream"
  strip_ansi: true
  resolve_carriage_return: true
  chunk_regex: "(?s)(.*)"
`;

    const res = await app.inject({
      method: "POST",
      url: "/api/adapters/probe",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: yaml.parse(draftYaml),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
    expect(body.isInstalled).toBe(false);
    expect(body.resolvedPath).toBeNull();
    expect(body.error).toContain("was not found on host search paths");
  });

  it("POST /api/adapters/probe successfully validates installed binary (node)", async () => {
    const draftYaml = `
id: "node-probe-test"
name: "Node Probe Test"
version: "1.0.0"
executable: "node"
execution_mode: "pipe"
models:
  - id: "node-model"
    name: "Node Model"
    tier: "low"
    is_default: true
invocation:
  args_template: ["-e", "console.log('test')"]
  prompt_transport: "auto"
output_parser:
  type: "regex_stream"
  strip_ansi: true
  resolve_carriage_return: true
  chunk_regex: "(?s)(.*)"
`;

    const res = await app.inject({
      method: "POST",
      url: "/api/adapters/probe",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: yaml.parse(draftYaml),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
    expect(body.isInstalled).toBe(true);
    expect(body.resolvedPath).toBeTruthy();
    expect(body.detectedVersion).toMatch(/^v\d+/);
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("POST /api/adapters registers custom adapter and saves YAML to custom adapters dir", async () => {
    const customConfig = {
      id: "test-e2e-custom",
      name: "Test E2E Custom CLI",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe",
      models: [
        {
          id: "custom-v1",
          name: "Custom V1 Model",
          tier: "medium",
          is_default: true,
          context_window: 64000,
          cost_weight: 2,
        },
      ],
      invocation: {
        args_template: ["-v"],
        prompt_transport: "auto",
        prompt_threshold_chars: 4000,
        working_dir_template: "{account_dir}/workspace",
        timeout_seconds: 30,
      },
      output_parser: {
        type: "regex_stream",
        strip_ansi: true,
        resolve_carriage_return: true,
        chunk_regex: "(?s)(.*)",
      },
    };

    const res = await app.inject({
      method: "POST",
      url: "/api/adapters",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: customConfig,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.adapterId).toBe("test-e2e-custom");
    expect(body.isInstalled).toBe(true);

    // Verify file exists on disk
    const fileStat = await fs.stat(testCustomAdapterFile);
    expect(fileStat.isFile()).toBe(true);
  });

  it("POST /api/adapters/scan re-scans host and returns accurate counts", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/adapters/scan",
      headers: {
        authorization: "Bearer sk-cta-dev",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.scanned).toBeGreaterThanOrEqual(4);
    expect(body.installed).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/terminal/ticket issues single-use ticket for host terminal", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/terminal/ticket",
      headers: {
        authorization: "Bearer sk-cta-dev",
        "content-type": "application/json",
      },
      payload: {
        mode: "host",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ticket).toMatch(/^tkt_[a-f0-9]{48}$/);
    expect(body.mode).toBe("host");
    expect(body.expiresIn).toBe(30);
  });
});
