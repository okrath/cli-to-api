import { describe, it, expect } from "vitest";
import { stripThinkingTags } from "../../apps/gateway/src/utils/content-normalizer.js";
import { globalProcessManager } from "../../apps/gateway/src/supervisor/process-manager.js";

describe("Context Decontamination Unit Tests", () => {
  it("strips standard <think>...</think> tags", () => {
    const input = "<think>\nBước 1: Phân tích bài toán.\nBước 2: Tìm lời giải.\n</think>\nĐây là câu trả lời.";
    const result = stripThinkingTags(input);
    expect(result).toBe("Đây là câu trả lời.");
  });

  it("strips <thought>...</thought> tags as well", () => {
    const input = "<thought>Internal monologue</thought>The final answer.";
    const result = stripThinkingTags(input);
    expect(result).toBe("The final answer.");
  });

  it("handles text with no thinking tags", () => {
    const input = "Plain message without tags.";
    const result = stripThinkingTags(input);
    expect(result).toBe("Plain message without tags.");
  });

  it("preserves math expressions with comparison symbols like < or >", () => {
    const input = "Let x < 10 and y > 20.";
    const result = stripThinkingTags(input);
    expect(result).toBe("Let x < 10 and y > 20.");
  });

  it("decontaminates assistant messages when flattening conversation history", () => {
    const messages = [
      { role: "user", content: "Tell me about Pi." },
      {
        role: "assistant",
        content: "<think>Pi is 3.14159... Let me formulate explanation</think>Pi is an irrational number.",
      },
      { role: "user", content: "Can you give more digits?" },
    ];

    const prompt = globalProcessManager.flattenMessages(messages);

    expect(prompt).toContain("Human:\nTell me about Pi.");
    expect(prompt).toContain("Assistant:\nPi is an irrational number.");
    expect(prompt).not.toContain("<think>");
    expect(prompt).not.toContain("Pi is 3.14159... Let me formulate explanation");
    expect(prompt).toContain("Human:\nCan you give more digits?");
  });
});
