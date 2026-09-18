import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { Adapter } from "../core/types.js";
import { agyAdapter } from "./agy.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { ompAdapter } from "./omp.js";

export type AdapterId = Adapter["id"] | "fake";

const VERSION_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60_000;

interface DetectionRow {
  id: AdapterId;
  executable: string;
  installed: boolean;
  version?: string;
  path?: string;
}

let cache: { at: number; rows: DetectionRow[] } | null = null;

function repoRoot(): string {
  return join(import.meta.dirname, "../../../../");
}

function findExecutable(name: string): string | undefined {
  const cmd = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(cmd, [name], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) return undefined;
  const first = result.stdout.trim().split(/\r?\n/)[0]?.trim();
  return first || undefined;
}

async function probeVersion(executable: string, path?: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawnSync(path ?? executable, ["--version"], {
      encoding: "utf8",
      timeout: VERSION_TIMEOUT_MS,
    });
    if (child.status !== 0) {
      resolve(undefined);
      return;
    }
    const line = (child.stdout || child.stderr || "").trim().split(/\r?\n/)[0];
    resolve(line || undefined);
  });
}

function fakeAdapter(repo: string): Adapter {
  const fakeCli = join(repo, "tests", "fake-cli", "fake-cli.mjs");
  return {
    id: "fake" as Adapter["id"],
    executable: process.execPath,
    models: [{ id: "fake", label: "Fake CLI" }],
    buildArgs() {
      return { args: [fakeCli], promptVia: "stdin" as const };
    },
    buildEnv: () => ({}),
    parseLine: claudeCodeAdapter.parseLine.bind(claudeCodeAdapter),
    parseStderr: claudeCodeAdapter.parseStderr?.bind(claudeCodeAdapter),
  };
}

function buildRegistry(): Record<Adapter["id"], Adapter> & { fake?: Adapter } {
  const repo = repoRoot();
  const registry: Record<Adapter["id"], Adapter> & { fake?: Adapter } = {
    "claude-code": claudeCodeAdapter,
    codex: codexAdapter,
    agy: agyAdapter,
    omp: ompAdapter,
  };
  if (process.env.CTA_ENABLE_FAKE_ADAPTER === "1") {
    registry.fake = fakeAdapter(repo);
  }
  return registry;
}

export const adapters = buildRegistry() as Record<Adapter["id"], Adapter> & {
  fake?: Adapter;
};

export function getFakeAdapter(): Adapter | undefined {
  return process.env.CTA_ENABLE_FAKE_ADAPTER === "1" ? adapters.fake : undefined;
}

export async function detectAdapters(): Promise<DetectionRow[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.rows;
  }

  const rows: DetectionRow[] = [];
  const entries: Array<{ id: AdapterId; adapter: Adapter }> = Object.entries(adapters).map(
    ([id, adapter]) => ({ id: id as AdapterId, adapter }),
  );

  for (const { id, adapter } of entries) {
    if (id === "fake") {
      rows.push({
        id,
        executable: adapter.executable,
        installed: true,
        version: "fake",
        path: join(repoRoot(), "tests", "fake-cli", "fake-cli.mjs"),
      });
      continue;
    }

    const path = findExecutable(adapter.executable);
    const installed = path != null;
    const version = installed ? await probeVersion(adapter.executable, path) : undefined;
    rows.push({ id, executable: adapter.executable, installed, version, path });
  }

  cache = { at: now, rows };
  return rows;
}

export function refreshAdapterDetection(): void {
  cache = null;
}
