import fs from "node:fs/promises";
import path from "node:path";

export interface SandboxContext {
  sandboxDir: string;
  workspaceDir: string;
  tmpDir: string;
  env: NodeJS.ProcessEnv;
}

export async function provisionSandbox(params: {
  dataDir: string;
  adapterId: string;
  accountId: string;
  customEnv?: Record<string, string>;
}): Promise<SandboxContext> {
  const { dataDir, adapterId, accountId, customEnv = {} } = params;
  const sandboxDir = path.resolve(dataDir, "sandboxes", adapterId, accountId);
  const workspaceDir = path.join(sandboxDir, "workspace");
  const tmpDir = path.join(sandboxDir, "tmp");
  const configDir = path.join(sandboxDir, ".config");
  const appDataRoaming = path.join(sandboxDir, "AppData", "Roaming");
  const appDataLocal = path.join(sandboxDir, "AppData", "Local");

  // Ensure directories exist
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(appDataRoaming, { recursive: true });
  await fs.mkdir(appDataLocal, { recursive: true });

  // Clone host environment and purge credentials
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env["OPENAI_API_KEY"];
  delete env["ANTHROPIC_API_KEY"];
  delete env["CODEX_API_KEY"];
  delete env["GH_TOKEN"];
  delete env["GITHUB_TOKEN"];

  // Mount directory jail
  env["HOME"] = sandboxDir;
  env["USERPROFILE"] = sandboxDir;
  env["XDG_CONFIG_HOME"] = configDir;
  env["XDG_CACHE_HOME"] = path.join(sandboxDir, ".cache");
  env["XDG_DATA_HOME"] = path.join(sandboxDir, ".local", "share");
  env["TMPDIR"] = tmpDir;
  env["TEMP"] = tmpDir;
  env["TMP"] = tmpDir;
  env["APPDATA"] = appDataRoaming;
  env["LOCALAPPDATA"] = appDataLocal;
  env["CI"] = "1"; // Disable interactive terminal prompts in scripts

  // Apply custom adapter environment overrides
  for (const [key, value] of Object.entries(customEnv)) {
    env[key] = value
      .replace("{sandbox_dir}", sandboxDir)
      .replace("{account_dir}", sandboxDir)
      .replace("{workspace_dir}", workspaceDir);
  }

  return { sandboxDir, workspaceDir, tmpDir, env };
}
