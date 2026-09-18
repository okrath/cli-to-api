import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

export function parseCmdShim(cmdPath: string, content: string): ResolvedExecutable | null {
  const match =
    content.match(/"(%dp0%\\[^"]+)"/i) ?? content.match(/'(%dp0%\\[^']+)'/i);
  if (!match) return null;

  const dp0 = dirname(cmdPath);
  const relative = match[1]!.replace(/%dp0%/i, "").replace(/^\\/, "");
  const target = resolve(dp0, relative);

  if (!existsSync(target)) return null;

  if (/\.js$/i.test(target)) {
    return {
      file: process.execPath,
      prefixArgs: [target],
      shell: false,
      path: cmdPath,
    };
  }

  return {
    file: target,
    prefixArgs: [],
    shell: false,
    path: cmdPath,
  };
}

function asResolved(candidate: string, shell: boolean): ResolvedExecutable {
  return { file: candidate, prefixArgs: [], shell, path: candidate };
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
