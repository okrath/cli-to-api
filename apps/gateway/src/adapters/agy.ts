import type { Adapter, CliEvent, Effort } from "../core/types.js";

function clampEffort(effort: Effort): Effort {
  if (effort === "xhigh") return "high";
  return effort;
}

function classifyError(message: string): CliEvent & { type: "error" } {
  if (/rate limit|usage limit|resets in/i.test(message)) {
    return { type: "error", kind: "rate_limit", message };
  }
  if (/not logged in|login|unauthor|api key/i.test(message)) {
    return { type: "error", kind: "auth", message };
  }
  return { type: "error", kind: "unknown", message };
}

const ARGV_PROMPT_LIMIT = 6000;

export const agyAdapter: Adapter = {
  id: "agy",
  executable: "agy",
  models: [
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],

  buildArgs(input) {
    const args = [
      "--print",
      "",
      "--output-format",
      "stream-json",
      "--disable-slash-commands",
      "--model",
      input.model,
    ];

    if (input.effort && input.effort !== "none") {
      args.push("--effort", clampEffort(input.effort));
    }
    if (input.resume) {
      args.push("--conversation", input.resume.cliSessionId);
    }
    if (input.allowTools) {
      args.push("--dangerously-skip-permissions");
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

    const event = obj.event as string | undefined;

    if (event === "init") {
      return [{ type: "session", cliSessionId: String(obj.conversation_id) }];
    }

    if (event === "step_update") {
      const step = obj.step_update as Record<string, unknown> | undefined;
      if (!step || step.step_type !== "agent_response") return [];
      if (typeof step.text_delta !== "string") return [];

      const events: CliEvent[] = [{ type: "text_delta", text: step.text_delta }];

      const usage = step.usage as Record<string, unknown> | undefined;
      if (step.state === "DONE" && usage) {
        events.push({
          type: "usage",
          input: Number(usage.input_tokens ?? 0),
          cachedInput: Number(usage.cache_read_tokens ?? 0),
          cacheWrite: 0,
          output: Number(usage.output_tokens ?? 0),
          reasoning: Number(usage.thinking_tokens ?? 0),
        });
      }
      return events;
    }

    if (event === "result") {
      const result = obj.result as Record<string, unknown> | undefined;
      if (!result) return [];

      const events: CliEvent[] = [];
      const usage = result.usage as Record<string, unknown> | undefined;
      if (usage) {
        events.push({
          type: "usage",
          input: Number(usage.input_tokens ?? 0),
          cachedInput: Number(usage.cache_read_tokens ?? 0),
          cacheWrite: 0,
          output: Number(usage.output_tokens ?? 0),
          reasoning: Number(usage.thinking_tokens ?? 0),
        });
      }

      if (result.status === "SUCCESS") {
        events.push({ type: "done", stopReason: "end_turn" });
      } else {
        const message = String(result.response ?? result.status ?? "Unknown error");
        events.push(classifyError(message));
        events.push({ type: "done", stopReason: "error" });
      }
      return events;
    }

    return [];
  },
};

export function agyBuildArgsWithPrompt(
  input: Parameters<Adapter["buildArgs"]>[0],
  prompt: string,
): { args: string[]; promptVia: "argv" | "stdin"; stdinPayload?: string } {
  const base = agyAdapter.buildArgs(input);
  const args = [...base.args];

  if (prompt.length > ARGV_PROMPT_LIMIT) {
    const printIdx = args.indexOf("--print");
    if (printIdx >= 0) args[printIdx + 1] = "";
    args.push("--input-format", "stream-json");
    const stdinPayload = JSON.stringify({
      type: "user",
      message: { role: "user", content: prompt },
    });
    return { args, promptVia: "stdin", stdinPayload };
  }

  const printIdx = args.indexOf("--print");
  if (printIdx >= 0) args[printIdx + 1] = prompt;

  return { args, promptVia: "argv" };
}
