import type { Logger } from "pino";
import { adapters } from "../adapters/index.js";
import type { ChatRequest, CliEvent } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import type { SettingsMap } from "../db/repos.js";
import { RouteError } from "../protocol/errors.js";
import { resolveExecutable } from "../runner/resolve-executable.js";
import { runCli as defaultRunCli } from "../runner/run-cli.js";
import { renderTranscript } from "../runner/render-transcript.js";
import { baseEnv, ensureSandbox, hostEnv } from "../runner/sandbox.js";
import { deleteSession, lookupFingerprint } from "../sessions/session-store.js";
import { applyCooldown, cooldownSecondsFromError } from "./cooldown.js";
import { bridgeEvents } from "./bridge-events.js";
import { updateLive } from "./live.js";
import type { Candidate } from "./select-target.js";
import { createBridge, finishBridge, type Bridge, type ParkedRun } from "./tool-bridge.js";

// Errors that mark the account unusable for a while: the account is cooled down before failover.
const COOLDOWN_KINDS = new Set(["rate_limit", "crash", "auth", "timeout"]);
const PREPEND_SYSTEM_ADAPTERS = new Set(["codex", "agy", "cursor-agent"]);

function isContent(event: CliEvent): boolean {
  return event.type === "thinking_delta" || event.type === "text_delta" || event.type === "tool_call";
}

function resolveAdapter(adapterId: string) {
  const adapter = (adapters as Record<string, (typeof adapters)["claude-code"]>)[adapterId];
  if (!adapter) {
    throw new RouteError("model_not_found", "Adapter not installed");
  }
  return adapter;
}

export interface ExecuteResult {
  outcome: "success" | "failover";
  leadIn: CliEvent[];
  stream: AsyncIterable<CliEvent>;
  retryFreshSession?: boolean;
  failoverKind?: Extract<CliEvent, { type: "error" }>["kind"];
  failoverMessage?: string;
}

