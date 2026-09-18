export interface TokenRates {
  promptPerMillion: number;      // USD per 1,000,000 prompt/input tokens
  completionPerMillion: number;  // USD per 1,000,000 completion/output tokens
  reasoningPerMillion: number;   // USD per 1,000,000 reasoning CoT tokens
}

// Standard benchmark pricing table (USD per 1M tokens)
export const MODEL_PRICING_TABLE: Record<string, TokenRates> = {
  // Anthropic Claude
  "claude-3-7-sonnet": { promptPerMillion: 3.0, completionPerMillion: 15.0, reasoningPerMillion: 15.0 },
  "claude-3-5-sonnet": { promptPerMillion: 3.0, completionPerMillion: 15.0, reasoningPerMillion: 15.0 },
  "claude-3-5-haiku":  { promptPerMillion: 0.8, completionPerMillion: 4.0,  reasoningPerMillion: 4.0 },
  "claude-3-opus":     { promptPerMillion: 15.0, completionPerMillion: 75.0, reasoningPerMillion: 75.0 },

  // OpenAI Flagship & Reasoning
  "gpt-4o":            { promptPerMillion: 2.5, completionPerMillion: 10.0, reasoningPerMillion: 10.0 },
  "gpt-4o-mini":       { promptPerMillion: 0.15, completionPerMillion: 0.6,  reasoningPerMillion: 0.6 },
  "o1":                { promptPerMillion: 15.0, completionPerMillion: 60.0, reasoningPerMillion: 60.0 },
  "o1-preview":        { promptPerMillion: 15.0, completionPerMillion: 60.0, reasoningPerMillion: 60.0 },
  "o1-mini":           { promptPerMillion: 3.0,  completionPerMillion: 12.0, reasoningPerMillion: 12.0 },
  "o3-mini":           { promptPerMillion: 1.1,  completionPerMillion: 4.4,  reasoningPerMillion: 4.4 },
  "gpt-4-turbo":       { promptPerMillion: 10.0, completionPerMillion: 30.0, reasoningPerMillion: 30.0 },

  // DeepSeek
  "deepseek-reasoner": { promptPerMillion: 0.55, completionPerMillion: 2.19, reasoningPerMillion: 2.19 },
  "deepseek-chat":     { promptPerMillion: 0.14, completionPerMillion: 0.28, reasoningPerMillion: 0.28 },

  // Google Gemini
  "gemini-1.5-pro":    { promptPerMillion: 1.25, completionPerMillion: 5.0,  reasoningPerMillion: 5.0 },
  "gemini-1.5-flash":  { promptPerMillion: 0.075, completionPerMillion: 0.3, reasoningPerMillion: 0.3 },
  "gemini-2.0-flash":  { promptPerMillion: 0.1,  completionPerMillion: 0.4,  reasoningPerMillion: 0.4 },
};

// Fallback tier rates
export const TIER_FALLBACK_TABLE: Record<string, TokenRates> = {
  "xhigh":   { promptPerMillion: 10.0, completionPerMillion: 30.0, reasoningPerMillion: 30.0 },
  "high":    { promptPerMillion: 3.0,  completionPerMillion: 15.0, reasoningPerMillion: 15.0 },
  "medium":  { promptPerMillion: 1.0,  completionPerMillion: 3.0,  reasoningPerMillion: 3.0 },
  "low":     { promptPerMillion: 0.2,  completionPerMillion: 0.8,  reasoningPerMillion: 0.8 },
  "default": { promptPerMillion: 1.5,  completionPerMillion: 5.0,  reasoningPerMillion: 5.0 },
};

/**
 * 3-Tier Fallback Pricing Resolver:
 * Tier 1: Exact or prefix match in MODEL_PRICING_TABLE
 * Tier 2: Heuristic keyword match (opus, o1, reasoner -> high; mini, haiku, flash -> low)
 * Tier 3: Default fallback rates
 */
export function resolveTokenRates(modelName?: string | null): TokenRates {
  if (!modelName || typeof modelName !== "string") {
    return TIER_FALLBACK_TABLE["default"];
  }

  const normalized = modelName.toLowerCase().trim();
  if (!normalized) {
    return TIER_FALLBACK_TABLE["default"];
  }

  // Tier 1: Exact or prefix matching
  for (const [key, rates] of Object.entries(MODEL_PRICING_TABLE)) {
    if (normalized === key || normalized.startsWith(key) || normalized.includes(key)) {
      return rates;
    }
  }

  // Tier 2: Heuristic keywords
  if (
    normalized.includes("haiku") ||
    normalized.includes("mini") ||
    normalized.includes("flash") ||
    normalized.includes("small") ||
    normalized.includes("nano")
  ) {
    return TIER_FALLBACK_TABLE["low"];
  }

  if (
    normalized.includes("opus") ||
    normalized.includes("o1") ||
    normalized.includes("reasoner") ||
    normalized.includes("large") ||
    normalized.includes("xhigh")
  ) {
    return TIER_FALLBACK_TABLE["high"];
  }

  // Tier 3: Default Fallback
  return TIER_FALLBACK_TABLE["default"];
}

/**
 * Calculate token cost in USD with Micro-Cent precision ($10^-6).
 * Safely guards against negative numbers or NaN.
 */
export function calculateMicroCost(
  promptTokens: number,
  completionTokens: number,
  reasoningTokens: number,
  rates: TokenRates
): number {
  const p = Math.max(0, Number.isFinite(promptTokens) ? promptTokens : 0);
  const c = Math.max(0, Number.isFinite(completionTokens) ? completionTokens : 0);
  const r = Math.max(0, Number.isFinite(reasoningTokens) ? reasoningTokens : 0);

  // Cost per token = rate / 1,000,000
  // In micro-cents (1/100th of a cent = 10^-6 USD):
  const promptCost = (p * rates.promptPerMillion) / 1_000_000;
  const completionCost = (c * rates.completionPerMillion) / 1_000_000;
  const reasoningCost = (r * rates.reasoningPerMillion) / 1_000_000;

  const total = promptCost + completionCost + reasoningCost;
  // Round to 6 decimal places (micro-cent level)
  return Math.round(total * 1_000_000) / 1_000_000;
}

/**
 * Format USD amount for human readable UI display.
 */
export function formatUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) {
    return "$0.00";
  }
  if (cost < 0.0001) {
    return "< $0.0001";
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}
