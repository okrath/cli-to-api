import { describe, it, expect } from "vitest";
import {
  formatAnthropicMessage,
  formatAnthropicMessageStart,
  formatAnthropicBlockStart,
  formatAnthropicBlockDelta,
  formatAnthropicBlockStop,
  formatAnthropicMessageDelta,
  formatAnthropicMessageStop,
  formatAnthropicSseError,
} from "../../apps/gateway/src/stream/anthropic-serializer.js";

describe("Anthropic Event & Message Serializer", () => {
  it("formats unary response with text content block only", () => {
    const res = formatAnthropicMessage({
      id: "msg_test_123",
      model: "claude-3-7-sonnet",
      content: "Hello world",
      inputTokens: 10,
      outputTokens: 5,
    });

    expect(res.id).toBe("msg_test_123");
    expect(res.type).toBe("message");
    expect(res.role).toBe("assistant");
    expect(res.model).toBe("claude-3-7-sonnet");
    expect(res.stop_reason).toBe("end_turn");
    expect(res.content).toEqual([{ type: "text", text: "Hello world" }]);
    expect(res.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it("formats unary response with thinking and text content blocks", () => {
    const res = formatAnthropicMessage({
      id: "msg_test_456",
      model: "claude-3-7-sonnet",
      content: "Final answer",
      thoughtContent: "Step 1: Analyzed prompt\nStep 2: Synthesized reply",
      inputTokens: 25,
      outputTokens: 30,
    });

    expect(res.content).toHaveLength(2);
    expect(res.content[0]).toEqual({
      type: "thinking",
      thinking: "Step 1: Analyzed prompt\nStep 2: Synthesized reply",
    });
    expect(res.content[1]).toEqual({
      type: "text",
      text: "Final answer",
    });
  });

  it("formats compliant SSE events for Anthropic streaming lifecycle", () => {
    // 1. message_start
    const msgStart = formatAnthropicMessageStart("msg_999", "claude-3-7-sonnet", 15);
    expect(msgStart).toContain("event: message_start\n");
    expect(msgStart).toContain('"type":"message_start"');
    expect(msgStart).toContain('"id":"msg_999"');
    expect(msgStart).toContain('"input_tokens":15');

    // 2. content_block_start (thinking)
    const blockStartThinking = formatAnthropicBlockStart(0, "thinking");
    expect(blockStartThinking).toContain("event: content_block_start\n");
    expect(blockStartThinking).toContain('"type":"thinking"');
    expect(blockStartThinking).toContain('"index":0');

    // 3. content_block_delta (thinking_delta)
    const blockDeltaThinking = formatAnthropicBlockDelta(0, "thinking_delta", "Processing...");
    expect(blockDeltaThinking).toContain("event: content_block_delta\n");
    expect(blockDeltaThinking).toContain('"type":"thinking_delta"');
    expect(blockDeltaThinking).toContain('"thinking":"Processing..."');

    // 4. content_block_stop
    const blockStop = formatAnthropicBlockStop(0);
    expect(blockStop).toContain("event: content_block_stop\n");
    expect(blockStop).toContain('"index":0');

    // 5. content_block_start (text)
    const blockStartText = formatAnthropicBlockStart(1, "text");
    expect(blockStartText).toContain("event: content_block_start\n");
    expect(blockStartText).toContain('"type":"text"');
    expect(blockStartText).toContain('"index":1');

    // 6. content_block_delta (text_delta)
    const blockDeltaText = formatAnthropicBlockDelta(1, "text_delta", "Hello!");
    expect(blockDeltaText).toContain("event: content_block_delta\n");
    expect(blockDeltaText).toContain('"type":"text_delta"');
    expect(blockDeltaText).toContain('"text":"Hello!"');

    // 7. message_delta
    const msgDelta = formatAnthropicMessageDelta(42, "end_turn");
    expect(msgDelta).toContain("event: message_delta\n");
    expect(msgDelta).toContain('"stop_reason":"end_turn"');
    expect(msgDelta).toContain('"output_tokens":42');

    // 8. message_stop
    const msgStop = formatAnthropicMessageStop();
    expect(msgStop).toBe("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");
  });

  it("formats Anthropic SSE error event properly", () => {
    const errEvent = formatAnthropicSseError("api_error", "Upstream execution failure");
    expect(errEvent).toContain("event: error\n");
    expect(errEvent).toContain('"type":"error"');
    expect(errEvent).toContain('"message":"Upstream execution failure"');
  });
});
