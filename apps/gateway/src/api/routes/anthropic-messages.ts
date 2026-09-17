import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { globalLoadBalancer } from "../../router/load-balancer.js";
import { globalAccountPool } from "../../router/account-pool.js";
import { globalPipelineExecutor } from "../../router/pipeline-executor.js";
import { globalProcessManager } from "../../supervisor/process-manager.js";
import {
  AnthropicMessagesBodySchema,
  normalizeAnthropicMessages,
  resolveAnthropicEffort,
} from "../../utils/anthropic-normalizer.js";
import {
  formatAnthropicMessage,
  formatAnthropicMessageStart,
  formatAnthropicBlockStart,
  formatAnthropicBlockDelta,
  formatAnthropicBlockStop,
  formatAnthropicMessageDelta,
  formatAnthropicMessageStop,
  formatAnthropicSseError,
} from "../../stream/anthropic-serializer.js";
import {
  estimatePromptTokens,
  estimateTextTokens,
} from "../../utils/token-estimator.js";
import { globalExecutionRegistry } from "../../telemetry/execution-registry.js";
import { globalTelemetryBroadcaster } from "../../telemetry/telemetry-broadcaster.js";
import { globalTelemetryQueue } from "../../telemetry/persist-queue.js";
import { globalCooldownTracker } from "../../router/cooldown-tracker.js";
import { globalAdminEventBus } from "./admin-events.js";
import { globalSessionThreadManager } from "../../router/session-thread-manager.js";

