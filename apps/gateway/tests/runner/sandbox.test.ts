import { describe, expect, it } from "vitest";
import { baseEnv, hostEnv } from "../../src/runner/sandbox.js";

describe("hostEnv", () => {
  it("keeps the real profile paths and only adds non-interactive flags", () => {
    const sandbox = {
      accountDir: "/data/sandboxes/claude-code/acc-1",
      homeDir: "/data/sandboxes/claude-code/acc-1/home",
      configDir: "/data/sandboxes/claude-code/acc-1/config",
      workspaceDir: "/data/sandboxes/claude-code/acc-1/workspace",
    };

    const env = hostEnv(sandbox);
    expect(env.USERPROFILE).toBe(process.env.USERPROFILE);
    expect(env.HOME).toBe(process.env.HOME);
    expect(env.CI).toBe("1");
    expect(env.NO_COLOR).toBe("1");
    expect(env.FORCE_COLOR).toBe("0");
    expect(env.TERM).toBe("dumb");
  });

  it("baseEnv overrides profile paths for isolated sandboxes", () => {
    const sandbox = {
      accountDir: "/data/sandboxes/claude-code/acc-1",
      homeDir: "/data/sandboxes/claude-code/acc-1/home",
      configDir: "/data/sandboxes/claude-code/acc-1/config",
      workspaceDir: "/data/sandboxes/claude-code/acc-1/workspace",
    };

    const env = baseEnv(sandbox);
    expect(env.USERPROFILE).toBe(sandbox.homeDir);
    expect(env.HOME).toBe(sandbox.homeDir);
  });
});
