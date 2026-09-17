---
phase: 1
title: "SQLite Schema Migration & Enhanced Host Binary Resolver"
status: pending
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: SQLite Schema Migration & Enhanced Host Binary Resolver

## Goal
Evolve the Drizzle SQLite schema to track adapter discovery lifecycle states (`INSTALLED`, `NOT_INSTALLED`, `DEGRADED`) and refactor `resolver.ts` to execute deterministic cross-platform binary lookups that return an explicit `isInstalled: boolean` flag and `null` fallback instead of masking missing executables.

---

## Detailed Technical Context & Requirements

1. **Schema Defect:**
   The existing `adapters` table in `apps/gateway/src/db/schema.ts` assumes every loaded YAML has a resolved binary path (`resolvedPath: text("resolved_path").notNull()`) and treats all adapters as enabled (`isEnabled: integer("is_enabled").notNull().default(true)`). It lacks lifecycle state, detected version, probe timestamps, and custom adapter indicators.
   The `accounts` table lacks a `CLI_MISSING` status for accounts whose CLI binary was removed after initial creation.

2. **Resolver Defect:**
   In `apps/gateway/src/adapters/resolver.ts` (lines 61-62):
   ```typescript
   // Fallback to raw executable name if not located on disk
   return wrapResolvedBinary(executable, isWin);
   ```
   This masks uninstalled binaries by returning the executable name as if it were a resolved path, causing downstream components to attempt execution.

---

## Tasks Breakdown

### Task 1.1: Schema Additive Evolution (`apps/gateway/src/db/schema.ts`)
Add lifecycle tracking columns to `adapters`:
- `isInstalled`: `integer("is_installed", { mode: "boolean" }).notNull().default(false)`
- `status`: `text("status", { enum: ["INSTALLED", "NOT_INSTALLED", "DEGRADED"] }).notNull().default("NOT_INSTALLED")`
- `resolvedPath`: `text("resolved_path")` (change from `.notNull()` to nullable)
- `detectedVersion`: `text("detected_version")`
- `lastProbedAt`: `integer("last_probed_at")`
- `isCustom`: `integer("is_custom", { mode: "boolean" }).notNull().default(false)`
- Update `accounts.status`: Add `"CLI_MISSING"` to allowed enum values (`READY`, `BUSY`, `COOLDOWN`, `ERROR`, `CLI_MISSING`).

### Task 1.2: Additive DDL Migration Script (`apps/gateway/src/db/migrate.ts`)
Implement non-destructive SQLite migrations:
- Run `ALTER TABLE adapters ADD COLUMN is_installed INTEGER NOT NULL DEFAULT 0;` (wrapped in try/catch or SQLite column existence check).
- Run `ALTER TABLE adapters ADD COLUMN status TEXT NOT NULL DEFAULT 'NOT_INSTALLED';`
- Run `ALTER TABLE adapters ADD COLUMN detected_version TEXT;`
- Run `ALTER TABLE adapters ADD COLUMN last_probed_at INTEGER;`
- Run `ALTER TABLE adapters ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0;`
- Create index `idx_adapters_status ON adapters(status);`.

### Task 1.3: Refactor Binary Resolver (`apps/gateway/src/adapters/resolver.ts`)
Upgrade `resolveBinary` to return:
```typescript
export interface ResolvedBinary {
  isInstalled: boolean;
  resolvedPath: string | null;
  isWindowsScript: boolean;
  isPowerShellScript: boolean;
  spawnExecutable: string;
  spawnPrefixArgs: string[];
  missingReason?: "NOT_FOUND_ON_PATH" | "PERMISSION_DENIED";
}
```
- Inspect system `PATH`, Windows `%APPDATA%\npm`, `%LOCALAPPDATA%\pnpm`, `%USERPROFILE%\.cargo\bin`, `%LOCALAPPDATA%\scoop\shims`, and POSIX `/usr/local/bin`, `/opt/homebrew/bin`, `~/.local/bin`, `~/.cargo/bin`.
- Check POSIX executable bit (`fs.accessSync(path, fs.constants.X_OK)`) and Windows `PATHEXT` (`.com;.exe;.bat;.cmd;.ps1`).
- If binary is found: return `isInstalled: true`, absolute `resolvedPath`, and appropriate spawn wrapper (`cmd.exe /d /s /c` for `.cmd`/`.bat`).
- If binary is not found: return `isInstalled: false`, `resolvedPath: null`, `spawnExecutable: executable`, `spawnPrefixArgs: []`.

### Task 1.4: Update Unit Tests (`tests/unit/resolver.test.ts`)
- Assert `resolveBinary("node")` or known system command returns `isInstalled: true` with absolute path.
- Assert `resolveBinary("non_existent_random_cli_12345")` returns `isInstalled: false` and `resolvedPath: null`.
- Verify Windows script wrapping (`.cmd`, `.bat`) continues to invoke `cmd.exe /d /s /c`.

---

## Verification Commands
```bash
# Run resolver unit tests
pnpm --filter @cli-to-api/gateway test tests/unit/resolver.test.ts

# Verify SQLite schema migration runs cleanly
pnpm --filter @cli-to-api/gateway test tests/unit/sqlite-lifecycle.test.ts
```

## Definition of Done
- `resolver.ts` accurately differentiates installed vs missing executables on both Windows and POSIX without falling back to raw names.
- SQLite migration applies additively without breaking existing test records or database integrity.
- All unit tests in `tests/unit/resolver.test.ts` pass 100%.
