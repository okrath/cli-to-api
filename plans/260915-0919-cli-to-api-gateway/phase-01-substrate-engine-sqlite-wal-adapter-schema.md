---
phase: 1
title: "Substrate Engine, SQLite WAL Persistence, Declarative Adapter Schema & Windows PATHEXT Resolver"
status: pending
priority: P1
effort: "2d"
dependencies: []
---

# Phase 1: Substrate Engine, SQLite WAL Persistence, Declarative Adapter Schema & Windows PATHEXT Resolver

## Goal
Establish the monorepo foundation, initialize SQLite in Write-Ahead Log (WAL) mode via `better-sqlite3` and `Drizzle ORM`, implement the declarative `adapter.yaml` validation engine, and build the Windows `PATHEXT` binary resolution mechanism. This delivers the resilient data persistence and binary discovery foundation required by all downstream components.

## Files to Create / Modify
- Create: `package.json` (root monorepo workspace)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `apps/gateway/package.json`
- Create: `apps/gateway/tsconfig.json`
- Create: `apps/gateway/src/config/env.ts`
- Create: `apps/gateway/src/config/paths.ts`
- Create: `apps/gateway/src/db/schema.ts`
- Create: `apps/gateway/src/db/index.ts`
- Create: `apps/gateway/src/db/migrate.ts`
- Create: `apps/gateway/src/adapters/schema.ts`
- Create: `apps/gateway/src/adapters/resolver.ts`
- Create: `apps/gateway/src/adapters/loader.ts`
- Create: `apps/gateway/src/adapters/registry.ts`
- Create: `adapters/codex-cli.yaml`
- Create: `adapters/opencode-cli.yaml`
- Create: `adapters/claude-code.yaml`
- Create: `adapters/grok-cli.yaml`
- Create: `tests/unit/resolver.test.ts`

## Tasks & Steps

### Task 1.1: Monorepo & TypeScript Configuration
1. Initialize root `package.json` with scripts: `dev`, `build`, `test`, `start`, `lint`.
2. Configure `pnpm-workspace.yaml` defining workspaces: `apps/*`.
3. Configure `tsconfig.base.json` with strict mode, target `ES2022`, module `NodeNext`, `moduleResolution: NodeNext`.

### Task 1.2: Environment Configuration & Path Resolver
1. Implement `apps/gateway/src/config/env.ts` with Zod schema:
   - `PORT`: number (default 8080)
   - `HOST`: string (default "0.0.0.0")
   - `DATA_DIR`: string (default "./data")
   - `ADMIN_TOKEN`: string (optional, auto-generated if missing)
   - `DEFAULT_API_KEY`: string (default "sk-cta-dev")
   - `LOG_LEVEL`: string (default "info")
2. Implement `apps/gateway/src/config/paths.ts` calculating deterministic paths for `sandboxesDir`, `dbFile`, `adaptersDir`, `tempDir`.

### Task 1.3: SQLite Engine (WAL Mode) & Drizzle ORM Schema
1. Define relational schema in `apps/gateway/src/db/schema.ts`:
   - `adapters`: `id`, `name`, `version`, `executable`, `resolvedPath`, `executionMode`, `configJson`, `isEnabled`, timestamps.
   - `accounts`: `id`, `adapterId`, `name`, `sandboxDir`, `status` (`READY`, `BUSY`, `COOLDOWN`, `ERROR`), `activeSlots`, `maxSlots`, `cooldownUntil`, `cooldownReason`, `totalRequests`, `failedRequests`, `avgLatencyMs`.
   - `modelAliases`: `alias`, `targetModel`, `description`.
   - `cooldownHistory`: `id`, `accountId`, `reason`, `cooldownSeconds`, `startedAt`, `expiresAt`.
2. Implement database connection in `apps/gateway/src/db/index.ts` with `better-sqlite3`:
   - Enforce `PRAGMA journal_mode = WAL;`
   - Enforce `PRAGMA busy_timeout = 5000;`
   - Enforce `PRAGMA synchronous = NORMAL;`
   - Enforce `PRAGMA foreign_keys = ON;`
