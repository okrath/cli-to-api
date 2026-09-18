import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Adapter } from "../core/types.js";
import {
  refreshExecutableCache,
  resolveExecutable,
  type ResolvedExecutable,
} from "../runner/resolve-executable.js";
import { agyAdapter } from "./agy.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { ompAdapter } from "./omp.js";

export type AdapterId = Adapter["id"] | "fake";

const VERSION_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60_000;

const execFileAsync = promisify(execFile);

interface DetectionRow {
  id: AdapterId;
  executable: string;
  installed: boolean;
  version?: string;
  path?: string;
}

let cache: { at: number; rows: DetectionRow[] } | null = null;
let inFlight: Promise<DetectionRow[]> | null = null;

function repoRoot(): string {
  return join(import.meta.dirname, "../../../../");
}

async function probeVersion(resolved: ResolvedExecutable): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(resolved.file, [...resolved.prefixArgs, "--version"], {
      encoding: "utf8",
      timeout: VERSION_TIMEOUT_MS,
      shell: resolved.shell,
    });
    const line = (stdout || stderr || "").trim().split(/\r?\n/)[0];
    return line || undefined;
  } catch {
    return undefined;
  }
}

function fakeAdapter(repo: string): Adapter {
  const fakeCli = join(repo, "tests", "fake-cli", "fake-cli.mjs");
  return {
    id: "fake" as Adapter["id"],
    executable: process.execPath,
    models: [{ id: "fake", label: "Fake CLI" }],
    buildArgs(input) {
      const args = [fakeCli, "--model", input.model];
      if (input.resume) {
        args.push("--resume", input.resume.cliSessionId);
      }
      return { args, promptVia: "stdin" as const };
    },
    buildEnv(sandbox) {
      const env: Record<string, string> = { FAKE_ECHO_ARGV: "1" };
      const scenarioFile = join(sandbox.accountDir, "fake-scenario");
      if (existsSync(scenarioFile)) {
        env.FAKE_SCENARIO = readFileSync(scenarioFile, "utf8").trim();
      }
      const textFile = join(sandbox.accountDir, "fake-text");
      if (existsSync(textFile)) {
        env.FAKE_TEXT = readFileSync(textFile, "utf8").trim();
      }
      return env;
    },
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

async function probeAll(): Promise<DetectionRow[]> {
  const rows: DetectionRow[] = [];
  const entries: Array<{ id: AdapterId; adapter: Adapter }> = Object.entries(adapters).map(
    ([id, adapter]) => ({ id: id as AdapterId, adapter }),
  );

  const probed = await Promise.all(
    entries.map(async ({ id, adapter }) => {
      if (id === "fake") {
        return {
          id,
          executable: adapter.executable,
          installed: true,
          version: "fake",
          path: join(repoRoot(), "tests", "fake-cli", "fake-cli.mjs"),
        } satisfies DetectionRow;
      }

      const resolved = await resolveExecutable(adapter.executable);
      const installed = resolved != null;
      const version = resolved ? await probeVersion(resolved) : undefined;
      return {
        id,
        executable: adapter.executable,
        installed,
        version,
        path: resolved?.path,
      } satisfies DetectionRow;
    }),
  );

  rows.push(...probed);
  return rows;
}

export async function detectAdapters(): Promise<DetectionRow[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.rows;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = probeAll()
    .then((rows) => {
      cache = { at: Date.now(), rows };
      return rows;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function refreshAdapterDetection(): void {
  cache = null;
  inFlight = null;
  refreshExecutableCache();
}
