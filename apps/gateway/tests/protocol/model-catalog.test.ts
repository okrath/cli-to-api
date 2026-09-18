import { describe, expect, it } from "vitest";
import {
  buildCatalogSync,
  listOpenAiModels,
  resolveModel,
} from "../../src/protocol/model-catalog.js";

const catalog = buildCatalogSync(
  [
    { id: "group:default", name: "Default", enabled: true },
    { id: "group:off", name: "Off", enabled: false },
  ],
  ["claude-code", "codex"],
);

describe("resolveModel", () => {
  it.each([
    ["group:default", { kind: "group", groupId: "group:default" }],
    ["group:missing", null],
    ["group:off", null],
    ["claude-code/sonnet", { kind: "direct", adapterId: "claude-code", modelId: "sonnet" }],
    ["claude-code/unknown-model", { kind: "direct", adapterId: "claude-code", modelId: "unknown-model" }],
    ["missing/sonnet", null],
    ["claude-sonnet-4-5", { kind: "direct", adapterId: "claude-code", modelId: "sonnet" }],
    ["claude-opus-4-1", { kind: "direct", adapterId: "claude-code", modelId: "opus" }],
    ["claude-haiku-4-5", { kind: "direct", adapterId: "claude-code", modelId: "haiku" }],
    ["gpt-5", { kind: "direct", adapterId: "codex", modelId: "gpt-5" }],
    ["o3-mini", { kind: "direct", adapterId: "codex", modelId: "o3-mini" }],
    ["codex-mini", { kind: "direct", adapterId: "codex", modelId: "codex-mini" }],
    ["unknown-model", null],
  ] as const)("resolveModel(%s)", (name, expected) => {
    expect(resolveModel(name, catalog)).toEqual(expected);
  });
});

describe("listOpenAiModels", () => {
  it("lists groups, installed adapters, and aliases", () => {
    const list = listOpenAiModels(catalog);
    const ids = list.data.map((entry) => entry.id);
    expect(ids[0]).toBe("group:default");
    expect(ids).toContain("claude-code/sonnet");
    expect(ids).toContain("gpt-5");
    expect(ids).toContain("claude-sonnet-4-5");
    expect(ids).not.toContain("group:off");
  });
});
