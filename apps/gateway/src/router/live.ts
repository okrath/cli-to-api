import type { killTree } from "../runner/kill-tree.js";

export interface LiveEntry {
  startedAt: number;
  apiKeyId: string;
  model: string;
  accountId?: string;
  pid?: number;
  tokensOut: number;
  state?: "running" | "waiting_tool_result";
}

const liveEntries = new Map<string, LiveEntry>();
const abortControllers = new Map<string, AbortController>();

export function registerLive(
  requestId: string,
  entry: LiveEntry,
  controller: AbortController,
): void {
  liveEntries.set(requestId, entry);
  abortControllers.set(requestId, controller);
}

export function updateLive(
  requestId: string,
  patch: Partial<Pick<LiveEntry, "accountId" | "pid" | "tokensOut" | "state">>,
): void {
  const current = liveEntries.get(requestId);
  if (!current) {
    return;
  }
  liveEntries.set(requestId, { ...current, ...patch });
}

export function removeLive(requestId: string): void {
  liveEntries.delete(requestId);
  abortControllers.delete(requestId);
}

export function getLiveEntries(): Map<string, LiveEntry> {
  return new Map(liveEntries);
}

export function abortRequest(
  requestId: string,
  kill: typeof killTree,
  log: Parameters<typeof killTree>[1],
): boolean {
  const controller = abortControllers.get(requestId);
  const entry = liveEntries.get(requestId);
  if (!controller) {
    return false;
  }
  controller.abort();
  if (entry?.pid != null && entry.pid > 0) {
    kill(entry.pid, log);
  }
  return true;
}
