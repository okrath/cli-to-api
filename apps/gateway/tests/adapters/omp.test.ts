import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ompAdapter } from "../../src/adapters/omp.js";
import type { CliEvent } from "../../src/core/types.js";

const repoRoot = join(import.meta.dirname, "../../../..");
const fixturePath = join(repoRoot, "tests/fixtures/omp-18.2.0-pong.jsonl");

function parseFixture(path: string): CliEvent[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.flatMap((line) => ompAdapter.parseLine(line));
}

describe("omp adapter parseLine", () => {
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
      input: 1606,
      cachedInput: 0,
      cacheWrite: 0,
      output: 25,
      reasoning: 24,
    });
    if (usage?.type === "usage") {
      expect(usage.costUsd).toBeCloseTo(0.0013, 3);
    }

    const dones = events.filter((e) => e.type === "done");
    expect(dones).toHaveLength(1);
    expect(dones[0]).toMatchObject({ stopReason: "end_turn" });
  });

  it("returns empty array for malformed JSON", () => {
    expect(ompAdapter.parseLine("{broken")).toEqual([]);
  });
});