3. Implement `apps/gateway/src/db/migrate.ts` executing `CREATE TABLE IF NOT EXISTS` statements on startup.

### Task 1.4: Declarative Adapter Specification (Zod Schema)
1. In `apps/gateway/src/adapters/schema.ts`, define strict Zod schema:
   - `id`: kebab-case string (e.g. `codex-cli`, `opencode-cli`)
   - `name`: human readable name
   - `version`: semantic version string
   - `executable`: binary name or path
   - `execution_mode`: enum `['pty', 'pipe']`
   - `models`: array of `{ id, name, tier: 'low'|'medium'|'high'|'xhigh', context_window, cost_weight }`
   - `invocation`: `{ args_template, args_template_file, prompt_transport, working_dir_template, timeout_seconds }`
   - `environment_isolation`: `{ home_dir_override, xdg_override, env_overrides }`
   - `output_parser`: `{ type: 'regex_stream'|'json_lines'|'raw_text', strip_ansi, resolve_carriage_return, chunk_regex }`
   - `error_handling`: `{ rate_limit_patterns: [{ pattern, cooldown_seconds_default, dynamic_extractor }] }`
   - `concurrency`: `{ max_concurrent_per_account }`

### Task 1.5: Windows PATHEXT Binary Resolver (CVE-2024-27980 Safe)
1. Implement `apps/gateway/src/adapters/resolver.ts`:
   - Inspect `process.platform === "win32"`.
   - Scan `PATH` plus `PATHEXT` (`.COM;.EXE;.BAT;.CMD;.PS1`).
   - Include global package manager paths: `%APPDATA%/npm`, `%LOCALAPPDATA%/pnpm`, `%USERPROFILE%/.cargo/bin`.
   - On Windows, wrap `.cmd` and `.bat` scripts with `cmd.exe /d /s /c` to prevent Node.js 22 `EINVAL` exceptions.
   - Wrap `.ps1` scripts with `powershell -ExecutionPolicy Bypass -File`.
   - Return `{ resolvedPath, isWindowsScript, isPowerShellScript, spawnExecutable, spawnPrefixArgs }`.

### Task 1.6: Adapter Discovery Loader & Registry
1. Implement `apps/gateway/src/adapters/loader.ts`:
   - Scan `adapters/*.yaml`.
   - Parse YAML and validate against `AdapterConfigSchema`.
   - Upsert records into SQLite `adapters` and `models` tables.
2. Implement `apps/gateway/src/adapters/registry.ts`:
   - Maintain fast in-memory map of active adapters and their model tiers for microsecond lookups.
3. Create starter adapter YAML definitions in `adapters/` for `codex-cli`, `opencode-cli`, `claude-code`, and `grok-cli`.

## Todo
- [x] Initialize monorepo workspace files (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`)
- [x] Implement `apps/gateway/src/config/env.ts` & `paths.ts`
- [x] Implement `apps/gateway/src/db/schema.ts`, `index.ts`, `migrate.ts` with SQLite WAL mode
- [x] Implement `apps/gateway/src/adapters/schema.ts` with Zod validation
- [x] Implement `apps/gateway/src/adapters/resolver.ts` with Windows PATHEXT & cmd.exe wrapping
- [x] Implement `apps/gateway/src/adapters/loader.ts` & `registry.ts`
- [x] Create initial adapter manifests: `codex-cli.yaml`, `opencode-cli.yaml`, `claude-code.yaml`, `grok-cli.yaml`
- [x] Write and pass unit tests in `tests/unit/resolver.test.ts`

## Verification
- Run `pnpm install` across workspace with 0 errors.
- Run `pnpm --filter @cli-to-api/gateway test tests/unit/resolver.test.ts` and verify binary resolution passes on current OS.
- Execute `pnpm --filter @cli-to-api/gateway exec tsx src/db/migrate.ts` and verify `data/sqlite.db` is created with WAL mode active (`PRAGMA journal_mode` returns `wal`).
