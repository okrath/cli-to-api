import { describe, it, expect } from "vitest";
import { normalizeContentToString } from "../../apps/gateway/src/utils/content-normalizer.js";

describe("Content Normalizer Utility", () => {
  it("preserves plain string content", () => {
    expect(normalizeContentToString("Hello world")).toBe("Hello world");
    expect(normalizeContentToString("   spaces   ")).toBe("   spaces   ");
  });

  it("handles null and undefined gracefully", () => {
    expect(normalizeContentToString(null)).toBe("");
    expect(normalizeContentToString(undefined)).toBe("");
  });

  it("extracts text from OpenAI text-part array", () => {
    const content = [{ type: "text", text: "Xin chào AI novel" }];
    const result = normalizeContentToString(content);
    expect(result).toBe("Xin chào AI novel");
    expect(result).not.toContain("[object Object]");
  });

  it("handles multimodal array with image and text parts", () => {
    const content = [
      { type: "image_url", image_url: { url: "data:image/webp;base64,abc123" } },
      { type: "text", text: "Hãy phân tích cổ vật này trong bối cảnh lịch sử." },
    ];
    const result = normalizeContentToString(content);
    expect(result).toContain("[image]");
    expect(result).toContain("Hãy phân tích cổ vật này trong bối cảnh lịch sử.");
    expect(result).not.toContain("[object Object]");
  });

  it("handles array with raw string items", () => {
    const content = ["Dòng 1", "Dòng 2"];
    const result = normalizeContentToString(content);
    expect(result).toBe("Dòng 1\nDòng 2");
  });

  it("handles object with text property", () => {
    const content = { text: "Nội dung trong object" };
    expect(normalizeContentToString(content)).toBe("Nội dung trong object");
  });
});
