import { execa } from "execa";

export interface ProcessContainmentHandle {
  pid: number;
  terminateTree: () => Promise<void>;
}

export function createWindowsProcessContainment(pid: number): ProcessContainmentHandle {
  return {
    pid,
    terminateTree: async () => {
      if (process.platform !== "win32") return;
      try {
        // /F = Force, /T = Kill process tree (descendants), /PID = Target PID
        await execa("taskkill", ["/F", "/T", "/PID", String(pid)], {
          reject: false,
          timeout: 2000,
        });
      } catch {
        // Process may already be dead
      }
    },
  };
}
