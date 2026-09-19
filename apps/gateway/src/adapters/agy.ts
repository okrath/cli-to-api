import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, CliDirs, CliEvent, Effort } from "../core/types.js";

function agyBase(homeDir: string): string {
  return join(homeDir, ".gemini", "antigravity-cli");
}

function agySessionArtifacts(dirs: CliDirs, id: string): string[] {
  const base = agyBase(dirs.homeDir);
  const paths: string[] = [];
  const brain = join(base, "brain", id);
  const annotation = join(base, "annotations", `${id}.pbtxt`);
  if (existsSync(brain)) paths.push(brain);
  if (existsSync(annotation)) paths.push(annotation);
  return paths;
}

function agySweepArtifacts(dirs: CliDirs, olderThanMs: number): string[] {
  const cutoff = Date.now() - olderThanMs;
  const base = agyBase(dirs.homeDir);
  const paths: string[] = [];
  const brainDir = join(base, "brain");
  if (existsSync(brainDir)) {
    for (const ent of readdirSync(brainDir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const full = join(brainDir, ent.name);
      try {
        if (statSync(full).mtimeMs < cutoff) paths.push(full);
      } catch {
        /* skip */
      }
    }
  }
  const annDir = join(base, "annotations");
  if (existsSync(annDir)) {
    for (const ent of readdirSync(annDir, { withFileTypes: true })) {
      if (!ent.isFile() || !ent.name.endsWith(".pbtxt")) continue;
      const full = join(annDir, ent.name);
      try {
        if (statSync(full).mtimeMs < cutoff) paths.push(full);
      } catch {
        /* skip */
      }
    }
  }
  const historyPath = join(base, "history.jsonl");
  if (existsSync(historyPath)) {
    try {
      const lines = readFileSync(historyPath, "utf8").split(/\r?\n/);
      const kept = lines.filter((line) => {
        if (line.length === 0) return false;
        try {
          const row = JSON.parse(line) as { timestamp?: number };
          return typeof row.timestamp === "number" && row.timestamp >= cutoff;
        } catch {
          return true;
        }
      });
      writeFileSync(historyPath, kept.length > 0 ? `${kept.join("\n")}\n` : "");
    } catch {
      /* skip */
    }
  }
  const dbPath = join(base, "conversation_summaries.db");
  if (existsSync(dbPath)) {
    try {
      if (statSync(dbPath).mtimeMs < cutoff) paths.push(dbPath);
    } catch {
      /* skip */
    }
  }
  return paths;
}

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

export const agyAdapter: Adapter = {
  id: "agy",
  executable: "agy",
  models: [
    { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash High" },
    { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro High" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 Thinking" },
    { id: "gpt-oss-120b-medium", label: "GPT OSS 120B Medium" },
  ],

  buildArgs(input) {
    const args = [
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
    args.push("--print");

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

  async detectHostLogin() {
    return { status: "unknown" as const };
  },

  sessionArtifacts: agySessionArtifacts,
  sweepArtifacts: agySweepArtifacts,
};
