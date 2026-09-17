import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { globalSwrrBalancer } from "../../apps/gateway/src/router/swrr-balancer.js";
import { globalPipelineStore } from "../../apps/gateway/src/router/pipeline-store.js";
import { globalLoadBalancer } from "../../apps/gateway/src/router/load-balancer.js";
import { globalModelCatalog } from "../../apps/gateway/src/router/model-catalog.js";
import { globalAdapterRegistry } from "../../apps/gateway/src/adapters/registry.js";
import { db, sqlite } from "../../apps/gateway/src/db/index.js";
import { adapters, accounts } from "../../apps/gateway/src/db/schema.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";

describe("SWRR Balancer & Routing Pipeline Resolution", () => {
  const claudeConfig = {
    id: "claude-code",
    name: "Claude Code CLI",
    version: "1.0.0",
    executable: "claude",
    execution_mode: "pipe" as const,
    models: [{ id: "sonnet", name: "Sonnet", tier: "medium" as const, context_window: 200000, cost_weight: 3, is_default: true }],
    invocation: {
      args_template: ["--model", "{model}", "{prompt}"],
      prompt_transport: "auto" as const,
      prompt_threshold_chars: 4000,
      working_dir_template: "{account_dir}/workspace",
      timeout_seconds: 300,
    },
    environment_isolation: { home_dir_override: true, xdg_override: true, env_overrides: {} },
    output_parser: { type: "regex_stream" as const, strip_ansi: true, resolve_carriage_return: true, chunk_regex: "(?s)(.*)" },
    error_handling: { rate_limit_patterns: [], fatal_error_patterns: [] },
    concurrency: { max_concurrent_per_account: 2 },
  };

  const codexConfig = {
    id: "codex-cli",
    name: "Codex CLI",
    version: "1.0.0",
    executable: "codex",
    execution_mode: "pipe" as const,
    models: [{ id: "gpt-5.6-sol", name: "Sol", tier: "xhigh" as const, context_window: 128000, cost_weight: 10, is_default: true }],
    invocation: {
      args_template: ["exec", "--model", "{model}", "-"],
      prompt_transport: "stdin" as const,
      prompt_threshold_chars: 4000,
      working_dir_template: "{account_dir}/workspace",
      timeout_seconds: 300,
    },
    environment_isolation: { home_dir_override: true, xdg_override: true, env_overrides: {} },
    output_parser: { type: "regex_stream" as const, strip_ansi: true, resolve_carriage_return: true, chunk_regex: "(?s)(.*)" },
    error_handling: { rate_limit_patterns: [], fatal_error_patterns: [] },
    concurrency: { max_concurrent_per_account: 2 },
  };

  beforeAll(async () => {
    runMigrations();

    // Register into in-memory adapter registry
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

    // Seed test adapters in DB
    await db
      .insert(adapters)
      .values([
        {
          id: "claude-code",
          name: "Claude Code CLI",
          version: "1.0.0",
          executable: "claude",
          resolvedPath: "node",
          executionMode: "pipe",
          configJson: JSON.stringify(claudeConfig),
          isInstalled: true,
          status: "INSTALLED",
        },
        {
          id: "codex-cli",
          name: "Codex CLI",
          version: "1.0.0",
          executable: "codex",
          resolvedPath: "node",
          executionMode: "pipe",
          configJson: JSON.stringify(codexConfig),
          isInstalled: true,
          status: "INSTALLED",
        },
      ])
      .onConflictDoNothing();

    // Seed test accounts in DB (using REPLACE to prevent pollution from previous tests)
    sqlite.prepare(
      "INSERT OR REPLACE INTO accounts (id, adapter_id, name, sandbox_dir, status, active_slots, max_slots) VALUES ('claude-acc-1', 'claude-code', 'Claude Account 1', '/tmp/claude1', 'READY', 0, 2)"
    ).run();
    sqlite.prepare(
      "INSERT OR REPLACE INTO accounts (id, adapter_id, name, sandbox_dir, status, active_slots, max_slots) VALUES ('codex-acc-1', 'codex-cli', 'Codex Account 1', '/tmp/codex1', 'READY', 0, 2)"
    ).run();
  });

  beforeEach(() => {
    globalSwrrBalancer.reset();
    sqlite.prepare("UPDATE accounts SET status = 'READY', cooldown_until = NULL, active_slots = 0 WHERE id IN ('claude-acc-1', 'codex-acc-1')").run();
  });

  it("distributes requests matching 70:30 ratio with smooth interleaving", () => {
    const candidates = [
      { id: "target-a", weight: 70 },
      { id: "target-b", weight: 30 },
    ];

    const counts: Record<string, number> = { "target-a": 0, "target-b": 0 };
    const sequence: string[] = [];

    for (let i = 0; i < 100; i++) {
      const selected = globalSwrrBalancer.select(candidates);
      expect(selected).toBeDefined();
      counts[selected!.id]++;
      sequence.push(selected!.id);
    }

    expect(counts["target-a"]).toBe(70);
    expect(counts["target-b"]).toBe(30);

    // Verify it is interleaved and NOT a block of 70 followed by 30
    const firstTen = sequence.slice(0, 10);
    expect(firstTen.filter((id) => id === "target-b").length).toBeGreaterThan(1);
  });

  it("resolves target through user-defined routing pipeline with 3-tier effort resolution", async () => {
    const pipelineId = `group:swrr-test-${Date.now()}`;
    const virtualModelId = `deep-swrr-${Date.now()}`;

    await globalPipelineStore.createPipeline({
      id: pipelineId,
      name: "SWRR Test Pipeline",
      virtualModelId,
      defaultEffortLevel: "medium",
      targets: [
        {
          targetKind: "ACCOUNT",
          priorityTier: 1,
          weight: 100,
          adapterId: "claude-code",
          modelId: "sonnet",
          targetAccountId: "claude-acc-1",
          effortOverride: "high", // Target override
        },
        {
          targetKind: "CLI",
          priorityTier: 2,
          weight: 100,
          adapterId: "codex-cli",
          modelId: "gpt-5.6-sol",
        },
      ],
    });

    // Case A: Request without effort -> inherits Target Override ("high")
    const resolvedA = await globalLoadBalancer.resolveTarget(virtualModelId);
    expect(resolvedA).toBeDefined();
    expect(resolvedA.adapter.id).toBe("claude-code");
    expect(resolvedA.account.id).toBe("claude-acc-1");
    expect(resolvedA.actualModelId).toBe("sonnet");
    expect(resolvedA.effectiveEffort).toBe("high");
    expect(resolvedA.pipelineId).toBe(pipelineId);
    expect(resolvedA.pipelineCandidates).toBeDefined();
    expect(resolvedA.pipelineCandidates!.length).toBeGreaterThan(0);

    // Case B: Request with explicit effort ("low") -> overrides Target and Group ("low")
    const resolvedB = await globalLoadBalancer.resolveTarget(virtualModelId, undefined, "low");
    expect(resolvedB.effectiveEffort).toBe("low");

    // Case C: Check projection in ModelCatalog
    const modelsList = globalModelCatalog.getOpenAiModelsList(false);
    const foundGroup = modelsList.data.find((m) => m.id === virtualModelId);
    expect(foundGroup).toBeDefined();
    expect(foundGroup?.owned_by).toBe("custom-group");
    expect(foundGroup?.meta.is_group).toBe(true);

    // Cleanup
    await globalPipelineStore.deletePipeline(pipelineId);
  });

  it("falls back to Priority 2 when Priority 1 target account is in cooldown", async () => {
    const pipelineId = `group:fallback-test-${Date.now()}`;
    const virtualModelId = `fallback-swrr-${Date.now()}`;

    // Place claude-acc-1 in cooldown
    const now = Math.floor(Date.now() / 1000);
    sqlite.prepare("UPDATE accounts SET status = 'COOLDOWN', cooldown_until = ? WHERE id = 'claude-acc-1'").run(now + 3600);

    await globalPipelineStore.createPipeline({
      id: pipelineId,
      name: "Fallback Test Pipeline",
      virtualModelId,
      defaultEffortLevel: "low",
      targets: [
        {
          targetKind: "ACCOUNT",
          priorityTier: 1, // P0
          weight: 100,
          adapterId: "claude-code",
          modelId: "sonnet",
          targetAccountId: "claude-acc-1", // In cooldown!
        },
        {
          targetKind: "ACCOUNT",
          priorityTier: 2, // P1 (Backup)
          weight: 100,
          adapterId: "codex-cli",
          modelId: "gpt-5.6-sol",
          targetAccountId: "codex-acc-1", // Ready!
        },
      ],
    });

    const resolved = await globalLoadBalancer.resolveTarget(virtualModelId);
    // Should fall back to P1 target: codex-acc-1
    expect(resolved.adapter.id).toBe("codex-cli");
    expect(resolved.account.id).toBe("codex-acc-1");
    expect(resolved.actualModelId).toBe("gpt-5.6-sol");

    // Reset claude-acc-1 back to READY
    sqlite.prepare("UPDATE accounts SET status = 'READY', cooldown_until = NULL WHERE id = 'claude-acc-1'").run();

    // Cleanup
    await globalPipelineStore.deletePipeline(pipelineId);
  });

  it("safely handles CLI targets with legacy targetAccountId and prevents cross-adapter account pollution", async () => {
    const pipelineId = `group:dirty-acc-test-${Date.now()}`;
    const virtualModelId = `dirty-acc-swrr-${Date.now()}`;

    // Directly insert target with targetKind: "CLI" but dirty targetAccountId: "claude-acc-1" (cross adapter to codex-cli!)
    await globalPipelineStore.createPipeline({
      id: pipelineId,
      name: "Dirty Account Pipeline",
      virtualModelId,
      targets: [
        {
          targetKind: "CLI",
          priorityTier: 1,
          weight: 100,
          adapterId: "codex-cli",
          modelId: "gpt-5.6-sol",
          targetAccountId: "claude-acc-1", // Stale/dirty ID from a different adapter
        },
      ],
    });

    // In DB, pipeline store sanitized targetAccountId to null for CLI kind
    const stored = await globalPipelineStore.getPipeline(pipelineId);
    expect(stored?.targets[0].targetAccountId).toBeNull();

    // Resolving target resolves to codex-acc-1 (the healthy account of codex-cli), NOT claude-acc-1
    const resolved = await globalLoadBalancer.resolveTarget(virtualModelId);
    expect(resolved.adapter.id).toBe("codex-cli");
    expect(resolved.account.id).toBe("codex-acc-1");
    expect(resolved.actualModelId).toBe("gpt-5.6-sol");

    // Cleanup
    await globalPipelineStore.deletePipeline(pipelineId);
  });
});
