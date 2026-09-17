import { describe, it, expect, beforeAll } from "vitest";
import { LoadBalancer } from "../../apps/gateway/src/router/load-balancer.js";
import { ModelCatalog } from "../../apps/gateway/src/router/model-catalog.js";
import { AdapterRegistry } from "../../apps/gateway/src/adapters/registry.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { db } from "../../apps/gateway/src/db/index.js";
import { adapters, accounts } from "../../apps/gateway/src/db/schema.js";
import { AdapterConfig } from "../../apps/gateway/src/adapters/schema.js";

describe("LoadBalancer & Router Engine", () => {
  const registry = new AdapterRegistry();
  const catalog = new ModelCatalog(registry);
  const lb = new LoadBalancer(catalog);

  beforeAll(async () => {
    runMigrations();

    // Setup mock adapter A (codex)
    const codexConfig: AdapterConfig = {
      id: "codex-test",
      name: "Codex Test",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe",
      models: [
        { id: "gpt-5.6-asta", name: "Asta", tier: "xhigh", context_window: 128000, cost_weight: 10, is_default: true },
        { id: "gpt-4o-mini", name: "Mini", tier: "low", context_window: 128000, cost_weight: 1, is_default: true },
      ],
      invocation: { args_template: ["exec", "{prompt}"], prompt_transport: "auto", prompt_threshold_chars: 4000, working_dir_template: "{account_dir}/workspace", timeout_seconds: 300 },
      environment_isolation: { home_dir_override: true, xdg_override: true, env_overrides: {} },
      output_parser: { type: "regex_stream", strip_ansi: true, resolve_carriage_return: true, chunk_regex: "(?s)(.*)" },
      error_handling: { rate_limit_patterns: [], fatal_error_patterns: [] },
      concurrency: { max_concurrent_per_account: 1 },
    };

    // Setup mock adapter B (opencode)
    const opencodeConfig: AdapterConfig = {
      id: "opencode-test",
      name: "OpenCode Test",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe",
      models: [
        { id: "gpt-5.6-asta", name: "Asta OpenCode", tier: "xhigh", context_window: 128000, cost_weight: 10, is_default: false },
        { id: "qwen-mini", name: "Qwen Mini", tier: "low", context_window: 32000, cost_weight: 1, is_default: true },
      ],
      invocation: { args_template: ["run", "{prompt}"], prompt_transport: "auto", prompt_threshold_chars: 4000, working_dir_template: "{account_dir}/workspace", timeout_seconds: 300 },
      environment_isolation: { home_dir_override: true, xdg_override: true, env_overrides: {} },
      output_parser: { type: "regex_stream", strip_ansi: true, resolve_carriage_return: true, chunk_regex: "(?s)(.*)" },
      error_handling: { rate_limit_patterns: [], fatal_error_patterns: [] },
      concurrency: { max_concurrent_per_account: 1 },
    };

    registry.register({
      config: codexConfig,
      resolvedExecutable: { resolvedPath: "node", isWindowsScript: false, isPowerShellScript: false, spawnExecutable: "node", spawnPrefixArgs: [] },
    });

    registry.register({
      config: opencodeConfig,
      resolvedExecutable: { resolvedPath: "node", isWindowsScript: false, isPowerShellScript: false, spawnExecutable: "node", spawnPrefixArgs: [] },
    });

    const claudeConfig: AdapterConfig = {
      id: "claude-code",
      name: "Claude Code",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pty",
      models: [
        { id: "opus", name: "Opus", tier: "high", context_window: 200000, cost_weight: 8, is_default: false },
        { id: "sonnet", name: "Sonnet", tier: "medium", context_window: 200000, cost_weight: 3, is_default: true },
        { id: "haiku", name: "Haiku", tier: "low", context_window: 200000, cost_weight: 1, is_default: false },
      ],
      invocation: { args_template: ["--print", "--model", "{model}", "{prompt}"], prompt_transport: "auto", prompt_threshold_chars: 4000, working_dir_template: "{account_dir}/workspace", timeout_seconds: 300 },
      environment_isolation: { home_dir_override: true, xdg_override: true, env_overrides: {} },
      output_parser: { type: "json_lines", strip_ansi: true, resolve_carriage_return: true, chunk_regex: "(?s)(.*)" },
      error_handling: { rate_limit_patterns: [], fatal_error_patterns: [] },
      concurrency: { max_concurrent_per_account: 1 },
    };

    registry.register({
      config: claudeConfig,
      resolvedExecutable: { isInstalled: true, resolvedPath: "node", isWindowsScript: false, isPowerShellScript: false, spawnExecutable: "node", spawnPrefixArgs: [] },
    });

    // DB setup
    await db.insert(adapters).values({
      id: "codex-test",
      name: "Codex Test",
      version: "1.0.0",
      executable: "node",
      resolvedPath: "node",
      executionMode: "pipe",
      configJson: JSON.stringify(codexConfig),
    }).onConflictDoNothing();

    await db.insert(adapters).values({
      id: "opencode-test",
      name: "OpenCode Test",
      version: "1.0.0",
      executable: "node",
      resolvedPath: "node",
      executionMode: "pipe",
      configJson: JSON.stringify(opencodeConfig),
    }).onConflictDoNothing();

    await db.insert(accounts).values({
      id: "codex-acc-1",
      adapterId: "codex-test",
      name: "Codex Acc 1",
      sandboxDir: "./data/sandboxes/codex-test/codex-acc-1",
      status: "READY",
      activeSlots: 0,
      maxSlots: 1,
    }).onConflictDoNothing();

    await db.insert(accounts).values({
      id: "opencode-acc-1",
      adapterId: "opencode-test",
      name: "OpenCode Acc 1",
      sandboxDir: "./data/sandboxes/opencode-test/opencode-acc-1",
      status: "READY",
      activeSlots: 0,
      maxSlots: 1,
    }).onConflictDoNothing();

    await db.insert(adapters).values({
      id: "claude-code",
      name: "Claude Code",
      executable: "node",
      resolvedPath: "node",
      configJson: JSON.stringify(claudeConfig),
      isInstalled: true,
      status: "INSTALLED",
    }).onConflictDoNothing();

    await db.insert(accounts).values({
      id: "claude-test-acc-1",
      adapterId: "claude-code",
      name: "Claude Acc 1",
      sandboxDir: "./data/sandboxes/claude-code/test",
      status: "READY",
      activeSlots: 0,
      maxSlots: 1,
    }).onConflictDoNothing();
  });

  it("routes namespaced target codex-test/gpt-5.6-asta strictly to codex account", async () => {
    const target = await lb.resolveTarget("codex-test/gpt-5.6-asta");
    expect(target.debugProvider).toBe("codex-test");
    expect(target.account.id).toContain("codex-");
    expect(target.actualModelId).toBe("gpt-5.6-asta");
  });

  it("routes namespaced target opencode-test/gpt-5.6-asta strictly to opencode account", async () => {
    const target = await lb.resolveTarget("opencode-test/gpt-5.6-asta");
    expect(target.debugProvider).toBe("opencode-test");
    expect(target.account.id).toContain("opencode-");
    expect(target.actualModelId).toBe("gpt-5.6-asta");
  });

  it("routes virtual tier auto-low across eligible low-tier models", async () => {
    const target = await lb.resolveTarget("auto-low");
    expect(target.debugModelTier).toBe("low");
    expect(target.account.id).toBeTruthy();
  });

  it("routes virtual tier auto-xhigh across eligible xhigh-tier models", async () => {
    const target = await lb.resolveTarget("auto-xhigh");
    expect(target.debugModelTier).toBe("xhigh");
    expect(target.account.id).toBeTruthy();
  });

  it("resolves flat alias to default provider", async () => {
    const target = await lb.resolveTarget("gpt-5.6-asta");
    expect(target.debugProvider).toBe("codex-test");
    expect(target.actualModelId).toBe("gpt-5.6-asta");
  });

  it("resolves short prefix claude/opus, strips claude prefix, and converts to actualModelId opus", async () => {
    const target = await lb.resolveTarget("claude/opus");
    expect(target.debugProvider).toBe("claude-code");
    expect(target.actualModelId).toBe("opus");
    expect(target.account.id).toBe("claude-test-acc-1");
  });

  it("resolves claude/claude-3-7-sonnet and converts to actualModelId sonnet", async () => {
    const target = await lb.resolveTarget("claude/claude-3-7-sonnet");
    expect(target.debugProvider).toBe("claude-code");
    expect(target.actualModelId).toBe("sonnet");
  });
});
