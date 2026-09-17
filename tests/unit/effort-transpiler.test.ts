import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { compileEffortFlags, preparePromptTransport } from "../../apps/gateway/src/supervisor/prompt-transport.js";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";

describe("Reasoning Effort Transpiler & Prompt Transport", () => {
  it("compiles effort flags for Claude Code CLI correctly", () => {
    expect(compileEffortFlags("claude-code", "low")).toEqual(["--effort", "low"]);
    expect(compileEffortFlags("claude-code", "medium")).toEqual(["--effort", "medium"]);
    expect(compileEffortFlags("claude-code", "high")).toEqual(["--effort", "high"]);
    expect(compileEffortFlags("claude-code", "xhigh")).toEqual(["--effort", "xhigh"]);
    expect(compileEffortFlags("claude-code", "none")).toEqual([]);
    expect(compileEffortFlags("claude-code", null)).toEqual([]);
  });

  it("compiles effort flags for OpenAI Codex CLI correctly", () => {
    expect(compileEffortFlags("codex-cli", "low")).toEqual(["-c", "model_reasoning_effort=low"]);
    expect(compileEffortFlags("codex-cli", "medium")).toEqual(["-c", "model_reasoning_effort=medium"]);
    expect(compileEffortFlags("codex-cli", "high")).toEqual(["-c", "model_reasoning_effort=high"]);
    expect(compileEffortFlags("codex-cli", "none")).toEqual([]);
  });

  it("compiles effort flags for OMP CLI correctly", () => {
    expect(compileEffortFlags("omp-cli", "low")).toEqual(["--effort", "low"]);
    expect(compileEffortFlags("omp-cli", "high")).toEqual(["--effort", "high"]);
  });

  it("injects effort flags into argv transport for short prompt", async () => {
    const res = await preparePromptTransport({
      argsTemplate: ["--print", "--model", "{model}", "{prompt}"],
      prompt: "Hello AI",
      model: "sonnet",
      accountDir: "/tmp/acc",
      preferredTransport: "auto",
      promptThresholdChars: 4000,
      effortLevel: "high",
      adapterId: "claude-code",
    });

    expect(res.isTempFile).toBe(false);
    expect(res.finalArgs).toEqual([
      "--print",
      "--model",
      "sonnet",
      "--effort",
      "high",
      "Hello AI",
    ]);
  });

  it("preserves effort flags when switching to temp_file for long prompt (>4000 chars)", async () => {
    const longPrompt = "a".repeat(4500);
    const res = await preparePromptTransport({
      argsTemplate: ["exec", "--model", "{model}", "{prompt}"],
      argsTemplateFile: ["exec", "--model", "{model}", "--file", "{prompt_file}"],
      prompt: longPrompt,
      model: "gpt-5.6-sol",
      accountDir: "/tmp/acc-test",
      preferredTransport: "auto",
      promptThresholdChars: 4000,
      effortLevel: "high",
      adapterId: "codex-cli",
    });

    expect(res.isTempFile).toBe(true);
    expect(res.finalArgs).toContain("-c");
    expect(res.finalArgs).toContain("model_reasoning_effort=high");
    expect(res.finalArgs).toContain("--file");

    // Clean up temporary file
    if (res.cleanupHook) {
      await res.cleanupHook();
    }
  });
});

describe("Admin Routing Groups REST API Endpoints", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    runMigrations();
    server = createGatewayServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("supports full CRUD lifecycle via /api/routing-groups", async () => {
    const testGroupId = `group:api-test-${Date.now()}`;

    // 1. Create Group
    const createRes = await server.inject({
      method: "POST",
      url: "/api/routing-groups",
      headers: { authorization: "Bearer sk-cta-dev" },
      payload: {
        id: testGroupId,
        name: "API Test Group",
        description: "Testing admin REST API",
        defaultEffortLevel: "high",
        targets: [
          {
            targetKind: "CLI",
            priorityTier: 1,
            weight: 80,
            adapterId: "claude-code",
            modelId: "sonnet",
          },
        ],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.group.id).toBe(testGroupId);
    expect(created.group.defaultEffortLevel).toBe("high");
    expect(created.group.targets).toHaveLength(1);

    // 2. List Groups
    const listRes = await server.inject({
      method: "GET",
      url: "/api/routing-groups",
      headers: { authorization: "Bearer sk-cta-dev" },
    });
    expect(listRes.statusCode).toBe(200);
    const list = JSON.parse(listRes.body);
    expect(list.groups.some((g: any) => g.id === testGroupId)).toBe(true);

    // 3. Update Group
    const updateRes = await server.inject({
      method: "PUT",
      url: `/api/routing-groups/${encodeURIComponent(testGroupId)}`,
      headers: { authorization: "Bearer sk-cta-dev" },
      payload: {
        defaultEffortLevel: "low",
        description: "Updated description",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = JSON.parse(updateRes.body);
    expect(updated.group.defaultEffortLevel).toBe("low");
    expect(updated.group.description).toBe("Updated description");

    // 4. Delete Group
    const deleteRes = await server.inject({
      method: "DELETE",
      url: `/api/routing-groups/${encodeURIComponent(testGroupId)}`,
      headers: { authorization: "Bearer sk-cta-dev" },
    });
    expect(deleteRes.statusCode).toBe(200);
  });
});
