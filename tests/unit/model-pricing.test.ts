import { describe, it, expect } from "vitest";
import {
  resolveTokenRates,
  calculateMicroCost,
  formatUsd,
  MODEL_PRICING_TABLE,
  TIER_FALLBACK_TABLE,
} from "../../apps/gateway/src/telemetry/model-pricing.js";

describe("Model Pricing Engine Unit Tests", () => {
  describe("resolveTokenRates", () => {
    it("should resolve exact model names correctly", () => {
      const claudeRates = resolveTokenRates("claude-3-7-sonnet");
      expect(claudeRates).toEqual(MODEL_PRICING_TABLE["claude-3-7-sonnet"]);
      expect(claudeRates.promptPerMillion).toBe(3.0);
      expect(claudeRates.completionPerMillion).toBe(15.0);
      expect(claudeRates.reasoningPerMillion).toBe(15.0);

      const gpt4oRates = resolveTokenRates("gpt-4o");
      expect(gpt4oRates).toEqual(MODEL_PRICING_TABLE["gpt-4o"]);
      expect(gpt4oRates.promptPerMillion).toBe(2.5);

      const o1Rates = resolveTokenRates("o1");
      expect(o1Rates).toEqual(MODEL_PRICING_TABLE["o1"]);
      expect(o1Rates.completionPerMillion).toBe(60.0);
    });

    it("should resolve dated model suffixes via prefix match", () => {
      const datedClaude = resolveTokenRates("claude-3-7-sonnet-20250219");
      expect(datedClaude).toEqual(MODEL_PRICING_TABLE["claude-3-7-sonnet"]);

      const datedGpt = resolveTokenRates("gpt-4o-2024-08-06");
      expect(datedGpt).toEqual(MODEL_PRICING_TABLE["gpt-4o"]);
    });

    it("should resolve heuristic tier fallbacks based on keywords", () => {
      const miniCustom = resolveTokenRates("custom-internal-mini-model");
      expect(miniCustom).toEqual(TIER_FALLBACK_TABLE["low"]);

      const haikuCustom = resolveTokenRates("open-haiku-tuned");
      expect(haikuCustom).toEqual(TIER_FALLBACK_TABLE["low"]);

      const opusCustom = resolveTokenRates("fine-tuned-opus-engine");
      expect(opusCustom).toEqual(TIER_FALLBACK_TABLE["high"]);

      const reasoningCustom = resolveTokenRates("qwen-reasoner-7b");
      expect(reasoningCustom).toEqual(TIER_FALLBACK_TABLE["high"]);
    });

    it("should fallback to default rates for unknown or missing model names", () => {
      expect(resolveTokenRates("random-unknown-model-xyz")).toEqual(TIER_FALLBACK_TABLE["default"]);
      expect(resolveTokenRates("")).toEqual(TIER_FALLBACK_TABLE["default"]);
      expect(resolveTokenRates(null)).toEqual(TIER_FALLBACK_TABLE["default"]);
      expect(resolveTokenRates(undefined)).toEqual(TIER_FALLBACK_TABLE["default"]);
    });
  });

  describe("calculateMicroCost", () => {
    it("should calculate exact cost for prompt, completion, and reasoning tokens", () => {
      const rates = {
        promptPerMillion: 3.0,
        completionPerMillion: 15.0,
        reasoningPerMillion: 15.0,
      };

      // 1,000 prompt tokens = $0.003
      // 500 reasoning tokens = $0.0075
      // 500 completion tokens = $0.0075
      // Total = $0.018
      const cost = calculateMicroCost(1000, 500, 500, rates);
      expect(cost).toBeCloseTo(0.018, 6);
    });

    it("should accurately maintain micro-cent precision without IEEE-754 drift", () => {
      const rates = {
        promptPerMillion: 2.5,
        completionPerMillion: 10.0,
        reasoningPerMillion: 10.0,
      };

      // 1 prompt token: 2.5 / 1,000,000 = $0.0000025 -> rounded to 6 decimals: 0.000003
      const costSingleToken = calculateMicroCost(1, 0, 0, rates);
      expect(costSingleToken).toBe(0.000003);

      // 100 prompt tokens: 250 / 1,000,000 = $0.00025
      const cost100 = calculateMicroCost(100, 0, 0, rates);
      expect(cost100).toBe(0.00025);
    });

    it("should guard defensively against negative or invalid token counts", () => {
      const rates = TIER_FALLBACK_TABLE["default"];
      expect(calculateMicroCost(-100, -50, -20, rates)).toBe(0);
      expect(calculateMicroCost(NaN, Infinity, 0, rates)).toBe(0);
    });
  });

  describe("formatUsd", () => {
    it("should format standard amounts with 2 decimal places", () => {
      expect(formatUsd(12.3456)).toBe("$12.35");
      expect(formatUsd(0.5)).toBe("$0.50");
      expect(formatUsd(1)).toBe("$1.00");
    });

    it("should format small sub-cent amounts with 4 decimal places", () => {
      expect(formatUsd(0.0042)).toBe("$0.0042");
      expect(formatUsd(0.0005)).toBe("$0.0005");
    });

    it("should handle sub-micro amounts and zeroes", () => {
      expect(formatUsd(0.00004)).toBe("< $0.0001");
      expect(formatUsd(0)).toBe("$0.00");
      expect(formatUsd(-5)).toBe("$0.00");
    });
  });
});
