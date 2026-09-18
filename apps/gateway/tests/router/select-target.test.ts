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

  it("never starts with tier 2 while tier 1 candidates exist", () => {
    const tierAccounts: AccountRow[] = [
      ...accounts,
      {
        id: "acc-c",
        adapterId: "fake",
        name: "C",
        sandboxDir: "/tmp/c",
        maxConcurrent: 1,
        cooldownUntil: null,
        cooldownReason: null,
        enabled: true,
      },
    ];
    const targets = [
      { tier: 1, adapterId: "fake", modelId: "fake", accountId: "acc-a" as const },
      { tier: 1, adapterId: "fake", modelId: "fake", accountId: "acc-b" as const },
      { tier: 2, adapterId: "fake", modelId: "fake", accountId: "acc-c" as const },
    ];
    for (let i = 0; i < 6; i++) {
      const candidates = expandCandidates(
        targets,
        tierAccounts,
        new Set(["fake"]),
        Date.now(),
        undefined,
        "group:tier",
      );
      expect(candidates[0]?.tier).toBe(1);
    }
  });

  it("keeps the pinned account first across consecutive calls", () => {
    for (let i = 0; i < 3; i++) {
      const candidates = expandCandidates(
        [{ tier: 1, adapterId: "fake", modelId: "fake", accountId: null }],
        accounts,
        new Set(["fake"]),
        Date.now(),
        "acc-b",
        "group:pin",
      );
      expect(candidates[0]?.accountId).toBe("acc-b");
    }
  });
});
