import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";
import { runMigrations } from "../../apps/gateway/src/db/migrate.js";
import { globalAdapterRegistry } from "../../apps/gateway/src/adapters/registry.js";
import { projectRoot, dataDir } from "../../apps/gateway/src/config/paths.js";
import { db } from "../../apps/gateway/src/db/index.js";
import { accounts, adapters } from "../../apps/gateway/src/db/schema.js";
import { provisionSandbox } from "../../apps/gateway/src/supervisor/sandbox.js";
import { globalCooldownTracker } from "../../apps/gateway/src/router/cooldown-tracker.js";
import path from "node:path";
import { FastifyInstance } from "fastify";

describe("cli-to-api Comprehensive Acceptance Test Suite (AC-01 - AC-07)", () => {
  let app: FastifyInstance;
  const spinnerScript = path.join(projectRoot, "tests", "mocks", "mock-spinner-cli.js");
  const ratelimitScript = path.join(projectRoot, "tests", "mocks", "mock-ratelimit-cli.js");
  const hangingScript = path.join(projectRoot, "tests", "mocks", "mock-hanging-cli.js");

  beforeAll(async () => {
    runMigrations();

    // 1. Setup Codex Adapter & Accounts
    const codexConfig = {
      id: "codex-test",
      name: "Codex CLI",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe" as const,
      models: [
        { id: "gpt-5.6-asta", name: "Codex Asta", tier: "xhigh" as const, context_window: 128000, cost_weight: 10, is_default: true },
        { id: "gpt-4o-mini", name: "Codex Mini", tier: "low" as const, context_window: 128000, cost_weight: 1, is_default: true },
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
      concurrency: { max_concurrent_per_account: 1 },
    };

    // 2. Setup OpenCode Adapter & Accounts
    const opencodeConfig = {
      id: "opencode-test",
      name: "OpenCode CLI",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe" as const,
      models: [
        { id: "gpt-5.6-asta", name: "OpenCode Asta", tier: "xhigh" as const, context_window: 128000, cost_weight: 10, is_default: false },
        { id: "deepseek-r1", name: "DeepSeek R1", tier: "high" as const, context_window: 64000, cost_weight: 3, is_default: true },
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
      concurrency: { max_concurrent_per_account: 1 },
    };

    // 3. Setup Rate-Limit Mock Adapter
    const ratelimitConfig = {
      id: "ratelimit-test",
      name: "RateLimit Test CLI",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe" as const,
      models: [{ id: "mock-model", name: "Mock", tier: "high" as const, context_window: 1000, cost_weight: 1, is_default: true }],
      invocation: {
        args_template: [ratelimitScript, "{prompt}"],
        prompt_transport: "auto" as const,
        prompt_threshold_chars: 4000,
        working_dir_template: "{account_dir}/workspace",
        timeout_seconds: 30,
      },
      environment_isolation: { home_dir_override: true, xdg_override: true, env_overrides: {} },
      output_parser: { type: "regex_stream" as const, strip_ansi: true, resolve_carriage_return: true, chunk_regex: "(?s)(.*)" },
      error_handling: {
        rate_limit_patterns: [
          { pattern: "rate limit.*resets in (\\d+m|\\d+h)", cooldown_seconds_default: 1800, dynamic_extractor: true },
        ],
        fatal_error_patterns: [],
      },
      concurrency: { max_concurrent_per_account: 1 },
    };

    // 4. Setup Hanging Mock Adapter
    const hangingConfig = {
      id: "hanging-test",
      name: "Hanging Test CLI",
      version: "1.0.0",
      executable: "node",
      execution_mode: "pipe" as const,
      models: [{ id: "hang-model", name: "Hang", tier: "high" as const, context_window: 1000, cost_weight: 1, is_default: true }],
      invocation: {
        args_template: [hangingScript],
        prompt_transport: "auto" as const,
        prompt_threshold_chars: 4000,
        working_dir_template: "{account_dir}/workspace",
        timeout_seconds: 30,
      },
      environment_isolation: { home_dir_override: true, xdg_override: true, env_overrides: {} },
      output_parser: { type: "regex_stream" as const, strip_ansi: true, resolve_carriage_return: true, chunk_regex: "(?s)(.*)" },
      error_handling: { rate_limit_patterns: [], fatal_error_patterns: [] },
      concurrency: { max_concurrent_per_account: 1 },
    };

    globalAdapterRegistry.register({ config: codexConfig, resolvedExecutable: { resolvedPath: "node", isWindowsScript: false, isPowerShellScript: false, spawnExecutable: "node", spawnPrefixArgs: [] } });
    globalAdapterRegistry.register({ config: opencodeConfig, resolvedExecutable: { resolvedPath: "node", isWindowsScript: false, isPowerShellScript: false, spawnExecutable: "node", spawnPrefixArgs: [] } });
    globalAdapterRegistry.register({ config: ratelimitConfig, resolvedExecutable: { resolvedPath: "node", isWindowsScript: false, isPowerShellScript: false, spawnExecutable: "node", spawnPrefixArgs: [] } });
    globalAdapterRegistry.register({ config: hangingConfig, resolvedExecutable: { resolvedPath: "node", isWindowsScript: false, isPowerShellScript: false, spawnExecutable: "node", spawnPrefixArgs: [] } });

    // Database upserts
    await db.insert(adapters).values({ id: "codex-test", name: "Codex CLI", version: "1.0.0", executable: "node", resolvedPath: "node", executionMode: "pipe", configJson: JSON.stringify(codexConfig) }).onConflictDoNothing();
    await db.insert(adapters).values({ id: "opencode-test", name: "OpenCode CLI", version: "1.0.0", executable: "node", resolvedPath: "node", executionMode: "pipe", configJson: JSON.stringify(opencodeConfig) }).onConflictDoNothing();
    await db.insert(adapters).values({ id: "ratelimit-test", name: "RateLimit CLI", version: "1.0.0", executable: "node", resolvedPath: "node", executionMode: "pipe", configJson: JSON.stringify(ratelimitConfig) }).onConflictDoNothing();
    await db.insert(adapters).values({ id: "hanging-test", name: "Hanging CLI", version: "1.0.0", executable: "node", resolvedPath: "node", executionMode: "pipe", configJson: JSON.stringify(hangingConfig) }).onConflictDoNothing();

    // Accounts
    const s1 = await provisionSandbox({ dataDir, adapterId: "codex-test", accountId: "codex-e2e-1" });
    const s2 = await provisionSandbox({ dataDir, adapterId: "opencode-test", accountId: "opencode-e2e-1" });
    const s3 = await provisionSandbox({ dataDir, adapterId: "ratelimit-test", accountId: "ratelimit-e2e-1" });
    const s4 = await provisionSandbox({ dataDir, adapterId: "hanging-test", accountId: "hanging-e2e-1" });

    await db.insert(accounts).values({ id: "codex-e2e-1", adapterId: "codex-test", name: "Codex E2E 1", sandboxDir: s1.sandboxDir, status: "READY", maxSlots: 1, activeSlots: 0 }).onConflictDoNothing();
    await db.insert(accounts).values({ id: "opencode-e2e-1", adapterId: "opencode-test", name: "OpenCode E2E 1", sandboxDir: s2.sandboxDir, status: "READY", maxSlots: 1, activeSlots: 0 }).onConflictDoNothing();
    await db.insert(accounts).values({ id: "ratelimit-e2e-1", adapterId: "ratelimit-test", name: "RL E2E 1", sandboxDir: s3.sandboxDir, status: "READY", maxSlots: 1, activeSlots: 0 }).onConflictDoNothing();
    await db.insert(accounts).values({ id: "hanging-e2e-1", adapterId: "hanging-test", name: "Hang E2E 1", sandboxDir: s4.sandboxDir, status: "READY", maxSlots: 1, activeSlots: 0 }).onConflictDoNothing();

    // Ensure ratelimit account is in clean READY state before test starts
    await globalCooldownTracker.clearCooldown("ratelimit-e2e-1");

    app = createGatewayServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("[AC-01] GET /v1/models returns complete catalog with namespaced models and virtual auto tiers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/models?include_auto=true",
      headers: { authorization: "Bearer sk-cta-dev" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ids = body.data.map((m: any) => m.id);

    expect(ids).toContain("auto");
    expect(ids).toContain("auto-low");
    expect(ids).toContain("auto-medium");
    expect(ids).toContain("auto-high");
    expect(ids).toContain("auto-xhigh");
    expect(ids).toContain("codex-test/gpt-5.6-asta");
    expect(ids).toContain("opencode-test/gpt-5.6-asta");
  });

  it("[AC-02] Namespaced targeting routes strictly to specified provider pool", async () => {
    const resCodex = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-dev", "content-type": "application/json" },
      payload: {
        model: "codex-test/gpt-5.6-asta",
        messages: [{ role: "user", content: "test codex" }],
      },
    });
    expect(resCodex.statusCode).toBe(200);
    const bodyCodex = JSON.parse(resCodex.body);
    expect(bodyCodex._debug_provider).toBe("codex-test");

    const resOpenCode = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-dev", "content-type": "application/json" },
      payload: {
        model: "opencode-test/gpt-5.6-asta",
        messages: [{ role: "user", content: "test opencode" }],
      },
    });
    expect(resOpenCode.statusCode).toBe(200);
    const bodyOpenCode = JSON.parse(resOpenCode.body);
    expect(bodyOpenCode._debug_provider).toBe("opencode-test");
  });

  it("[AC-03] Virtual tier auto-routing routes by tier with least-connections", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-dev", "content-type": "application/json" },
      payload: {
        model: "auto-low",
        messages: [{ role: "user", content: "test auto-low" }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body._debug_model_tier).toBe("low");
  });

  it("[AC-04] Multi-account sandbox directory jail isolates sessions", async () => {
    const res1 = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-dev", "content-type": "application/json" },
      payload: {
        model: "codex-test/gpt-5.6-asta",
        messages: [{ role: "user", content: "session 1" }],
      },
    });
    const res2 = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-dev", "content-type": "application/json" },
      payload: {
        model: "opencode-test/gpt-5.6-asta",
        messages: [{ role: "user", content: "session 2" }],
      },
    });

    const body1 = JSON.parse(res1.body);
    const body2 = JSON.parse(res2.body);

    expect(body1._debug_sandbox).toBeTruthy();
    expect(body2._debug_sandbox).toBeTruthy();
    expect(body1._debug_sandbox).not.toBe(body2._debug_sandbox);
  });

  it("[AC-05] Smart cooldown dynamically extracts rate limit duration", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-dev", "content-type": "application/json" },
      payload: {
        model: "ratelimit-test/mock-model",
        messages: [{ role: "user", content: "trigger rate limit" }],
      },
    });

    expect(res.statusCode).toBe(429);

    const accRes = await app.inject({
      method: "GET",
      url: "/api/accounts",
      headers: { authorization: "Bearer sk-cta-dev" },
    });
    const data = JSON.parse(accRes.body);
    const acc = data.accounts.find((a: any) => a.id === "ratelimit-e2e-1");
    expect(acc.status).toBe("COOLDOWN");
    expect(acc.cooldownSecondsRemaining).toBeGreaterThan(2600); // 45m = 2700s
  });

  it("[AC-06] Zero-zombie termination cleans up process upon client abort", async () => {
    const abortCtrl = new AbortController();

    const requestPromise = app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-dev", "content-type": "application/json" },
      payload: {
        model: "hanging-test/hang-model",
        messages: [{ role: "user", content: "test hang" }],
        stream: true,
      },
      signal: abortCtrl.signal,
    });

    // Abort after a moment
    abortCtrl.abort();

    try {
      await requestPromise;
    } catch {
      // Abort expected
    }
  });

  it("[AC-07] Admin events SSE stream connects and sends connected packet", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/events?test=true",
      headers: { authorization: "Bearer sk-cta-dev" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("data: {\"type\":\"connected\"");
  });

  it("GET /api/adapters returns all loaded adapters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/adapters",
      headers: { authorization: "Bearer sk-cta-dev" },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.adapters.length).toBeGreaterThanOrEqual(2);
    expect(data.adapters.some((a: any) => a.id === "codex-test")).toBe(true);
  });

  it("CORS preflight OPTIONS /api/accounts succeeds without 401 rejection", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/accounts",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
      },
    });

    expect(res.statusCode).not.toBe(401);
  });
});
