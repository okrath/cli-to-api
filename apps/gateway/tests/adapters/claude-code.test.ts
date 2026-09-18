import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
