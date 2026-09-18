import { eq } from "drizzle-orm";
import type { ChatRequest, CliEvent } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import { apiKeys } from "../db/schema.js";
import { insertRequest, upsertAccountRateLimit, type RequestInsert } from "../db/repos.js";
import type { RouteMeta } from "../router/route-request.js";

export interface RecordContext {
  req: ChatRequest;
  meta: RouteMeta;
  events: CliEvent[];
  startedAt: number;
  firstContentAt?: number | null;
  status: "ok" | "error" | "cache_hit";
  errorKind?: string;
  failoverCount: number;
}

function lastUsage(events: CliEvent[]): Extract<CliEvent, { type: "usage" }> | undefined {
  let usage: Extract<CliEvent, { type: "usage" }> | undefined;
  for (const event of events) {
    if (event.type === "usage") {
      usage = event;
    }
  }
  return usage;
}

export function recordUsage(handle: DbHandle, ctx: RecordContext): void {
  const usage = lastUsage(ctx.events);
  const now = Date.now();
  const row: RequestInsert = {
    id: ctx.req.requestId,
    apiKeyId: ctx.req.apiKeyId,
    dialect: ctx.req.dialect,
    modelRequested: ctx.req.model,
    groupId: ctx.meta.groupId ?? null,
    accountId: ctx.meta.accountId ?? null,
    adapterId: ctx.meta.adapterId,
    modelExecuted: ctx.meta.modelExecuted,
    status: ctx.status,
    errorKind: ctx.errorKind ?? null,
    inputTokens: usage?.input ?? null,
    cachedInputTokens: usage?.cachedInput ?? null,
    cacheWriteTokens: usage?.cacheWrite ?? null,
    outputTokens: usage?.output ?? null,
    reasoningTokens: usage?.reasoning ?? null,
    costUsd: usage?.costUsd ?? null,
    ttftMs:
      ctx.firstContentAt != null ? ctx.firstContentAt - ctx.startedAt : null,
    durationMs: now - ctx.startedAt,
    sessionReused: ctx.meta.sessionReused,
    failoverCount: ctx.failoverCount,
    createdAt: now,
  };
  insertRequest(handle, row);

  handle.db
    .update(apiKeys)
    .set({ lastUsedAt: now })
    .where(eq(apiKeys.id, ctx.req.apiKeyId))
    .run();

  const accountId = ctx.meta.accountId;
  if (accountId) {
    for (const event of ctx.events) {
      if (event.type !== "rate_limit") {
        continue;
      }
      const observedAt = Math.floor(now / 1000);
      for (const window of event.windows) {
        upsertAccountRateLimit(
          handle,
          accountId,
          window.name,
          window.utilization,
          window.resetsAt,
          observedAt,
        );
      }
    }
  }
}

export function routeResponseHeaders(meta: RouteMeta): Record<string, string> {
  const headers: Record<string, string> = {
    "x-cta-model": meta.modelExecuted,
    "x-cta-session-reused": meta.sessionReused ? "1" : "0",
    "x-cta-cache": meta.cacheHit ? "hit" : meta.cacheEnabled ? "miss" : "off",
    "x-cta-failovers": String(meta.failoverCount),
  };
  if (meta.accountId) {
    headers["x-cta-account"] = meta.accountId;
  }
  return headers;
}
