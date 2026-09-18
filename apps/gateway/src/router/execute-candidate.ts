import type { Logger } from "pino";
import { adapters } from "../adapters/index.js";
import type { ChatRequest, CliEvent, Effort } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import type { SettingsMap } from "../db/repos.js";
import { RouteError } from "../protocol/errors.js";
import { resolveExecutable } from "../runner/resolve-executable.js";
import { runCli as defaultRunCli } from "../runner/run-cli.js";
import { renderTranscript } from "../runner/render-transcript.js";
import { baseEnv, ensureSandbox } from "../runner/sandbox.js";
import { deleteSession, lookupFingerprint } from "../sessions/session-store.js";
import { applyCooldown, cooldownSecondsFromError } from "./cooldown.js";
import { updateLive } from "./live.js";
import type { Candidate } from "./select-target.js";

const FAILOVER_KINDS = new Set(["rate_limit", "crash", "auth", "timeout"]);

function isContent(event: CliEvent): boolean {
  return event.type === "thinking_delta" || event.type === "text_delta";
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
  failoverKind?: "rate_limit" | "crash" | "auth" | "timeout";
}

export async function executeCandidate(input: {
  req: ChatRequest;
  db: DbHandle;
  log: Pick<Logger, "debug" | "error" | "info" | "warn">;
  dataDir: string;
  candidate: Candidate;
  account: { id: string; adapterId: string };
  allowTools: boolean;
  effort: Effort | undefined;
  resume?: { cliSessionId: string };
  settings: SettingsMap;
  runCliFn: typeof defaultRunCli;
  controller: AbortController;
  onSpawn?: () => void;
}): Promise<ExecuteResult> {
  const adapter = resolveAdapter(input.candidate.adapterId);
  const sandbox = ensureSandbox(input.dataDir, input.candidate.adapterId, input.account.id);
  const { systemPrompt, prompt } = renderTranscript(input.req.messages, { resume: Boolean(input.resume) });
  const built = adapter.buildArgs({
    model: input.candidate.modelId,
    effort: input.effort,
    systemPrompt,
    resume: input.resume,
    allowTools: input.allowTools,
  });
  const resolved = await resolveExecutable(adapter.executable, input.log);
  if (!resolved) {
    applyCooldown(input.db, input.account.id, 60, "crash", Date.now());
    const failoverKind = "crash" as const;
    if (input.resume) {
      const fp = lookupFingerprint(input.req.conversationHint, input.req.messages);
      if (fp) deleteSession(input.db, fp);
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

  input.onSpawn?.();
  const { pid, events } = input.runCliFn({
    adapter,
    resolved,
    args: built.args,
    promptVia: built.promptVia,
    prompt,
    env: { ...baseEnv(sandbox), ...adapter.buildEnv(sandbox) },
    cwd: sandbox.workspaceDir,
    timeoutMs: input.settings.requestTimeoutSec * 1000,
    signal: input.controller.signal,
    log: input.log as Logger,
  });
  void pid.then((value) => updateLive(input.req.requestId, { accountId: input.account.id, pid: value }));

  const consumed: CliEvent[] = [];
  let latestRateLimit: Extract<CliEvent, { type: "rate_limit" }> | undefined;
  let tokensOut = 0;
  const iterator = events[Symbol.asyncIterator]();

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
    if (event.type === "error" && FAILOVER_KINDS.has(event.kind)) {
      const nowSec = Math.floor(Date.now() / 1000);
      const { seconds, reason } = cooldownSecondsFromError(
        event,
        latestRateLimit,
        input.settings.defaultCooldownSec,
        nowSec,
      );
      applyCooldown(input.db, input.account.id, seconds, reason, Date.now());
      const failoverKind = event.kind as ExecuteResult["failoverKind"];
      if (input.resume) {
        const fp = lookupFingerprint(input.req.conversationHint, input.req.messages);
        if (fp) deleteSession(input.db, fp);
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
