import { createWindowsProcessContainment } from "./job-object.js";

export async function killProcessTree(pid: number, signal: NodeJS.Signals = "SIGKILL"): Promise<void> {
  if (process.platform === "win32") {
    const containment = createWindowsProcessContainment(pid);
    await containment.terminateTree();
    return;
  }

  // POSIX: Kill negative PID to terminate entire process group
  try {
    process.kill(-pid, signal);
  } catch (err: unknown) {
    // If process group doesn't exist, try direct kill
    try {
      process.kill(pid, signal);
    } catch {
      // Process already terminated
    }
  }
}
