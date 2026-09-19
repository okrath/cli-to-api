import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliEvent } from "../../src/core/types.js";
import * as retention from "../../src/sessions/retention.js";
import {
  createBridge,
  deliverToolResults,
  finishBridge,
  getBridge,
  noteParsedCall,
  onMcpCall,
  resetBridges,
  sweepExpiredBridges,
  takeParkedRun,
} from "../../src/router/tool-bridge.js";

const log = pino({ level: "silent" });

function emptySource(): AsyncIterator<CliEvent> {
  return {
    next: async () => ({ done: true, value: undefined as never }),
  };
}

describe("tool-bridge", () => {
  beforeEach(() => {
    resetBridges();
  });

  afterEach(() => {
    resetBridges();
    vi.restoreAllMocks();
  });

  it("matches MCP calls by toolUseId", async () => {
    const bridge = createBridge(
      [{ name: "get_weather", parameters: { type: "object", properties: {} } }],
      { baseUrl: "http://127.0.0.1:8080", resultTimeoutMs: 5000 },
    );
    noteParsedCall(bridge, { id: "toolu_1", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' });

    const pending = onMcpCall(bridge, {
      name: "get_weather",
      argumentsJson: '{"city":"Other"}',
      toolUseId: "toolu_1",
    });
    deliverToolResults(bridge, [{ toolCallId: "toolu_1", content: "31C", isError: false }]);
    await expect(pending).resolves.toEqual({ content: "31C", isError: false });
  });

  it("matches MCP calls by name and JSON-equal arguments FIFO", async () => {
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });
    noteParsedCall(bridge, { id: "a", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' });
    noteParsedCall(bridge, { id: "b", name: "get_weather", argumentsJson: '{"city":"Hue"}' });

    const p1 = onMcpCall(bridge, { name: "get_weather", argumentsJson: '{"city":"Hanoi"}' });
    deliverToolResults(bridge, [{ toolCallId: "a", content: "r1", isError: false }]);
    await expect(p1).resolves.toEqual({ content: "r1", isError: false });

    const p2 = onMcpCall(bridge, { name: "get_weather", argumentsJson: '{"city":"Hue"}' });
    deliverToolResults(bridge, [{ toolCallId: "b", content: "r2", isError: false }]);
    await expect(p2).resolves.toEqual({ content: "r2", isError: false });
  });

  it("synthesises a tool call when no parsed call matches", async () => {
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });
    const pending = onMcpCall(bridge, {
      name: "get_weather",
      argumentsJson: '{"city":"Hanoi"}',
    });
    expect(bridge.parsedCalls).toHaveLength(1);
    expect(bridge.parsedCalls[0]!.id).toMatch(/^call_/);
    deliverToolResults(bridge, [
      { toolCallId: bridge.parsedCalls[0]!.id, content: "ok", isError: false },
    ]);
    await expect(pending).resolves.toEqual({ content: "ok", isError: false });
  });

  it("resolves immediately when an early result exists", async () => {
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });
    noteParsedCall(bridge, { id: "toolu_1", name: "get_weather", argumentsJson: "{}" });
    deliverToolResults(bridge, [{ toolCallId: "toolu_1", content: "early", isError: false }]);

    await expect(
      onMcpCall(bridge, { name: "get_weather", argumentsJson: "{}", toolUseId: "toolu_1" }),
    ).resolves.toEqual({ content: "early", isError: false });
  });

  it("does not arm MCP-first round end when resolving from an early result", async () => {
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });
    noteParsedCall(bridge, { id: "toolu_1", name: "get_weather", argumentsJson: "{}" });
    deliverToolResults(bridge, [{ toolCallId: "toolu_1", content: "early", isError: false }]);
    const onRoundMcpCall = vi.fn();
    bridge.onMcpCall = onRoundMcpCall;

    await onMcpCall(bridge, { name: "get_weather", argumentsJson: "{}", toolUseId: "toolu_1" });

    expect(bridge.firstMcpCallAt).toBeUndefined();
    expect(onRoundMcpCall).not.toHaveBeenCalled();
    expect(bridge.pending.size).toBe(0);
  });

  it("takeParkedRun rejects partial or foreign ids", () => {
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });
    const release = vi.fn();
    bridge.parked = {
      source: emptySource(),
      toolCallIds: ["toolu_1"],
      accountId: "acc",
      adapterId: "fake",
      modelId: "fake",
      pid: 1,
      requestId: "req_old",
      timeout: { pause() {}, reset() {} },
      controller: new AbortController(),
      detachClientAbort() {},
      attachClientAbort() {},
      release,
      roundsUsage: [],
    };
    bridge.pending.set("toolu_1", {
      name: "get_weather",
      argumentsJson: "{}",
      resolve: () => {},
      reject: () => {},
    });

    expect(takeParkedRun(["toolu_1", "foreign"])).toBeUndefined();
    expect(bridge.parked).toBeDefined();

    const taken = takeParkedRun(["toolu_1"]);
    expect(taken?.bridge).toBe(bridge);
    expect(taken?.run.toolCallIds).toEqual(["toolu_1"]);
    expect(bridge.parked).toBeUndefined();
  });

  it("sweep kills parked runs, releases slots, and rejects pending", () => {
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 1000,
    });
    bridge.expiresAt = Date.now() - 1;
    const release = vi.fn();
    const kill = vi.fn();
    bridge.parked = {
      source: emptySource(),
      toolCallIds: ["toolu_1"],
      accountId: "acc",
      adapterId: "fake",
      modelId: "fake",
      pid: 4242,
      requestId: "req_old",
      timeout: { pause() {}, reset() {} },
      controller: new AbortController(),
      detachClientAbort() {},
      attachClientAbort() {},
      release,
      roundsUsage: [],
    };
    let rejected = false;
    bridge.pending.set("toolu_1", {
      name: "get_weather",
      argumentsJson: "{}",
      resolve: () => {},
      reject: () => {
        rejected = true;
      },
    });

    expect(sweepExpiredBridges(Date.now(), kill, log)).toBe(1);
    expect(kill).toHaveBeenCalledWith(4242, log);
    expect(release).toHaveBeenCalled();
    expect(rejected).toBe(true);
    expect(getBridge(bridge.id)).toBeUndefined();
  });

  it("sweep deletes artifacts for expired ephemeral parked runs", () => {
    const deleteArtifacts = vi.spyOn(retention, "deleteRunArtifacts").mockReturnValue([]);
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 1000,
    });
    bridge.expiresAt = Date.now() - 1;
    const kill = vi.fn();
    const retentionDeps = {
      db: {} as import("../../src/db/db.js").DbHandle,
      dataDir: "/tmp",
      log,
    };
    bridge.parked = {
      source: emptySource(),
      toolCallIds: ["toolu_1"],
      ephemeral: true,
      cliSessionId: "sess_ephemeral",
      accountId: "acc",
      adapterId: "fake",
      modelId: "fake",
      pid: 0,
      requestId: "req_old",
      timeout: { pause() {}, reset() {} },
      controller: new AbortController(),
      detachClientAbort() {},
      attachClientAbort() {},
      release: vi.fn(),
      roundsUsage: [],
    };

    expect(sweepExpiredBridges(Date.now(), kill, log, retentionDeps)).toBe(1);
    expect(deleteArtifacts).toHaveBeenCalledWith(
      retentionDeps,
      "acc",
      "fake",
      "sess_ephemeral",
    );
    deleteArtifacts.mockRestore();
  });

  it("sweep leaves active bridges for finishBridge", () => {
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 1000,
    });
    bridge.expiresAt = Date.now() - 1;
    const kill = vi.fn();

    expect(sweepExpiredBridges(Date.now(), kill, log)).toBe(0);
    expect(kill).not.toHaveBeenCalled();
    expect(getBridge(bridge.id)).toBe(bridge);
  });

  it("finishBridge rejects pending waiters", async () => {
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });
    noteParsedCall(bridge, { id: "toolu_1", name: "get_weather", argumentsJson: "{}" });
    const pending = onMcpCall(bridge, {
      name: "get_weather",
      argumentsJson: "{}",
      toolUseId: "toolu_1",
    });
    finishBridge(bridge);
    await expect(pending).rejects.toThrow("bridge finished");
    expect(getBridge(bridge.id)).toBeUndefined();
  });
});
