import * as pty from "node-pty";
import { ProcessSpawnOptions, ProcessExecutionResult } from "./types.js";
import { killProcessTree } from "./process-group.js";
import { DualStageAnsiSanitizer } from "../stream/ansi-sanitizer.js";
import { ThinkingDemuxer } from "../stream/thinking-demuxer.js";

export async function executePty(options: ProcessSpawnOptions): Promise<ProcessExecutionResult> {
  const {
    executable,
    args,
    cwd,
    env,
    stdinContent,
    signal,
    timeoutSeconds = 300,
    onDelta,
    onContentDelta,
    onThoughtDelta,
  } = options;

  const startTime = Date.now();
  const sanitizer = new DualStageAnsiSanitizer();
  const demuxer = new ThinkingDemuxer({
    onThoughtDelta: (token: string) => {
      if (onThoughtDelta) onThoughtDelta(token);
    },
    onContentDelta: (token: string) => {
      if (onContentDelta) onContentDelta(token);
      if (onDelta) onDelta(token);
    },
  });

  let fullStdout = "";

  return new Promise<ProcessExecutionResult>((resolve) => {
    let ptyProcess: pty.IPty | null = null;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let isResolved = false;

    const cleanupAndResolve = (result: ProcessExecutionResult) => {
      if (isResolved) return;
      isResolved = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      resolve(result);
    };

    if (signal?.aborted) {
      cleanupAndResolve({
        exitCode: null,
        signal: "SIGABRT",
        stdout: "",
        stderr: "",
        durationMs: Date.now() - startTime,
        aborted: true,
      });
      return;
    }

    try {
      ptyProcess = pty.spawn(executable, args, {
        name: "xterm-color",
        cols: 120,
        rows: 30,
        cwd,
        env: env as Record<string, string>,
      });
    } catch (err: unknown) {
      cleanupAndResolve({
        exitCode: 1,
        signal: null,
        stdout: "",
        stderr: `Failed to spawn PTY: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startTime,
        aborted: false,
      });
      return;
    }

    const pid = ptyProcess.pid;
    if (pid && options.onSpawn) {
      options.onSpawn(pid);
    }
    if (signal) {
      const abortHandler = () => {
        if (pid) {
          killProcessTree(pid).catch(() => {});
        }
        cleanupAndResolve({
          exitCode: null,
          signal: "SIGABRT",
          stdout: fullStdout,
          stderr: "",
          durationMs: Date.now() - startTime,
          aborted: true,
        });
      };

      signal.addEventListener("abort", abortHandler, { once: true });
    }

    if (timeoutSeconds > 0) {
      timeoutTimer = setTimeout(() => {
        if (pid) {
          killProcessTree(pid).catch(() => {});
        }
        cleanupAndResolve({
          exitCode: null,
          signal: "SIGTERM",
          stdout: fullStdout,
          stderr: `Execution timed out after ${timeoutSeconds}s`,
          durationMs: Date.now() - startTime,
          aborted: false,
        });
      }, timeoutSeconds * 1000);
    }

    // Write stdin if provided
    if (stdinContent) {
      ptyProcess.write(stdinContent);
    }

    // Handle incoming data
    ptyProcess.onData((data: string) => {
      const clean = sanitizer.processChunk(data);
      if (clean) {
        fullStdout += clean;
        demuxer.feed(clean);
      }
    });

    // Handle exit
    ptyProcess.onExit(({ exitCode, signal: exitSignal }) => {
      const remaining = sanitizer.flush();
      if (remaining) {
        fullStdout += remaining;
        demuxer.feed(remaining);
      }
      demuxer.flush();

      cleanupAndResolve({
        exitCode: exitCode ?? 0,
        signal: exitSignal ? String(exitSignal) : null,
        stdout: demuxer.accumulatedContent || fullStdout,
        stderr: "",
        durationMs: Date.now() - startTime,
        aborted: false,
        thoughtContent: demuxer.accumulatedThought || undefined,
        thoughtDurationMs: demuxer.getThoughtDurationMs(),
      });
    });
  });
}
