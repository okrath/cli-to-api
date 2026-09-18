import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Logger } from "pino";
import type { Adapter, CliEvent } from "../core/types.js";
import { killTree } from "./kill-tree.js";

const STDERR_CAP = 64 * 1024;

export function runCli(opts: {
  adapter: Adapter;
  args: string[];
  promptVia: "argv" | "stdin";
  prompt: string;
  env: NodeJS.ProcessEnv;
  cwd: string;
  timeoutMs: number;
  signal: AbortSignal;
  log: Logger;
}): { pid: Promise<number>; events: AsyncIterable<CliEvent> } {
  const argv =
    opts.promptVia === "argv" ? [...opts.args, opts.prompt] : opts.args;

  let spawnFailed = false;
  let spawnErrorMessage = "";
  let wakeSpawn: (() => void) | undefined;

  const child = spawn(opts.adapter.executable, argv, {
    cwd: opts.cwd,
    env: opts.env,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pidPromise = new Promise<number>((resolve) => {
    child.once("error", (err) => {
      spawnFailed = true;
      spawnErrorMessage = err.message;
      wakeSpawn?.();
      resolve(-1);
    });
    if (child.pid != null) {
      resolve(child.pid);
      return;
    }
    child.once("spawn", () => {
      if (spawnFailed) return;
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
    let timedOut = false;
    let aborted = opts.signal.aborted;
    let streamClosed = false;
    const lineQueue: string[] = [];
    let wake: (() => void) | undefined;

    const notify = () => {
      wake?.();
      wake = undefined;
    };

    wakeSpawn = notify;

    child.once("error", (err) => {
      if (spawnFailed) return;
      spawnFailed = true;
      spawnErrorMessage = err.message;
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

    const timeout = setTimeout(() => {
      timedOut = true;
      if (child.pid != null && child.pid > 0) killTree(child.pid, opts.log);
      notify();
    }, opts.timeoutMs);

    const onAbort = () => {
      aborted = true;
      if (child.pid != null && child.pid > 0) killTree(child.pid, opts.log);
      notify();
    };
    opts.signal.addEventListener("abort", onAbort);

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
            yield event;
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
          yield* emitDone("error");
          return;
        }
        if (aborted) {
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
        yield* emitDone("error");
        return;
      }

      if (aborted) {
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

      yield* emitDone(sawError ? "error" : "end_turn");
    } finally {
      clearTimeout(timeout);
      opts.signal.removeEventListener("abort", onAbort);
      rl.close();
      child.stdout?.destroy();
      child.stderr?.destroy();
    }
  }

  return { pid: pidPromise, events: events() };
}
