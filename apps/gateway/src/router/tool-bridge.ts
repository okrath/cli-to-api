import { customAlphabet } from "nanoid";
import type { CliEvent, ToolCall, ToolDefinition } from "../core/types.js";
import type { killTree } from "../runner/kill-tree.js";
import { deleteRunArtifacts, type RetentionDeps } from "../sessions/retention.js";
import { removeLive, updateLive } from "./live.js";
import { defaultInputSchema, jsonEqual } from "./tool-bridge-util.js";

const bridgeIdAlphabet = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_",
  21,
);
const callIdAlphabet = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_",
  21,
);

export interface ToolResult {
  content: string;
  isError: boolean;
}

export interface ParkedRun {
  source: AsyncIterator<CliEvent>;
  pendingNext?: Promise<IteratorResult<CliEvent>>;
  toolCallIds: string[];
  ephemeral?: boolean;
  cliSessionId?: string;
  accountId: string;
  adapterId: string;
  modelId: string;
  pid: number;
  requestId: string;
  timeout: { pause(): void; reset(): void };
  controller: AbortController;
  detachClientAbort(): void;
  attachClientAbort(signal: AbortSignal): void;
  release(): void;
  roundsUsage: Array<Extract<CliEvent, { type: "usage" }>>;
}

export interface Bridge {
  id: string;
  url: string;
  serverName: "cta";
  tools: ToolDefinition[];
  createdAt: number;
  expiresAt: number;
  resultTimeoutMs: number;
  parsedCalls: ToolCall[];
  pending: Map<
    string,
    {
      name: string;
      argumentsJson: string;
      resolve(r: ToolResult): void;
      reject(e: Error): void;
    }
  >;
  earlyResults: Map<string, ToolResult>;
  parked?: ParkedRun;
  firstMcpCallAt?: number;
  onMcpCall?: () => void;
}

const bridges = new Map<string, Bridge>();

export function createBridge(
  tools: ToolDefinition[],
  opts: { baseUrl: string; resultTimeoutMs: number },
): Bridge {
  const id = bridgeIdAlphabet();
  const bridge: Bridge = {
    id,
    url: `${opts.baseUrl}/mcp/${id}`,
    serverName: "cta",
    tools,
    createdAt: Date.now(),
    expiresAt: Date.now() + opts.resultTimeoutMs,
    resultTimeoutMs: opts.resultTimeoutMs,
    parsedCalls: [],
    pending: new Map(),
    earlyResults: new Map(),
  };
  bridges.set(id, bridge);
  return bridge;
}

export function getBridge(id: string): Bridge | undefined {
  return bridges.get(id);
}

export function listBridgeTools(
  bridge: Bridge,
): Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }> {
  return bridge.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: defaultInputSchema(tool.parameters),
  }));
}

export function noteParsedCall(bridge: Bridge, call: ToolCall): void {
  bridge.parsedCalls.push({ ...call });
}

function matchParsedCall(
  bridge: Bridge,
  call: { name: string; argumentsJson: string; toolUseId?: string },
): ToolCall | undefined {
  if (call.toolUseId) {
    const idx = bridge.parsedCalls.findIndex((c) => c.id === call.toolUseId);
    if (idx >= 0) {
      const matched = bridge.parsedCalls.splice(idx, 1)[0]!;
      return matched;
    }
  }
  const idx = bridge.parsedCalls.findIndex(
    (c) => c.name === call.name && jsonEqual(c.argumentsJson, call.argumentsJson),
  );
  if (idx >= 0) {
    return bridge.parsedCalls.splice(idx, 1)[0]!;
  }
  return undefined;
}

export function onMcpCall(
  bridge: Bridge,
  call: { name: string; argumentsJson: string; toolUseId?: string },
): Promise<ToolResult> {
  let matched = matchParsedCall(bridge, call);
  if (!matched) {
    matched = {
      id: `call_${callIdAlphabet()}`,
      name: call.name,
      argumentsJson: call.argumentsJson,
    };
    bridge.parsedCalls.push(matched);
  }

  const early = bridge.earlyResults.get(matched.id);
  if (early) {
    bridge.earlyResults.delete(matched.id);
    return Promise.resolve(early);
  }

  if (bridge.firstMcpCallAt == null) {
    bridge.firstMcpCallAt = Date.now();
  }
  bridge.onMcpCall?.();

  if (bridge.expiresAt <= Date.now()) {
    return Promise.reject(new Error("tool result timed out"));
  }

  return new Promise<ToolResult>((resolve, reject) => {
    bridge.pending.set(matched!.id, {
      name: matched!.name,
      argumentsJson: matched!.argumentsJson,
      resolve,
      reject,
    });
  });
}

export function deliverToolResults(
  bridge: Bridge,
  results: Array<{ toolCallId: string; content: string; isError: boolean }>,
): void {
  for (const result of results) {
    const pending = bridge.pending.get(result.toolCallId);
    if (pending) {
      bridge.pending.delete(result.toolCallId);
      pending.resolve({ content: result.content, isError: result.isError });
    } else {
      bridge.earlyResults.set(result.toolCallId, {
        content: result.content,
        isError: result.isError,
      });
    }
  }
}

export function parkRun(bridge: Bridge, run: ParkedRun): void {
  bridge.parked = run;
  updateLive(run.requestId, { state: "waiting_tool_result" });
}

export function takeParkedRun(
  toolCallIds: string[],
): { bridge: Bridge; run: ParkedRun } | undefined {
  if (toolCallIds.length === 0) return undefined;

  for (const bridge of bridges.values()) {
    if (!bridge.parked) continue;
    const allBelong = toolCallIds.every(
      (id) =>
        bridge.pending.has(id) ||
        bridge.earlyResults.has(id) ||
        bridge.parked!.toolCallIds.includes(id),
    );
    if (!allBelong) continue;

    const run = bridge.parked;
    bridge.parked = undefined;
    return { bridge, run };
  }
  return undefined;
}

export function finishBridge(bridge: Bridge): void {
  bridge.parked?.release();
  for (const pending of bridge.pending.values()) {
    pending.reject(new Error("bridge finished"));
  }
  bridge.pending.clear();
  bridges.delete(bridge.id);
}

export function sweepExpiredBridges(
  now: number,
  kill: typeof killTree,
  log: Parameters<typeof killTree>[1],
  retention?: RetentionDeps,
): number {
  let count = 0;
  for (const [id, bridge] of [...bridges.entries()]) {
    if (bridge.expiresAt > now) continue;
    const parked = bridge.parked;
    const hasPending = bridge.pending.size > 0;
    if (!parked && !hasPending) continue;
    if (parked) {
      if (parked.pid > 0) kill(parked.pid, log);
      if (
        parked.ephemeral &&
        parked.cliSessionId &&
        retention
      ) {
        deleteRunArtifacts(
          retention,
          parked.accountId,
          parked.adapterId,
          parked.cliSessionId,
        );
      }
      parked.release();
      removeLive(parked.requestId);
    }
    for (const pending of bridge.pending.values()) {
      pending.reject(new Error("tool result timed out"));
    }
    bridge.pending.clear();
    bridges.delete(id);
    count++;
  }
  return count;
}

export function resetBridges(): void {
  bridges.clear();
}

export function expireAllBridges(now: number): void {
  for (const bridge of bridges.values()) {
    bridge.expiresAt = now - 1;
  }
}
