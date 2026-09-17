import type { EffortLevel } from "../db/schema.js";

export type ProcessExecutionMode = "pty" | "pipe";

export interface ProcessSpawnOptions {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  executionMode: ProcessExecutionMode;
  stdinContent?: string;
  signal?: AbortSignal;
  timeoutSeconds?: number;
  effortLevel?: EffortLevel | null;
  onDelta?: (chunk: string) => void;
  onContentDelta?: (chunk: string) => void;
  onThoughtDelta?: (chunk: string) => void;
  onError?: (errText: string) => void;
  onSpawn?: (pid: number) => void;
}

export interface ProcessExecutionResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  aborted: boolean;
  capturedSessionId?: string;
  thoughtContent?: string;
  thoughtDurationMs?: number;
  rateLimitDetected?: {
    isRateLimited: boolean;
    cooldownSeconds: number;
  };
}

export interface ProcessHandle {
  pid: number;
  kill: (signal?: string) => Promise<void>;
  wait: () => Promise<ProcessExecutionResult>;
}
