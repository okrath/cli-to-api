import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codexAdapter } from "../../src/adapters/codex.js";
import type { CliEvent } from "../../src/core/types.js";

const repoRoot = join(import.meta.dirname, "../../../..");
const fixturePath = join(repoRoot, "tests/fixtures/codex-0.154.0-pong.jsonl");
const mcpToolFixturePath = join(
  repoRoot,
  "tests/fixtures/codex-0.155.0-mcp-tool-approval-blocked.jsonl",
);
const mcpToolPassFixturePath = join(repoRoot, "tests/fixtures/codex-0.155.0-mcp-tool.jsonl");
const multistepStdoutPath = join(repoRoot, "tests/fixtures/codex-0.155.0-multistep.jsonl");
const multistepRolloutPath = join(repoRoot, "tests/fixtures/codex-0.155.0-multistep-rollout.jsonl");
const multistepThreadId = "01a0b994-16e8-7e80-b1a9-de4638bce658";

function parseFixture(path: string): CliEvent[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.flatMap((line) => codexAdapter.parseLine(line));
}

describe("codex adapter parseLine", () => {
  it("parses pong fixture into expected events", () => {
    const events = parseFixture(fixturePath);

    expect(events.filter((e) => e.type === "session")).toHaveLength(1);
    expect(events.filter((e) => e.type === "error")).toHaveLength(0);

    const text = events
      .filter((e) => e.type === "text_delta")
      .map((e) => (e.type === "text_delta" ? e.text : ""))
      .join("");
    expect(text).toBe("pong");

    const usage = events.find((e) => e.type === "usage");
    expect(usage).toMatchObject({
      type: "usage",
      input: 16414,
      cachedInput: 6784,
      cacheWrite: 0,
      output: 5,
      reasoning: 0,
    });

    const dones = events.filter((e) => e.type === "done");
    expect(dones).toHaveLength(1);
    expect(dones[0]).toMatchObject({ stopReason: "end_turn" });
  });

  it("returns empty array for malformed JSON", () => {
    expect(codexAdapter.parseLine("{broken")).toEqual([]);
  });

  it("parses approval-blocked mcp-tool fixture into one tool_call", () => {
    const events = parseFixture(mcpToolFixturePath);

    const toolCalls = events.filter((e) => e.type === "tool_call");
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toEqual({
      type: "tool_call",
      id: "item_4",
      name: "get_weather",
      argumentsJson: '{"city":"Hanoi"}',
    });

    expect(events.filter((e) => e.type === "error")).toHaveLength(0);
  });

  it("parses passing mcp-tool fixture into one tool_call", () => {
    const events = parseFixture(mcpToolPassFixturePath);

    const toolCalls = events.filter((e) => e.type === "tool_call");
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toEqual({
      type: "tool_call",
      id: "item_2",
      name: "get_weather",
      argumentsJson: '{"city":"Hanoi"}',
    });
  });

  it("exposes clientTools", () => {
    expect(codexAdapter.clientTools).toBe(true);
  });
});

describe("codex adapter turn.failed", () => {
  it("reports the nested error message and cools down on out-of-credits", () => {
    const events = parseFixture(join(repoRoot, "tests/fixtures/codex-0.155.0-out-of-credits.jsonl"));
    const errors = events.filter((e) => e.type === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      type: "error",
      kind: "rate_limit",
      message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
    });
    expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "error" });
  });

  it("keeps an unsupported-model failure as an unknown error with its text", () => {
    const line = JSON.stringify({
      type: "turn.failed",
      error: { message: "The 'x' model is not supported when using Codex with a ChatGPT account." },
    });
    expect(codexAdapter.parseLine(line)[0]).toMatchObject({
      type: "error",
      kind: "unknown",
      message: "The 'x' model is not supported when using Codex with a ChatGPT account.",
    });
  });
});

describe("codex adapter lastCallUsage", () => {
  it("returns last token_count last_token_usage from rollout fixture", () => {
    const tmp = mkdtempSync(join(tmpdir(), "codex-last-call-"));
    const rolloutDir = join(tmp, "sessions", "2026", "09", "19");
    mkdirSync(rolloutDir, { recursive: true });
    writeFileSync(
      join(rolloutDir, `rollout-2026-09-19T00-00-00-${multistepThreadId}.jsonl`),
      readFileSync(multistepRolloutPath, "utf8"),
    );
    const dirs = { configDir: tmp, homeDir: tmp, workspaceDir: tmp };
    expect(codexAdapter.lastCallUsage!(dirs, multistepThreadId)).toEqual({
      input: 495,
      cachedInput: 23168,
      cacheWrite: 0,
    });
  });

  it("returns undefined for unknown thread id", () => {
    const tmp = mkdtempSync(join(tmpdir(), "codex-last-call-"));
    const dirs = { configDir: tmp, homeDir: tmp, workspaceDir: tmp };
    expect(codexAdapter.lastCallUsage!(dirs, multistepThreadId)).toBeUndefined();
  });

  it("returns undefined when rollout has no token_count line", () => {
    const tmp = mkdtempSync(join(tmpdir(), "codex-last-call-"));
    const rolloutDir = join(tmp, "sessions", "2026", "09", "19");
    mkdirSync(rolloutDir, { recursive: true });
    const line = readFileSync(multistepRolloutPath, "utf8").split(/\r?\n/).filter(Boolean)[0]!;
    writeFileSync(
      join(rolloutDir, `rollout-2026-09-19T00-00-00-${multistepThreadId}.jsonl`),
      `${line}\n`,
    );
    const dirs = { configDir: tmp, homeDir: tmp, workspaceDir: tmp };
    expect(codexAdapter.lastCallUsage!(dirs, multistepThreadId)).toBeUndefined();
  });
});

describe("codex multistep stdout fixture", () => {
  it("parses turn.completed usage sum before last-call correction", () => {
    const events = parseFixture(multistepStdoutPath);
    const usage = events.find((e) => e.type === "usage");
    expect(usage).toMatchObject({ type: "usage" });
    if (!usage || usage.type !== "usage") return;
    expect(usage.input + usage.cachedInput).toBe(115934);
  });
});

describe("codex adapter buildArgs", () => {
  it("adds MCP url, web_search disabled, and bypass flag when tools are bridged", () => {
    const built = codexAdapter.buildArgs({
      model: "gpt-5.5",
      allowTools: true,
      tools: {
        mcpUrl: "http://127.0.0.1:8080/mcp/abc",
        serverName: "cta",
        maxTurns: 25,
        resultTimeoutMs: 300_000,
      },
    });
    expect(built.args).toContain("-c");
    expect(built.args.join(" ")).toContain('mcp_servers.cta.url="http://127.0.0.1:8080/mcp/abc"');
    expect(built.args.join(" ")).toContain('web_search="disabled"');
    expect(built.args).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(built.args).not.toContain("--sandbox");
  });

  it("keeps read-only sandbox when tools are not bridged", () => {
    const built = codexAdapter.buildArgs({
      model: "gpt-5.5",
      allowTools: false,
    });
    expect(built.args).toContain("--sandbox");
    expect(built.args).toContain("read-only");
    expect(built.args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });
});
