import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cursorAgentAdapter } from "../../src/adapters/cursor-agent.js";
import type { CliEvent } from "../../src/core/types.js";

const repoRoot = join(import.meta.dirname, "../../../..");
const fixturePath = join(repoRoot, "tests/fixtures/cursor-agent-2026.09.15-pong.jsonl");

function parseFixture(path: string): CliEvent[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.flatMap((line) => cursorAgentAdapter.parseLine(line));
}

describe("cursor-agent adapter parseLine", () => {
  it("parses pong fixture into expected events", () => {
    const events = parseFixture(fixturePath);

    expect(events.filter((e) => e.type === "session")).toHaveLength(1);
    expect(events.filter((e) => e.type === "thinking_delta")).toHaveLength(2);
    expect(events.filter((e) => e.type === "error")).toHaveLength(0);

    const text = events
      .filter((e) => e.type === "text_delta")
      .map((e) => (e.type === "text_delta" ? e.text : ""))
      .join("");
    expect(text).toBe("pong");

    const usage = events.find((e) => e.type === "usage");
    expect(usage).toMatchObject({
      type: "usage",
      input: 9357,
      cachedInput: 6624,
      cacheWrite: 0,
      output: 39,
      reasoning: 0,
    });

    const dones = events.filter((e) => e.type === "done");
    expect(dones).toHaveLength(1);
    expect(dones[0]).toMatchObject({ stopReason: "end_turn" });
  });

  it("returns empty array for malformed JSON", () => {
    expect(cursorAgentAdapter.parseLine("{broken")).toEqual([]);
  });

  it("ignores assistant lines without timestamp_ms", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "pong" }] },
    });
    expect(cursorAgentAdapter.parseLine(line)).toEqual([]);
  });
});

describe("cursor-agent adapter parseStderr", () => {
  it("classifies auth errors", () => {
    const events = cursorAgentAdapter.parseStderr!("Not logged in. Please run cursor-agent login");
    expect(events).toEqual([
      { type: "error", kind: "auth", message: "Not logged in. Please run cursor-agent login" },
    ]);
  });

  it("classifies missing trust as crash", () => {
    const events = cursorAgentAdapter.parseStderr!("Workspace Trust Required");
    expect(events).toEqual([
      { type: "error", kind: "crash", message: "cursor-agent needs --trust" },
    ]);
  });
});

describe("cursor-agent adapter buildArgs", () => {
  it("uses ask mode when tools are disabled", () => {
    const built = cursorAgentAdapter.buildArgs({
      model: "composer-2.5-fast",
      allowTools: false,
    });
    expect(built.args).toContain("--mode");
    expect(built.args).toContain("ask");
    expect(built.promptVia).toBe("argv");
  });

  it("uses force when tools are enabled", () => {
    const built = cursorAgentAdapter.buildArgs({
      model: "composer-2.5-fast",
      allowTools: true,
    });
    expect(built.args).toContain("--force");
  });
});
