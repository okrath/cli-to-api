import { cacheKey, setCache, type CachedBody } from "../cache/response-cache.js";
import type { ChatMessage, ChatRequest, CliEvent, Effort } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import { loadSettings } from "../db/repos.js";
import {
  findSession,
  fingerprint as sessionFingerprint,
  replaceSession,
} from "../sessions/session-store.js";
import { recordUsage } from "../usage/record-usage.js";
import type { RouteMeta } from "./route-request.js";

function bodyFromEvents(events: CliEvent[]): CachedBody {
  let thinking = "";
  let text = "";
  let usage: Extract<CliEvent, { type: "usage" }> | undefined;
  for (const event of events) {
    if (event.type === "thinking_delta") thinking += event.text;
    else if (event.type === "text_delta") text += event.text;
    else if (event.type === "usage") usage = event;
  }
  return { thinking, text, usage };
}

function assistantMessage(events: CliEvent[]): string {
  let text = "";
  for (const event of events) {
    if (event.type === "text_delta") text += event.text;
  }
  return text;
}

export function trackCompletion(
  source: AsyncIterable<CliEvent>,
  ctx: {
    req: ChatRequest;
    db: DbHandle;
    meta: RouteMeta;
    startedAt: number;
    failoverCount: number;
    sessionFp: string | null;
    cacheTtlSec: number;
    groupId?: string;
    effort: Effort | undefined;
    release: () => void;
  },
): AsyncIterable<CliEvent> {
  const collected: CliEvent[] = [];
  let cliSessionId: string | undefined;
  let stopReason: "end_turn" | "max_tokens" | "tool_use" | "error" = "error";
  let firstContentAt: number | null = null;

  async function* generator(): AsyncGenerator<CliEvent> {
    try {
      for await (const event of source) {
        collected.push(event);
        if (
          firstContentAt == null &&
          (event.type === "thinking_delta" || event.type === "text_delta")
        ) {
          firstContentAt = Date.now();
        }
        if (event.type === "session") cliSessionId = event.cliSessionId;
        if (event.type === "done") stopReason = event.stopReason;
        yield event;
      }
    } finally {
      ctx.release();
      const status = collected.some((e) => e.type === "error") ? "error" : "ok";
      recordUsage(ctx.db, {
        req: ctx.req,
        meta: ctx.meta,
        events: collected,
        startedAt: ctx.startedAt,
        firstContentAt,
        status,
        errorKind: collected.find((e) => e.type === "error")?.kind,
        failoverCount: ctx.failoverCount,
      });

      if (
        cliSessionId &&
        ctx.meta.accountId &&
        (stopReason === "end_turn" || stopReason === "max_tokens")
      ) {
        const fullMessages: ChatMessage[] = [
          ...ctx.req.messages,
          { role: "assistant", content: assistantMessage(collected) },
        ];
        const fp = sessionFingerprint(ctx.req.conversationHint ?? "", fullMessages);
        const existing = ctx.sessionFp ? findSession(ctx.db, ctx.sessionFp) : undefined;
        replaceSession(ctx.db, ctx.sessionFp, {
          fingerprint: fp,
          accountId: ctx.meta.accountId,
          adapterId: ctx.meta.adapterId,
          modelId: ctx.meta.modelExecuted,
          cliSessionId,
          turns: (existing?.turns ?? 0) + 1,
          lastUsedAt: Date.now(),
          expiresAt: Date.now() + loadSettings(ctx.db).sessionTtlSec * 1000,
        });
      }

      if (ctx.cacheTtlSec > 0 && ctx.groupId && status === "ok") {
        const key = cacheKey(ctx.groupId, ctx.effort, ctx.req.maxTokens, ctx.req.messages);
        setCache(ctx.db, key, ctx.groupId, bodyFromEvents(collected), ctx.cacheTtlSec, Date.now());
      }
    }
  }

  return generator();
}
