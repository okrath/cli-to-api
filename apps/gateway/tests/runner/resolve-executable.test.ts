import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
      expect(resolved?.file.toLowerCase()).toBe(exePath.toLowerCase());
      expect(resolved?.shell).toBe(false);
    } finally {
      process.env.PATH = prevPath;
    }
  });
});

function readCmd(path: string): string {
  return readFileSync(path, "utf8");
}
