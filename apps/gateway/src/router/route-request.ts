import type { Logger } from "pino";
import { adapters } from "../adapters/index.js";
import { tryCacheHit } from "./cache-hit.js";
import type { ChatRequest, CliEvent, Effort } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import {
  earliestCooldownAmong,
  loadEnabledAccounts,
  loadGroup,
  loadGroupTargets,
  loadSettings,
} from "../db/repos.js";
import { buildCatalog, resolveModel } from "../protocol/model-catalog.js";
import { RouteError, type RouteErrorContext } from "../protocol/errors.js";
import { trailingToolMessages } from "../runner/render-transcript.js";
import { runCli as defaultRunCli } from "../runner/run-cli.js";
import { findSession, lookupFingerprint } from "../sessions/session-store.js";
import { executeCandidate } from "./execute-candidate.js";
import { trackCompletion } from "./finalize-run.js";
import { registerLive, removeLive } from "./live.js";
import { buildTargetsFromGroup, expandCandidates } from "./select-target.js";
import { acquireSlot, releaseSlot } from "./slots.js";
import { deliverToolResults, parkRun, takeParkedRun } from "./tool-bridge.js";

export interface RouteMeta {
  groupId?: string;
  adapterId: string;
  accountId: string | null;
  modelExecuted: string;
  sessionReused: boolean;
  cacheHit: boolean;
  cacheEnabled: boolean;
  failoverCount: number;
}

export interface RouteRequestDeps {
  db: DbHandle;
  log: Pick<Logger, "debug" | "error" | "info" | "warn">;
  dataDir: string;
  mcpBaseUrl: string;
  runCliFn?: typeof defaultRunCli;
  onSpawn?: () => void;
}

async function* mergeEvents(
  prefix: CliEvent[],
  rest: AsyncIterable<CliEvent>,
): AsyncGenerator<CliEvent> {
  for (const event of prefix) yield event;
  yield* rest;
}

function routeErrorContext(input: {
  failoverCount: number;
  groupId?: string;
  cacheEnabled: boolean;
  targets: Array<{ adapterId: string; modelId: string }>;
  resolved: NonNullable<Awaited<ReturnType<typeof resolveModel>>>;
  lastCandidate?: { adapterId: string; modelId: string };
}): RouteErrorContext {
  const adapterId =
    input.lastCandidate?.adapterId ??
    (input.resolved.kind === "direct" ? input.resolved.adapterId : input.targets[0]?.adapterId);
  const modelExecuted =
    input.lastCandidate?.modelId ??
    (input.resolved.kind === "direct" ? input.resolved.modelId : input.targets[0]?.modelId);
  return {
    failoverCount: input.failoverCount,
    groupId: input.groupId,
    adapterId,
    modelExecuted,
    cacheEnabled: input.cacheEnabled,
  };
}

function hasBridgingTools(req: ChatRequest): boolean {
  return Boolean(req.tools?.length && req.toolChoice !== "none");
}

