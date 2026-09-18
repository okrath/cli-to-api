import { describe, expect, it } from "vitest";
import { renderTranscript } from "../../src/runner/render-transcript.js";

describe("renderTranscript", () => {
  it("returns raw user text for a single-turn request", () => {
    const result = renderTranscript([{ role: "user", content: "Hello" }]);
    expect(result).toEqual({ prompt: "Hello" });
  });

  it("extracts system prompt for adapters with a system flag", () => {
    const result = renderTranscript([
      { role: "system", content: "Be helpful" },
      { role: "user", content: "Hi" },
    ]);
    expect(result.systemPrompt).toBe("Be helpful");
    expect(result.prompt).toBe("Hi");
  });

  it("wraps multi-turn conversation", () => {
    const result = renderTranscript([
      { role: "user", content: "First" },
      { role: "assistant", content: "Reply" },
      { role: "user", content: "Second" },
    ]);
    expect(result.prompt).toContain("<conversation>");
    expect(result.prompt).toContain("[user]\nFirst");
    expect(result.prompt).toContain("[assistant]\nReply");
    expect(result.prompt).toContain("[user]\nSecond");
    expect(result.prompt).toContain("Continue the conversation");
  });

  it("returns only the newest user message when resuming", () => {
    const result = renderTranscript(
      [
        { role: "user", content: "Old" },
        { role: "assistant", content: "Old reply" },
        { role: "user", content: "New" },
      ],
      { resume: true },
    );
    expect(result).toEqual({ prompt: "New" });
  });

  it("inlines system prompt for adapters without a system flag", () => {
    const result = renderTranscript(
      [
        { role: "system", content: "Rules" },
        { role: "user", content: "Go" },
      ],
      { prependSystemInPrompt: true },
    );
    expect(result.systemPrompt).toBeUndefined();
    expect(result.prompt).toBe("<system>Rules</system>\n\nGo");
  });
});
