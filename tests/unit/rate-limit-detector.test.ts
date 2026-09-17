import { describe, it, expect } from "vitest";
import { checkRateLimit, extractDurationSeconds } from "../../apps/gateway/src/stream/rate-limit-detector.js";
import { RateLimitPattern } from "../../apps/gateway/src/adapters/schema.js";

describe("RateLimitDetector", () => {
  const patterns: RateLimitPattern[] = [
    {
      pattern: "rate limit reached|usage limit exceeded|resets in (\\d+m|\\d+h)",
      cooldown_seconds_default: 1800,
      dynamic_extractor: true,
    },
    {
      pattern: "rate limit exceeded",
      cooldown_seconds_default: 900,
      dynamic_extractor: false,
    },
  ];

  it("extracts hours and minutes dynamically", () => {
    expect(extractDurationSeconds("resets in 2h 15m")).toBe(2 * 3600 + 15 * 60);
    expect(extractDurationSeconds("Error: resets in 45m please wait")).toBe(45 * 60);
    expect(extractDurationSeconds("Try again in 30s")).toBe(30);
  });

  it("identifies rate limit match and sets dynamic duration", () => {
    const output = "Error 429: You have reached usage limit. resets in 45m";
    const res = checkRateLimit(output, patterns);

    expect(res.isRateLimited).toBe(true);
    expect(res.cooldownSeconds).toBe(45 * 60);
  });

  it("falls back to default cooldown if no time unit is present", () => {
    const output = "rate limit exceeded without time mentioned";
    const res = checkRateLimit(output, patterns);

    expect(res.isRateLimited).toBe(true);
    expect(res.cooldownSeconds).toBe(900);
  });

  it("returns isRateLimited false on clean output", () => {
    const output = "Here is the response text from the AI model.";
    const res = checkRateLimit(output, patterns);

    expect(res.isRateLimited).toBe(false);
  });
});
