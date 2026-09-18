import { mkdirSync } from "node:fs";
import { join } from "node:path";

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
