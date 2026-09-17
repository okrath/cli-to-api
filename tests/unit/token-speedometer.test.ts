import { describe, it, expect } from "vitest";
import { CircularTimestampBuffer } from "../../apps/gateway/src/telemetry/execution-registry.js";
import { estimateTextTokens, estimatePromptTokens, estimateTokenUsage } from "../../apps/gateway/src/utils/token-estimator.js";

describe("CircularTimestampBuffer (Token Speedometer)", () => {
  it("should calculate velocity accurately across sliding 3s window", () => {
    const buffer = new CircularTimestampBuffer(3000, 32);
    const baseTime = 1000000;

    // Stream 20 tokens at t=0, 20 tokens at t=1000ms, 20 tokens at t=2000ms
    buffer.addSample(20, baseTime);
    buffer.addSample(20, baseTime + 1000);
    buffer.addSample(20, baseTime + 2000);

    // At t=2000ms, 60 tokens over 2s elapsed => ~30 tokens/sec
    const velocity = buffer.getVelocity(baseTime + 2000);
    expect(velocity).toBeCloseTo(30, 0);
  });

  it("should ignore samples outside the sliding window cutoff", () => {
    const buffer = new CircularTimestampBuffer(3000, 32);
    const baseTime = 1000000;

    // Sample from 5 seconds ago (outside 3000ms window)
    buffer.addSample(100, baseTime - 5000);
    // Sample within window
    buffer.addSample(30, baseTime - 500);

    const velocity = buffer.getVelocity(baseTime);
    // Only the 30 tokens should count
    expect(velocity).toBeGreaterThan(0);
    expect(velocity).toBeLessThan(100);
  });

  it("should return 0 when buffer is empty or idle", () => {
    const buffer = new CircularTimestampBuffer(3000, 32);
    expect(buffer.getVelocity()).toBe(0);
  });
});

describe("Adaptive Multilingual Token Estimator", () => {
  it("should estimate ASCII / code text around ~3.7 chars per token", () => {
    const code = "const result = await processManager.executeStreaming(context);";
    const tokens = estimateTextTokens(code);
    expect(tokens).toBe(Math.ceil(code.length / 3.7));
  });

  it("should give higher token density for Vietnamese / Unicode text", () => {
    const vietnamese = "Đây là hệ thống giám sát tiến trình và đếm token thời gian thực.";
    const tokens = estimateTextTokens(vietnamese);
    // Non-ASCII characters should yield higher token counts than pure ASCII of same length
    expect(tokens).toBeGreaterThan(Math.ceil(vietnamese.length / 4.0));
  });

  it("should estimate prompt tokens with message structure overhead", () => {
    const messages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Xin chào, bạn có khỏe không?" },
    ];
    const promptTokens = estimatePromptTokens(messages);
    expect(promptTokens).toBeGreaterThan(10);
  });

  it("should return composite TokenUsage structure correctly", () => {
    const messages = [{ role: "user", content: "Hello world" }];
    const completion = "Hello! How can I help you today?";
    const usage = estimateTokenUsage(messages, completion);

    expect(usage.prompt_tokens).toBeGreaterThan(0);
    expect(usage.completion_tokens).toBeGreaterThan(0);
    expect(usage.total_tokens).toBe(usage.prompt_tokens + usage.completion_tokens);
  });
});
