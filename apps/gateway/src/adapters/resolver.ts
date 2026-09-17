import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export interface ResolvedBinary {
  isInstalled: boolean;
  resolvedPath: string | null;
  isWindowsScript: boolean;
  isPowerShellScript: boolean;
  spawnExecutable: string;
  spawnPrefixArgs: string[];
  missingReason?: "NOT_FOUND_ON_PATH" | "PERMISSION_DENIED";
}

function expandWindowsEnvVars(str: string): string {
  if (process.platform !== "win32") return str;
  return str.replace(/%([^%]+)%/g, (_, name) => {
    const key = Object.keys(process.env).find((k) => k.toLowerCase() === name.toLowerCase());
    return (key && process.env[key]) || "";
  });
}

/**
 * Returns dynamic search paths, actively querying the Windows Registry (HKCU and HKLM Environment Path)
 * on Windows so that newly installed tools (via npm, scoop, cargo, installer) are detected without restarting Node.
 */
export function getFreshHostSearchPaths(): string[] {
  const isWin = process.platform === "win32";
  const searchDirs = new Set<string>();

  // 1. Current process PATH
  const currentPath = process.env.PATH || "";
  for (const dir of currentPath.split(isWin ? ";" : ":")) {
    const trimmed = dir.replace(/^"|"$/g, "").trim();
    if (trimmed) {
      const expanded = expandWindowsEnvVars(trimmed);
      if (expanded) searchDirs.add(path.normalize(expanded));
    }
  }

  // 2. On Windows: Query live registry to catch newly installed tools without restart
  if (isWin) {
    // 2a. Query HKCU\Environment for User PATH
    try {
      const userReg = execSync('reg query "HKCU\\Environment" /v Path', {
        encoding: "utf8",
        timeout: 1000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const match = userReg.match(/REG_(?:EXPAND_)?SZ\s+(.*)/i);
      if (match && match[1]) {
        for (const dir of match[1].split(";")) {
          const trimmed = dir.replace(/^"|"$/g, "").trim();
          if (trimmed) {
            const expanded = expandWindowsEnvVars(trimmed);
            if (expanded) searchDirs.add(path.normalize(expanded));
          }
        }
      }
    } catch {
      // Ignore registry read errors
    }

    // 2b. Query HKLM for System PATH
    try {
      const sysReg = execSync('reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path', {
        encoding: "utf8",
        timeout: 1000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const match = sysReg.match(/REG_(?:EXPAND_)?SZ\s+(.*)/i);
      if (match && match[1]) {
        for (const dir of match[1].split(";")) {
          const trimmed = dir.replace(/^"|"$/g, "").trim();
          if (trimmed) {
            const expanded = expandWindowsEnvVars(trimmed);
            if (expanded) searchDirs.add(path.normalize(expanded));
          }
        }
      }
    } catch {
      // Ignore registry read errors
    }

    // 3. Check known global package manager paths on Windows
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    const userProfile = process.env.USERPROFILE;
    if (appData) searchDirs.add(path.join(appData, "npm"));
    if (localAppData) {
      searchDirs.add(path.join(localAppData, "pnpm"));
      searchDirs.add(path.join(localAppData, "Microsoft", "WinGet", "Links"));
    }
    if (userProfile) {
      searchDirs.add(path.join(userProfile, "scoop", "shims"));
      searchDirs.add(path.join(userProfile, ".cargo", "bin"));
      searchDirs.add(path.join(userProfile, "AppData", "Local", "Programs", "Python", "Python311", "Scripts"));
      searchDirs.add(path.join(userProfile, "AppData", "Local", "Programs", "Python", "Python312", "Scripts"));
    }
  } else {
    // POSIX standard paths
    searchDirs.add("/opt/homebrew/bin");
    searchDirs.add("/usr/local/bin");
    if (process.env.HOME) {
      searchDirs.add(path.join(process.env.HOME, ".cargo", "bin"));
      searchDirs.add(path.join(process.env.HOME, ".local", "bin"));
    }
  }

  return Array.from(searchDirs).filter((d) => {
    try {
      return fs.existsSync(d);
    } catch {
      return false;
    }
  });
}

/**
 * Returns fresh delimited PATH string constructed from dynamic host search paths.
 */
export function getFreshHostPathString(): string {
  const isWin = process.platform === "win32";
  return getFreshHostSearchPaths().join(isWin ? ";" : ":");
}

export function resolveBinary(executable: string, customPath?: string): ResolvedBinary {
  const isWin = process.platform === "win32";

  // 1. Check custom path if provided
  if (customPath) {
    if (fs.existsSync(customPath)) {
      return wrapResolvedBinary(customPath, isWin, true);
    }
  }

  // 2. Check if absolute or relative file directly exists
  if (path.isAbsolute(executable) && fs.existsSync(executable)) {
    return wrapResolvedBinary(executable, isWin, true);
  }

  const pathDirs = getFreshHostSearchPaths();
  const pathext = isWin ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD;.PS1") : "";
  const extensions = isWin ? pathext.split(";").map((e) => e.toLowerCase()) : [""];

  for (const dir of pathDirs) {
    try {
      const directPath = path.join(dir, executable);

      // POSIX direct binary check
      if (!isWin && fs.existsSync(directPath)) {
        try {
          fs.accessSync(directPath, fs.constants.X_OK);
          return wrapResolvedBinary(directPath, false, true);
        } catch {
          // File exists but not executable
          continue;
        }
      }

      // Windows executable / script check
      if (isWin) {
        for (const ext of extensions) {
          const candidate = directPath.toLowerCase().endsWith(ext)
            ? directPath
            : `${directPath}${ext}`;
          if (fs.existsSync(candidate)) {
            return wrapResolvedBinary(candidate, true, true);
          }
        }
      }
    } catch {
      // Ignore directory access errors
    }
  }

  // Fallback when binary is NOT found on disk
  return {
    isInstalled: false,
    resolvedPath: null,
    isWindowsScript: false,
    isPowerShellScript: false,
    spawnExecutable: executable,
    spawnPrefixArgs: [],
    missingReason: "NOT_FOUND_ON_PATH",
  };
}

function wrapResolvedBinary(filePath: string, isWin: boolean, isInstalled: boolean): ResolvedBinary {
  const lower = filePath.toLowerCase();
  const isWindowsScript = isWin && (lower.endsWith(".cmd") || lower.endsWith(".bat"));
  const isPowerShellScript = isWin && lower.endsWith(".ps1");

  if (isWindowsScript) {
    // Windows Node.js 22 LTS spawn of .cmd/.bat requires cmd.exe wrapper (CVE-2024-27980 safe)
    return {
      isInstalled,
      resolvedPath: filePath,
      isWindowsScript: true,
      isPowerShellScript: false,
      spawnExecutable: process.env.ComSpec || "cmd.exe",
      spawnPrefixArgs: ["/d", "/s", "/c", filePath],
    };
  }

  if (isPowerShellScript) {
    return {
      isInstalled,
      resolvedPath: filePath,
      isWindowsScript: false,
      isPowerShellScript: true,
      spawnExecutable: "powershell.exe",
      spawnPrefixArgs: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", filePath],
    };
  }

  return {
    isInstalled,
    resolvedPath: filePath,
    isWindowsScript: false,
    isPowerShellScript: false,
    spawnExecutable: filePath,
    spawnPrefixArgs: [],
  };
}
