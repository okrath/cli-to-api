import { globalAccountPool } from "./account-pool.js";
import { globalCooldownTracker } from "./cooldown-tracker.js";
import { globalPipelineStore } from "./pipeline-store.js";
import { globalProcessManager } from "../supervisor/process-manager.js";
import { globalAdminEventBus } from "../api/routes/admin-events.js";
import { globalExecutionRegistry } from "../telemetry/execution-registry.js";
import type { AdapterConfig } from "../adapters/schema.js";
import type { EffortLevel } from "../db/schema.js";
import type { ProcessExecutionResult } from "../supervisor/types.js";
import type { MessageContent } from "../utils/content-normalizer.js";

export interface PipelineExecutionCandidate {
  targetId: string;
  pipelineId: string;
  adapterConfig: AdapterConfig;
  account: {
    id: string;
    sandboxDir: string;
    customEnv?: Record<string, string>;
  };
  modelId: string;
  effectiveEffort: EffortLevel | null;
  priorityTier: number;
}

export interface PipelineExecutionContext {
  requestId: string;
  messages: Array<{ role: string; content: MessageContent }>;
  signal?: AbortSignal;
  onDelta?: (chunk: string) => void;
  onContentDelta?: (chunk: string) => void;
  onThoughtDelta?: (chunk: string) => void;
  onSpawn?: (pid: number) => void;
  session?: {
    threadId: string;
    cliSessionId?: string;
    isResume: boolean;
    deltaPrompt: string;
  };
}

export class DynamicTargetPipelineExecutor {
  public async executeWithFailover(
    candidates: PipelineExecutionCandidate[],
    context: PipelineExecutionContext
  ): Promise<{ result: ProcessExecutionResult; usedCandidate: PipelineExecutionCandidate }> {
    if (candidates.length === 0) {
      throw new Error("404: No active targets available in routing pipeline.");
    }

    let lastError: Error | null = null;
    const maxAttempts = Math.min(candidates.length, 3);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = candidates[attempt];
      const slotAcquired = await globalAccountPool.acquireSlot(candidate.account.id, 1);
      if (!slotAcquired) {
        continue;
      }

      let hasEmittedFirstByte = false;
      const startTime = Date.now();

      const wrappedOnDelta = (delta: string) => {
        if (delta && delta.length > 0) hasEmittedFirstByte = true;
        context.onDelta?.(delta);
      };
      const wrappedOnThoughtDelta = (delta: string) => {
        if (delta && delta.length > 0) hasEmittedFirstByte = true;
        context.onThoughtDelta?.(delta);
      };
      const wrappedOnContentDelta = (delta: string) => {
        if (delta && delta.length > 0) hasEmittedFirstByte = true;
        context.onContentDelta?.(delta);
      };

      try {
        const result = await globalProcessManager.executeStreaming({
          adapter: candidate.adapterConfig,
          account: candidate.account,
          modelId: candidate.modelId,
          messages: context.messages,
          session: context.session,
          signal: context.signal,
          onDelta: wrappedOnDelta,
          onThoughtDelta: wrappedOnThoughtDelta,
          onContentDelta: wrappedOnContentDelta,
          onSpawn: context.onSpawn,
          effortLevel: candidate.effectiveEffort,
        });
        const spawnDuration = Date.now() - startTime;

        // Check if spawn-time failure occurred before any bytes were emitted
        const isFailedSpawn =
          !hasEmittedFirstByte &&
          spawnDuration <= 250 &&
          (result.exitCode !== 0 || result.rateLimitDetected?.isRateLimited);

        if (isFailedSpawn && attempt < maxAttempts - 1) {
          // Release slot for this failing account
          await globalAccountPool.releaseSlot(candidate.account.id);

          // Put account in cooldown
          const cooldownSec = result.rateLimitDetected?.cooldownSeconds || 1800;
          await globalCooldownTracker.triggerCooldown(
            candidate.account.id,
            cooldownSec,
            "Spawn-time rate limit or crash detected"
          );

          const nextCandidate = candidates[attempt + 1];

          // Record failover event in SQLite
          await globalPipelineStore.recordFailoverEvent({
            pipelineId: candidate.pipelineId,
            requestId: context.requestId,
            fromAccountId: candidate.account.id,
            toAccountId: nextCandidate.account.id,
            triggerReason: result.rateLimitDetected?.isRateLimited
              ? "SPAWN_RATE_LIMIT"
              : "SPAWN_CRASH",
            failoverLatencyMs: spawnDuration,
          });

          // Record failover breadcrumb in execution registry
          globalExecutionRegistry.addFailoverBreadcrumb(context.requestId, {
            attempt,
            fromAccountId: candidate.account.id,
            toAccountId: nextCandidate.account.id,
            reason: result.rateLimitDetected?.isRateLimited ? "429 RateLimit" : "Spawn Crash",
            latencyMs: spawnDuration,
          });

          // Broadcast failover event via Admin Event Bus
          globalAdminEventBus.broadcast("pipeline:failover", {
            pipelineId: candidate.pipelineId,
            requestId: context.requestId,
            fromAccountId: candidate.account.id,
            toAccountId: nextCandidate.account.id,
            reason: result.rateLimitDetected?.isRateLimited
              ? "SPAWN_RATE_LIMIT"
              : "SPAWN_CRASH",
            latencyMs: spawnDuration,
          });

          globalAdminEventBus.broadcast("telemetry:failover", {
            pipelineId: candidate.pipelineId,
            requestId: context.requestId,
            fromAccountId: candidate.account.id,
            toAccountId: nextCandidate.account.id,
            reason: result.rateLimitDetected?.isRateLimited ? "429 RateLimit" : "Spawn Crash",
            latencyMs: spawnDuration,
          });
          // Try next candidate in the chain!
          continue;
        }

        return { result, usedCandidate: candidate };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await globalAccountPool.releaseSlot(candidate.account.id);

        // If bytes already emitted, cannot failover without breaking stream
        if (hasEmittedFirstByte) {
          throw lastError;
        }

        // Otherwise, if more candidates exist, try next candidate
        if (attempt < maxAttempts - 1) {
          const spawnDuration = Date.now() - startTime;
          const nextCandidate = candidates[attempt + 1];

          await globalPipelineStore.recordFailoverEvent({
            pipelineId: candidate.pipelineId,
            requestId: context.requestId,
            fromAccountId: candidate.account.id,
            toAccountId: nextCandidate.account.id,
            triggerReason: "EXECUTION_EXCEPTION",
            failoverLatencyMs: spawnDuration,
          });

          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error("503: All candidate targets in pipeline are exhausted or in cooldown.");
  }
}

export const globalPipelineExecutor = new DynamicTargetPipelineExecutor();
