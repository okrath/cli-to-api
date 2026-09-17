import { execa } from "execa";
import { ResolvedBinary } from "./resolver.js";
import { killProcessTree } from "../supervisor/process-group.js";

export interface ProbeResult {
  isHealthy: boolean;
  detectedVersion: string | null;
  latencyMs: number;
  error?: string;
}

/**
 * Executes a bounded version probe against a resolved binary with strict timeout containment.
 */
export async function probeExecutable(
  resolved: ResolvedBinary,
  versionFlag = "--version",
  timeoutMs = 1500
): Promise<ProbeResult> {
  if (!resolved.isInstalled || !resolved.resolvedPath) {
    return {
      isHealthy: false,
      detectedVersion: null,
      latencyMs: 0,
      error: "Binary not installed on host search paths",
    };
  }

  const startTime = Date.now();
  const args = [...resolved.spawnPrefixArgs, versionFlag];

  try {
    const child = execa(resolved.spawnExecutable, args, {
      timeout: timeoutMs,
      reject: false,
      windowsHide: true,
      env: {
        ...process.env,
        CI: "1", // Disable interactive prompts
      },
    });

    const result = await child;
    const latencyMs = Date.now() - startTime;

    if (result.exitCode === 0) {
      const output = (result.stdout || result.stderr || "").trim();
      const firstLine = output.split(/[\r\n]+/)[0]?.trim() || "installed";
      const detectedVersion = firstLine.slice(0, 80);

      return {
        isHealthy: true,
        detectedVersion,
        latencyMs,
      };
    }

    // Process exited non-zero
    return {
      isHealthy: false,
      detectedVersion: null,
      latencyMs,
      error: `Process exited with code ${result.exitCode}: ${(result.stderr || result.stdout).slice(0, 100)}`,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    return {
      isHealthy: false,
      detectedVersion: null,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
