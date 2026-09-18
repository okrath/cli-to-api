import { describe, expect, it } from "vitest";
import { agyAdapter } from "../../src/adapters/agy.js";
import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import { codexAdapter } from "../../src/adapters/codex.js";
import { cursorAgentAdapter } from "../../src/adapters/cursor-agent.js";
import type { HostLoginRun } from "../../src/core/types.js";

function cannedRun(
  results: Record<string, { code?: number | null; stdout?: string; stderr?: string }>,
): HostLoginRun {
  return async (file, args) => {
    const key = `${file} ${args.join(" ")}`;
    const row = results[key] ?? { code: 1, stdout: "", stderr: "" };
    return {
      code: row.code ?? 0,
      stdout: row.stdout ?? "",
      stderr: row.stderr ?? "",
    };
  };
}

describe("detectHostLogin", () => {
  it("claude-code reports logged in with auth method and email", async () => {
    const run = cannedRun({
      "claude auth status": {
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: "claude.ai",
          email: "user@example.com",
        }),
      },
    });
    await expect(claudeCodeAdapter.detectHostLogin!(run)).resolves.toEqual({
      status: "logged_in",
      label: "claude.ai · user@example.com",
    });
  });

  it("claude-code reports logged out", async () => {
    const run = cannedRun({
      "claude auth status": {
        stdout: JSON.stringify({ loggedIn: false }),
      },
    });
    await expect(claudeCodeAdapter.detectHostLogin!(run)).resolves.toEqual({
      status: "logged_out",
    });
  });

  it("claude-code reports unknown on garbage output", async () => {
    const run = cannedRun({
      "claude auth status": { stdout: "not json" },
    });
    await expect(claudeCodeAdapter.detectHostLogin!(run)).resolves.toEqual({
      status: "unknown",
    });
  });

  it("codex reports logged in from stderr", async () => {
    const run = cannedRun({
      "codex login status": {
        code: 0,
        stderr: "Logged in using ChatGPT",
      },
    });
    await expect(codexAdapter.detectHostLogin!(run)).resolves.toEqual({
      status: "logged_in",
      label: "Logged in using ChatGPT",
    });
  });

  it("codex reports logged out", async () => {
    const run = cannedRun({
      "codex login status": {
        code: 1,
        stdout: "Not logged in",
      },
    });
    await expect(codexAdapter.detectHostLogin!(run)).resolves.toEqual({
      status: "logged_out",
    });
  });

  it("cursor-agent reports logged in with email", async () => {
    const run = cannedRun({
      "cursor-agent status": {
        stdout: "✓ Logged in as user@cursor.com",
      },
    });
    await expect(cursorAgentAdapter.detectHostLogin!(run)).resolves.toEqual({
      status: "logged_in",
      label: "user@cursor.com",
    });
  });

  it("cursor-agent reports logged out", async () => {
    const run = cannedRun({
      "cursor-agent status": {
        stdout: "Not logged in",
      },
    });
    await expect(cursorAgentAdapter.detectHostLogin!(run)).resolves.toEqual({
      status: "logged_out",
    });
  });

  it("agy always reports unknown", async () => {
    await expect(agyAdapter.detectHostLogin!({} as HostLoginRun)).resolves.toEqual({
      status: "unknown",
    });
  });
});
