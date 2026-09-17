import { execa } from "execa";
import { ProcessSpawnOptions, ProcessExecutionResult } from "./types.js";
import { killProcessTree } from "./process-group.js";
import { DualStageAnsiSanitizer } from "../stream/ansi-sanitizer.js";
import { ThinkingDemuxer } from "../stream/thinking-demuxer.js";

export async function executePipe(options: ProcessSpawnOptions): Promise<ProcessExecutionResult> {
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
    onError,
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
  let fullStderr = "";

  const child = execa(executable, args, {
    cwd,
    env,
    timeout: timeoutSeconds * 1000,
    reject: false,
    stripFinalNewline: false,
    buffer: false,
    windowsHide: true,
  });

  const pid = child.pid;
  if (pid && options.onSpawn) {
    options.onSpawn(pid);
  }
  // Handle AbortSignal immediately
  if (signal) {
    if (signal.aborted) {
      if (pid) {
        killProcessTree(pid).catch(() => {});
      }
      return {
        exitCode: null,
        signal: "SIGABRT",
        stdout: "",
        stderr: "",
        durationMs: Date.now() - startTime,
        aborted: true,
      };
    }

    signal.addEventListener("abort", () => {
      if (pid) {
        killProcessTree(pid).catch(() => {});
      }
    });
  }

  // Stream stdin if provided, and always end stdin to prevent deadlocks on CLIs that inspect stdin
  if (child.stdin) {
    if (stdinContent) {
      child.stdin.write(stdinContent);
    }
    child.stdin.end();
  }

  // Handle stdout streaming
  if (child.stdout) {
    child.stdout.on("data", (chunk: Buffer) => {
      const cleanDelta = sanitizer.processChunk(chunk);
      if (cleanDelta) {
        fullStdout += cleanDelta;
        demuxer.feed(cleanDelta);
      }
    });
  }

  // Handle stderr
  if (child.stderr) {
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      fullStderr += text;
      if (onError) onError(text);
    });
  }

  const result = await child;
  const remaining = sanitizer.flush();
  if (remaining) {
    fullStdout += remaining;
    demuxer.feed(remaining);
  }
  demuxer.flush();

  const durationMs = Date.now() - startTime;

  return {
    exitCode: result.exitCode ?? null,
    signal: result.signal ?? null,
    stdout: demuxer.accumulatedContent || fullStdout,
    stderr: fullStderr,
    durationMs,
    aborted: Boolean(signal?.aborted),
    thoughtContent: demuxer.accumulatedThought || undefined,
    thoughtDurationMs: demuxer.getThoughtDurationMs(),
  };
}
