import { createHash } from "node:crypto";
import { eq, lte } from "drizzle-orm";
import type { ChatMessage, CliEvent, Effort } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import { responseCache } from "../db/schema.js";

export interface CachedBody {
  thinking: string;
  text: string;
  usage?: Extract<CliEvent, { type: "usage" }>;
}

export function cacheKey(
  groupId: string,
  effort: Effort | undefined,
  maxTokens: number | undefined,
  messages: ChatMessage[],
): string {
  const payload = [
    groupId,
    "modelExecutedHint=group",
    effort ?? "",
    maxTokens ?? "",
    JSON.stringify(messages),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function getCache(handle: DbHandle, key: string, now: number): CachedBody | null {
  const row = handle.db.select().from(responseCache).where(eq(responseCache.key, key)).get();
  if (!row || row.expiresAt <= now) {
    return null;
  }
  return JSON.parse(row.bodyJson) as CachedBody;
}

export function setCache(
  handle: DbHandle,
  key: string,
  groupId: string,
  body: CachedBody,
  ttlSec: number,
  now: number,
): void {
  handle.db
    .insert(responseCache)
    .values({
      key,
      groupId,
      bodyJson: JSON.stringify(body),
      createdAt: now,
      expiresAt: now + ttlSec * 1000,
    })
    .onConflictDoUpdate({
      target: responseCache.key,
      set: {
        bodyJson: JSON.stringify(body),
        createdAt: now,
        expiresAt: now + ttlSec * 1000,
      },
    })
    .run();
}

export function purgeExpiredCache(handle: DbHandle, now: number): number {
  return handle.db.delete(responseCache).where(lte(responseCache.expiresAt, now)).run().changes;
}

export async function* replayCachedEvents(body: CachedBody): AsyncGenerator<CliEvent> {
  if (body.thinking.length > 0) {
    yield { type: "thinking_delta", text: body.thinking };
  }
  if (body.text.length > 0) {
    yield { type: "text_delta", text: body.text };
  }
  if (body.usage) {
    yield body.usage;
  }
  yield { type: "done", stopReason: "end_turn" };
}
