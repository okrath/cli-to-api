import { describe, expect, it, beforeEach } from "vitest";
import type { AccountRow } from "../../src/db/repos.js";
import { expandCandidates, resetRoundRobin } from "../../src/router/select-target.js";
import { resetSlots } from "../../src/router/slots.js";

const accounts: AccountRow[] = [
  {
    id: "acc-a",
    adapterId: "fake",
    name: "A",
    sandboxDir: "/tmp/a",
    maxConcurrent: 1,
    cooldownUntil: null,
    cooldownReason: null,
    enabled: true,
  },
  {
    id: "acc-b",
    adapterId: "fake",
    name: "B",
    sandboxDir: "/tmp/b",
    maxConcurrent: 1,
    cooldownUntil: null,
    cooldownReason: null,
    enabled: true,
  },
];

describe("expandCandidates", () => {
  beforeEach(() => {
    resetRoundRobin();
    resetSlots();
  });

  it("expands null account targets to all adapter accounts", () => {
    const candidates = expandCandidates(
      [{ tier: 1, adapterId: "fake", modelId: "fake", accountId: null }],
      accounts,
      new Set(["fake"]),
      Date.now(),
    );
    expect(candidates.map((c) => c.accountId).sort()).toEqual(["acc-a", "acc-b"]);
  });

  it("skips accounts in cooldown", () => {
    const cooled = accounts.map((account) =>
      account.id === "acc-a"
        ? { ...account, cooldownUntil: Date.now() + 60_000 }
        : account,
    );
    const candidates = expandCandidates(
      [{ tier: 1, adapterId: "fake", modelId: "fake", accountId: null }],
      cooled,
      new Set(["fake"]),
      Date.now(),
    );
    expect(candidates.map((c) => c.accountId)).toEqual(["acc-b"]);
  });

  it("pins the session account first", () => {
    const candidates = expandCandidates(
      [{ tier: 1, adapterId: "fake", modelId: "fake", accountId: null }],
      accounts,
      new Set(["fake"]),
      Date.now(),
      "acc-b",
      "group:test",
    );
    expect(candidates[0]?.accountId).toBe("acc-b");
  });
});
