import { randomUUID } from "node:crypto";
import type { Adapter, CliEvent, HostLoginRun } from "../core/types.js";

function classifyError(message: string): CliEvent & { type: "error" } {
  if (/rate limit|usage limit|resets in/i.test(message)) {
    return { type: "error", kind: "rate_limit", message };
  }
  if (/not logged in|login|unauthor|api key/i.test(message)) {
    return { type: "error", kind: "auth", message };
  }
  return { type: "error", kind: "unknown", message };
}

function usageFromRaw(raw: Record<string, unknown>): CliEvent {
  const details = raw.output_tokens_details as Record<string, unknown> | undefined;
  return {
    type: "usage",
    input: Number(raw.input_tokens ?? 0),
    cachedInput: Number(raw.cache_read_input_tokens ?? 0),
    cacheWrite: Number(raw.cache_creation_input_tokens ?? 0),
    output: Number(raw.output_tokens ?? 0),
    reasoning: Number(details?.thinking_tokens ?? 0),
  };
}

export const claudeCodeAdapter: Adapter = {
  id: "claude-code",
  executable: "claude",
  models: [
    { id: "sonnet", label: "Sonnet" },
    { id: "opus", label: "Opus" },
    { id: "haiku", label: "Haiku" },
  ],

  buildArgs(input) {
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--model",
      input.model,
      "--max-turns",
      "1",
      "--disable-slash-commands",
    ];

    if (input.effort && input.effort !== "none") {
      args.push("--effort", input.effort);
    }
    if (input.systemPrompt && !input.resume) {
      args.push("--system-prompt", input.systemPrompt);
    }
    if (input.allowTools) {
      args.push("--dangerously-skip-permissions");
    } else {
      args.push("--tools", "");
    }
    if (input.resume) {
      args.push("--resume", input.resume.cliSessionId);
    } else {
      args.push("--session-id", randomUUID());
    }

    return { args, promptVia: "stdin" };
  },

  buildEnv(sandbox) {
    return { CLAUDE_CONFIG_DIR: sandbox.configDir };
  },

  parseLine(line: string): CliEvent[] {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return [];
    }

    const type = obj.type as string | undefined;

    if (type === "system" && obj.subtype === "init") {
      return [{ type: "session", cliSessionId: String(obj.session_id) }];
    }

    if (type === "rate_limit_event") {
      const info = obj.rate_limit_info as Record<string, unknown> | undefined;
      const windowsRaw = info?.unifiedWindows as Record<string, Record<string, unknown>> | undefined;
      const windows = windowsRaw
        ? Object.entries(windowsRaw).map(([name, w]) => ({
            name,
            utilization: Number(w.utilization ?? 0),
            resetsAt: Number(w.resetsAt ?? 0),
          }))
        : [];
      return [
        {
          type: "rate_limit",
          windows,
          limited: info?.status !== "allowed",
        },
      ];
    }

    if (type === "stream_event") {
      const event = obj.event as Record<string, unknown> | undefined;
      if (!event) return [];

      if (event.type === "content_block_delta") {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.type === "thinking_delta") {
          return [{ type: "thinking_delta", text: String(delta.thinking ?? "") }];
        }
        if (delta?.type === "text_delta") {
          return [{ type: "text_delta", text: String(delta.text ?? "") }];
        }
        return [];
      }

      if (event.type === "message_delta") {
        const usage = event.usage as Record<string, unknown> | undefined;
        if (usage) return [usageFromRaw(usage)];
      }

      return [];
    }

    if (type === "result") {
      const events: CliEvent[] = [];
      const usage = obj.usage as Record<string, unknown> | undefined;
      if (usage) {
        const usageEvent = usageFromRaw(usage) as Extract<CliEvent, { type: "usage" }>;
        if (obj.total_cost_usd != null) {
          usageEvent.costUsd = Number(obj.total_cost_usd);
        }
        events.push(usageEvent);
      }

      if (obj.is_error) {
        const message = String(obj.result ?? obj.message ?? "Unknown error");
        events.push(classifyError(message));
        events.push({ type: "done", stopReason: "error" });
        return events;
      }

      const stopReason =
        obj.stop_reason === "max_tokens" ? "max_tokens" : ("end_turn" as const);
      events.push({ type: "done", stopReason });
      return events;
    }

    return [];
  },

  parseStderr(text: string): CliEvent[] {
    if (/not logged in|please run \/login|invalid api key/i.test(text)) {
      return [{ type: "error", kind: "auth", message: text.trim().slice(0, 500) }];
    }
    return [];
  },

  async detectHostLogin(run: HostLoginRun) {
    const result = await run("claude", ["auth", "status"]);
    try {
      const json = JSON.parse((result.stdout || result.stderr).trim()) as Record<string, unknown>;
      if (json.loggedIn === true) {
        const label = [json.authMethod, json.email].filter(Boolean).join(" · ");
        return { status: "logged_in" as const, label: label || undefined };
      }
      if (json.loggedIn === false) {
        return { status: "logged_out" as const };
      }
    } catch {
      /* parse failure */
    }
    return { status: "unknown" as const };
  },
};
