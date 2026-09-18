import type { Adapter, CliEvent, HostLoginRun } from "../core/types.js";

function classifyError(message: string): CliEvent & { type: "error" } {
  if (/rate limit|usage limit|quota|too many requests/i.test(message)) {
    return { type: "error", kind: "rate_limit", message };
  }
  if (/login|unauthor|auth/i.test(message)) {
    return { type: "error", kind: "auth", message };
  }
  return { type: "error", kind: "unknown", message };
}

export const codexAdapter: Adapter = {
  id: "codex",
  executable: "codex",
  models: [
    { id: "gpt-5.6-asta", label: "GPT-5.6 Asta" },
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
    { id: "gpt-5.5", label: "GPT-5.5" },
  ],

  buildArgs(input) {
    const args = input.resume
      ? ["exec", "resume", input.resume.cliSessionId, "--json", "--skip-git-repo-check", "-m", input.model]
      : ["exec", "--json", "--skip-git-repo-check", "--color", "never", "-m", input.model];

    if (input.effort && input.effort !== "none") {
      args.push("-c", `model_reasoning_effort="${input.effort}"`);
    }
    if (input.allowTools) {
      args.push("--dangerously-bypass-approvals-and-sandbox");
    } else {
      args.push("--sandbox", "read-only");
    }
    args.push("-");

    return { args, promptVia: "stdin" };
  },

  buildEnv(sandbox) {
    return { CODEX_HOME: sandbox.configDir };
  },

  parseLine(line: string): CliEvent[] {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return [];
    }

    const type = obj.type as string | undefined;

    if (type === "thread.started") {
      return [{ type: "session", cliSessionId: String(obj.thread_id) }];
    }

    if (type === "item.completed") {
      const item = obj.item as Record<string, unknown> | undefined;
      if (!item) return [];

      if (item.type === "agent_message") {
        return [{ type: "text_delta", text: String(item.text ?? "") }];
      }
      if (item.type === "reasoning") {
        return [{ type: "thinking_delta", text: String(item.text ?? "") }];
      }
      if (item.type === "error") {
        const message = String(item.message ?? "");
        const err = classifyError(message);
        if (err.kind === "unknown") return [];
        return [err];
      }
      return [];
    }

    if (type === "turn.completed") {
      const usage = obj.usage as Record<string, unknown> | undefined;
      const events: CliEvent[] = [];
      if (usage) {
        events.push({
          type: "usage",
          input: Number(usage.input_tokens ?? 0),
          cachedInput: Number(usage.cached_input_tokens ?? 0),
          cacheWrite: Number(usage.cache_write_input_tokens ?? 0),
          output: Number(usage.output_tokens ?? 0),
          reasoning: Number(usage.reasoning_output_tokens ?? 0),
        });
      }
      events.push({ type: "done", stopReason: "end_turn" });
      return events;
    }

    if (type === "turn.failed") {
      const message = String(obj.message ?? obj.error ?? "Turn failed");
      return [classifyError(message), { type: "done", stopReason: "error" }];
    }

    return [];
  },

  async detectHostLogin(run: HostLoginRun) {
    const result = await run("codex", ["login", "status"]);
    const combined = `${result.stdout}\n${result.stderr}`;
    if (/not logged in/i.test(combined)) {
      return { status: "logged_out" as const };
    }
    if (result.code === 0 && /logged in/i.test(combined)) {
      const line = combined.split(/\r?\n/).find((row) => /logged in/i.test(row))?.trim();
      return { status: "logged_in" as const, label: line };
    }
    return { status: "unknown" as const };
  },
};
