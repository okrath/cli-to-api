import type { Effort } from "../core/types.js";
import type { AccountRow, GroupTargetRow } from "../db/repos.js";
import { getActiveCount } from "./slots.js";

export interface RouteTarget {
  tier: number;
  adapterId: string;
  modelId: string;
  accountId: string | null;
  effortOverride?: Effort | null;
  effort?: Effort;
}

export interface Candidate {
  accountId: string;
  adapterId: string;
  modelId: string;
  tier: number;
  effort?: Effort;
}

const groupCursors = new Map<string, number>();

export function resetRoundRobin(): void {
  groupCursors.clear();
}

export function buildTargetsFromGroup(
  groupTargets: GroupTargetRow[],
  defaultEffort: Effort | null,
  requestEffort: Effort | undefined,
): Array<RouteTarget & { effort: Effort | undefined }> {
  return groupTargets.map((target) => ({
    tier: target.tier,
    adapterId: target.adapterId,
    modelId: target.modelId,
    accountId: target.accountId,
    effortOverride: target.effortOverride,
    effort: requestEffort ?? (target.effortOverride as Effort | null) ?? defaultEffort ?? undefined,
  }));
}

export function expandCandidates(
  targets: RouteTarget[],
  accounts: AccountRow[],
  installedAdapters: Set<string>,
  nowMs: number,
  pinnedAccountId?: string,
  roundRobinKey?: string,
): Candidate[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  let expanded: Candidate[] = [];

  for (const target of targets) {
    const accountIds =
      target.accountId != null
        ? [target.accountId]
        : accounts.filter((account) => account.adapterId === target.adapterId).map((account) => account.id);

    for (const accountId of accountIds) {
      const account = accountById.get(accountId);
      if (!account || !account.enabled) {
        continue;
      }
      if (!installedAdapters.has(target.adapterId)) {
        continue;
      }
      if (account.cooldownUntil != null && account.cooldownUntil > nowMs) {
        continue;
      }
      expanded.push({
        accountId,
        adapterId: target.adapterId,
        modelId: target.modelId,
        tier: target.tier,
        effort: target.effort,
      });
    }
  }

  expanded.sort((left, right) => {
    if (left.tier !== right.tier) {
      return left.tier - right.tier;
    }
    return getActiveCount(left.accountId) - getActiveCount(right.accountId);
  });

  const key = roundRobinKey ?? "default";
  const cursor = groupCursors.get(key) ?? 0;
  const lowestTier = expanded[0]?.tier;
  if (lowestTier != null) {
    const tierSlice = expanded.filter((candidate) => candidate.tier === lowestTier);
    const rest = expanded.filter((candidate) => candidate.tier !== lowestTier);
    if (tierSlice.length > 1) {
      const rotateBy = cursor % tierSlice.length;
      expanded = [...tierSlice.slice(rotateBy), ...tierSlice.slice(0, rotateBy), ...rest];
    }
  }
  groupCursors.set(key, cursor + 1);

  if (pinnedAccountId) {
    const index = expanded.findIndex((candidate) => candidate.accountId === pinnedAccountId);
    if (index > 0) {
      const [pinned] = expanded.splice(index, 1);
      expanded.unshift(pinned);
    }
  }

  return expanded;
}
