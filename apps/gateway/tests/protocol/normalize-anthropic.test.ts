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

  it("rejects tools", () => {
    expect(() =>
      normalizeAnthropic({
        ...base,
        body: {
          model: "claude-sonnet-4-5",
          max_tokens: 100,
          messages: [{ role: "user", content: "hi" }],
          tools: [],
        },
      }),
    ).toThrowError(/not supported by this gateway/);
  });

  it("rejects non-text content parts", () => {
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
