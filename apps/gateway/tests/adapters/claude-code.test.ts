import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import type { CliEvent } from "../../src/core/types.js";

const repoRoot = join(import.meta.dirname, "../../../..");
const fixturePath = join(repoRoot, "tests/fixtures/claude-code-2.1.276-pong.jsonl");

function parseFixture(path: string): CliEvent[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.flatMap((line) => claudeCodeAdapter.parseLine(line));
}

describe("claude-code adapter parseLine", () => {
  it("parses pong fixture into expected events", () => {
    const events = parseFixture(fixturePath);

    const sessions = events.filter((e) => e.type === "session");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ cliSessionId: "7b935286-c7c9-4f34-8017-51e6f58bb846" });

    const rateLimits = events.filter((e) => e.type === "rate_limit");
    expect(rateLimits).toHaveLength(1);
    expect(rateLimits[0]).toMatchObject({ limited: false });
    const windows = rateLimits[0]!.type === "rate_limit" ? rateLimits[0].windows : [];
    expect(windows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "five_hour", utilization: 0.34 }),
        expect.objectContaining({ name: "seven_day", utilization: 0.22 }),
      ]),
    );

    const thinking = events.filter((e) => e.type === "thinking_delta");
    expect(thinking.length).toBeGreaterThan(0);

    const text = events
      .filter((e) => e.type === "text_delta")
      .map((e) => (e.type === "text_delta" ? e.text : ""))
      .join("");
    expect(text).toBe("pong");

    const usages = events.filter((e) => e.type === "usage");
    expect(usages.length).toBeGreaterThan(0);
    const lastUsage = usages[usages.length - 1]!;
    expect(lastUsage).toMatchObject({
      type: "usage",
      input: 10,
      cachedInput: 21894,
      cacheWrite: 12828,
      output: 43,
      reasoning: 35,
    });
    if (lastUsage.type === "usage") {
      expect(lastUsage.costUsd).toBeCloseTo(0.029, 3);
    }

    const dones = events.filter((e) => e.type === "done");
    expect(dones).toHaveLength(1);
    expect(dones[0]).toMatchObject({ stopReason: "end_turn" });

    expect(events.filter((e) => e.type === "error")).toHaveLength(0);
  });

  it("returns empty array for malformed JSON", () => {
    expect(claudeCodeAdapter.parseLine("not json")).toEqual([]);
  });
});

describe("claude-code adapter buildArgs", () => {
  const writtenFiles: string[] = [];

  afterEach(() => {
    vi.useRealTimers();
    for (const file of writtenFiles.splice(0)) {
      rmSync(file, { force: true });
    }
  });

  function trackedPromptFile(args: string[]): string {
    const idx = args.indexOf("--system-prompt-file");
    expect(idx).toBeGreaterThanOrEqual(0);
    const file = args[idx + 1]!;
    writtenFiles.push(file);
    return file;
  }

  it("writes a huge system prompt to a temp file instead of passing it inline", () => {
    const huge = "x".repeat(500_000);
    const { args, promptVia } = claudeCodeAdapter.buildArgs({
      model: "sonnet",
      systemPrompt: huge,
      allowTools: false,
    });

    expect(promptVia).toBe("stdin");
    expect(args).not.toContain(huge);
    expect(args).not.toContain("--system-prompt");

    const file = trackedPromptFile(args);
    expect(file.startsWith(tmpdir())).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(huge);
  });

  it("omits the system-prompt-file flag when resuming a session", () => {
    const { args } = claudeCodeAdapter.buildArgs({
      model: "sonnet",
      systemPrompt: "You are a test assistant.",
      resume: { cliSessionId: "abc" },
      allowTools: false,
    });

    expect(args).not.toContain("--system-prompt-file");
  });

  it("deletes the temp prompt file after the cleanup delay", async () => {
    vi.useFakeTimers();
    const { args } = claudeCodeAdapter.buildArgs({
      model: "sonnet",
      systemPrompt: "cleanup check",
      allowTools: false,
    });
    const file = trackedPromptFile(args);
    expect(existsSync(file)).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(existsSync(file)).toBe(false);
  });
});
