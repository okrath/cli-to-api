import { spawn } from "node:child_process";
import type { Logger } from "pino";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function killTree(pid: number, log?: Logger): void {
  if (!pid || pid <= 0) return;

  try {
    if (process.platform === "win32") {
      const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString("utf8")).slice(0, 4096);
      });
      child.on("error", (err) => {
        log?.warn({ pid, err }, "taskkill failed");
      });
      child.on("close", (code) => {
        if (code !== 0) {
          log?.warn({ pid, code, stderr: stderr.trim() || undefined }, "taskkill failed");
        }
      });
      return;
    }

    try {
      process.kill(-pid, "SIGTERM");
    } catch (err) {
      try {
        process.kill(pid, "SIGTERM");
      } catch (inner) {
        log?.warn({ pid, err: inner }, "SIGTERM failed");
      }
    }

    if (isAlive(pid)) {
      setTimeout(() => {
        if (!isAlive(pid)) return;
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          try {
            process.kill(pid, "SIGKILL");
          } catch (err) {
            log?.warn({ pid, err }, "SIGKILL failed");
          }
        }
      }, 300).unref();
    }
  } catch (err) {
    log?.warn({ pid, err }, "killTree failed");
  }
}
