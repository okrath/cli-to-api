import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CliDirs } from "../core/types.js";

export interface SandboxDirs {
  accountDir: string;
  homeDir: string;
  configDir: string;
  workspaceDir: string;
}

export function ensureSandbox(
  dataDir: string,
  adapterId: string,
  accountId: string,
): SandboxDirs {
  const accountDir = join(dataDir, "sandboxes", adapterId, accountId);
  const homeDir = join(accountDir, "home");
  const configDir = join(accountDir, "config");
  const workspaceDir = join(accountDir, "workspace");

  for (const dir of [accountDir, homeDir, configDir, workspaceDir]) {
    mkdirSync(dir, { recursive: true });
  }

  return { accountDir, homeDir, configDir, workspaceDir };
}

export function cliDirs(
  adapterId: string,
  account: { useHostProfile: boolean },
  sandbox: SandboxDirs,
): CliDirs {
  if (!account.useHostProfile) {
    return {
      configDir: sandbox.configDir,
      homeDir: sandbox.homeDir,
      workspaceDir: sandbox.workspaceDir,
    };
  }

  const home = homedir();
  let configDir = sandbox.configDir;
  if (adapterId === "claude-code") {
    configDir = process.env.CLAUDE_CONFIG_DIR ?? join(home, ".claude");
  } else if (adapterId === "codex") {
    configDir = process.env.CODEX_HOME ?? join(home, ".codex");
  }

  const homeDir =
    adapterId === "agy" || adapterId === "cursor-agent" ? home : sandbox.homeDir;

  return { configDir, homeDir, workspaceDir: sandbox.workspaceDir };
}

export function hostEnv(_sandbox: SandboxDirs): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CI: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    TERM: "dumb",
  };
}

export function baseEnv(sandbox: SandboxDirs): NodeJS.ProcessEnv {
  const roaming = join(sandbox.homeDir, "AppData", "Roaming");
  const local = join(sandbox.homeDir, "AppData", "Local");

  return {
    ...process.env,
    HOME: sandbox.homeDir,
    USERPROFILE: sandbox.homeDir,
    APPDATA: roaming,
    LOCALAPPDATA: local,
    XDG_CONFIG_HOME: join(sandbox.homeDir, ".config"),
    XDG_DATA_HOME: join(sandbox.homeDir, ".local", "share"),
    XDG_CACHE_HOME: join(sandbox.homeDir, ".cache"),
    CI: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    TERM: "dumb",
  };
}
