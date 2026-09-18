import { spawnSync } from "node:child_process";
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
      const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        encoding: "utf8",
      });
      if (result.error || result.status !== 0) {
        log?.warn({ pid, status: result.status, stderr: result.stderr }, "taskkill failed");
      }
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
