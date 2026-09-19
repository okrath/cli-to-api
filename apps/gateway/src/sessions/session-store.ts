import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ChatMessage } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import { sessions } from "../db/schema.js";
import { deleteSessionArtifacts, type RetentionDeps } from "./retention.js";

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

export type SessionStoreDeps = Pick<RetentionDeps, "dataDir" | "log"> & { db: DbHandle };

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

function dropArtifactsIfNeeded(
  deps: SessionStoreDeps | undefined,
  old: SessionRow | undefined,
  nextCliSessionId: string,
): void {
  if (!deps || !old || old.cliSessionId === nextCliSessionId) {
    return;
  }
  deleteSessionArtifacts(deps, {
    accountId: old.accountId,
    adapterId: old.adapterId,
    cliSessionId: old.cliSessionId,
  });
}

export function replaceSession(
  handle: DbHandle,
  oldFingerprint: string | null,
  row: SessionRow,
  deps?: SessionStoreDeps,
): void {
  const existingAtNew = findSession(handle, row.fingerprint);
  dropArtifactsIfNeeded(deps, existingAtNew, row.cliSessionId);

  if (oldFingerprint && oldFingerprint !== row.fingerprint) {
    const oldRow = findSession(handle, oldFingerprint);
    dropArtifactsIfNeeded(deps, oldRow, row.cliSessionId);
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

export function deleteSession(handle: DbHandle, fp: string, deps?: SessionStoreDeps): void {
  const row = findSession(handle, fp);
  if (row && deps) {
    deleteSessionArtifacts(deps, {
      accountId: row.accountId,
      adapterId: row.adapterId,
      cliSessionId: row.cliSessionId,
    });
  }
  handle.db.delete(sessions).where(eq(sessions.fingerprint, fp)).run();
}