export async function routeRequest(
  req: ChatRequest,
  deps: RouteRequestDeps,
): Promise<{ events: AsyncIterable<CliEvent>; meta: RouteMeta }> {
  const startedAt = Date.now();
  const settings = loadSettings(deps.db);
  const catalog = await buildCatalog(deps.db);
  const resolved = resolveModel(req.model, catalog);
  if (!resolved) {
    throw new RouteError("model_not_found", "Model not found");
  }

  const accounts = loadEnabledAccounts(deps.db);
  const now = Date.now();
  let targets: Array<{
    tier: number;
    adapterId: string;
    modelId: string;
    accountId: string | null;
    effort?: Effort;
  }> = [];
  let groupId: string | undefined;
  let allowTools = false;
  let cacheTtlSec = 0;
  let effort = req.effort;
  let roundRobinKey = req.model;

  if (resolved.kind === "group") {
    groupId = resolved.groupId;
    const group = loadGroup(deps.db, groupId);
    if (!group?.enabled) {
      throw new RouteError("model_not_found", "Group not found");
    }
    allowTools = group.allowTools;
    cacheTtlSec = group.cacheTtlSec;
    effort = req.effort ?? (group.defaultEffort as Effort | null) ?? undefined;
    targets = buildTargetsFromGroup(
      loadGroupTargets(deps.db, groupId),
      group.defaultEffort as Effort | null,
      req.effort,
    );
    roundRobinKey = groupId;
  } else {
    targets = [
      {
        tier: 1,
        adapterId: resolved.adapterId,
        modelId: resolved.modelId,
        accountId: null,
        effort: req.effort,
      },
    ];
  }

  const ephemeral = req.retention === "ephemeral";
  const bridging = hasBridgingTools(req);
  const cacheEnabled = !ephemeral && cacheTtlSec > 0 && !bridging;

  const trailing = trailingToolMessages(req.messages);
  if (trailing.length > 0) {
    const parked = takeParkedRun(trailing.map((m) => m.toolCallId!));
    if (parked) {
      const { bridge, run } = parked;
      const account = accounts.find((a) => a.id === run.accountId);
      if (!account?.enabled) {
        parkRun(bridge, run, deps.log, {
          db: deps.db,
          dataDir: deps.dataDir,
          log: deps.log as Logger,
        });
      } else {
        deliverToolResults(
          bridge,
          trailing.map((m) => ({
            toolCallId: m.toolCallId!,
            content: m.content,
            isError: m.isError === true,
          })),
        );
        run.attachClientAbort(req.clientAbort);
        run.timeout.reset();
        const oldRequestId = run.requestId;
        run.requestId = req.requestId;
        removeLive(oldRequestId);

        registerLive(
          req.requestId,
          {
            startedAt,
            apiKeyId: req.apiKeyId,
            model: req.model,
            tokensOut: 0,
            accountId: run.accountId,
            pid: run.pid,
            state: "running",
          },
          run.controller,
        );

        const meta: RouteMeta = {
          groupId,
          adapterId: run.adapterId,
          accountId: run.accountId,
          modelExecuted: run.modelId,
          sessionReused: true,
          cacheHit: false,
          cacheEnabled,
          failoverCount: 0,
        };

        const result = await executeCandidate({
          req,
          db: deps.db,
          log: deps.log,
          dataDir: deps.dataDir,
          candidate: {
            tier: 1,
            adapterId: run.adapterId,
            modelId: run.modelId,
            accountId: run.accountId,
            effort,
          },
          account,
          allowTools,
          effort,
          settings,
          runCliFn: deps.runCliFn ?? defaultRunCli,
          controller: run.controller,
          release: run.release,
          mcpBaseUrl: deps.mcpBaseUrl,
          bridge,
          parkedRun: run,
        });

        return {
          events: trackCompletion(mergeEvents(result.leadIn, result.stream), {
            req,
            db: deps.db,
            dataDir: deps.dataDir,
            log: deps.log,
            meta,
            startedAt,
            failoverCount: 0,
            sessionFp: ephemeral ? null : lookupFingerprint(req.conversationHint, req.messages),
            cacheTtlSec: ephemeral || bridging ? 0 : cacheTtlSec,
            groupId,
            effort,
            release: run.release,
            fallbackCliSessionId: run.cliSessionId,
            ephemeral,
          }),
          meta,
        };
      }
    }
  }

  if (cacheEnabled && groupId) {
    const cached = tryCacheHit(deps.db, {
      req,
      groupId,
      effort,
      messages: req.messages,
      targets,
      startedAt,
      cacheTtlSec,
      now,
    });
    if (cached) return cached;
  }

  const sessionFp = ephemeral ? null : lookupFingerprint(req.conversationHint, req.messages);
  let pinnedAccount: string | undefined;
  let resume: { cliSessionId: string } | undefined;
  if (sessionFp) {
    const row = findSession(deps.db, sessionFp);
    const match = row && targets.some((t) => t.adapterId === row.adapterId && t.modelId === row.modelId);
    const account = row && accounts.find((a) => a.id === row.accountId && a.enabled);
    if (row && match && account && (account.cooldownUntil == null || account.cooldownUntil <= now)) {
      pinnedAccount = row.accountId;
      resume = { cliSessionId: row.cliSessionId };
    }
  }

  let candidates = expandCandidates(
    targets,
    accounts,
    catalog.installedAdapters,
    now,
    pinnedAccount,
    roundRobinKey,
  );

  if (bridging) {
    const beforeFilter = candidates.length;
    candidates = candidates.filter((c) => {
      const adapter = adapters[c.adapterId as keyof typeof adapters];
      if (!adapter?.clientTools) return false;
      if (c.adapterId === "codex" && !allowTools) return false;
      return true;
    });
    if (beforeFilter > 0 && candidates.length === 0) {
      throw new RouteError(
        "tools_unsupported",
        "no target in this group supports client tools",
      );
    }
  }

  if (candidates.length === 0) {
    const ids = accounts.map((a) => a.id);
    const earliest = earliestCooldownAmong(deps.db, ids, now);
    const ctx = routeErrorContext({
      failoverCount: 0,
      groupId,
      cacheEnabled,
      targets,
      resolved,
    });
    if (earliest != null) {
      throw new RouteError(
        "all_rate_limited",
        "All accounts are rate limited",
        Math.max(1, Math.ceil((earliest - now) / 1000)),
        ctx,
      );
    }
    throw new RouteError("queue_timeout", "No available accounts", undefined, ctx);
  }

  let failoverCount = 0;
  let lastFailoverKind: string | undefined;
  let lastFailoverMessage: string | undefined;
  const runCliFn = deps.runCliFn ?? defaultRunCli;
  const requestController = new AbortController();
  let clientAbortListener: (() => void) | undefined;
  const attachClientAbort = (signal: AbortSignal) => {
    if (clientAbortListener) {
      req.clientAbort.removeEventListener("abort", clientAbortListener);
    }
    clientAbortListener = () => requestController.abort();
    signal.addEventListener("abort", clientAbortListener);
    if (signal.aborted) requestController.abort();
  };
  attachClientAbort(req.clientAbort);

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]!;
    const account = accounts.find((a) => a.id === candidate.accountId);
    if (!account) continue;

    const acquired = await acquireSlot(account.id, account.maxConcurrent, settings.queueTimeoutSec);
    if (!acquired) {
      if (index === candidates.length - 1) {
        throw new RouteError(
          "queue_timeout",
          "All account slots busy",
          undefined,
          routeErrorContext({
            failoverCount,
            groupId,
            cacheEnabled,
            targets,
            resolved,
            lastCandidate: candidate,
          }),
        );
      }
      continue;
    }

    registerLive(
      req.requestId,
      { startedAt, apiKeyId: req.apiKeyId, model: req.model, tokensOut: 0, state: "running" },
      requestController,
    );

    let slotReleased = false;
    const release = (requestId = req.requestId) => {
      if (!slotReleased) {
        slotReleased = true;
        releaseSlot(account.id);
        removeLive(requestId);
      }
    };

    let sessionResume = pinnedAccount === account.id ? resume : undefined;
    let freshRetry = false;

    try {
      const result = await executeCandidate({
        req,
        db: deps.db,
        log: deps.log,
        dataDir: deps.dataDir,
        candidate,
        account,
        allowTools,
        effort: candidate.effort ?? effort,
        resume: sessionResume,
        settings,
        runCliFn,
        controller: requestController,
        release,
        mcpBaseUrl: deps.mcpBaseUrl,
        onSpawn: deps.onSpawn,
      });

      if (result.outcome === "failover") {
        release();
        if (result.failoverKind) {
          lastFailoverKind = result.failoverKind;
          lastFailoverMessage = result.failoverMessage;
        }
        if (result.retryFreshSession && !freshRetry) {
          freshRetry = true;
          sessionResume = undefined;
          index--;
          continue;
        }
        failoverCount++;
        continue;
      }

      const meta: RouteMeta = {
        groupId,
        adapterId: candidate.adapterId,
        accountId: candidate.accountId,
        modelExecuted: candidate.modelId,
        sessionReused: Boolean(resume && pinnedAccount === account.id && !freshRetry),
        cacheHit: false,
        cacheEnabled,
        failoverCount,
      };

      return {
        events: trackCompletion(mergeEvents(result.leadIn, result.stream), {
          req,
          db: deps.db,
          dataDir: deps.dataDir,
          log: deps.log,
          meta,
          startedAt,
          failoverCount,
          sessionFp,
          cacheTtlSec: ephemeral || bridging ? 0 : cacheTtlSec,
          groupId,
          effort,
          release,
          ephemeral,
        }),
        meta,
      };
    } catch (err) {
      release();
      throw err;
    }
  }

  const ids = candidates.map((c) => c.accountId);
  const earliest = earliestCooldownAmong(deps.db, ids, now);
  const retryAfterSec =
    earliest != null ? Math.max(1, Math.ceil((earliest - now) / 1000)) : settings.defaultCooldownSec;
  const lastCandidate = candidates[candidates.length - 1];
  const ctx = routeErrorContext({
    failoverCount,
    groupId,
    cacheEnabled,
    targets,
    resolved,
    lastCandidate,
  });
  if (lastFailoverKind === "rate_limit") {
    throw new RouteError("all_rate_limited", "All accounts are rate limited", retryAfterSec, ctx);
  }
  if (lastFailoverKind === "auth") {
    throw new RouteError("upstream_auth", "Upstream authentication failed", undefined, ctx);
  }
  if (lastFailoverKind === "timeout") {
    throw new RouteError("upstream_timeout", "Upstream request timed out", undefined, ctx);
  }
  if (lastFailoverKind === "crash") {
    throw new RouteError("upstream_crash", "Upstream CLI crashed", undefined, ctx);
  }
  if (lastFailoverKind === "unknown") {
    const detail = lastFailoverMessage ? `: ${lastFailoverMessage.slice(0, 500)}` : "";
    throw new RouteError("upstream_crash", `Upstream CLI failed${detail}`, undefined, ctx);
  }
  throw new RouteError("all_rate_limited", "All accounts are rate limited", retryAfterSec, ctx);
}
