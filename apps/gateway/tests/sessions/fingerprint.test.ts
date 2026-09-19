import { describe, expect, it } from "vitest";
import { fingerprint, lookupFingerprint } from "../../src/sessions/session-store.js";

describe("session fingerprint", () => {
  it("returns null for single-turn conversations", () => {
    expect(lookupFingerprint(undefined, [{ role: "user", content: "hello" }])).toBeNull();
  });

  it("hashes prior turns with trimmed content", () => {
    const fp1 = lookupFingerprint("conv-1", [
      { role: "user", content: " hello " },
      { role: "assistant", content: "hi" },
      { role: "user", content: "again" },
    ]);
    const fp2 = lookupFingerprint("conv-1", [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "again" },
    ]);
    const fp3 = lookupFingerprint("conv-1", [
      { role: "user", content: "hello" },
      { role: "assistant", content: "bye" },
      { role: "user", content: "again" },
    ]);
    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3);
  });

  it("includes conversation hint in fingerprint", () => {
    const messages = [
      { role: "user" as const, content: "a" },
      { role: "assistant" as const, content: "b" },
      { role: "user" as const, content: "c" },
    ];
    expect(fingerprint("hint-a", messages.slice(0, -1))).not.toBe(
      fingerprint("hint-b", messages.slice(0, -1)),
    );
  });

  it("hashes differently when toolCalls or toolCallId differ", () => {
    const base = [
      { role: "user" as const, content: "weather?" },
      { role: "assistant" as const, content: "Checking." },
    ];
    const withCalls = [
      ...base,
      {
        role: "assistant" as const,
        content: "",
        toolCalls: [{ id: "call_1", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' }],
      },
    ];
    const withResults = [
      ...withCalls,
      { role: "tool" as const, content: "31C", toolCallId: "call_1" },
    ];
    const withDifferentCall = [
      ...base,
      {
        role: "assistant" as const,
        content: "",
        toolCalls: [{ id: "call_2", name: "get_weather", argumentsJson: '{"city":"Hanoi"}' }],
      },
    ];

    expect(fingerprint(undefined, withCalls)).not.toBe(fingerprint(undefined, base));
    expect(fingerprint(undefined, withResults)).not.toBe(fingerprint(undefined, withCalls));
    expect(fingerprint(undefined, withDifferentCall)).not.toBe(fingerprint(undefined, withCalls));
  });
});
