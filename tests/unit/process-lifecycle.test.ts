import { describe, it, expect } from "vitest";
import { executePipe } from "../../apps/gateway/src/supervisor/pipe-executor.js";
import { projectRoot } from "../../apps/gateway/src/config/paths.js";
import path from "node:path";

describe("Process Lifecycle & Zero-Zombie Containment", () => {
  const mockScript = path.join(projectRoot, "tests", "mocks", "mock-hanging-cli.js");

  it("terminates hanging process tree upon abort signal", async () => {
    const abortCtrl = new AbortController();
    const startTime = Date.now();

    const result = await executePipe({
      executable: "node",
      args: [mockScript],
      cwd: projectRoot,
      env: process.env,
      executionMode: "pipe",
      signal: abortCtrl.signal,
      timeoutSeconds: 10,
      onDelta: () => {
        // Event-driven abort as soon as process starts emitting output
        abortCtrl.abort();
      },
    });

    const elapsed = Date.now() - startTime;

    expect(result.aborted).toBe(true);
    expect(elapsed).toBeLessThanOrEqual(500);
  });
});
