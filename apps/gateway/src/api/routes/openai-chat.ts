import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { globalLoadBalancer } from "../../router/load-balancer.js";
import { globalAccountPool } from "../../router/account-pool.js";
import { globalPipelineExecutor } from "../../router/pipeline-executor.js";
import { globalProcessManager } from "../../supervisor/process-manager.js";
import { formatSseChunk, formatSseDone } from "../../stream/sse-serializer.js";
import { estimateTokenUsage, estimatePromptTokens, estimateTextTokens } from "../../utils/token-estimator.js";
import { globalExecutionRegistry } from "../../telemetry/execution-registry.js";
import { globalTelemetryBroadcaster } from "../../telemetry/telemetry-broadcaster.js";
import { globalTelemetryQueue } from "../../telemetry/persist-queue.js";
import { globalCooldownTracker } from "../../router/cooldown-tracker.js";
import { extractDurationSeconds } from "../../stream/rate-limit-detector.js";
import { globalAdminEventBus } from "./admin-events.js";
import { globalSessionThreadManager } from "../../router/session-thread-manager.js";
import { ChatMessage } from "../../utils/content-normalizer.js";
import type { EffortLevel } from "../../db/schema.js";

interface ChatCompletionBody {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  conversation_id?: string;
  user?: string;
  reasoning_effort?: EffortLevel;
}

