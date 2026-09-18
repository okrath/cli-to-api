import type { Adapter, CliEvent } from "../core/types.js";

function classifyError(message: string): CliEvent & { type: "error" } {
  if (/rate limit|usage limit|quota/i.test(message)) {
    return { type: "error", kind: "rate_limit", message };
  }
  if (/not logged in|login|unauthor|auth/i.test(message)) {
    return { type: "error", kind: "auth", message };
  }
  return { type: "error", kind: "unknown", message };
}

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: string; text?: string } =>
        typeof part === "object" && part != null && part.type === "text",
    )
    .map((part) => String(part.text ?? ""))
    .join("");
}

export const cursorAgentAdapter: Adapter = {
  id: "cursor-agent",
  executable: "cursor-agent",
  models: [
    { id: "composer-2.5-fast", label: "Composer 2.5 Fast" },
    { id: "composer-2.5", label: "Composer 2.5" },
    { id: "gpt-5.3-codex", label: "Codex 5.3" },
    { id: "claude-sonnet-5-thinking-high", label: "Claude Sonnet 5 Thinking" },
    { id: "claude-opus-5-high", label: "Claude Opus 5" },
    { id: "gemini-3.7-flash-high", label: "Gemini 3.7 Flash" },
  ],

  buildArgs(input) {
    const args = [
      "-p",
      "--trust",
      "--output-format",
      "stream-json",
      "--stream-partial-output",
      "--model",
      input.model,
    ];

    if (input.allowTools) {
      args.push("--force");
    } else {
      args.push("--mode", "ask");
    }
    if (input.resume) {
      args.push("--resume", input.resume.cliSessionId);
    }

    return { args, promptVia: "argv" };
  },

  buildEnv() {
    return { CURSOR_INVOKED_AS: "cursor-agent" };
  },

  parseLine(line: string): CliEvent[] {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return [];
    }

    const type = obj.type as string | undefined;
    const subtype = obj.subtype as string | undefined;

    if (type === "system" && subtype === "init") {
      return [{ type: "session", cliSessionId: String(obj.session_id) }];
    }

    if (type === "thinking" && subtype === "delta") {
      return [{ type: "thinking_delta", text: String(obj.text ?? "") }];
    }

    if (type === "assistant") {
      if (typeof obj.timestamp_ms !== "number") return [];
      const message = obj.message as Record<string, unknown> | undefined;
      if (!message) return [];
      const text = textFromContent(message.content);
      return text ? [{ type: "text_delta", text }] : [];
    }

    if (type === "result") {
      const events: CliEvent[] = [];
      const usage = obj.usage as Record<string, unknown> | undefined;
      if (usage) {
        events.push({
          type: "usage",
          input: Number(usage.inputTokens ?? 0),
          cachedInput: Number(usage.cacheReadTokens ?? 0),
          cacheWrite: Number(usage.cacheWriteTokens ?? 0),
          output: Number(usage.outputTokens ?? 0),
          reasoning: 0,
        });
      }

      if (obj.is_error) {
        const message = String(obj.result ?? obj.error ?? "Unknown error");
        events.push(classifyError(message));
        events.push({ type: "done", stopReason: "error" });
      } else {
        events.push({ type: "done", stopReason: "end_turn" });
      }
      return events;
    }

    return [];
  },

  parseStderr(text: string): CliEvent[] {
    if (/not logged in|please run .*login|unauthor/i.test(text)) {
      return [{ type: "error", kind: "auth", message: text.trim() }];
    }
    if (/Workspace Trust Required/i.test(text)) {
      return [{ type: "error", kind: "crash", message: "cursor-agent needs --trust" }];
    }
    return [];
  },
};
