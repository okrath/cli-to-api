import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import type { CliEvent } from "../../src/core/types.js";
import { bridgeEvents } from "../../src/router/bridge-events.js";
import {
  createBridge,
  deliverToolResults,
  noteParsedCall,
  onMcpCall,
  resetBridges,
} from "../../src/router/tool-bridge.js";

const repoRoot = join(import.meta.dirname, "../../../..");
const fixturePath = join(repoRoot, "tests/fixtures/claude-code-2.1.277-mcp-tool.jsonl");

function parseFixture(path: string): CliEvent[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => claudeCodeAdapter.parseLine(line));
}

async function collectEvents(source: AsyncIterable<CliEvent>): Promise<CliEvent[]> {
  const events: CliEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
}

function makeRun(source: AsyncIterator<CliEvent>, hooks?: { pause?: () => void; detachClientAbort?: () => void }) {
  return {
    source,
    toolCallIds: [] as string[],
    accountId: "acc",
    adapterId: "claude-code",
    modelId: "sonnet",
    pid: 1,
    requestId: "req_test",
    timeout: { pause: hooks?.pause ?? (() => {}), reset() {} },
    controller: new AbortController(),
    detachClientAbort: hooks?.detachClientAbort ?? (() => {}),
    attachClientAbort() {},
    release() {},
    roundsUsage: [] as Array<Extract<CliEvent, { type: "usage" }>>,
  };
}

async function* scriptedEvents(events: CliEvent[]): AsyncGenerator<CliEvent> {
  for (const event of events) yield event;
}

