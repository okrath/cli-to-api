import { describe, it, expect } from "vitest";
import { resolveBinary } from "../../apps/gateway/src/adapters/resolver.js";
import { loadAdapterFile } from "../../apps/gateway/src/adapters/loader.js";
import { projectRoot } from "../../apps/gateway/src/config/paths.js";
import path from "node:path";
import fs from "node:fs";

describe("Windows PATHEXT & Binary Resolver", () => {
  it("resolves node binary from system PATH", () => {
    const res = resolveBinary("node");
    expect(res.isInstalled).toBe(true);
    expect(res.resolvedPath).toBeTruthy();
    expect(fs.existsSync(res.resolvedPath!)).toBe(true);
    expect(res.isPowerShellScript).toBe(false);
  });

  it("handles non-existent binary with clean fallback", () => {
    const res = resolveBinary("non-existent-binary-12345");
    expect(res.isInstalled).toBe(false);
    expect(res.resolvedPath).toBeNull();
    expect(res.spawnExecutable).toBe("non-existent-binary-12345");
    expect(res.spawnPrefixArgs).toEqual([]);
    expect(res.missingReason).toBe("NOT_FOUND_ON_PATH");
  });

  it("identifies Windows batch and cmd files", () => {
    const isWin = process.platform === "win32";
    if (isWin) {
      // Mock cmd resolution
      const res = resolveBinary("cmd");
      expect(res.resolvedPath.toLowerCase()).toContain("cmd");
    }
  });
});

describe("Declarative Adapter Loader & Schema Validation", () => {
  it("loads and validates codex-cli.yaml", () => {
    const filePath = path.join(projectRoot, "adapters", "codex-cli.yaml");
    const loaded = loadAdapterFile(filePath);
    expect(loaded.config.id).toBe("codex-cli");
    expect(loaded.config.models.length).toBeGreaterThanOrEqual(3);
    const asta = loaded.config.models.find(m => m.id === "gpt-5.6-asta");
    expect(asta).toBeDefined();
    expect(asta?.tier).toBe("xhigh");
    expect(asta?.is_default).toBe(true);
  });

  it("loads and validates opencode-cli.yaml", () => {
    const filePath = path.join(projectRoot, "adapters", "opencode-cli.yaml");
    const loaded = loadAdapterFile(filePath);
    expect(loaded.config.id).toBe("opencode-cli");
    const asta = loaded.config.models.find(m => m.id === "gpt-5.6-asta");
    expect(asta).toBeDefined();
    expect(asta?.tier).toBe("xhigh");
    expect(asta?.is_default).toBe(false);
  });

  it("loads and validates claude-code.yaml", () => {
    const filePath = path.join(projectRoot, "adapters", "claude-code.yaml");
    const loaded = loadAdapterFile(filePath);
    expect(loaded.config.id).toBe("claude-code");
    expect(loaded.config.execution_mode).toBe("pipe");
    const sonnet = loaded.config.models.find(m => m.id === "claude-3-7-sonnet");
    expect(sonnet).toBeDefined();
    expect(sonnet?.tier).toBe("medium");
  });

  it("loads and validates grok-cli.yaml", () => {
    const filePath = path.join(projectRoot, "adapters", "grok-cli.yaml");
    const loaded = loadAdapterFile(filePath);
    expect(loaded.config.id).toBe("grok-cli");
    expect(loaded.config.models.some(m => m.id === "grok-2")).toBe(true);
  });
});
