import { describe, it, expect } from "vitest";
import { DualStageAnsiSanitizer } from "../../apps/gateway/src/stream/ansi-sanitizer.js";

describe("DualStageAnsiSanitizer", () => {
  it("strips ANSI color and control codes cleanly", () => {
    const sanitizer = new DualStageAnsiSanitizer();
    const input = "\u001b[31mRed Alert\u001b[0m: \u001b[1mBold Text\u001b[0m";
    const result = sanitizer.processChunk(input) + sanitizer.flush();
    expect(result).toBe("Red Alert: Bold Text");
  });

  it("handles multi-byte UTF-8 split across chunk boundaries", () => {
    const sanitizer = new DualStageAnsiSanitizer();
    // Vietnamese "ế" is 2 bytes: 0xC3, 0xAA
    const fullBuffer = Buffer.from("Thế giới 🚀", "utf8");
    const part1 = fullBuffer.subarray(0, 3); // cuts midway inside "ế"
    const part2 = fullBuffer.subarray(3);

    const chunk1 = sanitizer.processChunk(part1);
    const chunk2 = sanitizer.processChunk(part2) + sanitizer.flush();

    expect(chunk1 + chunk2).toBe("Thế giới 🚀");
  });

  it("eliminates carriage return \\r spinner overwrites", () => {
    const sanitizer = new DualStageAnsiSanitizer();
    const spinnerStream = "\rThinking... ⠋\rThinking... ⠙\rThinking... ⠹\rHere is the real answer.\n";
    const result = sanitizer.processChunk(spinnerStream) + sanitizer.flush();

    expect(result).toBe("Here is the real answer.\n");
    expect(result).not.toContain("Thinking... ⠋");
  });

  it("preserves real-time streaming tokens without waiting for newline", () => {
    const sanitizer = new DualStageAnsiSanitizer();
    // Emitting individual token words with no newlines
    const delta1 = sanitizer.processChunk("Hello ");
    const delta2 = sanitizer.processChunk("world, ");
    const delta3 = sanitizer.processChunk("how are you?");

    expect(delta1).toBe("Hello ");
    expect(delta2).toBe("world, ");
    expect(delta3).toBe("how are you?");
  });
});
