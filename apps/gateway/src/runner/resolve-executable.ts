import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Logger } from "pino";

const execFileAsync = promisify(execFile);
const LOOKUP_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60_000;

export interface ResolvedExecutable {
  file: string;
  prefixArgs: string[];
  shell: boolean;
  path: string;
}

interface CacheEntry {
  at: number;
  value: ResolvedExecutable | undefined;
}

const cache = new Map<string, CacheEntry>();

function realPathIfExists(path: string): string {
  if (!existsSync(path)) return path;
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

export function refreshExecutableCache(): void {
  cache.clear();
}

async function lookupCandidates(name: string): Promise<string[]> {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(cmd, [name], {
      encoding: "utf8",
      timeout: LOOKUP_TIMEOUT_MS,
    });
    return stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function resolveNodeBundle(dir: string, cmdPath: string): ResolvedExecutable | null {
  const nodeExe = join(dir, "node.exe");
  const indexJs = join(dir, "index.js");
  if (existsSync(nodeExe) && existsSync(indexJs)) {
    return {
      file: realPathIfExists(nodeExe),
      prefixArgs: [realPathIfExists(indexJs)],
      shell: false,
      path: cmdPath,
    };
  }
  return null;
}

function resolvePs1Shim(ps1Path: string, cmdPath: string): ResolvedExecutable | null {
  const shimDir = dirname(ps1Path);
  const direct = resolveNodeBundle(shimDir, cmdPath);
  if (direct) return direct;

  const versionsDir = join(shimDir, "versions");
  if (!existsSync(versionsDir)) return null;

  const versionDirs = readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}\.\d+\.\d+/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  for (const version of versionDirs) {
    const resolved = resolveNodeBundle(join(versionsDir, version), cmdPath);
    if (resolved) return resolved;
  }

  return null;
}

function cmdTargetPath(cmdPath: string, content: string): string | null {
  const dp0Match =
    content.match(/"(%dp0%\\[^"]+)"/i) ?? content.match(/'(%dp0%\\[^']+)'/i);
  if (dp0Match) {
    const relative = dp0Match[1]!.replace(/%dp0%/i, "").replace(/^[\\/]+/, "");
    const parts = relative.split(/[\\/]+/);
    return join(dirname(cmdPath), ...parts);
  }

  const scriptDirMatch = content.match(/-File\s+"%SCRIPT_DIR%\\([^"]+\.ps1)"/i);
  if (scriptDirMatch) {
    const parts = scriptDirMatch[1]!.split(/[\\/]+/);
    return join(dirname(cmdPath), ...parts);
  }

  return null;
}

export function parseCmdShim(cmdPath: string, content: string): ResolvedExecutable | null {
  const target = cmdTargetPath(cmdPath, content);
  if (!target || !existsSync(target)) return null;

  if (/\.ps1$/i.test(target)) {
    return resolvePs1Shim(target, cmdPath);
  }

  if (/\.js$/i.test(target)) {
    return {
      file: realPathIfExists(process.execPath),
      prefixArgs: [realPathIfExists(target)],
      shell: false,
      path: cmdPath,
    };
  }

  return {
    file: realPathIfExists(target),
    prefixArgs: [],
    shell: false,
    path: cmdPath,
  };
}

function asResolved(candidate: string, shell: boolean): ResolvedExecutable {
  return {
    file: realPathIfExists(candidate),
    prefixArgs: [],
    shell,
    path: candidate,
  };
}

function isDirectPath(name: string): boolean {
  return (
    name.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(name) ||
    name.includes("/") ||
    name.includes("\\")
  );
}

export async function resolveExecutable(
  name: string,
  log?: Pick<Logger, "warn">,
): Promise<ResolvedExecutable | undefined> {
  const now = Date.now();
  const cached = cache.get(name);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  if (isDirectPath(name)) {
    if (!existsSync(name)) {
      cache.set(name, { at: now, value: undefined });
      return undefined;
    }
    const value = asResolved(name, false);
    cache.set(name, { at: now, value });
    return value;
  }

  const candidates = await lookupCandidates(name);
  if (candidates.length === 0) {
    cache.set(name, { at: now, value: undefined });
    return undefined;
  }

  const exe = candidates.find((c) => c.toLowerCase().endsWith(".exe"));
  if (exe) {
    const value = asResolved(exe, false);
    cache.set(name, { at: now, value });
    return value;
  }

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (!lower.endsWith(".cmd") && !lower.endsWith(".bat")) continue;
    try {
      const content = readFileSync(candidate, "utf8");
      const parsed = parseCmdShim(candidate, content);
      if (parsed) {
        cache.set(name, { at: now, value: parsed });
        return parsed;
      }
      const bundled = resolveNodeBundle(dirname(candidate), candidate);
      if (bundled) {
        cache.set(name, { at: now, value: bundled });
        return bundled;
      }
    } catch {
      /* try next candidate */
    }
  }

  const batch = candidates.find((c) => {
    const lower = c.toLowerCase();
    return lower.endsWith(".cmd") || lower.endsWith(".bat");
  });
  if (batch) {
    log?.warn({ batch }, "Falling back to shell spawn for batch shim");
    const value = asResolved(batch, true);
    cache.set(name, { at: now, value });
    return value;
  }

  const value = asResolved(candidates[0]!, false);
  cache.set(name, { at: now, value });
  return value;
}
