import { describe, expect, it } from "vitest";
import { normalizeOpenAi } from "../../src/protocol/normalize-openai.js";
import { ProtocolError } from "../../src/protocol/errors.js";

const base = {
  headers: {},
  requestId: "req_test",
  apiKeyId: "key_test",
  clientAbort: new AbortController().signal,
};

describe("normalizeOpenAi", () => {
  it("normalizes a valid request", () => {
    const result = normalizeOpenAi({
      ...base,
      body: {
        model: "claude-sonnet-4-5",
        messages: [
          { role: "developer", content: "Be helpful" },
          { role: "system", content: "Extra" },
          { role: "user", content: "hi" },
        ],
        stream: true,
        reasoning_effort: "minimal",
        max_completion_tokens: 100,
        user: "conv-1",
      },
      headers: { "x-conversation-id": "header-conv" },
    });

    expect(result.dialect).toBe("openai");
    expect(result.model).toBe("claude-sonnet-4-5");
    expect(result.stream).toBe(true);
    expect(result.effort).toBe("low");
    expect(result.maxTokens).toBe(100);
    expect(result.conversationHint).toBe("header-conv");
    expect(result.messages[0]).toEqual({ role: "system", content: "Be helpful\n\nExtra" });
    expect(result.messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("normalizes a tool loop request", () => {
    const result = normalizeOpenAi({
      ...base,
      body: {
        model: "gpt-5",
        messages: [
          { role: "user", content: "weather?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "get_weather", arguments: '{"city":"Hanoi"}' },
              },
            ],
          },
          { role: "tool", tool_call_id: "call_1", content: "31C sunny" },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get weather",
              parameters: { type: "object", properties: { city: { type: "string" } } },
            },
          },
        ],
      },
    });

    expect(result.tools).toEqual([
      {
        name: "get_weather",
        description: "Get weather",
        parameters: { type: "object", properties: { city: { type: "string" } } },
      },
    ]);
    expect(result.toolChoice).toBe("auto");
    expect(result.messages[1]).toEqual({
      role: "assistant",
      content: "",
      toolCalls: [{ id: "call_1", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' }],
    });
    expect(result.messages[2]).toEqual({
      role: "tool",
      content: "31C sunny",
      toolCallId: "call_1",
    });
  });

  it("re-serialises tool call arguments for stable fingerprints", () => {
    const result = normalizeOpenAi({
      ...base,
      body: {
        model: "gpt-5",
        messages: [
          {
            role: "assistant",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "get_weather", arguments: '{"city":"Hanoi"}' },
              },
            ],
          },
          { role: "tool", tool_call_id: "call_1", content: "ok" },
        ],
        tools: [{ type: "function", function: { name: "get_weather" } }],
      },
    });

    expect(result.messages[0]?.toolCalls?.[0]?.argumentsJson).toBe('{"city":"Hanoi"}');
  });

  it("treats empty tool arguments as {}", () => {
    const result = normalizeOpenAi({
      ...base,
      body: {
        model: "gpt-5",
        messages: [
          {
            role: "assistant",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "ping", arguments: "" },
              },
            ],
          },
          { role: "tool", tool_call_id: "call_1", content: "pong" },
        ],
        tools: [{ type: "function", function: { name: "ping" } }],
      },
    });

    expect(result.messages[0]?.toolCalls?.[0]?.argumentsJson).toBe("{}");
  });

  it("drops tools when tool_choice is none", () => {
    const result = normalizeOpenAi({
      ...base,
      body: {
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "get_weather" } }],
        tool_choice: "none",
      },
    });

    expect(result.tools).toBeUndefined();
    expect(result.toolChoice).toBeUndefined();
  });

  it("accepts parallel_tool_calls without effect", () => {
    const result = normalizeOpenAi({
      ...base,
      body: {
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "get_weather" } }],
        parallel_tool_calls: false,
      },
    });

    expect(result.tools).toHaveLength(1);
  });

  it("rejects non-text content parts", () => {
    expect(() =>
      normalizeOpenAi({
        ...base,
        body: {
          model: "gpt-5",
          messages: [{ role: "user", content: [{ type: "image", url: "x" }] }],
        },
      }),
    ).toThrow(ProtocolError);
  });

  it("rejects invalid tool names", () => {
    expect(() =>
      normalizeOpenAi({
        ...base,
        body: {
          model: "gpt-5",
          messages: [{ role: "user", content: "hi" }],
          tools: [{ type: "function", function: { name: "bad name!" } }],
        },
      }),
    ).toThrowError(/invalid tool name/);
  });

  it("rejects required tool_choice", () => {
    expect(() =>
      normalizeOpenAi({
        ...base,
        body: {
          model: "gpt-5",
          messages: [{ role: "user", content: "hi" }],
          tools: [{ type: "function", function: { name: "get_weather" } }],
          tool_choice: "required",
        },
      }),
    ).toThrowError(/tool_choice must be "auto" or "none"/);
  });

  it("rejects object tool_choice", () => {
    expect(() =>
      normalizeOpenAi({
        ...base,
        body: {
          model: "gpt-5",
          messages: [{ role: "user", content: "hi" }],
          tools: [{ type: "function", function: { name: "get_weather" } }],
          tool_choice: { type: "function", function: { name: "get_weather" } },
        },
      }),
    ).toThrowError(/tool_choice must be "auto" or "none"/);
  });

  it("rejects tool message without matching tool call", () => {
    expect(() =>
      normalizeOpenAi({
        ...base,
        body: {
          model: "gpt-5",
          messages: [{ role: "tool", tool_call_id: "missing", content: "x" }],
          tools: [{ type: "function", function: { name: "get_weather" } }],
        },
      }),
    ).toThrowError(/tool message without a matching tool call/);
  });

  it("rejects invalid tool call arguments", () => {
    expect(() =>
      normalizeOpenAi({
        ...base,
        body: {
          model: "gpt-5",
          messages: [
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "get_weather", arguments: "not-json" },
                },
              ],
            },
            { role: "tool", tool_call_id: "call_1", content: "x" },
          ],
          tools: [{ type: "function", function: { name: "get_weather" } }],
        },
      }),
    ).toThrowError(/tool call arguments must be a JSON object/);
  });

  it("rejects non-object tool call arguments", () => {
    expect(() =>
      normalizeOpenAi({
        ...base,
        body: {
          model: "gpt-5",
          messages: [
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "get_weather", arguments: "[]" },
                },
              ],
            },
            { role: "tool", tool_call_id: "call_1", content: "x" },
          ],
          tools: [{ type: "function", function: { name: "get_weather" } }],
        },
      }),
    ).toThrowError(/tool call arguments must be a JSON object/);
  });

  it("rejects functions", () => {
    expect(() =>
      normalizeOpenAi({
        ...base,
        body: { model: "gpt-5", messages: [{ role: "user", content: "hi" }], functions: [] },
      }),
    ).toThrowError(/not supported by this gateway/);
  });

  it("rejects response_format", () => {
    expect(() =>
      normalizeOpenAi({
        ...base,
        body: {
          model: "gpt-5",
          messages: [{ role: "user", content: "hi" }],
          response_format: { type: "json_object" },
        },
      }),
    ).toThrowError(/not supported by this gateway/);
  });

  it("accepts common optional client params", () => {
    const result = normalizeOpenAi({
      ...base,
      body: {
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
        temperature: 0.7,
        top_p: 0.9,
        stop: ["END"],
      },
    });

    expect(result.model).toBe("gpt-5");
    expect(result.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("rejects empty messages", () => {
    expect(() =>
      normalizeOpenAi({
        ...base,
        body: { model: "gpt-5", messages: [] },
      }),
    ).toThrow(ProtocolError);
  });

  it("treats empty tools array as no tools", () => {
    const result = normalizeOpenAi({
      ...base,
      body: {
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
        tools: [],
      },
    });

    expect(result.tools).toBeUndefined();
  });
});
