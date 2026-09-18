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

  it("rejects tools", () => {
    expect(() =>
      normalizeOpenAi({
        ...base,
        body: { model: "gpt-5", messages: [{ role: "user", content: "hi" }], tools: [] },
      }),
    ).toThrowError(/not supported by this gateway/);
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
});
