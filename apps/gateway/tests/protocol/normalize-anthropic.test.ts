import { describe, expect, it } from "vitest";
import { normalizeAnthropic } from "../../src/protocol/normalize-anthropic.js";
import { ProtocolError } from "../../src/protocol/errors.js";

const base = {
  headers: {},
  requestId: "req_test",
  apiKeyId: "key_test",
  clientAbort: new AbortController().signal,
};

describe("normalizeAnthropic", () => {
  it("normalizes a valid request", () => {
    const result = normalizeAnthropic({
      ...base,
      body: {
        model: "claude-sonnet-4-5",
        system: [{ type: "text", text: "System" }],
        messages: [{ role: "user", content: "hi" }],
        stream: true,
        thinking: { type: "enabled", budget_tokens: 4096 },
        metadata: { user_id: "user-1" },
      },
    });

    expect(result.dialect).toBe("anthropic");
    expect(result.maxTokens).toBe(8192);
    expect(result.effort).toBe("medium");
    expect(result.conversationHint).toBe("user-1");
    expect(result.messages[0]).toEqual({ role: "system", content: "System" });
  });

  it("maps tool_use and tool_result blocks", () => {
    const result = normalizeAnthropic({
      ...base,
      body: {
        model: "claude-sonnet-4-5",
        max_tokens: 100,
        messages: [
          { role: "user", content: "weather?" },
          {
            role: "assistant",
            content: [
              { type: "text", text: "Checking." },
              { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Hanoi" } },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_1",
                content: [{ type: "text", text: "31C sunny" }],
                is_error: false,
              },
              { type: "text", text: "Thanks" },
            ],
          },
        ],
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            input_schema: { type: "object", properties: { city: { type: "string" } } },
          },
        ],
      },
    });

    expect(result.tools?.[0]).toEqual({
      name: "get_weather",
      description: "Get weather",
      parameters: { type: "object", properties: { city: { type: "string" } } },
    });
    expect(result.messages[1]).toEqual({
      role: "assistant",
      content: "Checking.",
      toolCalls: [{ id: "toolu_1", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' }],
    });
    expect(result.messages[2]).toEqual({
      role: "tool",
      content: "31C sunny",
      toolCallId: "toolu_1",
    });
    expect(result.messages[3]).toEqual({ role: "user", content: "Thanks" });
  });

  it("marks tool_result is_error", () => {
    const result = normalizeAnthropic({
      ...base,
      body: {
        model: "claude-sonnet-4-5",
        max_tokens: 100,
        messages: [
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "toolu_1", name: "get_weather", input: {} }],
          },
          {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "toolu_1", is_error: true }],
          },
        ],
        tools: [{ name: "get_weather", input_schema: { type: "object", properties: {} } }],
      },
    });

    expect(result.messages[1]).toEqual({
      role: "tool",
      content: "",
      toolCallId: "toolu_1",
      isError: true,
    });
  });

  it("ignores thinking blocks in assistant replay", () => {
    const result = normalizeAnthropic({
      ...base,
      body: {
        model: "claude-sonnet-4-5",
        max_tokens: 100,
        messages: [
          {
            role: "assistant",
            content: [
              { type: "thinking" },
              { type: "text", text: "Done." },
            ],
          },
        ],
      },
    });

    expect(result.messages).toEqual([{ role: "assistant", content: "Done." }]);
  });

  it("drops tools when tool_choice is none", () => {
    const result = normalizeAnthropic({
      ...base,
      body: {
        model: "claude-sonnet-4-5",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
        tools: [{ name: "get_weather", input_schema: { type: "object", properties: {} } }],
        tool_choice: { type: "none" },
      },
    });

    expect(result.tools).toBeUndefined();
  });

  it("defaults max_tokens to 8192", () => {
    const result = normalizeAnthropic({
      ...base,
      body: {
        model: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "hi" }],
      },
    });
    expect(result.maxTokens).toBe(8192);
  });

  it("maps thinking budgets to effort", () => {
    const low = normalizeAnthropic({
      ...base,
      body: {
        model: "claude-sonnet-4-5",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
        thinking: { type: "enabled", budget_tokens: 1000 },
      },
    });
    expect(low.effort).toBe("low");

    const disabled = normalizeAnthropic({
      ...base,
      body: {
        model: "claude-sonnet-4-5",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
        thinking: { type: "disabled" },
      },
    });
    expect(disabled.effort).toBe("none");
  });

  it("rejects any tool_choice", () => {
    expect(() =>
      normalizeAnthropic({
        ...base,
        body: {
          model: "claude-sonnet-4-5",
          max_tokens: 100,
          messages: [{ role: "user", content: "hi" }],
          tools: [{ name: "get_weather", input_schema: { type: "object", properties: {} } }],
          tool_choice: { type: "any" },
        },
      }),
    ).toThrowError(/tool_choice must be "auto" or "none"/);
  });

  it("rejects specific tool tool_choice", () => {
    expect(() =>
      normalizeAnthropic({
        ...base,
        body: {
          model: "claude-sonnet-4-5",
          max_tokens: 100,
          messages: [{ role: "user", content: "hi" }],
          tools: [{ name: "get_weather", input_schema: { type: "object", properties: {} } }],
          tool_choice: { type: "tool", name: "get_weather" },
        },
      }),
    ).toThrowError(/tool_choice must be "auto" or "none"/);
  });

  it("rejects invalid tool names", () => {
    expect(() =>
      normalizeAnthropic({
        ...base,
        body: {
          model: "claude-sonnet-4-5",
          max_tokens: 100,
          messages: [{ role: "user", content: "hi" }],
          tools: [{ name: "bad name!", input_schema: { type: "object", properties: {} } }],
        },
      }),
    ).toThrowError(/invalid tool name/);
  });

  it("rejects tool_result without matching tool_use", () => {
    expect(() =>
      normalizeAnthropic({
        ...base,
        body: {
          model: "claude-sonnet-4-5",
          max_tokens: 100,
          messages: [
            {
              role: "user",
              content: [{ type: "tool_result", tool_use_id: "missing" }],
            },
          ],
          tools: [{ name: "get_weather", input_schema: { type: "object", properties: {} } }],
        },
      }),
    ).toThrowError(/tool message without a matching tool call/);
  });

  it("accepts common optional client params", () => {
    const result = normalizeAnthropic({
      ...base,
      body: {
        model: "claude-sonnet-4-5",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
        temperature: 0.7,
        top_p: 0.9,
        stop_sequences: ["END"],
      },
    });

    expect(result.model).toBe("claude-sonnet-4-5");
    expect(result.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("rejects non-text user content parts", () => {
    expect(() =>
      normalizeAnthropic({
        ...base,
        body: {
          model: "claude-sonnet-4-5",
          max_tokens: 100,
          messages: [{ role: "user", content: [{ type: "image", source: {} }] }],
        },
      }),
    ).toThrow(ProtocolError);
  });
});
