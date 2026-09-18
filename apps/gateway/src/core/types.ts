export type Role = "system" | "user" | "assistant";
export interface ChatMessage {
  role: Role;
  content: string;
}
export type Effort = "none" | "low" | "medium" | "high" | "xhigh";

export interface ChatRequest {
  requestId: string;
  apiKeyId: string;
  dialect: "openai" | "anthropic";
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  effort?: Effort;
  maxTokens?: number;
  conversationHint?: string;
  clientAbort: AbortSignal;
}

export type CliEvent =
  | { type: "session"; cliSessionId: string }
  | { type: "thinking_delta"; text: string }
  | { type: "text_delta"; text: string }
  | {
      type: "usage";
      input: number;
      cachedInput: number;
      cacheWrite: number;
      output: number;
      reasoning: number;
      costUsd?: number;
    }
  | {
      type: "rate_limit";
      windows: Array<{ name: string; utilization: number; resetsAt: number }>;
      limited: boolean;
    }
  | {
      type: "error";
      kind: "rate_limit" | "auth" | "crash" | "timeout" | "unknown";
      message: string;
      retryAfterSec?: number;
    }
  | { type: "done"; stopReason: "end_turn" | "max_tokens" | "error" };

export interface Adapter {
  id: "claude-code" | "codex" | "agy" | "omp";
  executable: string;
  models: Array<{ id: string; label: string }>;
  buildArgs(input: {
    model: string;
    effort?: Effort;
    systemPrompt?: string;
    resume?: { cliSessionId: string };
    allowTools: boolean;
  }): { args: string[]; promptVia: "argv" | "stdin" };
  buildEnv(sandbox: {
    accountDir: string;
    homeDir: string;
    configDir: string;
    workspaceDir: string;
  }): NodeJS.ProcessEnv;
  parseLine(line: string): CliEvent[];
  parseStderr?(text: string): CliEvent[];
}
