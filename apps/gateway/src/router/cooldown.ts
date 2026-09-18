import type { CliEvent } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import { setAccountCooldown } from "../db/repos.js";

export function cooldownSecondsFromError(
  event: Extract<CliEvent, { type: "error" }>,
  latestRateLimit: Extract<CliEvent, { type: "rate_limit" }> | undefined,
  defaultCooldownSec: number,
  nowSec: number,
): { seconds: number; reason: string } {
  switch (event.kind) {
    case "rate_limit":
      if (event.retryAfterSec != null && event.retryAfterSec > 0) {
        return { seconds: event.retryAfterSec, reason: "rate_limit" };
      }
      if (latestRateLimit?.limited) {
        const saturated = latestRateLimit.windows
          .filter((window) => window.utilization >= 1)
          .sort((a, b) => b.utilization - a.utilization);
        if (saturated[0]) {
          const wait = Math.max(1, saturated[0].resetsAt - nowSec);
          return { seconds: wait, reason: "rate_limit" };
        }
      }
      return { seconds: defaultCooldownSec, reason: "rate_limit" };
    case "auth":
      return { seconds: 3600, reason: "not authenticated" };
    case "crash":
    case "timeout":
      return { seconds: 60, reason: event.kind };
    default:
      return { seconds: 60, reason: event.kind };
  }
}

export function applyCooldown(
  handle: DbHandle,
  accountId: string,
  seconds: number,
  reason: string,
  nowMs: number,
): number {
  const until = nowMs + seconds * 1000;
  setAccountCooldown(handle, accountId, until, reason);
  return until;
}
