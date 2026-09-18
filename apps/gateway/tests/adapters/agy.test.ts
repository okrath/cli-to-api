import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agyAdapter } from "../../src/adapters/agy.js";
import type { CliEvent } from "../../src/core/types.js";

const repoRoot = join(import.meta.dirname, "../../../..");
const fixturePath = join(repoRoot, "tests/fixtures/agy-1.2.6-pong.jsonl");

function parseFixture(path: string): CliEvent[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.flatMap((line) => agyAdapter.parseLine(line));
}

describe("agy adapter parseLine", () => {
  it("parses pong fixture into expected events", () => {
    const events = parseFixture(fixturePath);

    expect(events.filter((e) => e.type === "session")).toHaveLength(1);
    expect(events.filter((e) => e.type === "error")).toHaveLength(0);

    const text = events
      .filter((e) => e.type === "text_delta")
      .map((e) => (e.type === "text_delta" ? e.text : ""))
      .join("");
    expect(text).toBe("pong\n");

    const usage = events.find((e) => e.type === "usage");
    expect(usage).toMatchObject({
      type: "usage",
      input: 13902,
      cachedInput: 0,
      cacheWrite: 0,
      output: 23,
      reasoning: 22,
    });

    const dones = events.filter((e) => e.type === "done");
    expect(dones).toHaveLength(1);
    expect(dones[0]).toMatchObject({ stopReason: "end_turn" });
  });

  it("returns empty array for malformed JSON", () => {
    expect(agyAdapter.parseLine("not json")).toEqual([]);
  });
});
