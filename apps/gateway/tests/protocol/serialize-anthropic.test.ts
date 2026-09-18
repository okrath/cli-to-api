import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  collectAnthropicStreamFrames,
  serializeAnthropicMessage,
} from "../../src/protocol/serialize-anthropic.js";
import { PONG_EVENTS } from "./fixtures.js";

const opts = { requestId: "abc123", model: "claude-sonnet-4-5" };

describe("serializeAnthropicMessage", () => {
  it("matches snapshot for pong events", () => {
    const body = serializeAnthropicMessage(PONG_EVENTS, opts);
    expect(body).toMatchSnapshot();
  });
});

describe("collectAnthropicStreamFrames", () => {
  it("matches snapshot for pong events", () => {
    const frames = collectAnthropicStreamFrames(PONG_EVENTS, opts);
    expect(frames.join("")).toMatchSnapshot();
  });

  it("is accepted by the Anthropic SDK MessageStream parser", async () => {
    const frames = collectAnthropicStreamFrames(PONG_EVENTS, opts);
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
});
