import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  collectAnthropicStreamFrames,
  serializeAnthropicMessage,
} from "../../src/protocol/serialize-anthropic.js";
import type { CliEvent } from "../../src/core/types.js";
import { asAsyncEvents, PONG_EVENTS } from "./fixtures.js";

const opts = { requestId: "abc123", model: "claude-sonnet-4-5" };

const TOOL_EVENTS: CliEvent[] = [
  { type: "text_delta", text: "Checking." },
  { type: "tool_call", id: "toolu_a", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' },
  { type: "tool_call", id: "toolu_b", name: "get_time", argumentsJson: "{}" },
  { type: "usage", input: 10, cachedInput: 0, cacheWrite: 0, output: 20, reasoning: 0 },
  { type: "done", stopReason: "tool_use" },
];

describe("serializeAnthropicMessage", () => {
  it("matches snapshot for pong events", () => {
    const body = serializeAnthropicMessage(PONG_EVENTS, opts);
    expect(body).toMatchSnapshot();
  });

  it("includes tool_use blocks in event order", () => {
    const body = serializeAnthropicMessage(TOOL_EVENTS, opts);
    if ("content" in body) {
      expect(body.stop_reason).toBe("tool_use");
      expect(body.content).toEqual([
        { type: "text", text: "Checking." },
        { type: "tool_use", id: "toolu_a", name: "get_weather", input: { city: "Hanoi" } },
        { type: "tool_use", id: "toolu_b", name: "get_time", input: {} },
      ]);
    } else {
      throw new Error("expected message body");
    }
  });
});

describe("collectAnthropicStreamFrames", () => {
  it("matches snapshot for pong events", async () => {
    const frames = await collectAnthropicStreamFrames(await asAsyncEvents(PONG_EVENTS), opts);
    expect(frames.join("")).toMatchSnapshot();
  });

  it("uses sequential block indices for mixed content", async () => {
    const frames = await collectAnthropicStreamFrames(await asAsyncEvents(TOOL_EVENTS), opts);
    const starts = frames
      .filter((frame) => frame.includes('"content_block_start"'))
      .map((frame) => JSON.parse(frame.split("data: ")[1]!.trim()) as { index: number });
    expect(starts.map((row) => row.index)).toEqual([0, 1, 2]);
  });

  it("is accepted by the Anthropic SDK MessageStream parser", async () => {
    const frames = await collectAnthropicStreamFrames(await asAsyncEvents(PONG_EVENTS), opts);
    const sseBody = frames.join("");

    const client = new Anthropic({
      apiKey: "sk-test",
      baseURL: "http://localhost:8080",
      fetch: async () =>
        new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
    });

    const stream = client.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 256,
      messages: [{ role: "user", content: "ping" }],
    });

    let text = "";
    stream.on("text", (delta) => {
      text += delta;
    });

    const message = await stream.finalMessage();
    expect(text).toBe("pong");
    expect(message.stop_reason).toBe("end_turn");
    expect(message.usage.output_tokens).toBe(43);
  });

  it("is accepted by the Anthropic SDK for tool_use streams", async () => {
    const frames = await collectAnthropicStreamFrames(await asAsyncEvents(TOOL_EVENTS), opts);
    const sseBody = frames.join("");

    const client = new Anthropic({
      apiKey: "sk-test",
      baseURL: "http://localhost:8080",
      fetch: async () =>
        new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
    });

    const stream = client.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 256,
      messages: [{ role: "user", content: "weather?" }],
    });

    const message = await stream.finalMessage();
    expect(message.stop_reason).toBe("tool_use");
    const toolBlocks = message.content.filter((block) => block.type === "tool_use");
    expect(toolBlocks).toHaveLength(2);
  });
});
