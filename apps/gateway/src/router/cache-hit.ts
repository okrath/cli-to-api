import { cacheKey, getCache, replayCachedEvents } from "../cache/response-cache.js";
import type { ChatMessage, ChatRequest, CliEvent, Effort } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import { recordUsage } from "../usage/record-usage.js";
import type { RouteMeta } from "./route-request.js";

export function tryCacheHit(
  handle: DbHandle,
  input: {
    req: ChatRequest;
    groupId: string;
    effort: Effort | undefined;
    messages: ChatMessage[];
    targets: Array<{ adapterId: string; modelId: string }>;
    startedAt: number;
    cacheTtlSec: number;
    now: number;
  },
): { events: AsyncIterable<CliEvent>; meta: RouteMeta } | null {
  if (input.cacheTtlSec <= 0) {
    return null;
  }
  const key = cacheKey(input.groupId, input.effort, input.req.maxTokens, input.messages);
  const cached = getCache(handle, key, input.now);
  if (!cached) {
    return null;
  }
  const meta: RouteMeta = {
    groupId: input.groupId,
    adapterId: input.targets[0]?.adapterId ?? "unknown",
    accountId: "",
    modelExecuted: input.targets[0]?.modelId ?? input.req.model,
    sessionReused: false,
    cacheHit: true,
    cacheEnabled: true,
    failoverCount: 0,
  };
  recordUsage(handle, {
    req: input.req,
    meta,
    events: [],
    startedAt: input.startedAt,
    status: "cache_hit",
    failoverCount: 0,
  });
  return { events: replayCachedEvents(cached), meta };
}
