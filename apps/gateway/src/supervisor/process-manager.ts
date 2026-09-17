import type { EffortLevel } from "../db/schema.js";
import fs from "node:fs/promises";
import { execSync } from "node:child_process";
import { AdapterConfig } from "../adapters/schema.js";
import { resolveBinary } from "../adapters/resolver.js";
import { preparePromptTransport } from "./prompt-transport.js";
import { executePipe } from "./pipe-executor.js";
import { executePty } from "./pty-executor.js";
import { ProcessExecutionResult } from "./types.js";
import { checkRateLimit } from "../stream/rate-limit-detector.js";
import { normalizeContentToString, stripThinkingTags, MessageContent } from "../utils/content-normalizer.js";

export interface ExecutionContext {
  adapter: AdapterConfig;
  account: {
    id: string;
    sandboxDir: string;
    customEnv?: Record<string, string>;
  };
  modelId: string;
  messages: Array<{ role: string; content: MessageContent }>;
  session?: {
    threadId: string;
    cliSessionId?: string;
    isResume: boolean;
    deltaPrompt: string;
  };
  signal?: AbortSignal;
  onDelta?: (content: string) => void;
  onContentDelta?: (content: string) => void;
  onThoughtDelta?: (content: string) => void;
  effortLevel?: EffortLevel | null;
  onSpawn?: (pid: number) => void;
}

export interface NonStreamingExecutionResult {
  content: string;
  thoughtContent?: string;
}

export class ProcessManager {
  public async executeStreaming(ctx: ExecutionContext): Promise<ProcessExecutionResult> {
    const prompt = ctx.session?.isResume
      ? ctx.session.deltaPrompt
      : this.flattenMessages(ctx.messages);

    const resolved = resolveBinary(ctx.adapter.executable);

    // Ensure account sandbox directory exists
    await fs.mkdir(ctx.account.sandboxDir, { recursive: true });

    const isResume = Boolean(ctx.session?.isResume && ctx.session?.cliSessionId);
    const argsTemplate = isResume && ctx.adapter.invocation.args_template_resume
      ? ctx.adapter.invocation.args_template_resume
      : ctx.adapter.invocation.args_template;
    const argsTemplateFile = isResume && ctx.adapter.invocation.args_template_resume_file
      ? ctx.adapter.invocation.args_template_resume_file
      : ctx.adapter.invocation.args_template_file;

    // Prepare prompt transport (argv vs temp_file vs stdin)
    const transport = await preparePromptTransport({
      argsTemplate,
      argsTemplateFile,
      prompt,
      model: ctx.modelId,
      accountDir: ctx.account.sandboxDir,
      preferredTransport: ctx.adapter.invocation.prompt_transport,
      promptThresholdChars: ctx.adapter.invocation.prompt_threshold_chars,
      sessionId: ctx.session?.cliSessionId,
      effortLevel: ctx.effortLevel,
      adapterId: ctx.adapter.id,
    });

    // Merge spawnPrefixArgs (e.g. ["/d", "/s", "/c", "path/to/cli.cmd"]) with finalArgs
    const fullArgs = [...resolved.spawnPrefixArgs, ...transport.finalArgs];

    const adapterOverrides: Record<string, string> = {};
    for (const [key, value] of Object.entries(ctx.adapter.environment_isolation?.env_overrides || {})) {
      adapterOverrides[key] = value
        .replace(/{sandbox_dir}/g, ctx.account.sandboxDir)
        .replace(/{account_dir}/g, ctx.account.sandboxDir)
        .replace(/{workspace_dir}/g, `${ctx.account.sandboxDir}/workspace`);
    }

    try {
      const execFn = ctx.adapter.execution_mode === "pty" ? executePty : executePipe;

      const result = await execFn({
        executable: resolved.spawnExecutable,
        args: fullArgs,
        cwd: ctx.account.sandboxDir,
        env: {
          ...process.env,
          HOME: ctx.account.sandboxDir,
          USERPROFILE: ctx.account.sandboxDir,
          CI: "1",
          ...adapterOverrides,
          ...(ctx.account.customEnv || {}),
        },
        executionMode: ctx.adapter.execution_mode,
        stdinContent: transport.stdinContent,
        signal: ctx.signal,
        timeoutSeconds: ctx.adapter.invocation.timeout_seconds,
        onDelta: ctx.onDelta,
        onContentDelta: ctx.onContentDelta,
        onThoughtDelta: ctx.onThoughtDelta,
        onSpawn: ctx.onSpawn,
      });

      // Check for rate limit signatures in stdout / stderr
      const combinedOutput = `${result.stdout}\n${result.stderr}`;
      const rateLimit = checkRateLimit(
        combinedOutput,
        ctx.adapter.error_handling.rate_limit_patterns
      );
      // Capture session ID from output if present (e.g. Codex prints "session id: <UUID>")
      const sessionMatch = combinedOutput.match(/session id:\s*([a-f0-9-]+)/i);
      if (sessionMatch && sessionMatch[1]) {
        result.capturedSessionId = sessionMatch[1];
      } else if (ctx.session?.cliSessionId) {
        result.capturedSessionId = ctx.session.cliSessionId;
      }

      if (rateLimit.isRateLimited) {
        result.rateLimitDetected = {
          isRateLimited: true,
          cooldownSeconds: rateLimit.cooldownSeconds,
        };
      }
      return result;
    } finally {
      if (transport.cleanupHook) {
        await transport.cleanupHook();
      }
    }
  }

  public async executeNonStreaming(ctx: ExecutionContext): Promise<NonStreamingExecutionResult> {
    const result = await this.executeStreaming(ctx);
    if (result.exitCode !== 0 && result.exitCode !== null) {
      if (result.rateLimitDetected?.isRateLimited) {
        throw new Error(`429: Rate limit exceeded (${result.rateLimitDetected.cooldownSeconds}s cooldown)`);
      }
      throw new Error(`CLI execution failed with code ${result.exitCode}: ${result.stderr || result.stdout}`);
    }
    return {
      content: result.stdout,
      thoughtContent: result.thoughtContent,
    };
  }

  public flattenMessages(messages: Array<{ role: string; content: MessageContent }>): string {
    if (messages.length === 1) {
      return stripThinkingTags(normalizeContentToString(messages[0].content));
    }

    // Standard conversational formatting with historical thinking stripped from assistant turns
    return messages
      .map(m => {
        const rolePrefix = m.role === "system"
          ? "System Instructions:"
          : m.role === "user"
            ? "Human:"
            : "Assistant:";
        const text = normalizeContentToString(m.content);
        const cleanText = m.role === "assistant" ? stripThinkingTags(text) : text;
        return `${rolePrefix}\n${cleanText}`;
      })
      .join("\n\n");
  }
}

export const globalProcessManager = new ProcessManager();

/**
 * Forcefully terminate an operating system subprocess tree in < 200ms.
 * Compatible with Win32 Job Objects / taskkill and POSIX Process Groups.
 */
export function killSubprocessTree(pid: number): void {
  if (!pid || pid <= 0) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } else {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        process.kill(pid, "SIGKILL");
      }
    }
  } catch {
    // Process may have already exited cleanly
  }
}
