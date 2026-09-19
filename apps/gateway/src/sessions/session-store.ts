import { createHash } from "node:crypto";
import { eq, lte } from "drizzle-orm";
import type { ChatMessage } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import { sessions } from "../db/schema.js";

export interface SessionRow {
  fingerprint: string;
  accountId: string;
  adapterId: string;
  modelId: string;
  cliSessionId: string;
  turns: number;
  lastUsedAt: number;
  expiresAt: number;
}

function normalizeMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    const normalized: Record<string, unknown> = {
      role: message.role,
      content: message.content.trim(),
    };
    if (message.toolCalls !== undefined) {
      normalized.toolCalls = message.toolCalls;
    }
    if (message.toolCallId !== undefined) {
      normalized.toolCallId = message.toolCallId;
    }
    if (message.isError !== undefined) {
      normalized.isError = message.isError;
    }
    return normalized;
  });
}

export function fingerprint(conversationHint: string | undefined, messages: ChatMessage[]): string {
  const payload = `${conversationHint ?? ""}|${JSON.stringify(normalizeMessages(messages))}`;
  return createHash("sha256").update(payload).digest("hex");
}

export function lookupFingerprint(
  conversationHint: string | undefined,
  messages: ChatMessage[],
): string | null {
  const nonSystem = messages.filter((message) => message.role !== "system");
  if (nonSystem.length < 2) {
    return null;
  }
  return fingerprint(conversationHint, messages.slice(0, -1));
}

export function findSession(handle: DbHandle, fp: string): SessionRow | undefined {
  return handle.db.select().from(sessions).where(eq(sessions.fingerprint, fp)).get() as
    | SessionRow
    | undefined;
}

export function replaceSession(
  handle: DbHandle,
  oldFingerprint: string | null,
  row: SessionRow,
): void {
  if (oldFingerprint && oldFingerprint !== row.fingerprint) {
    handle.db.delete(sessions).where(eq(sessions.fingerprint, oldFingerprint)).run();
  }
  handle.db
    .insert(sessions)
    .values(row)
    .onConflictDoUpdate({
      target: sessions.fingerprint,
      set: {
        accountId: row.accountId,
        adapterId: row.adapterId,
        modelId: row.modelId,
        cliSessionId: row.cliSessionId,
        turns: row.turns,
        lastUsedAt: row.lastUsedAt,
        expiresAt: row.expiresAt,
      },
    })
    .run();
}

export function deleteSession(handle: DbHandle, fp: string): void {
  handle.db.delete(sessions).where(eq(sessions.fingerprint, fp)).run();
}

export function purgeExpiredSessions(handle: DbHandle, now: number): number {
  return handle.db.delete(sessions).where(lte(sessions.expiresAt, now)).run().changes;
}
