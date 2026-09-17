import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { globalAdapterRegistry } from "../../apps/gateway/src/adapters/registry.js";
import { projectRoot, dataDir } from "../../apps/gateway/src/config/paths.js";
import { db, sqlite } from "../../apps/gateway/src/db/index.js";
import { accounts, adapters } from "../../apps/gateway/src/db/schema.js";
import { provisionSandbox } from "../../apps/gateway/src/supervisor/sandbox.js";
import path from "node:path";
import type { FastifyInstance } from "fastify";

describe("Routing Groups & Reasoning Effort Pipeline E2E Suite (AC-1 to AC-7)", () => {
  let app: FastifyInstance;
  const spinnerScript = path.join(projectRoot, "tests", "mocks", "mock-spinner-cli.js");
  const reasoningScript = path.join(projectRoot, "tests", "mocks", "mock-reasoning-cli.js");

  const claudeConfig = {
    id: "claude-e2e",
    name: "Claude Code E2E",
    version: "1.0.0",
    executable: "node",
    execution_mode: "pipe" as const,
    models: [
      { id: "sonnet", name: "Sonnet 3.7", tier: "medium" as const, context_window: 200000, cost_weight: 3, is_default: true },
    ],
    invocation: {
      args_template: [reasoningScript, "{prompt}"],
      prompt_transport: "auto" as const,
      prompt_threshold_chars: 4000,
      working_dir_template: "{account_dir}/workspace",
      timeout_seconds: 30,
    },
    environment_isolation: { home_dir_override: true, xdg_override: true, env_overrides: {} },
    output_parser: { type: "regex_stream" as const, strip_ansi: true, resolve_carriage_return: true, chunk_regex: "(?s)(.*)" },
    error_handling: { rate_limit_patterns: [], fatal_error_patterns: [] },
    concurrency: { max_concurrent_per_account: 2 },
  };

  const codexConfig = {
    id: "codex-e2e",
    name: "Codex E2E",
    version: "1.0.0",
    executable: "node",
    execution_mode: "pipe" as const,
    models: [
      { id: "gpt-5.6-sol", name: "Sol 5.6", tier: "xhigh" as const, context_window: 128000, cost_weight: 10, is_default: true },
    ],
    invocation: {
      args_template: [spinnerScript, "{prompt}"],
      prompt_transport: "auto" as const,
      prompt_threshold_chars: 4000,
      working_dir_template: "{account_dir}/workspace",
      timeout_seconds: 30,
    },
    environment_isolation: { home_dir_override: true, xdg_override: true, env_overrides: {} },
    output_parser: { type: "regex_stream" as const, strip_ansi: true, resolve_carriage_return: true, chunk_regex: "(?s)(.*)" },
    error_handling: { rate_limit_patterns: [], fatal_error_patterns: [] },
    concurrency: { max_concurrent_per_account: 2 },
  };

  beforeAll(async () => {
    runMigrations();

    // Register into in-memory registry
    globalAdapterRegistry.register({
      config: claudeConfig,
      resolvedExecutable: {
        isInstalled: true,
        resolvedPath: "node",
        isWindowsScript: false,
        isPowerShellScript: false,
        spawnExecutable: "node",
        spawnPrefixArgs: [],
      },
    });

    globalAdapterRegistry.register({
      config: codexConfig,
      resolvedExecutable: {
        isInstalled: true,
        resolvedPath: "node",
        isWindowsScript: false,
        isPowerShellScript: false,
        spawnExecutable: "node",
        spawnPrefixArgs: [],
      },
    });

    // DB seed adapters
    await db
      .insert(adapters)
      .values([
        {
          id: "claude-e2e",
          name: "Claude Code E2E",
          version: "1.0.0",
          executable: "node",
          resolvedPath: "node",
          executionMode: "pipe",
          configJson: JSON.stringify(claudeConfig),
          isInstalled: true,
          status: "INSTALLED",
        },
        {
          id: "codex-e2e",
          name: "Codex E2E",
          version: "1.0.0",
          executable: "node",
          resolvedPath: "node",
          executionMode: "pipe",
          configJson: JSON.stringify(codexConfig),
          isInstalled: true,
          status: "INSTALLED",
        },
      ])
      .onConflictDoNothing();

    const sbClaude = await provisionSandbox({ dataDir, adapterId: "claude-e2e", accountId: "acc-claude-p0" });
    const sbCodex = await provisionSandbox({ dataDir, adapterId: "codex-e2e", accountId: "acc-codex-p1" });

    await db
      .insert(accounts)
      .values([
        {
          id: "acc-claude-p0",
          adapterId: "claude-e2e",
          name: "Claude P0 Account",
          sandboxDir: sbClaude.sandboxDir,
          status: "READY",
          activeSlots: 0,
          maxSlots: 2,
        },
        {
          id: "acc-codex-p1",
          adapterId: "codex-e2e",
          name: "Codex P1 Account",
          sandboxDir: sbCodex.sandboxDir,
          status: "READY",
          activeSlots: 0,
          maxSlots: 2,
        },
      ])
      .onConflictDoNothing();

    app = createGatewayServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const testGroupModel = `group:e2e-pipeline-${Date.now()}`;

  it("[AC-1] Creates routing group via Admin API and projects it in GET /v1/models", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/routing-groups",
      headers: { authorization: "Bearer sk-cta-dev" },
      payload: {
        id: testGroupModel,
        name: "E2E Test Pipeline",
        description: "Integration test pipeline",
        virtualModelId: testGroupModel,
        defaultEffortLevel: "high",
        fallbackPolicy: "cascade_failover",
        targets: [
          {
            targetKind: "ACCOUNT",
            priorityTier: 1, // P0
            weight: 70,
            adapterId: "claude-e2e",
            modelId: "sonnet",
            targetAccountId: "acc-claude-p0",
            effortOverride: "high",
          },
          {
            targetKind: "ACCOUNT",
            priorityTier: 2, // P1 (Fallback)
            weight: 30,
            adapterId: "codex-e2e",
            modelId: "gpt-5.6-sol",
            targetAccountId: "acc-codex-p1",
          },
        ],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.group.id).toBe(testGroupModel);
    expect(created.group.targets).toHaveLength(2);

    // Verify GET /v1/models lists the newly created group as a virtual model
    const modelsRes = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer sk-cta-dev" },
    });

    expect(modelsRes.statusCode).toBe(200);
    const modelsData = JSON.parse(modelsRes.body);
    const foundGroup = modelsData.data.find((m: any) => m.id === testGroupModel);
    expect(foundGroup).toBeDefined();
    expect(foundGroup.owned_by).toBe("custom-group");
    expect(foundGroup.meta?.is_group).toBe(true);
    expect(foundGroup.meta?.default_effort).toBe("high");

    // Verify GET /v1/models by default does NOT contain legacy auto tiers
    const modelIds = modelsData.data.map((m: any) => m.id);
    expect(modelIds).not.toContain("auto");
    expect(modelIds).not.toContain("auto-low");
    expect(modelIds).not.toContain("auto-medium");
    expect(modelIds).not.toContain("auto-high");
    expect(modelIds).not.toContain("auto-xhigh");

    // Verify all returned models are either custom groups or installed CLI models
    for (const m of modelsData.data) {
      const isGroup = m.meta?.is_group === true || m.id.startsWith("group:");
      const isCliModel = !m.meta?.is_virtual && Boolean(m.meta?.provider || m.id.includes("/"));
      expect(isGroup || isCliModel).toBe(true);
    }
  });

  it("[AC-2] Chat completion targeting group resolves effort and executes P0 target", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-dev" },
      payload: {
        model: testGroupModel,
        messages: [{ role: "user", content: "Tell me about reasoning" }],
        stream: false,
        reasoning_effort: "high",
      },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.choices[0].message.content).toBeTruthy();
    expect(data._debug_effort).toBe("high");
    expect(data._debug_pipeline).toBe(testGroupModel);
    expect(data._debug_provider).toBe("claude-e2e");
  });

  it("[AC-3] Falls back to P1 target when P0 target account is in cooldown", async () => {
    // Put acc-claude-p0 into cooldown
    const now = Math.floor(Date.now() / 1000);
    sqlite
      .prepare("UPDATE accounts SET status = 'COOLDOWN', cooldown_until = ? WHERE id = 'acc-claude-p0'")
      .run(now + 3600);

    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-dev" },
      payload: {
        model: testGroupModel,
        messages: [{ role: "user", content: "Fallback request" }],
        stream: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    // Should have routed to P1 target: codex-e2e
    expect(data._debug_provider).toBe("codex-e2e");
    expect(data._debug_pipeline).toBe(testGroupModel);

    // Reset claude account back to READY
    sqlite
      .prepare("UPDATE accounts SET status = 'READY', cooldown_until = NULL WHERE id = 'acc-claude-p0'")
      .run();
  });

  it("[AC-6] Preserves reasoning effort flags when prompt >4000 characters triggers temp file", async () => {
    const longPrompt = "Write code with reasoning. " + "repeat ".repeat(700);

    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-dev" },
      payload: {
        model: testGroupModel,
        messages: [{ role: "user", content: longPrompt }],
        stream: false,
        reasoning_effort: "high",
      },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data._debug_effort).toBe("high");
    expect(data.choices[0].message.content).toBeTruthy();
  });

  it("[AC-7] Deletes routing group and cleans up from GET /v1/models", async () => {
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/routing-groups/${encodeURIComponent(testGroupModel)}`,
      headers: { authorization: "Bearer sk-cta-dev" },
    });

    expect(delRes.statusCode).toBe(200);

    // Check GET /v1/models no longer lists the group
    const modelsRes = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer sk-cta-dev" },
    });
    const modelsData = JSON.parse(modelsRes.body);
    expect(modelsData.data.some((m: any) => m.id === testGroupModel)).toBe(false);
  });
});