export function registerAnthropicMessagesRoutes(fastify: FastifyInstance): void {
  fastify.post("/v1/messages", async (req: FastifyRequest, reply: FastifyReply) => {
    // 1. Validate incoming request body schema
    const parseResult = AnthropicMessagesBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const errorMessage = issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid request payload";
      return reply.status(400).send({
        type: "error",
        error: {
          type: "invalid_request_error",
          message: errorMessage,
        },
      });
    }

    const body = parseResult.data;
    const requestedModel = body.model;
    const isStreaming = Boolean(body.stream);
    const messages = normalizeAnthropicMessages(body);

    const headerEffort = req.headers["x-reasoning-effort"] as string | undefined;
    const requestedEffort = resolveAnthropicEffort(body, headerEffort);

    // 2. Resolve Conversation Thread & Session Context
    const explicitConversationId = (
      req.headers["x-conversation-id"] ||
      req.headers["x-session-id"] ||
      body.metadata?.user_id
    ) as string | undefined;

    const authHeader = req.headers.authorization || (req.headers["x-api-key"] ? `Bearer ${req.headers["x-api-key"]}` : undefined);
    const clientIp = req.ip || req.socket.remoteAddress;

    const sessionRes = await globalSessionThreadManager.resolveThread({
      explicitId: explicitConversationId,
      authHeader,
      clientIp,
      messages,
      adapterId: requestedModel.includes("/") ? requestedModel.split("/")[0] : requestedModel,
      requestedModel,
    });

    // 3. Resolve Target via Load Balancer (pin to thread's bound account if exists)
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
        type: "error",
        error: {
          type: is429 ? "rate_limit_error" : is404 ? "not_found_error" : "invalid_request_error",
          message: cleanedMessage,
        },
      });
    }

    const isPipeline = Boolean(target.pipelineCandidates && target.pipelineCandidates.length > 0);

    // 4. Acquire Slot via Semaphore (for direct non-pipeline targets)
    if (!isPipeline) {
      const slotAcquired = await globalAccountPool.acquireSlot(
        target.account.id,
        target.account.maxSlots || 1
      );
      if (!slotAcquired) {
        return reply.status(429).send({
          type: "error",
          error: {
            type: "rate_limit_error",
            message: `Account '${target.account.id}' active slots full. Please retry shortly.`,
          },
        });
      }
    }

    const completionId = `msg_${randomUUID()}`;
    const startTime = Date.now();
    const promptTokens = estimatePromptTokens(messages);

    // Setup AbortController for client disconnect
    const abortController = new AbortController();
    req.raw.on("close", () => {
      if (!reply.raw.writableEnded) {
        abortController.abort();
      }
    });

    // Register with in-memory execution registry for active radar
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

    globalAdminEventBus.broadcast("request:start", {
      id: completionId,
      model: requestedModel,
      provider: target.debugProvider,
      accountId: target.account.id,
      promptTokens,
      stream: isStreaming,
    });

    // 5. Streaming Response (Anthropic SSE event-stream)
    if (isStreaming) {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, x-api-key, anthropic-version, anthropic-beta",
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

      // Emit initial message_start event
      reply.raw.write(formatAnthropicMessageStart(completionId, requestedModel, promptTokens));

      let hasError = false;
      let activeAccountId = target.account.id;
      let activeAdapterId = target.adapter.id;

      let currentBlockType: "thinking" | "text" | null = null;
      let blockIndex = -1;
      let totalOutputTokens = 0;

      const handleThought = (thought: string) => {
        if (!thought) return;
        if (currentBlockType !== "thinking") {
          if (currentBlockType !== null) {
            reply.raw.write(formatAnthropicBlockStop(blockIndex));
          }
          blockIndex++;
          currentBlockType = "thinking";
          reply.raw.write(formatAnthropicBlockStart(blockIndex, "thinking"));
        }
        reply.raw.write(formatAnthropicBlockDelta(blockIndex, "thinking_delta", thought));
        const deltaTokens = estimateTextTokens(thought);
        totalOutputTokens += deltaTokens;
        globalExecutionRegistry.recordTokenChunk(completionId, deltaTokens, "reasoning");
        globalTelemetryBroadcaster.markDirty();
        globalAdminEventBus.broadcast("chunk:thought", { id: completionId, content: thought });
      };

      const handleContent = (content: string) => {
        if (!content) return;
        if (currentBlockType !== "text") {
          if (currentBlockType !== null) {
            reply.raw.write(formatAnthropicBlockStop(blockIndex));
          }
          blockIndex++;
          currentBlockType = "text";
          reply.raw.write(formatAnthropicBlockStart(blockIndex, "text"));
        }
        reply.raw.write(formatAnthropicBlockDelta(blockIndex, "text_delta", content));
        const deltaTokens = estimateTextTokens(content);
        totalOutputTokens += deltaTokens;
        globalExecutionRegistry.recordTokenChunk(completionId, deltaTokens, "content");
        globalTelemetryBroadcaster.markDirty();
        globalAdminEventBus.broadcast("chunk:delta", { id: completionId, content });
      };

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
              onThoughtDelta: handleThought,
              onContentDelta: handleContent,
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
            onThoughtDelta: handleThought,
            onContentDelta: handleContent,
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
          reply.raw.write(formatAnthropicSseError("api_error", errMsg));
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

        // Close any open content block
        if (currentBlockType !== null) {
          reply.raw.write(formatAnthropicBlockStop(blockIndex));
          currentBlockType = null;
        }

        // Emit message_delta & message_stop
        reply.raw.write(formatAnthropicMessageDelta(totalOutputTokens || 1, "end_turn"));
        reply.raw.write(formatAnthropicMessageStop());
        reply.raw.end();
      } catch (err: unknown) {
        hasError = true;
        const message = err instanceof Error ? err.message : String(err);
        if (!abortController.signal.aborted) {
          reply.raw.write(formatAnthropicSseError("api_error", message));
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
          completionTokens: finishedRecord?.completionTokens || totalOutputTokens,
          totalTokens: (finishedRecord?.promptTokens || promptTokens) + (finishedRecord?.completionTokens || totalOutputTokens),
          ttftMs: finishedRecord?.ttftMs ?? null,
          totalDurationMs: duration,
          statusCode: hasError ? 500 : 200,
          status: hasError ? "ERROR" : "SUCCESS",
          errorMessage: hasError ? "Anthropic stream completed with error" : null,
          createdAt: Math.floor(Date.now() / 1000),
        });
        globalAdminEventBus.broadcast("request:complete", {
          id: completionId,
          durationMs: duration,
          success: !hasError,
          promptTokens: finishedRecord?.promptTokens || promptTokens,
          completionTokens: finishedRecord?.completionTokens || totalOutputTokens,
          reasoningTokens: finishedRecord?.reasoningTokens || 0,
          totalTokens: (finishedRecord?.promptTokens || promptTokens) + (finishedRecord?.completionTokens || totalOutputTokens),
        });
      }
      return;
    }

    // 6. Unary Non-Streaming Response
    let hasError = false;
    let activeAccountId = target.account.id;
    let activeAdapterId = target.adapter.id;

    try {
      let result;
      let usedCandidate;

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
          }
        );
        result = execRes.result;
        usedCandidate = execRes.usedCandidate;
        activeAccountId = usedCandidate.account.id;
        activeAdapterId = usedCandidate.adapterConfig.id;
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
        });
      }

      if (result.exitCode !== 0 && result.exitCode !== null) {
        if (result.rateLimitDetected?.isRateLimited) {
          await globalCooldownTracker.triggerCooldown(
            activeAccountId,
            result.rateLimitDetected.cooldownSeconds,
            "429 rate limit exceeded during execution"
          );
          return reply.status(429).send({
            type: "error",
            error: {
              type: "rate_limit_error",
              message: `Rate limit exceeded (${result.rateLimitDetected.cooldownSeconds}s cooldown)`,
            },
          });
        }
        const errMsg = result.stderr || result.stdout || `CLI execution failed with code ${result.exitCode}`;
        return reply.status(500).send({
          type: "error",
          error: {
            type: "api_error",
            message: errMsg.trim(),
          },
        });
      }

      await globalSessionThreadManager.saveThreadState({
        threadId: sessionRes.threadId,
        clientScope: sessionRes.clientScope,
        rootHash: sessionRes.rootHash,
        leafHash: sessionRes.leafHash,
        adapterId: activeAdapterId,
        accountId: activeAccountId,
        cliSessionId: result.capturedSessionId || sessionRes.cliSessionId,
      });

      const outputTokens = estimateTextTokens(result.stdout) + estimateTextTokens(result.thoughtContent || "");

      const responsePayload = formatAnthropicMessage({
        id: completionId,
        model: requestedModel,
        content: result.stdout,
        thoughtContent: result.thoughtContent,
        inputTokens: promptTokens,
        outputTokens: outputTokens || 1,
        stopReason: "end_turn",
      });

      return reply.send(responsePayload);
    } catch (err: unknown) {
      hasError = true;
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        type: "error",
        error: {
          type: "api_error",
          message,
        },
      });
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
        totalTokens: (finishedRecord?.promptTokens || promptTokens) + (finishedRecord?.completionTokens || 0),
        ttftMs: finishedRecord?.ttftMs ?? null,
        totalDurationMs: duration,
        statusCode: hasError ? 500 : 200,
        status: hasError ? "ERROR" : "SUCCESS",
        errorMessage: hasError ? "Anthropic unary execution error" : null,
        createdAt: Math.floor(Date.now() / 1000),
      });
      globalAdminEventBus.broadcast("request:complete", {
        id: completionId,
        durationMs: duration,
        success: !hasError,
        promptTokens: finishedRecord?.promptTokens || promptTokens,
        completionTokens: finishedRecord?.completionTokens || 0,
        reasoningTokens: finishedRecord?.reasoningTokens || 0,
        totalTokens: (finishedRecord?.promptTokens || promptTokens) + (finishedRecord?.completionTokens || 0),
      });
    }
  });
}
