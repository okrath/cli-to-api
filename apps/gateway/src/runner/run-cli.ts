import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Logger } from "pino";
import type { Adapter, CliDirs, CliEvent } from "../core/types.js";
import { killTree } from "./kill-tree.js";
import {
  applyHeldTerminalEvent,
  type HeldTerminalEvents,
  yieldHeldDone,
  yieldHeldUsage,
} from "./run-cli-held-events.js";
import type { ResolvedExecutable } from "./resolve-executable.js";

const STDERR_CAP = 64 * 1024;

function spawnErrorText(resolved: ResolvedExecutable, err: NodeJS.ErrnoException): string {
  const code = err.code ?? "UNKNOWN";
  return `Could not start executable "${resolved.file}": ${err.message} (${code})`;
}

export function runCli(opts: {
  adapter: Adapter;
  resolved: ResolvedExecutable;
  args: string[];
  promptVia: "argv" | "stdin";
  prompt: string;
  env: NodeJS.ProcessEnv;
  cwd: string;
  timeoutMs: number;
  signal: AbortSignal;
  log: Logger;
  dirs?: CliDirs;
}): {
  pid: Promise<number>;
  events: AsyncIterable<CliEvent>;
  timeout: { pause(): void; reset(): void };
} {
  const baseArgv = [...opts.resolved.prefixArgs, ...opts.args];
  const argv =
    opts.promptVia === "argv" ? [...baseArgv, opts.prompt] : baseArgv;

  let spawnFailed = false;
  let spawnErrorMessage = "";
  let wakeSpawn: (() => void) | undefined;
  let aborted = opts.signal.aborted;

  // spawn() throws synchronously (rather than emitting "error") for some
  // failures, e.g. ENAMETOOLONG when argv exceeds the OS command-line limit.
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(opts.resolved.file, argv, {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
      shell: opts.resolved.shell,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    const message = spawnErrorText(opts.resolved, err as NodeJS.ErrnoException);
    async function* failedEvents(): AsyncGenerator<CliEvent> {
      yield { type: "error", kind: "crash", message };
      yield { type: "done", stopReason: "error" };
    }
    const noopTimeout = { pause() {}, reset() {} };
    return { pid: Promise.resolve(-1), events: failedEvents(), timeout: noopTimeout };
  }

  const pidPromise = new Promise<number>((resolve) => {
    child.once("error", (err: NodeJS.ErrnoException) => {
      spawnFailed = true;
      spawnErrorMessage = spawnErrorText(opts.resolved, err);
      wakeSpawn?.();
      resolve(-1);
    });
    if (child.pid != null) {
      if (opts.signal.aborted && child.pid > 0) {
        killTree(child.pid, opts.log);
      }
      resolve(child.pid);
      return;
    }
    child.once("spawn", () => {
      if (spawnFailed) return;
      if (opts.signal.aborted && child.pid != null && child.pid > 0) {
        killTree(child.pid, opts.log);
      }
      resolve(child.pid ?? -1);
    });
  });

  if (opts.promptVia === "stdin" && child.stdin) {
    child.stdin.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE") {
        opts.log.debug({ err }, "stdin error");
      }
    });
    child.stdin.write(opts.prompt);
    child.stdin.end();
  }

  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let notifyTimeout: (() => void) | undefined;

  const armTimeout = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      if (child.pid != null && child.pid > 0) killTree(child.pid, opts.log);
      notifyTimeout?.();
    }, opts.timeoutMs);
  };

  const timeout = {
    pause() {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
    },
    reset() {
      timedOut = false;
      armTimeout();
    },
  };

  async function* events(): AsyncGenerator<CliEvent> {
    if (spawnFailed) {
      yield {
        type: "error",
        kind: "crash",
        message: spawnErrorMessage,
      };
      yield { type: "done", stopReason: "error" };
      return;
    }

    let stderr = "";
    let sawError = false;
    let sawDone = false;
    timedOut = false;
    aborted = opts.signal.aborted;
    let streamClosed = false;
    const lineQueue: string[] = [];
    let wake: (() => void) | undefined;
    const holdTerminal = Boolean(opts.adapter.lastCallUsage && opts.dirs);
    const held: HeldTerminalEvents = {};

    const yieldHeldTerminal = function* () {
      if (!holdTerminal) return;
      yield* yieldHeldUsage(held, opts.adapter, opts.dirs!, opts.log);
      yield* yieldHeldDone(held);
    };

    const notify = () => {
      wake?.();
      wake = undefined;
    };

    notifyTimeout = notify;
    wakeSpawn = notify;
    armTimeout();

    child.once("error", (err: NodeJS.ErrnoException) => {
      if (spawnFailed) return;
      spawnFailed = true;
      spawnErrorMessage = spawnErrorText(opts.resolved, err);
      notify();
    });

    const wait = () =>
      new Promise<void>((resolve) => {
        wake = resolve;
      });

    const emitDone = function* (stopReason: "end_turn" | "max_tokens" | "error") {
      if (sawDone) return;
      sawDone = true;
      yield { type: "done" as const, stopReason };
    };

    const onAbort = () => {
      aborted = true;
      if (child.pid != null && child.pid > 0) killTree(child.pid, opts.log);
      notify();
    };
    opts.signal.addEventListener("abort", onAbort);
    if (opts.signal.aborted) onAbort();

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < STDERR_CAP) {
        stderr = (stderr + chunk.toString("utf8")).slice(0, STDERR_CAP);
      }
    });

    const rl = createInterface({
      input: child.stdout!,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      lineQueue.push(line);
      notify();
    });
    rl.on("close", () => {
      streamClosed = true;
      notify();
    });

    const drainLines = function* () {
      while (lineQueue.length > 0) {
        const trimmed = lineQueue.shift()!.trim();
        if (!trimmed) continue;

        try {
          for (const event of opts.adapter.parseLine(trimmed)) {
            if (event.type === "error") sawError = true;
            if (event.type === "done") sawDone = true;
            const out = applyHeldTerminalEvent(held, event, holdTerminal);
            if (holdTerminal && (event.type === "usage" || event.type === "done")) continue;
            if (out) yield out;
          }
        } catch (err) {
          opts.log.error(
            { err, line: trimmed.slice(0, 500) },
            "parseLine threw",
          );
        }
      }
    };

    try {
      while (true) {
        yield* drainLines();

        if (spawnFailed) {
          if (!sawError) {
            sawError = true;
            yield {
              type: "error",
              kind: "crash",
              message: spawnErrorMessage,
            };
          }
          yield* yieldHeldTerminal();
          yield* emitDone("error");
          return;
        }
        if (aborted) {
          yield* yieldHeldTerminal();
          yield* emitDone("error");
          return;
        }
        if (timedOut) break;
        if (streamClosed) break;

        await wait();
      }

      yield* drainLines();

      if (spawnFailed) {
        if (!sawError) {
          sawError = true;
          yield {
            type: "error",
            kind: "crash",
            message: spawnErrorMessage,
          };
        }
        yield* yieldHeldTerminal();
        yield* emitDone("error");
        return;
      }

      if (aborted) {
        yield* yieldHeldTerminal();
        yield* emitDone("error");
        return;
      }

      if (timedOut) {
        if (!sawError) {
          sawError = true;
          yield {
            type: "error",
            kind: "timeout",
            message: `CLI timed out after ${opts.timeoutMs}ms`,
          };
        }
        yield* yieldHeldTerminal();
        yield* emitDone("error");
        return;
      }

      const exitCode = await new Promise<number | null>((resolve) => {
        if (child.exitCode != null) {
          resolve(child.exitCode);
          return;
        }
        child.once("close", (code) => resolve(code));
      });

      if (!sawError && !sawDone && exitCode != null && exitCode !== 0) {
        const stderrEvents = opts.adapter.parseStderr?.(stderr) ?? [];
        if (stderrEvents.length > 0) {
          for (const event of stderrEvents) {
            if (event.type === "error") sawError = true;
            yield event;
          }
        } else {
          sawError = true;
          yield {
            type: "error",
            kind: "crash",
            message: stderr.slice(-500) || `Process exited with code ${exitCode}`,
          };
        }
      }

      yield* yieldHeldTerminal();
      yield* emitDone(sawError ? "error" : "end_turn");
    } finally {
      timeout.pause();
      opts.signal.removeEventListener("abort", onAbort);
      rl.close();
      child.stdout?.destroy();
      child.stderr?.destroy();
    }
  }

  return { pid: pidPromise, events: events(), timeout };
}
