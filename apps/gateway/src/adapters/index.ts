import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Adapter, HostLoginRun, HostLoginStatus } from "../core/types.js";
import {
  refreshExecutableCache,
  resolveExecutable,
  type ResolvedExecutable,
} from "../runner/resolve-executable.js";
import { agyAdapter } from "./agy.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { cursorAgentAdapter } from "./cursor-agent.js";

export type AdapterId = Adapter["id"] | "fake";

const VERSION_TIMEOUT_MS = 5000;
const HOST_LOGIN_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 60_000;

const execFileAsync = promisify(execFile);

interface DetectionRow {
  id: AdapterId;
  executable: string;
  installed: boolean;
  version?: string;
  path?: string;
  hostLogin?: HostLoginStatus;
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

function makeHostLoginRunner(): HostLoginRun {
  return async (file, args) => {
    try {
      const resolved = await resolveExecutable(file);
      if (!resolved) {
        return { code: null, stdout: "", stderr: "" };
      }
      const { stdout, stderr } = await execFileAsync(resolved.file, [...resolved.prefixArgs, ...args], {
        encoding: "utf8",
        timeout: HOST_LOGIN_TIMEOUT_MS,
        shell: resolved.shell,
      });
      return { code: 0, stdout, stderr };
    } catch (err: unknown) {
      const error = err as { code?: number; stdout?: string; stderr?: string };
      return {
        code: typeof error.code === "number" ? error.code : null,
        stdout: String(error.stdout ?? ""),
        stderr: String(error.stderr ?? ""),
      };
    }
  };
}

function fakeAdapter(repo: string): Adapter {
  const fakeCli = join(repo, "tests", "fake-cli", "fake-cli.mjs");
  return {
    id: "fake" as Adapter["id"],
    clientTools: true,
    executable: process.execPath,
    models: [{ id: "fake", label: "Fake CLI" }],
    buildArgs(input) {
      const args = [fakeCli, "--model", input.model];
      if (input.resume) {
        args.push("--resume", input.resume.cliSessionId);
      }
      if (input.tools) {
        args.push("--mcp-url", input.tools.mcpUrl);
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
    "cursor-agent": cursorAgentAdapter,
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
  const entries: Array<{ id: AdapterId; adapter: Adapter }> = Object.entries(adapters).map(
    ([id, adapter]) => ({ id: id as AdapterId, adapter }),
  );

  const run = makeHostLoginRunner();

  const probed = await Promise.all(
    entries.map(async ({ id, adapter }) => {
      if (id === "fake") {
        return {
          id,
          executable: adapter.executable,
          installed: true,
          version: "fake",
          path: join(repoRoot(), "tests", "fake-cli", "fake-cli.mjs"),
          hostLogin: { status: "unknown" as const },
        } satisfies DetectionRow;
      }

      const resolved = await resolveExecutable(adapter.executable);
      const installed = resolved != null;
      const [version, hostLogin] = await Promise.all([
        resolved ? probeVersion(resolved) : Promise.resolve(undefined),
        adapter.detectHostLogin ? adapter.detectHostLogin(run) : Promise.resolve({ status: "unknown" as const }),
      ]);
      return {
        id,
        executable: adapter.executable,
        installed,
        version,
        path: resolved?.path,
        hostLogin,
      } satisfies DetectionRow;
    }),
  );

  return probed;
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
