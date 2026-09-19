import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { killTree } from "../../src/runner/kill-tree.js";

vi.mock("../../src/runner/kill-tree.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/runner/kill-tree.js")>();
  return { killTree: vi.fn(actual.killTree) };
});
import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import type { Adapter, CliEvent } from "../../src/core/types.js";
import type { ResolvedExecutable } from "../../src/runner/resolve-executable.js";

const repoRoot = join(import.meta.dirname, "../../../..");
const fakeCli = join(repoRoot, "tests/fake-cli/fake-cli.mjs");
const log = pino({ level: "silent" });

function resolvedFor(adapter: Adapter): ResolvedExecutable {
  return {
    file: adapter.executable,
    prefixArgs: [],
    shell: false,
    path: adapter.executable,
  };
}

function makeFakeAdapter(): Adapter {
  return {
    id: "fake" as Adapter["id"],
    executable: process.execPath,
    models: [{ id: "fake", label: "Fake" }],
    buildArgs() {
      return { args: [fakeCli], promptVia: "stdin" };
    },
    buildEnv: () => ({}),
    parseLine: (line) => claudeCodeAdapter.parseLine(line),
    parseStderr: (text) => claudeCodeAdapter.parseStderr?.(text) ?? [],
  };
}

async function collectEvents(iterable: AsyncIterable<CliEvent>): Promise<CliEvent[]> {
  const events: CliEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

async function waitUntilDead(pid: number, deadlineMs = 2000): Promise<void> {
  const start = Date.now();
  while (isProcessAlive(pid) && Date.now() - start < deadlineMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

function isProcessAlive(pid: number): boolean {
  if (process.platform === "win32") {
    const result = spawnSync("tasklist", ["/FI", `PID eq ${pid}`], { encoding: "utf8" });
    return result.stdout.includes(String(pid));
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("runCli with fake CLI", () => {
  let cwd: string;
  let runCli: typeof import("../../src/runner/run-cli.js").runCli;

  beforeEach(async () => {
    cwd = mkdtempSync(join(tmpdir(), "cli-to-api-run-"));
    vi.mocked(killTree).mockClear();
    vi.resetModules();
    ({ runCli } = await import("../../src/runner/run-cli.js"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("streams ok events with exactly one done", async () => {
    vi.stubEnv("FAKE_SCENARIO", "ok");
    const adapter = makeFakeAdapter();
    const { args, promptVia } = adapter.buildArgs({
      model: "fake",
      allowTools: false,
    });

    const { events } = runCli({
      adapter,
      resolved: resolvedFor(adapter),
      args,
      promptVia,
      prompt: "ping",
      env: { ...process.env, FAKE_SCENARIO: "ok", FAKE_TEXT: "pong" },
      cwd,
      timeoutMs: 5000,
      signal: new AbortController().signal,
      log,
    });

    const collected = await collectEvents(events);
    expect(collected.some((e) => e.type === "session")).toBe(true);
    expect(collected.some((e) => e.type === "text_delta")).toBe(true);
    const dones = collected.filter((e) => e.type === "done");
    expect(dones).toHaveLength(1);
    expect(dones[0]).toMatchObject({ stopReason: "end_turn" });
    expect(collected[collected.length - 1]?.type).toBe("done");
  });

  it("emits crash error on non-zero exit", async () => {
    const adapter = makeFakeAdapter();
    const { args, promptVia } = adapter.buildArgs({
      model: "fake",
      allowTools: false,
    });

    const { events } = runCli({
      adapter,
      resolved: resolvedFor(adapter),
      args,
      promptVia,
      prompt: "ping",
      env: { ...process.env, FAKE_SCENARIO: "crash" },
      cwd,
      timeoutMs: 5000,
      signal: new AbortController().signal,
      log,
    });

    const collected = await collectEvents(events);
    expect(collected.some((e) => e.type === "error" && e.kind === "crash")).toBe(true);
    expect(collected.filter((e) => e.type === "done")).toHaveLength(1);
  });

  it("times out hang scenario and kills the process", async () => {
    const adapter = makeFakeAdapter();
    const { args, promptVia } = adapter.buildArgs({
      model: "fake",
      allowTools: false,
    });

    const { pid, events } = runCli({
      adapter,
      resolved: resolvedFor(adapter),
      args,
      promptVia,
      prompt: "ping",
      env: { ...process.env, FAKE_SCENARIO: "hang" },
      cwd,
      timeoutMs: 500,
      signal: new AbortController().signal,
      log,
    });

    const childPid = await pid;
    const collected = await collectEvents(events);
    expect(collected.some((e) => e.type === "error" && e.kind === "timeout")).toBe(true);
    await waitUntilDead(childPid);
    expect(isProcessAlive(childPid)).toBe(false);
  });

  it("kills the process on abort", async () => {
    const adapter = makeFakeAdapter();
    const { args, promptVia } = adapter.buildArgs({
      model: "fake",
      allowTools: false,
    });
    const controller = new AbortController();

    const { pid, events } = runCli({
      adapter,
      resolved: resolvedFor(adapter),
      args,
      promptVia,
      prompt: "ping",
      env: { ...process.env, FAKE_SCENARIO: "hang" },
      cwd,
      timeoutMs: 30_000,
      signal: controller.signal,
      log,
    });

    const childPid = await pid;
    setTimeout(() => controller.abort(), 100);

    const collected = await collectEvents(events);
    expect(collected.filter((e) => e.type === "done")).toHaveLength(1);
    expect(collected[collected.length - 1]).toMatchObject({ type: "done", stopReason: "error" });
    await waitUntilDead(childPid);
    expect(isProcessAlive(childPid)).toBe(false);
  });

  it("timeout.pause prevents kill and reset re-arms it", async () => {
    const adapter = makeFakeAdapter();
    const { args, promptVia } = adapter.buildArgs({ model: "fake", allowTools: false });
    const controller = new AbortController();

    const { pid, events, timeout } = runCli({
      adapter,
      resolved: resolvedFor(adapter),
      args,
      promptVia,
      prompt: "ping",
      env: { ...process.env, FAKE_SCENARIO: "hang" },
      cwd,
      timeoutMs: 400,
      signal: controller.signal,
      log,
    });

    const childPid = await pid;
    timeout.pause();
    await new Promise((r) => setTimeout(r, 600));
    expect(isProcessAlive(childPid)).toBe(true);

    timeout.reset();
    await collectEvents(events);
    await waitUntilDead(childPid);
    expect(isProcessAlive(childPid)).toBe(false);
  });

  it("kills hang when the abort signal was already set before the stream starts", async () => {
    const adapter = makeFakeAdapter();
    const { args, promptVia } = adapter.buildArgs({
      model: "fake",
      allowTools: false,
    });
    const controller = new AbortController();
    controller.abort();

    const { pid, events } = runCli({
      adapter,
      resolved: resolvedFor(adapter),
      args,
      promptVia,
      prompt: "ping",
      env: { ...process.env, FAKE_SCENARIO: "hang" },
      cwd,
      timeoutMs: 30_000,
      signal: controller.signal,
      log,
    });

    const childPid = await pid;
    const collected = await collectEvents(events);
    expect(collected.filter((e) => e.type === "done")).toHaveLength(1);
    await waitUntilDead(childPid);
    expect(isProcessAlive(childPid)).toBe(false);
  });

  it("does not kill after the child exited", async () => {
    vi.stubEnv("FAKE_SCENARIO", "ok");
    const adapter = makeFakeAdapter();
    const { args, promptVia } = adapter.buildArgs({ model: "fake", allowTools: false });
    const controller = new AbortController();

    const { events, exited, kill } = runCli({
      adapter,
      resolved: resolvedFor(adapter),
      args,
      promptVia,
      prompt: "ping",
      env: { ...process.env, FAKE_SCENARIO: "ok", FAKE_TEXT: "pong" },
      cwd,
      timeoutMs: 300,
      signal: controller.signal,
      log,
    });

    await collectEvents(events);
    expect(await exited).toBe(0);
    controller.abort();
    kill();
    await new Promise((r) => setTimeout(r, 500));
    expect(vi.mocked(killTree)).not.toHaveBeenCalled();
  });

  it("kill() is a no-op after exit", async () => {
    vi.stubEnv("FAKE_SCENARIO", "ok");
    const adapter = makeFakeAdapter();
    const { args, promptVia } = adapter.buildArgs({ model: "fake", allowTools: false });

    const { events, exited, kill } = runCli({
      adapter,
      resolved: resolvedFor(adapter),
      args,
      promptVia,
      prompt: "ping",
      env: { ...process.env, FAKE_SCENARIO: "ok", FAKE_TEXT: "pong" },
      cwd,
      timeoutMs: 300,
      signal: new AbortController().signal,
      log,
    });

    await collectEvents(events);
    expect(await exited).toBe(0);
    kill();
    expect(vi.mocked(killTree)).not.toHaveBeenCalled();
  });

  it("replaces usage input fields from lastCallUsage after exit", async () => {
    vi.stubEnv("FAKE_SCENARIO", "ok");
    const base = makeFakeAdapter();
    const adapter: Adapter = {
      ...base,
      lastCallUsage: () => ({ input: 111, cachedInput: 22, cacheWrite: 3 }),
    };
    const { args, promptVia } = adapter.buildArgs({ model: "fake", allowTools: false });
    const dirs = { configDir: cwd, homeDir: cwd, workspaceDir: cwd };

    const { events } = runCli({
      adapter,
      resolved: resolvedFor(adapter),
      args,
      promptVia,
      prompt: "ping",
      env: { ...process.env, FAKE_SCENARIO: "ok", FAKE_TEXT: "pong" },
      cwd,
      timeoutMs: 5000,
      signal: new AbortController().signal,
      log,
      dirs,
    });

    const collected = await collectEvents(events);
    const usage = collected.find((e) => e.type === "usage");
    expect(usage).toMatchObject({
      type: "usage",
      input: 111,
      cachedInput: 22,
      cacheWrite: 3,
    });
    expect(usage && usage.type === "usage" ? usage.output : undefined).toBeGreaterThan(0);
    expect(collected.at(-2)?.type).toBe("usage");
    expect(collected.at(-1)?.type).toBe("done");
  });

  it("keeps usage unchanged when lastCallUsage returns undefined", async () => {
    vi.stubEnv("FAKE_SCENARIO", "ok");
    const base = makeFakeAdapter();
    const adapter: Adapter = {
      ...base,
      lastCallUsage: () => undefined,
    };
    const { args, promptVia } = adapter.buildArgs({ model: "fake", allowTools: false });
    const dirs = { configDir: cwd, homeDir: cwd, workspaceDir: cwd };

    const { events } = runCli({
      adapter,
      resolved: resolvedFor(adapter),
      args,
      promptVia,
      prompt: "ping",
      env: { ...process.env, FAKE_SCENARIO: "ok", FAKE_TEXT: "pong" },
      cwd,
      timeoutMs: 5000,
      signal: new AbortController().signal,
      log,
      dirs,
    });

    const collected = await collectEvents(events);
    const usage = collected.find((e) => e.type === "usage");
    expect(usage).toMatchObject({
      type: "usage",
      input: 1,
      cachedInput: 0,
      cacheWrite: 0,
    });
  });

  it("emits crash error when executable is missing", async () => {
    const adapter: Adapter = {
      id: "claude-code",
      executable: "definitely-not-a-binary-xyz",
      models: [],
      buildArgs: () => ({ args: [], promptVia: "stdin" }),
      buildEnv: () => ({}),
      parseLine: () => [],
    };

    const missing = "definitely-not-a-binary-xyz";
    const { pid, events } = runCli({
      adapter,
      resolved: { file: missing, prefixArgs: [], shell: false, path: missing },
      args: [],
      promptVia: "stdin",
      prompt: "ping",
      env: process.env,
      cwd,
      timeoutMs: 5000,
      signal: new AbortController().signal,
      log,
    });

    expect(await pid).toBe(-1);
    const collected = await collectEvents(events);
    expect(collected).toHaveLength(2);
    expect(collected[0]).toMatchObject({ type: "error", kind: "crash" });
    expect(collected[0]).toMatchObject({
      message: expect.stringMatching(/Could not start executable/i),
    });
    expect(collected[1]).toMatchObject({ type: "done", stopReason: "error" });
  });

  it("emits crash error instead of throwing when argv is too long (ENAMETOOLONG)", async () => {
    const adapter = makeFakeAdapter();

    const { pid, events } = runCli({
      adapter,
      resolved: resolvedFor(adapter),
      args: [fakeCli],
      promptVia: "argv",
      prompt: "x".repeat(500_000),
      env: { ...process.env, FAKE_SCENARIO: "ok" },
      cwd,
      timeoutMs: 5000,
      signal: new AbortController().signal,
      log,
    });

    expect(await pid).toBe(-1);
    const collected = await collectEvents(events);
    expect(collected).toHaveLength(2);
    expect(collected[0]).toMatchObject({ type: "error", kind: "crash" });
    expect(collected[0]).toMatchObject({
      message: expect.stringMatching(/ENAMETOOLONG/i),
    });
    expect(collected[1]).toMatchObject({ type: "done", stopReason: "error" });
  });
});
