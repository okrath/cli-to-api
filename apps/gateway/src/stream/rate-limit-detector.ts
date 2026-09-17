import { RateLimitPattern } from "../adapters/schema.js";

export interface RateLimitCheckResult {
  isRateLimited: boolean;
  cooldownSeconds: number;
  matchedPattern?: string;
  reason?: string;
}

export function checkRateLimit(
  text: string,
  patterns: RateLimitPattern[],
  defaultCooldownSeconds = 1800
): RateLimitCheckResult {
  if (!text || patterns.length === 0) {
    return { isRateLimited: false, cooldownSeconds: 0 };
  }

  for (const p of patterns) {
    const regex = new RegExp(p.pattern, "i");
    const match = regex.exec(text);

    if (match) {
      let seconds = p.cooldown_seconds_default || defaultCooldownSeconds;

      if (p.dynamic_extractor) {
        const extracted = extractDurationSeconds(text);
        if (extracted > 0) {
          seconds = extracted;
        }
      }

      return {
        isRateLimited: true,
        cooldownSeconds: seconds,
        matchedPattern: p.pattern,
        reason: match[0] || "Rate limit pattern matched",
      };
    }
  }

  return { isRateLimited: false, cooldownSeconds: 0 };
}

export function extractDurationSeconds(text: string): number {
  let total = 0;

  // Check hours e.g. "2h" or "2 hours"
  const hoursMatch = /(\d+)\s*(?:h|hours?)/i.exec(text);
  if (hoursMatch && hoursMatch[1]) {
    total += parseInt(hoursMatch[1], 10) * 3600;
  }

  // Check minutes e.g. "45m" or "45 minutes"
  const minutesMatch = /(\d+)\s*(?:m|mins?|minutes?)/i.exec(text);
  if (minutesMatch && minutesMatch[1]) {
    total += parseInt(minutesMatch[1], 10) * 60;
  }

  // Check seconds e.g. "30s" or "30 seconds"
  const secondsMatch = /(\d+)\s*(?:s|secs?|seconds?)/i.exec(text);
  if (secondsMatch && secondsMatch[1]) {
    total += parseInt(secondsMatch[1], 10);
  }

  return total;
}
