import type { Logger } from "pino";

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
  _log?: Pick<Logger, "warn">,
): boolean {
  const controller = abortControllers.get(requestId);
  if (!controller) {
    return false;
  }
  controller.abort();
  return true;
}
