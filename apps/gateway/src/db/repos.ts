import { and, eq, gt, inArray } from "drizzle-orm";
import type { Effort } from "../core/types.js";
import type { DbHandle } from "./db.js";
import {
  accounts,
  groupTargets,
  groups,
  requests,
  settings,
  accountRateLimits,
} from "./schema.js";

export interface GroupRow {
  id: string;
  name: string;
  defaultEffort: Effort | null;
  allowTools: boolean;
  cacheTtlSec: number;
  enabled: boolean;
}

export interface GroupTargetRow {
  id: string;
  groupId: string;
  tier: number;
  accountId: string | null;
  adapterId: string;
  modelId: string;
  effortOverride: Effort | null;
  enabled: boolean;
}

export interface AccountRow {
  id: string;
  adapterId: string;
  name: string;
  sandboxDir: string;
  maxConcurrent: number;
  cooldownUntil: number | null;
  cooldownReason: string | null;
  enabled: boolean;
  useHostProfile: boolean;
}

export interface SettingsMap {
  defaultCooldownSec: number;
  sessionTtlSec: number;
  requestTimeoutSec: number;
  queueTimeoutSec: number;
  toolResultTimeoutSec: number;
  toolMaxTurns: number;
}

export function loadSettings(handle: DbHandle): SettingsMap {
  const rows = handle.db.select().from(settings).all();
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    defaultCooldownSec: Number(map.default_cooldown_sec ?? 1800),
    sessionTtlSec: Number(map.session_ttl_sec ?? 86400),
    requestTimeoutSec: Number(map.request_timeout_sec ?? 600),
    queueTimeoutSec: Number(map.queue_timeout_sec ?? 30),
    toolResultTimeoutSec: Number(map.tool_result_timeout_sec ?? 300),
    toolMaxTurns: Number(map.tool_max_turns ?? 25),
  };
}

export function loadGroup(handle: DbHandle, groupId: string): GroupRow | undefined {
  return handle.db
    .select({
      id: groups.id,
      name: groups.name,
      defaultEffort: groups.defaultEffort,
      allowTools: groups.allowTools,
      cacheTtlSec: groups.cacheTtlSec,
      enabled: groups.enabled,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .get() as GroupRow | undefined;
}

export function loadGroupTargets(handle: DbHandle, groupId: string): GroupTargetRow[] {
  return handle.db
    .select({
      id: groupTargets.id,
      groupId: groupTargets.groupId,
      tier: groupTargets.tier,
      accountId: groupTargets.accountId,
      adapterId: groupTargets.adapterId,
      modelId: groupTargets.modelId,
      effortOverride: groupTargets.effortOverride,
      enabled: groupTargets.enabled,
    })
    .from(groupTargets)
    .where(and(eq(groupTargets.groupId, groupId), eq(groupTargets.enabled, true)))
    .all() as GroupTargetRow[];
}

export function loadEnabledAccounts(handle: DbHandle): AccountRow[] {
  return handle.db
    .select({
      id: accounts.id,
      adapterId: accounts.adapterId,
      name: accounts.name,
      sandboxDir: accounts.sandboxDir,
      maxConcurrent: accounts.maxConcurrent,
      cooldownUntil: accounts.cooldownUntil,
      cooldownReason: accounts.cooldownReason,
      enabled: accounts.enabled,
      useHostProfile: accounts.useHostProfile,
    })
    .from(accounts)
    .where(eq(accounts.enabled, true))
    .all() as AccountRow[];
}

export function loadAccount(handle: DbHandle, accountId: string): AccountRow | undefined {
  return handle.db
    .select({
      id: accounts.id,
      adapterId: accounts.adapterId,
      name: accounts.name,
      sandboxDir: accounts.sandboxDir,
      maxConcurrent: accounts.maxConcurrent,
      cooldownUntil: accounts.cooldownUntil,
      cooldownReason: accounts.cooldownReason,
      enabled: accounts.enabled,
      useHostProfile: accounts.useHostProfile,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get() as AccountRow | undefined;
}

export function setAccountCooldown(
  handle: DbHandle,
  accountId: string,
  cooldownUntil: number,
  reason: string,
): void {
  handle.db
    .update(accounts)
    .set({ cooldownUntil, cooldownReason: reason })
    .where(eq(accounts.id, accountId))
    .run();
}

export function upsertAccountRateLimit(
  handle: DbHandle,
  accountId: string,
  windowName: string,
  utilization: number,
  resetsAt: number,
  observedAt: number,
): void {
  handle.db
    .insert(accountRateLimits)
    .values({ accountId, windowName, utilization, resetsAt, observedAt })
    .onConflictDoUpdate({
      target: [accountRateLimits.accountId, accountRateLimits.windowName],
      set: { utilization, resetsAt, observedAt },
    })
    .run();
}

export interface RequestInsert {
  id: string;
  apiKeyId: string;
  dialect: string;
  modelRequested: string;
  groupId?: string | null;
  accountId?: string | null;
  adapterId?: string | null;
  modelExecuted?: string | null;
  status: string;
  errorKind?: string | null;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  cacheWriteTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  costUsd?: number | null;
  ttftMs?: number | null;
  durationMs?: number | null;
  sessionReused?: boolean | null;
  failoverCount?: number | null;
  createdAt: number;
}

export function insertRequest(handle: DbHandle, row: RequestInsert): void {
  handle.db.insert(requests).values(row).run();
}

export function earliestCooldownAmong(
  handle: DbHandle,
  accountIds: string[],
  now: number,
): number | null {
  if (accountIds.length === 0) {
    return null;
  }
  const rows = handle.db
    .select({ cooldownUntil: accounts.cooldownUntil })
    .from(accounts)
    .where(and(inArray(accounts.id, accountIds), gt(accounts.cooldownUntil, now)))
    .all();
  const times = rows
    .map((row) => row.cooldownUntil)
    .filter((value): value is number => value != null);
  return times.length > 0 ? Math.min(...times) : null;
}

export function accountsInCooldown(handle: DbHandle, accountIds: string[], now: number): string[] {
  if (accountIds.length === 0) {
    return [];
  }
  return handle.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(inArray(accounts.id, accountIds), gt(accounts.cooldownUntil, now)))
    .all()
    .map((row) => row.id);
}

export function countActiveCooldownAccounts(handle: DbHandle, accountIds: string[], now: number): number {
  if (accountIds.length === 0) {
    return 0;
  }
  return handle.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(inArray(accounts.id, accountIds), gt(accounts.cooldownUntil, now)))
    .all().length;
}