export function registerOpenAiChatRoutes(fastify: FastifyInstance): void {
  fastify.post("/v1/chat/completions", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as ChatCompletionBody;
    const requestedModel = body.model;
    const isStreaming = Boolean(body.stream);
    const messages = body.messages || [];

    const requestedEffort = (
      body.reasoning_effort ||
      (req.headers["x-reasoning-effort"] as string | undefined)
    ) as EffortLevel | undefined;

    if (!requestedModel) {
      return reply.status(400).send({
        error: {
          message: "Missing required 'model' parameter",
          type: "invalid_request_error",
          param: "model",
          code: null,
        },
      });
    }

    // 1. Resolve Conversation Thread & Session Context
    const explicitConversationId = (
      req.headers["x-conversation-id"] ||
      req.headers["x-session-id"] ||
      body.conversation_id ||
      body.user
    ) as string | undefined;

    const authHeader = req.headers.authorization;
    const clientIp = req.ip || req.socket.remoteAddress;

    const sessionRes = await globalSessionThreadManager.resolveThread({
      explicitId: explicitConversationId,
      authHeader,
      clientIp,
      messages,
      adapterId: requestedModel.includes("/") ? requestedModel.split("/")[0] : requestedModel,
      requestedModel,
    });

    // 2. Resolve Target via Load Balancer (pin to thread's bound account if exists)
    let target;
    try {
      target = await globalLoadBalancer.resolveTarget(
        requestedModel,
        sessionRes.boundAccountId,
        requestedEffort
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const is429 = message.startsWith("429");
      const is404 = message.startsWith("404");
      const cleanedMessage = message.replace(/^(?:429|404):\s*/, "");
      return reply.status(is429 ? 429 : is404 ? 404 : 400).send({
        error: {
          message: cleanedMessage,
          type: is429 ? "rate_limit_error" : "invalid_request_error",
          param: is429 ? null : "model",
          code: is429 ? "rate_limit_exceeded" : is404 ? "model_not_found" : null,
        },
      });
    }

    const isPipeline = Boolean(target.pipelineCandidates && target.pipelineCandidates.length > 0);

    // 3. Acquire Slot via Semaphore (for direct non-pipeline targets)
    if (!isPipeline) {
      const slotAcquired = await globalAccountPool.acquireSlot(target.account.id, target.account.maxSlots || 1);
      if (!slotAcquired) {
        return reply.status(429).send({
          error: {
            message: `429: Account '${target.account.id}' active slots full. Please retry shortly.`,
            type: "rate_limit_error",
            param: null,
            code: "concurrency_limit_exceeded",
          },
        });
      }
    }

    const completionId = `chatcmpl-${randomUUID()}`;
    const createdTimestamp = Math.floor(Date.now() / 1000);
    const startTime = Date.now();
    // Setup AbortController for client disconnect
    const abortController = new AbortController();
    req.raw.on("close", () => {
      if (!reply.raw.writableEnded) {
        abortController.abort();
      }
    });

    // Compute prompt tokens and register active stream
    const promptTokens = estimatePromptTokens(messages);
    globalExecutionRegistry.register({
      requestId: completionId,
      pid: null,
      accountId: target.account.id,
      adapterId: target.adapter.id,
      modelRequested: requestedModel,
      modelExecuted: target.actualModelId,
      sandboxDir: target.account.sandboxDir,
      promptTokens,
      reasoningTokens: 0,
      completionTokens: 0,
      totalTokens: promptTokens,
      startedAt: startTime,
      status: "PRE_FLIGHT",
      abortController,
    });

    // Broadcast request start
    globalAdminEventBus.broadcast("request:start", {
      id: completionId,
      model: requestedModel,
      provider: target.debugProvider,
      accountId: target.account.id,
      promptTokens,
      stream: isStreaming,
    });
    // 4. Streaming Response (SSE text/event-stream)
    if (isStreaming) {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "X-Accel-Buffering": "no",
        "X-Debug-Provider": target.debugProvider,
        "X-Debug-Model-Tier": target.debugModelTier,
        "X-Debug-Effort": target.effectiveEffort || "none",
        "X-Debug-Pipeline": target.pipelineId || "none",
        "X-Debug-Sandbox": target.account.sandboxDir,
        "X-Debug-Session-Id": sessionRes.threadId,
        "X-Debug-Session-Status": sessionRes.isResume ? "RESUMED" : "NEW",
        "X-Debug-CLI-Session": sessionRes.cliSessionId || "",
      });

      // Emit initial role delta
      reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { role: "assistant" }));

      let hasError = false;
      let activeAccountId = target.account.id;
      let activeAdapterId = target.adapter.id;

      try {
        let result;

        if (isPipeline && target.pipelineCandidates) {
          const execRes = await globalPipelineExecutor.executeWithFailover(
            target.pipelineCandidates,
            {
              requestId: completionId,
              messages,
              session: {
                threadId: sessionRes.threadId,
                cliSessionId: sessionRes.cliSessionId,
                isResume: sessionRes.isResume,
                deltaPrompt: sessionRes.deltaPrompt,
              },
              signal: abortController.signal,
              onSpawn: (pid: number) => {
                globalExecutionRegistry.bindPid(completionId, pid);
              },
              onThoughtDelta: (thought: string) => {
                reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { reasoning_content: thought }));
                const deltaTokens = estimateTextTokens(thought);
                globalExecutionRegistry.recordTokenChunk(completionId, deltaTokens, "reasoning");
                globalTelemetryBroadcaster.markDirty();
                globalAdminEventBus.broadcast("chunk:thought", { id: completionId, content: thought });
              },
              onContentDelta: (content: string) => {
                reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { content }));
                const deltaTokens = estimateTextTokens(content);
                globalExecutionRegistry.recordTokenChunk(completionId, deltaTokens, "content");
                globalTelemetryBroadcaster.markDirty();
                globalAdminEventBus.broadcast("chunk:delta", { id: completionId, content });
              },
            }
          );
          result = execRes.result;
          activeAccountId = execRes.usedCandidate.account.id;
          activeAdapterId = execRes.usedCandidate.adapterConfig.id;
        } else {
          result = await globalProcessManager.executeStreaming({
            adapter: target.adapter,
            account: target.account,
            modelId: target.actualModelId,
            messages,
            session: {
              threadId: sessionRes.threadId,
              cliSessionId: sessionRes.cliSessionId,
              isResume: sessionRes.isResume,
              deltaPrompt: sessionRes.deltaPrompt,
            },
            signal: abortController.signal,
            effortLevel: target.effectiveEffort || requestedEffort,
            onSpawn: (pid: number) => {
              globalExecutionRegistry.bindPid(completionId, pid);
            },
            onThoughtDelta: (thought: string) => {
              reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { reasoning_content: thought }));
              const deltaTokens = estimateTextTokens(thought);
              globalExecutionRegistry.recordTokenChunk(completionId, deltaTokens, "reasoning");
              globalTelemetryBroadcaster.markDirty();
              globalAdminEventBus.broadcast("chunk:thought", { id: completionId, content: thought });
            },
            onContentDelta: (content: string) => {
              reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { content }));
              const deltaTokens = estimateTextTokens(content);
              globalExecutionRegistry.recordTokenChunk(completionId, deltaTokens, "content");
              globalTelemetryBroadcaster.markDirty();
              globalAdminEventBus.broadcast("chunk:delta", { id: completionId, content });
            },
          });
        }

        if (result.rateLimitDetected?.isRateLimited) {
          await globalCooldownTracker.triggerCooldown(
            activeAccountId,
            result.rateLimitDetected.cooldownSeconds,
            "429 rate limit detected during generation"
          );
          globalAdminEventBus.broadcast("cooldown:trigger", {
            accountId: activeAccountId,
            seconds: result.rateLimitDetected.cooldownSeconds,
          });
        }

        if (result.exitCode !== 0 && result.exitCode !== null && !abortController.signal.aborted) {
          hasError = true;
          const errMsg = (result.stderr || result.stdout || `Process exited with code ${result.exitCode}`).trim();
          reply.raw.write(`data: {"error":{"message":${JSON.stringify(errMsg)}}}\n\n`);
        } else if (!hasError) {
          await globalSessionThreadManager.saveThreadState({
            threadId: sessionRes.threadId,
            clientScope: sessionRes.clientScope,
            rootHash: sessionRes.rootHash,
            leafHash: sessionRes.leafHash,
            adapterId: activeAdapterId,
            accountId: activeAccountId,
            cliSessionId: result.capturedSessionId || sessionRes.cliSessionId,
          });
        }

        reply.raw.write(formatSseDone());
        reply.raw.end();
      } catch (err: unknown) {
        hasError = true;
        const message = err instanceof Error ? err.message : String(err);
        if (!abortController.signal.aborted) {
          reply.raw.write(`data: {"error":{"message":${JSON.stringify(message)}}}\n\n`);
          reply.raw.end();
        }
      } finally {
        await globalAccountPool.releaseSlot(activeAccountId);
        const duration = Date.now() - startTime;
        const finishedRecord = globalExecutionRegistry.complete(completionId, hasError ? "ERROR" : "COMPLETED");
        await globalAccountPool.recordRequestMetrics(activeAccountId, !hasError, duration);
        globalTelemetryQueue.enqueue({
          id: `rm-${randomUUID()}`,
          requestId: completionId,
          adapterId: activeAdapterId,
          accountId: activeAccountId,
          modelRequested: requestedModel,
          modelExecuted: target.actualModelId,
          promptTokens: finishedRecord?.promptTokens || promptTokens,
          reasoningTokens: finishedRecord?.reasoningTokens || 0,
          completionTokens: finishedRecord?.completionTokens || 0,
          totalTokens: finishedRecord?.totalTokens || promptTokens,
          ttftMs: finishedRecord?.ttftMs ?? null,
          totalDurationMs: duration,
          statusCode: hasError ? 500 : 200,
          status: hasError ? "ERROR" : "SUCCESS",
          errorMessage: hasError ? "Stream completed with error" : null,
          createdAt: Math.floor(Date.now() / 1000),
        });
        globalAdminEventBus.broadcast("request:complete", {
          id: completionId,
          durationMs: duration,
          success: !hasError,
          promptTokens: finishedRecord?.promptTokens || promptTokens,
          completionTokens: finishedRecord?.completionTokens || 0,
          reasoningTokens: finishedRecord?.reasoningTokens || 0,
          totalTokens: finishedRecord?.totalTokens || promptTokens,
        });
      }
      return;
    }

    // 5. Unary Non-Streaming Response
    try {
      const nonStreamRes = await globalProcessManager.executeNonStreaming({
        adapter: target.adapter,
        account: target.account,
        modelId: target.actualModelId,
        messages,
        session: {
          threadId: sessionRes.threadId,
          cliSessionId: sessionRes.cliSessionId,
          isResume: sessionRes.isResume,
          deltaPrompt: sessionRes.deltaPrompt,
        },
        signal: abortController.signal,
        effortLevel: target.effectiveEffort || requestedEffort,
      });

      const tokenUsage = estimateTokenUsage(messages, nonStreamRes.content);

      const duration = Date.now() - startTime;
      const reasoningTokens = nonStreamRes.thoughtContent ? estimateTextTokens(nonStreamRes.thoughtContent) : 0;
      globalExecutionRegistry.complete(completionId, "COMPLETED");
      await globalAccountPool.recordRequestMetrics(target.account.id, true, duration);
      globalTelemetryQueue.enqueue({
        id: `rm-${randomUUID()}`,
        requestId: completionId,
        adapterId: target.adapter.id,
        accountId: target.account.id,
        modelRequested: requestedModel,
        modelExecuted: target.actualModelId,
        promptTokens: tokenUsage.prompt_tokens,
        reasoningTokens,
        completionTokens: tokenUsage.completion_tokens,
        totalTokens: tokenUsage.total_tokens + reasoningTokens,
        totalDurationMs: duration,
        statusCode: 200,
        status: "SUCCESS",
        createdAt: Math.floor(Date.now() / 1000),
      });
      globalAdminEventBus.broadcast("request:complete", {
        id: completionId,
        durationMs: duration,
        success: true,
        promptTokens: tokenUsage.prompt_tokens,
        completionTokens: tokenUsage.completion_tokens,
        reasoningTokens,
        totalTokens: tokenUsage.total_tokens + reasoningTokens,
      });

      return reply.send({
        id: completionId,
        object: "chat.completion",
        created: createdTimestamp,
        model: requestedModel,
        _debug_provider: target.debugProvider,
        _debug_model_tier: target.debugModelTier,
        _debug_sandbox: target.account.sandboxDir,
        _debug_effort: target.effectiveEffort || "none",
        _debug_pipeline: target.pipelineId || "none",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: nonStreamRes.content,
              ...(nonStreamRes.thoughtContent ? { reasoning_content: nonStreamRes.thoughtContent } : {}),
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: tokenUsage.prompt_tokens,
          completion_tokens: tokenUsage.completion_tokens,
          total_tokens: tokenUsage.total_tokens,
          ...(nonStreamRes.thoughtContent
            ? { completion_tokens_details: { reasoning_tokens: Math.ceil(nonStreamRes.thoughtContent.length / 4) } }
            : {}),
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const is429 = message.startsWith("429") || message.toLowerCase().includes("rate limit");
      if (is429) {
        const cooldownSeconds = extractDurationSeconds(message) || 1800;
        await globalCooldownTracker.triggerCooldown(
          target.account.id,
          cooldownSeconds,
          message
        );
        return reply.status(429).send({
          error: {
            message,
            type: "rate_limit_error",
            param: null,
            code: "rate_limit_exceeded",
          },
        });
      }
      return reply.status(500).send({
        error: {
          message,
          type: "api_error",
          param: null,
          code: null,
        },
      });
    } finally {
      globalExecutionRegistry.complete(completionId, "COMPLETED");
      await globalAccountPool.releaseSlot(target.account.id);
    }
  });
}