export async function executeCandidate(input: {
  req: ChatRequest;
  db: DbHandle;
  log: Pick<Logger, "debug" | "error" | "info" | "warn">;
  dataDir: string;
  candidate: Candidate;
  account: { id: string; adapterId: string; useHostProfile: boolean };
  allowTools: boolean;
  effort: import("../core/types.js").Effort | undefined;
  resume?: { cliSessionId: string };
  settings: SettingsMap;
  runCliFn: typeof defaultRunCli;
  controller: AbortController;
  release: (requestId?: string) => void;
  mcpBaseUrl: string;
  bridge?: Bridge;
  parkedRun?: ParkedRun;
  onSpawn?: () => void;
}): Promise<ExecuteResult> {
  const adapter = resolveAdapter(input.candidate.adapterId);
  const sandbox = ensureSandbox(input.dataDir, input.candidate.adapterId, input.account.id);
  const { systemPrompt, prompt } = renderTranscript(input.req.messages, {
    resume: Boolean(input.resume),
    prependSystemInPrompt: PREPEND_SYSTEM_ADAPTERS.has(adapter.id),
  });

  const useTools = Boolean(input.req.tools?.length && input.req.toolChoice !== "none");
  let bridge = input.bridge;
  if (useTools && !bridge) {
    bridge = createBridge(input.req.tools!, {
      baseUrl: input.mcpBaseUrl,
      resultTimeoutMs: input.settings.toolResultTimeoutSec * 1000,
    });
  }

  const resultTimeoutMs = input.settings.toolResultTimeoutSec * 1000;
  const built = adapter.buildArgs({
    model: input.candidate.modelId,
    effort: input.effort,
    systemPrompt,
    resume: input.resume,
    allowTools: input.allowTools,
    tools: bridge
      ? {
          mcpUrl: bridge.url,
          serverName: "cta",
          maxTurns: input.settings.toolMaxTurns,
          resultTimeoutMs,
        }
      : undefined,
  });

  const resolved = await resolveExecutable(adapter.executable, input.log);
  if (!resolved) {
    applyCooldown(input.db, input.account.id, 60, "crash", Date.now());
    const failoverKind = "crash" as const;
    if (bridge) finishBridge(bridge);
    if (input.resume) {
      const fp = lookupFingerprint(input.req.conversationHint, input.req.messages);
      if (fp) deleteSession(input.db, fp, { db: input.db, dataDir: input.dataDir, log: input.log });
      return {
        outcome: "failover",
        leadIn: [],
        stream: emptyStream(),
        retryFreshSession: true,
        failoverKind,
      };
    }
    return { outcome: "failover", leadIn: [], stream: emptyStream(), failoverKind };
  }

  if (input.parkedRun) {
    const stream = bridgeEvents(bridge!, input.parkedRun);
    return { outcome: "success", leadIn: [], stream };
  }

  input.onSpawn?.();
  const baseChildEnv = input.account.useHostProfile
    ? hostEnv(sandbox)
    : { ...baseEnv(sandbox), ...adapter.buildEnv(sandbox) };
  const { pid, events, timeout } = input.runCliFn({
    adapter,
    resolved,
    args: built.args,
    promptVia: built.promptVia,
    prompt,
    env: { ...baseChildEnv, ...built.env },
    cwd: sandbox.workspaceDir,
    timeoutMs: input.settings.requestTimeoutSec * 1000,
    signal: input.controller.signal,
    log: input.log as Logger,
  });

  let clientAbortListener: (() => void) | undefined;
  let attachedSignal: AbortSignal | undefined;

  const detachClientAbort = () => {
    if (attachedSignal && clientAbortListener) {
      attachedSignal.removeEventListener("abort", clientAbortListener);
      attachedSignal = undefined;
      clientAbortListener = undefined;
    }
  };

  const attachClientAbort = (signal: AbortSignal) => {
    detachClientAbort();
    clientAbortListener = () => input.controller.abort();
    attachedSignal = signal;
    signal.addEventListener("abort", clientAbortListener);
    if (signal.aborted) input.controller.abort();
  };

  attachClientAbort(input.req.clientAbort);

  const childPid = await pid;
  void updateLive(input.req.requestId, { accountId: input.account.id, pid: childPid, state: "running" });

  const source = events[Symbol.asyncIterator]();
  const run: ParkedRun = {
    source,
    toolCallIds: [],
    ephemeral: input.req.retention === "ephemeral",
    accountId: input.account.id,
    adapterId: input.candidate.adapterId,
    modelId: input.candidate.modelId,
    pid: childPid,
    requestId: input.req.requestId,
    timeout,
    controller: input.controller,
    detachClientAbort,
    attachClientAbort,
    release: () => input.release(run.requestId),
    roundsUsage: [],
  };

  const eventIterable: AsyncIterable<CliEvent> = bridge ? bridgeEvents(bridge, run) : events;

  const consumed: CliEvent[] = [];
  let latestRateLimit: Extract<CliEvent, { type: "rate_limit" }> | undefined;
  let tokensOut = 0;
  const iterator = eventIterable[Symbol.asyncIterator]();

  while (true) {
    const next = await iterator.next();
    if (next.done) break;
    const event = next.value;
    consumed.push(event);
    if (event.type === "rate_limit") latestRateLimit = event;
    if (event.type === "thinking_delta" || event.type === "text_delta") {
      tokensOut += event.text.length;
      updateLive(input.req.requestId, { tokensOut });
    }
    if (isContent(event)) {
      const splitAt = consumed.findIndex(isContent);
      return {
        outcome: "success",
        leadIn: consumed.slice(0, splitAt),
        stream: continueStream(consumed.slice(splitAt), iterator),
      };
    }
    if (event.type === "error") {
      // No content has been sent yet, so the next candidate can still serve the request.
      if (COOLDOWN_KINDS.has(event.kind)) {
        const nowSec = Math.floor(Date.now() / 1000);
        const { seconds, reason } = cooldownSecondsFromError(
          event,
          latestRateLimit,
          input.settings.defaultCooldownSec,
          nowSec,
        );
        applyCooldown(input.db, input.account.id, seconds, reason, Date.now());
      } else {
        // An unclassified CLI error (unsupported model, oversized prompt, ...) is about this
        // target or request, not the account: fail over without cooling the account.
        input.log.warn(
          {
            accountId: input.account.id,
            adapterId: input.candidate.adapterId,
            model: input.candidate.modelId,
            message: event.message,
          },
          "CLI reported an error before any content; trying the next target",
        );
      }
      const failoverKind = event.kind;
      const failoverMessage = event.message;
      if (bridge) finishBridge(bridge);
      if (input.resume) {
        const fp = lookupFingerprint(input.req.conversationHint, input.req.messages);
        if (fp) deleteSession(input.db, fp, { db: input.db, dataDir: input.dataDir, log: input.log });
        return {
          outcome: "failover",
          leadIn: [],
          stream: emptyStream(),
          retryFreshSession: true,
          failoverKind,
          failoverMessage,
        };
      }
      return { outcome: "failover", leadIn: [], stream: emptyStream(), failoverKind, failoverMessage };
    }
  }

  return { outcome: "success", leadIn: consumed, stream: emptyStream() };
}

async function* continueStream(
  head: CliEvent[],
  iterator: AsyncIterator<CliEvent>,
): AsyncGenerator<CliEvent> {
  for (const event of head) yield event;
  while (true) {
    const next = await iterator.next();
    if (next.done) break;
    yield next.value;
  }
}

async function* emptyStream(): AsyncGenerator<CliEvent> {}
