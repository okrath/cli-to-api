import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, unlink, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Adapter, CliDirs, CliEvent, HostLoginRun } from "../core/types.js";

function claudeSessionArtifacts(dirs: CliDirs, id: string): string[] {
  const paths: string[] = [];
  const projectsDir = join(dirs.configDir, "projects");
  if (existsSync(projectsDir)) {
    for (const sub of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const file = join(projectsDir, sub.name, `${id}.jsonl`);
      if (existsSync(file)) paths.push(file);
    }
  }
  const sessionsDir = join(dirs.configDir, "sessions");
  if (existsSync(sessionsDir)) {
    for (const ent of readdirSync(sessionsDir, { withFileTypes: true })) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
      const file = join(sessionsDir, ent.name);
      try {
        const json = JSON.parse(readFileSync(file, "utf8")) as { sessionId?: string };
        if (json.sessionId === id) paths.push(file);
      } catch {
        /* skip */
      }
    }
  }
  return paths;
}

function claudeSweepArtifacts(dirs: CliDirs, olderThanMs: number): string[] {
  const cutoff = Date.now() - olderThanMs;
  const paths: string[] = [];
  const projectsDir = join(dirs.configDir, "projects");
  if (existsSync(projectsDir)) {
    for (const sub of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const dir = join(projectsDir, sub.name);
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".jsonl")) continue;
        const full = join(dir, file);
        try {
          if (statSync(full).mtimeMs < cutoff) paths.push(full);
        } catch {
          /* skip */
        }
      }
    }
  }
  const sessionsDir = join(dirs.configDir, "sessions");
  if (existsSync(sessionsDir)) {
    for (const ent of readdirSync(sessionsDir, { withFileTypes: true })) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
      const full = join(sessionsDir, ent.name);
      try {
        if (statSync(full).mtimeMs < cutoff) paths.push(full);
      } catch {
        /* skip */
      }
    }
  }
  return paths;
}

const SYSTEM_PROMPT_FILE_CLEANUP_MS = 60_000;

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

function stripMcpPrefix(name: string): string {
  const prefix = "mcp__cta__";
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

export const claudeCodeAdapter: Adapter = {
  id: "claude-code",
  clientTools: true,
  executable: "claude",
  models: [
    { id: "sonnet", label: "Sonnet" },
    { id: "opus", label: "Opus" },
    { id: "haiku", label: "Haiku" },
  ],

  buildArgs(input) {
    const maxTurns = input.tools ? String(input.tools.maxTurns) : "1";
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--model",
      input.model,
      "--max-turns",
      maxTurns,
      "--disable-slash-commands",
    ];

    if (input.effort && input.effort !== "none") {
      args.push("--effort", input.effort);
    }
    if (input.systemPrompt && !input.resume) {
      // Written to a file instead of passed inline: a long system prompt
      // (e.g. a client's tool catalog folded into it) can exceed the OS
      // command-line length limit and crash spawn() with ENAMETOOLONG.
      const promptFile = join(tmpdir(), `cli-to-api-system-prompt-${randomUUID()}.txt`);
      writeFileSync(promptFile, input.systemPrompt);
      setTimeout(() => unlink(promptFile, () => {}), SYSTEM_PROMPT_FILE_CLEANUP_MS).unref();
      args.push("--system-prompt-file", promptFile);
    }
    if (input.tools) {
      args.push("--tools", "");
      const mcpConfig = JSON.stringify({
        mcpServers: {
          [input.tools.serverName]: { type: "http", url: input.tools.mcpUrl },
        },
      });
      args.push("--mcp-config", mcpConfig, "--strict-mcp-config", "--allowedTools", `mcp__${input.tools.serverName}`);
    } else if (input.allowTools) {
      args.push("--dangerously-skip-permissions");
    } else {
      args.push("--tools", "");
    }
    if (input.resume) {
      args.push("--resume", input.resume.cliSessionId);
    } else {
      args.push("--session-id", randomUUID());
    }

    const env = input.tools
      ? { MCP_TOOL_TIMEOUT: String(input.tools.resultTimeoutMs + 30_000) }
      : undefined;
    return { args, promptVia: "stdin", env };
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

    if (type === "assistant") {
      const message = obj.message as Record<string, unknown> | undefined;
      const blocks = message?.content as Array<Record<string, unknown>> | undefined;
      if (!blocks) return [];
      return blocks.flatMap((block) => {
        if (block.type !== "tool_use") return [];
        return [
          {
            type: "tool_call" as const,
            id: String(block.id),
            name: stripMcpPrefix(String(block.name)),
            argumentsJson: JSON.stringify(block.input ?? {}),
          },
        ];
      });
    }

    if (type === "stream_event") {
      const event = obj.event as Record<string, unknown> | undefined;
      if (!event) return [];

      if (event.type === "content_block_start" || event.type === "content_block_delta") {
        const block = event.content_block as Record<string, unknown> | undefined;
        const delta = event.delta as Record<string, unknown> | undefined;
        if (block?.type === "tool_use" || delta?.type === "input_json_delta") {
          return [];
        }
      }

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
        const events: CliEvent[] = [];
        const usage = event.usage as Record<string, unknown> | undefined;
        if (usage) {
          events.push(usageFromRaw(usage));
        }
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.stop_reason === "tool_use") {
          events.push({ type: "done", stopReason: "tool_use" });
        }
        return events;
      }

      return [];
    }

    if (type === "system") {
      return [];
    }

    if (type === "user") {
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

  sessionArtifacts: claudeSessionArtifacts,
  sweepArtifacts: claudeSweepArtifacts,
};
