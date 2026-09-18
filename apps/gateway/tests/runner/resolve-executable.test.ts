import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseCmdShim,
  refreshExecutableCache,
  resolveExecutable,
} from "../../src/runner/resolve-executable.js";

describe("parseCmdShim", () => {
  let root: string;

  afterEach(() => {
    refreshExecutableCache();
  });

  it("resolves npm claude.cmd shim to claude.exe", () => {
    root = join(tmpdir(), `cli-to-api-shim-${Date.now()}`);
    mkdirSync(join(root, "node_modules", "@anthropic-ai", "claude-code", "bin"), {
      recursive: true,
    });
    const exePath = join(root, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
    writeFileSync(exePath, "");
    const cmdPath = join(root, "claude.cmd");
    writeFileSync(
      cmdPath,
      `@ECHO off\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe" %*\r\n`,
    );

    const resolved = parseCmdShim(cmdPath, readCmd(cmdPath));
    expect(resolved).toEqual({
      file: exePath,
      prefixArgs: [],
      shell: false,
      path: cmdPath,
    });
  });

  it("resolves SCRIPT_DIR ps1 shims like cursor-agent.cmd", () => {
    root = join(tmpdir(), `cli-to-api-shim-scriptdir-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    const nodeExe = join(root, "node.exe");
    const indexJs = join(root, "index.js");
    writeFileSync(nodeExe, "");
    writeFileSync(indexJs, "");
    writeFileSync(join(root, "cursor-agent.ps1"), "");
    const cmdPath = join(root, "cursor-agent.cmd");
    writeFileSync(
      cmdPath,
      `@echo off\r\nset "SCRIPT_DIR=%~dp0"\r\npowershell -NoProfile -File "%SCRIPT_DIR%\\cursor-agent.ps1" %*\r\n`,
    );

    const resolved = parseCmdShim(cmdPath, readCmd(cmdPath));
    expect(resolved).toEqual({
      file: nodeExe,
      prefixArgs: [indexJs],
      shell: false,
      path: cmdPath,
    });
  });

  it("resolves cursor-agent ps1 shim to bundled node.exe and index.js", () => {
    root = join(tmpdir(), `cli-to-api-shim-ps1-${Date.now()}`);
    mkdirSync(join(root, "versions", "2026.9.15-abc123"), { recursive: true });
    const nodeExe = join(root, "versions", "2026.9.15-abc123", "node.exe");
    const indexJs = join(root, "versions", "2026.9.15-abc123", "index.js");
    writeFileSync(nodeExe, "");
    writeFileSync(indexJs, "");
    writeFileSync(join(root, "cursor-agent.ps1"), "");
    const cmdPath = join(root, "cursor-agent.cmd");
    writeFileSync(
      cmdPath,
      `@ECHO off\r\npowershell -NoProfile -File "%dp0%\\cursor-agent.ps1" %*\r\n`,
    );

    const resolved = parseCmdShim(cmdPath, readCmd(cmdPath));
    expect(resolved).toEqual({
      file: nodeExe,
      prefixArgs: [indexJs],
      shell: false,
      path: cmdPath,
    });
  });

  it("prefers node.exe next to the ps1 when present", () => {
    root = join(tmpdir(), `cli-to-api-shim-ps1-direct-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    const nodeExe = join(root, "node.exe");
    const indexJs = join(root, "index.js");
    writeFileSync(nodeExe, "");
    writeFileSync(indexJs, "");
    writeFileSync(join(root, "cursor-agent.ps1"), "");
    const cmdPath = join(root, "cursor-agent.cmd");
    writeFileSync(cmdPath, `"%dp0%\\cursor-agent.ps1" %*\r\n`);

    const resolved = parseCmdShim(cmdPath, readCmd(cmdPath));
    expect(resolved).toEqual({
      file: nodeExe,
      prefixArgs: [indexJs],
      shell: false,
      path: cmdPath,
    });
  });

  it("returns node execPath with js target as prefixArgs", () => {
    root = join(tmpdir(), `cli-to-api-shim-js-${Date.now()}`);
    mkdirSync(join(root, "node_modules", "pkg", "bin"), { recursive: true });
    const jsPath = join(root, "node_modules", "pkg", "bin", "cli.js");
    writeFileSync(jsPath, "console.log('hi');");
    const cmdPath = join(root, "pkg.cmd");
    writeFileSync(cmdPath, `"%dp0%\\node_modules\\pkg\\bin\\cli.js" %*\r\n`);

    const resolved = parseCmdShim(cmdPath, readCmd(cmdPath));
    expect(resolved?.file).toBe(process.execPath);
    expect(resolved?.prefixArgs).toEqual([jsPath]);
    expect(resolved?.shell).toBe(false);
  });
});

describe("resolveExecutable", () => {
  let root: string;

  afterEach(() => {
    refreshExecutableCache();
  });

  it("prefers .exe over extensionless shim on Windows", async () => {
    if (process.platform !== "win32") return;

    root = join(tmpdir(), `cli-to-api-where-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    const exePath = join(root, "tool.exe");
    writeFileSync(exePath, "");
    writeFileSync(join(root, "tool"), "@echo off\r\n");
    writeFileSync(join(root, "tool.cmd"), `@echo off\r\n"${exePath}" %*\r\n`);

    const prevPath = process.env.PATH;
    process.env.PATH = `${root};${prevPath ?? ""}`;
    try {
      refreshExecutableCache();
      const resolved = await resolveExecutable("tool");
      expect(resolved?.file.toLowerCase()).toBe(
        realpathSync.native(exePath).toLowerCase(),
      );
      expect(resolved?.shell).toBe(false);
    } finally {
      process.env.PATH = prevPath;
    }
  });
});

function readCmd(path: string): string {
  return readFileSync(path, "utf8");
}
