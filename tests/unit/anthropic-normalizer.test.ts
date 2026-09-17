import { describe, it, expect } from "vitest";
import {
  AnthropicMessagesBodySchema,
  normalizeAnthropicMessages,
  resolveAnthropicEffort,
} from "../../apps/gateway/src/utils/anthropic-normalizer.js";

describe("Anthropic Request Normalizer & Effort Resolver", () => {
  it("parses and validates a standard Anthropic Messages request", () => {
    const raw = {
      model: "claude-3-7-sonnet-20250219",
      messages: [
        {
          role: "user",
          content: "Hello from Anthropic client",
        },
      ],
      max_tokens: 1024,
      stream: true,
    };

    const parsed = AnthropicMessagesBodySchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const messages = normalizeAnthropicMessages(parsed.data);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello from Anthropic client");
  });

  it("extracts system prompt string and prepends as system message", () => {
    const raw = {
      model: "claude-3-5-sonnet",
      system: "You are an expert coder.",
      messages: [{ role: "user", content: "Write quicksort" }],
    };

    const parsed = AnthropicMessagesBodySchema.parse(raw);
    const messages = normalizeAnthropicMessages(parsed);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe("You are an expert coder.");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toBe("Write quicksort");
  });

  it("extracts system prompt array of text blocks and joins them", () => {
    const raw = {
      model: "claude-3-5-sonnet",
      system: [
        { type: "text", text: "Instruction Part 1" },
        { type: "text", text: "Instruction Part 2" },
      ],
      messages: [{ role: "user", content: "Hi" }],
    };

    const parsed = AnthropicMessagesBodySchema.parse(raw);
    const messages = normalizeAnthropicMessages(parsed);

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe("Instruction Part 1\n\nInstruction Part 2");
  });

  it("normalizes array of content blocks in user message", () => {
    const raw = {
      model: "claude-3-5-sonnet",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Here is a code snippet:" },
            { type: "text", text: "const x = 42;" },
          ],
        },
      ],
    };

    const parsed = AnthropicMessagesBodySchema.parse(raw);
    const messages = normalizeAnthropicMessages(parsed);

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("Here is a code snippet:\nconst x = 42;");
  });

  it("resolves thinking budget tokens into discrete EffortLevels", () => {
    // 1. Low: <= 2048
    expect(
      resolveAnthropicEffort({
        model: "claude-3-7-sonnet",
        messages: [{ role: "user", content: "test" }],
        thinking: { type: "enabled", budget_tokens: 1024 },
      })
    ).toBe("low");

    // 2. Medium: 2049..8192
    expect(
      resolveAnthropicEffort({
        model: "claude-3-7-sonnet",
        messages: [{ role: "user", content: "test" }],
        thinking: { type: "enabled", budget_tokens: 4096 },
      })
    ).toBe("medium");

    // 3. High: 8193..16384
    expect(
      resolveAnthropicEffort({
        model: "claude-3-7-sonnet",
        messages: [{ role: "user", content: "test" }],
        thinking: { type: "enabled", budget_tokens: 16000 },
      })
    ).toBe("high");

    // 4. xhigh: > 16384
    expect(
      resolveAnthropicEffort({
        model: "claude-3-7-sonnet",
        messages: [{ role: "user", content: "test" }],
        thinking: { type: "enabled", budget_tokens: 32000 },
      })
    ).toBe("xhigh");

    // 5. Disabled thinking
    expect(
      resolveAnthropicEffort({
        model: "claude-3-7-sonnet",
        messages: [{ role: "user", content: "test" }],
        thinking: { type: "disabled" },
      })
    ).toBeNull();
  });

  it("falls back to header effort when thinking config is not set", () => {
    const body = {
      model: "claude-3-7-sonnet",
      messages: [{ role: "user", content: "test" }],
    };

    expect(resolveAnthropicEffort(body, "high")).toBe("high");
    expect(resolveAnthropicEffort(body, "low")).toBe("low");
    expect(resolveAnthropicEffort(body, undefined)).toBeNull();
  });
});
