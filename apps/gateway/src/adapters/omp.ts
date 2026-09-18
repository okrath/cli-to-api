import type { Adapter, CliEvent } from "../core/types.js";

function classifyError(message: string): CliEvent & { type: "error" } {
  if (/rate limit|usage limit|resets in/i.test(message)) {
    return { type: "error", kind: "rate_limit", message };
  }
  if (/not logged in|login|unauthor|api key/i.test(message)) {
    return { type: "error", kind: "auth", message };
  }
  return { type: "error", kind: "unknown", message };
}

export const ompAdapter: Adapter = {
  id: "omp",
  executable: "omp",
  models: [{ id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" }],

  buildArgs(input) {
    const args = ["-p", "--mode", "json", "--no-pty", "--model", input.model];

    if (input.systemPrompt && !input.resume) {
      args.push("--system-prompt", input.systemPrompt);
    }
    if (input.resume) {
      args.push("-r", input.resume.cliSessionId);
    }

    return { args, promptVia: "argv" };
  },

  buildEnv() {
    return {};
  },

  parseLine(line: string): CliEvent[] {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return [];
    }

    const type = obj.type as string | undefined;

    if (type === "session") {
      return [{ type: "session", cliSessionId: String(obj.id) }];
    }

    if (type === "message_update") {
      const evt = obj.assistantMessageEvent as Record<string, unknown> | undefined;
      if (!evt) return [];
      if (evt.type === "text_delta") {
        return [{ type: "text_delta", text: String(evt.delta ?? "") }];
      }
      if (evt.type === "thinking_delta") {
        return [{ type: "thinking_delta", text: String(evt.delta ?? "") }];
      }
      return [];
    }

    if (type === "message_end") {
      const message = obj.message as Record<string, unknown> | undefined;
      if (message?.role !== "assistant") return [];
      const usage = message.usage as Record<string, unknown> | undefined;
      if (!usage) return [];
      const cost = usage.cost as Record<string, unknown> | undefined;
      return [
        {
          type: "usage",
          input: Number(usage.input ?? 0),
          cachedInput: Number(usage.cacheRead ?? 0),
          cacheWrite: Number(usage.cacheWrite ?? 0),
          output: Number(usage.output ?? 0),
          reasoning: Number(usage.reasoningTokens ?? 0),
          costUsd: cost?.total != null ? Number(cost.total) : undefined,
        },
      ];
    }

    if (type === "agent_end") {
      return [{ type: "done", stopReason: "end_turn" }];
    }

    if (type === "error") {
      const message = String(obj.message ?? obj.error ?? "Unknown error");
      return [classifyError(message), { type: "done", stopReason: "error" }];
    }

    return [];
  },
};