describe("bridge-events", () => {
  it("parks before yielding done when the consumer stops after done like OpenAI streaming", async () => {
    resetBridges();
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });
    let paused = false;
    let detached = false;
    const stream = bridgeEvents(
      bridge,
      makeRun(
        scriptedEvents([
          { type: "tool_call", id: "toolu_1", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' },
          { type: "usage", input: 1, cachedInput: 0, cacheWrite: 0, output: 2, reasoning: 0 },
          { type: "done", stopReason: "tool_use" },
        ])[Symbol.asyncIterator](),
        {
          pause: () => {
            paused = true;
          },
          detachClientAbort: () => {
            detached = true;
          },
        },
      ),
    );

    const iter = stream[Symbol.asyncIterator]();
    const collected: CliEvent[] = [];
    while (true) {
      const next = await iter.next();
      if (next.done) break;
      collected.push(next.value);
      if (next.value.type === "done") break;
    }

    expect(collected.some((e) => e.type === "done" && e.stopReason === "tool_use")).toBe(true);
    expect(bridge.parked).toBeDefined();
    expect(bridge.parked!.toolCallIds).toEqual(["toolu_1"]);
    expect(paused).toBe(true);
    expect(detached).toBe(true);
  });

  it("ends the round and parks on adapter done tool_use", async () => {
    resetBridges();
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });
    const events = await collectEvents(
      bridgeEvents(
        bridge,
        makeRun(
          scriptedEvents([
            { type: "tool_call", id: "toolu_1", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' },
            { type: "usage", input: 1, cachedInput: 0, cacheWrite: 0, output: 2, reasoning: 0 },
            { type: "done", stopReason: "tool_use" },
          ])[Symbol.asyncIterator](),
        ),
      ),
    );

    expect(events.some((e) => e.type === "done" && e.stopReason === "tool_use")).toBe(true);
    expect(bridge.parked).toBeDefined();
    expect(bridge.parked!.toolCallIds).toEqual(["toolu_1"]);
  });

  it("ends after 250 ms with a synthesised call when MCP arrives first", async () => {
    resetBridges();
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });
    const hangSource = {
      next: () => new Promise<{ done: false; value: CliEvent }>(() => {}),
    } as AsyncIterator<CliEvent>;

    noteParsedCall(bridge, {
      id: "toolu_synth",
      name: "get_weather",
      argumentsJson: '{"city":"Hanoi"}',
    });

    const stream = bridgeEvents(bridge, makeRun(hangSource));
    const iter = stream[Symbol.asyncIterator]();
    const first = iter.next();
    void onMcpCall(bridge, {
      name: "get_weather",
      argumentsJson: '{"city":"Hanoi"}',
      toolUseId: "toolu_synth",
    });

    const collected: CliEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const next =
        i === 0
          ? await Promise.race([
              first,
              new Promise<{ done: true; value: undefined }>((resolve) =>
                setTimeout(() => resolve({ done: true, value: undefined }), 1000),
              ),
            ])
          : await Promise.race([
              iter.next(),
              new Promise<{ done: true; value: undefined }>((resolve) =>
                setTimeout(() => resolve({ done: true, value: undefined }), 1000),
              ),
            ]);
      if (next.done) break;
      collected.push(next.value);
    }

    expect(collected.some((e) => e.type === "tool_call")).toBe(true);
    expect(collected.some((e) => e.type === "done" && e.stopReason === "tool_use")).toBe(true);
    expect(bridge.parked).toBeDefined();
  });

  it("continues round 2 after an early MCP result without a spurious tool_use stop", async () => {
    resetBridges();
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });
    noteParsedCall(bridge, {
      id: "toolu_1",
      name: "get_weather",
      argumentsJson: '{"city":"Hanoi"}',
    });
    deliverToolResults(bridge, [
      { toolCallId: "toolu_1", content: "31C, sunny", isError: false },
    ]);

    const hangSource = {
      next: () => new Promise<{ done: false; value: CliEvent }>(() => {}),
    } as AsyncIterator<CliEvent>;
    const run = makeRun(hangSource);
    run.roundsUsage.push({
      type: "usage",
      input: 10,
      cachedInput: 0,
      cacheWrite: 0,
      output: 5,
      reasoning: 0,
    });

    const stream = bridgeEvents(bridge, run);
    const iter = stream[Symbol.asyncIterator]();
    void onMcpCall(bridge, {
      name: "get_weather",
      argumentsJson: '{"city":"Hanoi"}',
      toolUseId: "toolu_1",
    });

    await new Promise((r) => setTimeout(r, 350));

    hangSource.next = async () => ({
      done: false,
      value: { type: "text_delta", text: "It is 31C and sunny in Hanoi." },
    });
    const text = await iter.next();
    expect(text.value).toEqual({ type: "text_delta", text: "It is 31C and sunny in Hanoi." });
  });

  it("resets firstMcpCallAt between rounds so round 2 is not cut off immediately", async () => {
    resetBridges();
    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });
    bridge.firstMcpCallAt = Date.now() - 60_000;

    const run = makeRun(
      scriptedEvents([
        { type: "text_delta", text: "It is 31C and sunny in Hanoi." },
        { type: "usage", input: 1, cachedInput: 0, cacheWrite: 0, output: 2, reasoning: 0 },
        { type: "done", stopReason: "end_turn" },
      ])[Symbol.asyncIterator](),
    );
    run.roundsUsage.push({
      type: "usage",
      input: 10,
      cachedInput: 0,
      cacheWrite: 0,
      output: 5,
      reasoning: 0,
    });

    const events = await collectEvents(bridgeEvents(bridge, run));
    expect(events.some((e) => e.type === "text_delta")).toBe(true);
    expect(events.some((e) => e.type === "done" && e.stopReason === "end_turn")).toBe(true);
    expect(events.some((e) => e.type === "done" && e.stopReason === "tool_use")).toBe(false);
  });

  it("records round-2 usage delta from the committed Claude fixture", async () => {
    resetBridges();
    const all = parseFixture(fixturePath);
    const round1End = all.findIndex((e) => e.type === "done" && e.stopReason === "tool_use");
    const round2End = all.findIndex((e) => e.type === "done" && e.stopReason === "end_turn");
    const round1 = all.slice(0, round1End + 1);
    const round2 = all.slice(round1End + 1, round2End + 1);

    const bridge = createBridge([{ name: "get_weather", parameters: {} }], {
      baseUrl: "http://127.0.0.1:8080",
      resultTimeoutMs: 5000,
    });

    const run1 = makeRun(scriptedEvents(round1)[Symbol.asyncIterator]());
    await collectEvents(bridgeEvents(bridge, run1));
    bridge.parked = undefined;

    const run2 = makeRun(scriptedEvents(round2)[Symbol.asyncIterator]());
    run2.roundsUsage = [...run1.roundsUsage];
    const round2Events = await collectEvents(bridgeEvents(bridge, run2));
    const usageEvents = round2Events.filter((e) => e.type === "usage");
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      input: 2,
      cacheWrite: 141,
      cachedInput: 15038,
      output: 156,
      costUsd: 0.06604159999999999,
    });
  });
});
