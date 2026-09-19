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

  it("renders tool history in conversation blocks", () => {
    const result = renderTranscript([
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: "Checking.",
        toolCalls: [{ id: "call_1", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' }],
      },
      { role: "tool", toolCallId: "call_1", content: "31C sunny" },
    ]);

    expect(result.prompt).toContain("[assistant]");
    expect(result.prompt).toContain("Checking.");
    expect(result.prompt).toContain("[tool_call id=call_1 name=get_weather]");
    expect(result.prompt).toContain('{"city":"Hanoi"}');
    expect(result.prompt).toContain("[tool_result id=call_1]");
    expect(result.prompt).toContain("31C sunny");
  });

  it("marks error tool results", () => {
    const result = renderTranscript([
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "get_weather", argumentsJson: "{}" }],
      },
      { role: "tool", toolCallId: "call_1", content: "failed", isError: true },
    ]);

    expect(result.prompt).toContain("[tool_result id=call_1 error]");
  });

  it("uses trailing tool results when resuming after a tool round", () => {
    const result = renderTranscript(
      [
        { role: "user", content: "weather?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' }],
        },
        { role: "tool", toolCallId: "call_1", content: "31C sunny" },
      ],
      { resume: true },
    );

    expect(result.prompt).toBe(
      "[tool_result id=call_1]\n31C sunny\nContinue with these tool results.",
    );
  });
});
