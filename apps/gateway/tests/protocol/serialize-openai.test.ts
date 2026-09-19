import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import {
  openAiStreamFrames,
  serializeOpenAiCompletion,
} from "../../src/protocol/serialize-openai.js";
import type { CliEvent } from "../../src/core/types.js";
import { asAsyncEvents, PONG_EVENTS } from "./fixtures.js";

const opts = {
  requestId: "abc123",
  model: "claude-sonnet-4-5",
  includeUsage: true,
  created: 1_700_000_000,
};

const TOOL_EVENTS: CliEvent[] = [
  { type: "text_delta", text: "Checking." },
  { type: "tool_call", id: "call_a", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' },
  { type: "tool_call", id: "call_b", name: "get_time", argumentsJson: "{}" },
  { type: "usage", input: 10, cachedInput: 0, cacheWrite: 0, output: 20, reasoning: 0 },
  { type: "done", stopReason: "tool_use" },
];

describe("openAiStreamFrames", () => {
  it("matches snapshot for pong events", async () => {
    const frames: string[] = [];
    for await (const frame of openAiStreamFrames(await asAsyncEvents(PONG_EVENTS), opts)) {
      frames.push(frame);
    }
    expect(frames).toMatchSnapshot();
  });

  it("emits tool_calls and finish_reason tool_calls", async () => {
    const frames: string[] = [];
    for await (const frame of openAiStreamFrames(await asAsyncEvents(TOOL_EVENTS), opts)) {
      frames.push(frame);
    }

    const parsed = frames.filter((f) => f !== "[DONE]").map((f) => JSON.parse(f));
    const toolChunks = parsed.filter((chunk) => chunk.choices?.[0]?.delta?.tool_calls);
    expect(toolChunks).toHaveLength(2);
    expect(toolChunks[0]?.choices[0].delta.tool_calls[0]).toMatchObject({
      index: 0,
      id: "call_a",
      type: "function",
      function: { name: "get_weather", arguments: '{"city":"Hanoi"}' },
    });
    expect(toolChunks[1]?.choices[0].delta.tool_calls[0].index).toBe(1);

    const finish = parsed.find((chunk) => chunk.choices?.[0]?.finish_reason === "tool_calls");
    expect(finish).toBeTruthy();
  });

  it("is accepted by the OpenAI SDK stream parser", async () => {
    const frames: string[] = [];
    for await (const frame of openAiStreamFrames(await asAsyncEvents(TOOL_EVENTS), opts)) {
      frames.push(frame);
    }

    const client = new OpenAI({
      apiKey: "sk-test",
      baseURL: "http://localhost:8080/v1",
      fetch: async () =>
        new Response(frames.map((line) => `data: ${line}\n\n`).join("") + "data: [DONE]\n\n", {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
    });

    const stream = await client.chat.completions.create({
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "weather?" }],
      stream: true,
    });

    let content = "";
    const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        content += delta.content;
      }
      if (delta?.tool_calls) {
        for (const call of delta.tool_calls) {
          const existing = toolCalls[call.index ?? 0];
          if (!existing) {
            toolCalls[call.index ?? 0] = {
              id: call.id ?? "",
              type: "function",
              function: { name: call.function?.name ?? "", arguments: call.function?.arguments ?? "" },
            };
          } else if (existing.type === "function") {
            if (call.function?.name) {
              existing.function.name = call.function.name;
            }
            if (call.function?.arguments) {
              existing.function.arguments += call.function.arguments;
            }
          }
        }
      }
    }

    expect(content).toBe("Checking.");
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]).toMatchObject({
      id: "call_a",
      function: { name: "get_weather", arguments: '{"city":"Hanoi"}' },
    });
    expect(toolCalls[1]).toMatchObject({
      id: "call_b",
      function: { name: "get_time", arguments: "{}" },
    });
  });
});

describe("serializeOpenAiCompletion", () => {
  it("matches snapshot for pong events", () => {
    const body = serializeOpenAiCompletion(PONG_EVENTS, opts);
    expect(body).toMatchSnapshot();
  });

  it("returns tool_calls with finish_reason tool_calls", () => {
    const body = serializeOpenAiCompletion(TOOL_EVENTS, opts);
    expect(body).toMatchObject({
      choices: [
        {
          message: {
            role: "assistant",
            content: "Checking.",
            tool_calls: [
              { id: "call_a", function: { name: "get_weather", arguments: '{"city":"Hanoi"}' } },
              { id: "call_b", function: { name: "get_time", arguments: "{}" } },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });
  });

  it("returns null content when there are tool calls but no text", () => {
    const body = serializeOpenAiCompletion(
      [
        { type: "tool_call", id: "call_a", name: "get_weather", argumentsJson: "{}" },
        { type: "done", stopReason: "tool_use" },
      ],
      opts,
    );
    expect(body).toMatchObject({
      choices: [{ message: { content: null, tool_calls: [{ id: "call_a" }] }, finish_reason: "tool_calls" }],
    });
  });
});
