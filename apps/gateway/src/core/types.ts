export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

export interface ChatMessage {
  role: Role;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  isError?: boolean;
}

export type Effort = "none" | "low" | "medium" | "high" | "xhigh";

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

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
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none";
}

export type CliEvent =
  | { type: "session"; cliSessionId: string }
  | { type: "thinking_delta"; text: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; argumentsJson: string }
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
  | { type: "done"; stopReason: "end_turn" | "max_tokens" | "tool_use" | "error" };

export type HostLoginStatus = {
  status: "logged_in" | "logged_out" | "unknown";
  label?: string;
};

export type HostLoginRun = (
  file: string,
  args: string[],
) => Promise<{ code: number | null; stdout: string; stderr: string }>;

export interface Adapter {
  id: "claude-code" | "codex" | "agy" | "cursor-agent";
  executable: string;
  models: Array<{ id: string; label: string }>;
  clientTools?: boolean;
  buildArgs(input: {
    model: string;
    effort?: Effort;
    systemPrompt?: string;
    resume?: { cliSessionId: string };
    allowTools: boolean;
    tools?: { mcpUrl: string; serverName: string; maxTurns: number; resultTimeoutMs: number };
  }): { args: string[]; promptVia: "argv" | "stdin"; env?: NodeJS.ProcessEnv };
  buildEnv(sandbox: {
    accountDir: string;
    homeDir: string;
    configDir: string;
    workspaceDir: string;
  }): NodeJS.ProcessEnv;
  parseLine(line: string): CliEvent[];
  parseStderr?(text: string): CliEvent[];
  detectHostLogin?(run: HostLoginRun): Promise<HostLoginStatus>;
}
