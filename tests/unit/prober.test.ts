import { describe, it, expect } from "vitest";
import { resolveBinary } from "../../apps/gateway/src/adapters/resolver.js";
import { probeExecutable } from "../../apps/gateway/src/adapters/prober.js";
import path from "node:path";
import { projectRoot } from "../../apps/gateway/src/config/paths.js";

describe("Bounded Version Prober", () => {
  it("successfully probes installed binary (node)", async () => {
    const resolved = resolveBinary("node");
    expect(resolved.isInstalled).toBe(true);

    const probe = await probeExecutable(resolved, "-v", 3000);
    expect(probe.isHealthy).toBe(true);
    expect(probe.detectedVersion).toMatch(/^v\d+/);
    expect(probe.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns isHealthy: false for uninstalled binary", async () => {
    const resolved = resolveBinary("completely-non-existent-binary-xyz");
    expect(resolved.isInstalled).toBe(false);

    const probe = await probeExecutable(resolved, "--version", 1000);
    expect(probe.isHealthy).toBe(false);
    expect(probe.detectedVersion).toBeNull();
    expect(probe.error).toContain("Binary not installed");
  });

  it("terminates hanging probe execution within bounded timeout", async () => {
    const mockHangingScript = path.join(projectRoot, "tests", "mocks", "mock-hanging-cli.js");
    const nodeResolved = resolveBinary("node");

    // Construct mock script execution wrapper
    const hangingResolved = {
      ...nodeResolved,
      spawnPrefixArgs: [mockHangingScript],
    };

    const startTime = Date.now();
    const probe = await probeExecutable(hangingResolved, "--version", 600);
    const duration = Date.now() - startTime;

    expect(probe.isHealthy).toBe(false);
    expect(duration).toBeLessThan(2500); // Must not hang beyond bounded safety window
  });
});
