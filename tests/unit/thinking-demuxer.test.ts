import { describe, it, expect, vi } from "vitest";
import { ThinkingDemuxer } from "../../apps/gateway/src/stream/thinking-demuxer.js";

describe("ThinkingDemuxer Unit Tests", () => {
  it("demuxes a standard single chunk with thinking and answer", () => {
    let thoughts = "";
    let content = "";
    const demuxer = new ThinkingDemuxer({
      onThoughtDelta: (t) => { thoughts += t; },
      onContentDelta: (c) => { content += c; },
    });

    demuxer.feed("<think>Phân tích bài toán 1+1.</think>Kết quả là 2.");
    demuxer.flush();

    expect(thoughts).toBe("Phân tích bài toán 1+1.");
    expect(content).toBe("Kết quả là 2.");
    expect(demuxer.phase).toBe("CONTENT");
  });

  it("demuxes <thought>...</thought> tags automatically", () => {
    let thoughts = "";
    let content = "";
    const demuxer = new ThinkingDemuxer({
      onThoughtDelta: (t) => { thoughts += t; },
      onContentDelta: (c) => { content += c; },
    });

    demuxer.feed("<thought>Internal chain of thought.</thought>Here is the answer.");
    demuxer.flush();

    expect(thoughts).toBe("Internal chain of thought.");
    expect(content).toBe("Here is the answer.");
    expect(demuxer.phase).toBe("CONTENT");
  });

  it("demuxes <reasoning>...</reasoning> tags automatically", () => {
    let thoughts = "";
    let content = "";
    const demuxer = new ThinkingDemuxer({
      onThoughtDelta: (t) => { thoughts += t; },
      onContentDelta: (c) => { content += c; },
    });

    demuxer.feed("<reasoning>Deductive reasoning steps.</reasoning>Output text.");
    demuxer.flush();

    expect(thoughts).toBe("Deductive reasoning steps.");
    expect(content).toBe("Output text.");
    expect(demuxer.phase).toBe("CONTENT");
  });

  it("handles multi-chunk split tags seamlessly without leaking tags", () => {
    let thoughts = "";
    let content = "";
    const demuxer = new ThinkingDemuxer({
      onThoughtDelta: (t) => { thoughts += t; },
      onContentDelta: (c) => { content += c; },
    });

    // Split open tag across chunks: "<thi" + "nk>"
    demuxer.feed("Bắt đầu: <thi");
    expect(content).toBe("Bắt đầu: ");
    expect(thoughts).toBe("");

    demuxer.feed("nk>Bước 1: Tính toán logic.</th");
    expect(thoughts).toBe("Bước 1: Tính toán logic.");

    // Split close tag across chunks: "</th" + "ink>"
    demuxer.feed("ink>Hoàn thành giải pháp.");
    demuxer.flush();

    expect(content).toBe("Bắt đầu: Hoàn thành giải pháp.");
    expect(thoughts).toBe("Bước 1: Tính toán logic.");
    expect(demuxer.phase).toBe("CONTENT");
  });

  it("handles 1-byte micro-chunks across tags", () => {
    let thoughts = "";
    let content = "";
    const demuxer = new ThinkingDemuxer({
      onThoughtDelta: (t) => { thoughts += t; },
      onContentDelta: (c) => { content += c; },
    });

    const input = "<think>abc</think>xyz";
    for (const ch of input) {
      demuxer.feed(ch);
    }
    demuxer.flush();

    expect(thoughts).toBe("abc");
    expect(content).toBe("xyz");
  });

  it("does not drop characters when encountering false-positive tag prefixes", () => {
    let thoughts = "";
    let content = "";
    const demuxer = new ThinkingDemuxer({
      onThoughtDelta: (t) => { thoughts += t; },
      onContentDelta: (c) => { content += c; },
    });

    demuxer.feed("Phương trình: x < this and y > 2.");
    demuxer.flush();

    expect(thoughts).toBe("");
    expect(content).toBe("Phương trình: x < this and y > 2.");
    expect(demuxer.phase).toBe("IDLE");
  });

  it("handles input with no thinking tags at all", () => {
    let thoughts = "";
    let content = "";
    const demuxer = new ThinkingDemuxer({
      onThoughtDelta: (t) => { thoughts += t; },
      onContentDelta: (c) => { content += c; },
    });

    demuxer.feed("Xin chào thế giới! Đây là câu trả lời bình thường.");
    demuxer.flush();

    expect(thoughts).toBe("");
    expect(content).toBe("Xin chào thế giới! Đây là câu trả lời bình thường.");
  });

  it("handles nested thinking tags properly", () => {
    let thoughts = "";
    let content = "";
    const demuxer = new ThinkingDemuxer({
      onThoughtDelta: (t) => { thoughts += t; },
      onContentDelta: (c) => { content += c; },
    });

    demuxer.feed("<think>Lớp ngoài <think>Lớp trong</think> Tiếp tục lớp ngoài</think>Xong.");
    demuxer.flush();

    expect(thoughts).toBe("Lớp ngoài Lớp trong Tiếp tục lớp ngoài");
    expect(content).toBe("Xong.");
    expect(demuxer.phase).toBe("CONTENT");
  });

  it("recovers gracefully on unclosed thinking tag at EOF (flush)", () => {
    let thoughts = "";
    let content = "";
    let finalPhase = "";
    const demuxer = new ThinkingDemuxer({
      onThoughtDelta: (t) => { thoughts += t; },
      onContentDelta: (c) => { content += c; },
      onPhaseChange: (p) => { finalPhase = p; },
    });

    demuxer.feed("<think>Đang giải bài toán chưa kịp xong...");
    demuxer.flush();

    expect(thoughts).toBe("Đang giải bài toán chưa kịp xong...");
    expect(content).toBe("");
    expect(demuxer.phase).toBe("CONTENT");
    expect(finalPhase).toBe("CONTENT");
  });

  it("measures thought duration deterministically with fake timers", () => {
    vi.useFakeTimers();
    try {
      const demuxer = new ThinkingDemuxer({
        onThoughtDelta: () => {},
        onContentDelta: () => {},
      });

      demuxer.feed("<think>Đang suy nghĩ...");
      vi.advanceTimersByTime(2500);
      demuxer.feed("</think>Xong!");
      demuxer.flush();

      expect(demuxer.getThoughtDurationMs()).toBe(2500);
    } finally {
      vi.useRealTimers();
    }
  });
});
