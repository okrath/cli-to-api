import { describe, it, expect } from "vitest";
import { provisionSandbox } from "../../apps/gateway/src/supervisor/sandbox.js";
import { dataDir } from "../../apps/gateway/src/config/paths.js";
import fs from "node:fs";
import path from "node:path";

describe("Sandbox Directory Jail & Environment Isolation", () => {
  it("provisions discrete directory jail paths for different accounts", async () => {
    const accA = await provisionSandbox({
      dataDir,
      adapterId: "test-claude",
      accountId: "acc-alpha",
    });

    const accB = await provisionSandbox({
      dataDir,
      adapterId: "test-claude",
      accountId: "acc-beta",
    });

    expect(accA.sandboxDir).not.toBe(accB.sandboxDir);
    expect(fs.existsSync(accA.workspaceDir)).toBe(true);
    expect(fs.existsSync(accB.workspaceDir)).toBe(true);

    // Verify subdirectories exist
    expect(fs.existsSync(path.join(accA.sandboxDir, ".config"))).toBe(true);
    expect(fs.existsSync(path.join(accA.sandboxDir, "tmp"))).toBe(true);
  });

  it("purges sensitive host API keys from the sandbox environment", async () => {
    process.env.OPENAI_API_KEY = "sk-secret-host-key";
    process.env.ANTHROPIC_API_KEY = "sk-ant-host-key";

    const sandbox = await provisionSandbox({
      dataDir,
      adapterId: "test-isolation",
      accountId: "acc-clean",
    });

    expect(sandbox.env.OPENAI_API_KEY).toBeUndefined();
    expect(sandbox.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(sandbox.env.HOME).toBe(sandbox.sandboxDir);
    expect(sandbox.env.USERPROFILE).toBe(sandbox.sandboxDir);
  });
});
