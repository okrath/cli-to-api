import { describe, it, expect } from "vitest";
import { resolveBinary, getFreshHostSearchPaths } from "../../apps/gateway/src/adapters/resolver.js";

describe("Dynamic Binary Resolution for Newly Installed CLIs", () => {
  it("resolves agy from dynamic HKCU PATH expansion", () => {
    const searchPaths = getFreshHostSearchPaths();
    console.log("Search paths count:", searchPaths.length);

    // Look for agy path
    const agyPath = searchPaths.find((p) => p.toLowerCase().includes("agy"));
    console.log("Found agy in search paths:", agyPath);

    expect(agyPath).toBeDefined();

    const resolved = resolveBinary("agy");
    console.log("Resolved agy binary:", resolved);

    expect(resolved.isInstalled).toBe(true);
    expect(resolved.resolvedPath).toBeTruthy();
    expect(resolved.resolvedPath?.toLowerCase()).toContain("agy");
  });
});
