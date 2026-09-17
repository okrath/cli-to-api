---
phase: 2
title: "Dynamic Discovery Prober, Hot-Reload Watcher & Legacy Phantom Reconciler"
status: pending
priority: P1
effort: "1d"
dependencies: ["phase-01-schema-migration-binary-resolver"]
---

# Phase 2: Dynamic Discovery Prober, Hot-Reload Watcher & Legacy Phantom Reconciler

## Goal
Implement the bounded version prober (`BinaryProber`) that executes `--version` checks under Win32 Job Object containment ($\le 1.5\text{s}$), build the `fs.watch` hot-reloader to detect new YAML manifests on disk, and deploy the `reconciler.ts` startup logic that purges legacy phantom accounts and ghost sandboxes while gating new account creation strictly to verified installed CLIs.

---

## Detailed Technical Context & Requirements

1. **Bootstrap Invariant:**
   `apps/gateway/src/index.ts` lines 23-44 must be replaced. Default accounts (`{adapterId}-acc-01`) and sandboxes must NEVER be created if `adapter.resolvedExecutable.isInstalled === false`.

2. **Legacy Phantom Sweep:**
   Existing developer databases (including `./data/sqlite.db`) already contain phantom accounts (`opencode-acc-1`, `grok-cli-acc-01`) created by earlier runs. If `totalRequests === 0` and the CLI is missing, they must be purged on startup along with their empty sandbox folders. If `totalRequests > 0`, preserve historical metrics but flag account status as `CLI_MISSING`.

3. **Safe Version Probing:**
   When verifying whether an installed tool runs properly, calling `--version` must not hang indefinitely. It must be wrapped in `execa` with a 1,500ms timeout and assigned to a Win32 Job Object / POSIX process group to guarantee child process cleanup.

---

## Tasks Breakdown

### Task 2.1: Implement Bounded Prober (`apps/gateway/src/adapters/prober.ts`)
Create `BinaryProber`:
- Method `probeExecutable(resolved: ResolvedBinary, timeoutMs = 1500): Promise<ProbeResult>`:
  - Spawns `{executable} --version` (or custom probe flag from adapter YAML).
  - Enforces Win32 Job Object `KILL_ON_JOB_CLOSE` or POSIX `setsid`.
  - Captures version output (first 60 characters of stdout/stderr).
  - Returns `{ isHealthy: boolean, detectedVersion: string | null, latencyMs: number, error?: string }`.
  - If process times out or exits non-zero, logs diagnostic warning and returns `isHealthy: false`.

### Task 2.2: Implement Legacy Phantom Reconciler (`apps/gateway/src/adapters/reconciler.ts`)
Create `reconcileLegacyAccounts(loadedAdapters: LoadedAdapter[], dataDir: string): Promise<void>`:
- Read all accounts from SQLite.
- For each account where `adapter.isInstalled === false`:
  - If `totalRequests === 0`:
    - Delete SQLite record from `accounts`.
    - Delete empty sandbox directory `$DATA_DIR/sandboxes/{adapter}/{account}` using `fs.rm(..., { recursive: true, force: true })`.
    - Log: `[Reconciler] Pruned phantom account ${accountId} (CLI not installed).`
  - If `totalRequests > 0`:
    - Update `accounts.status = 'CLI_MISSING'`.
    - Preserve user history and existing session files.

### Task 2.3: Implement Adapter File Watcher (`apps/gateway/src/adapters/watcher.ts`)
Create `initAdapterWatcher(dirs: string[], onReload: () => Promise<void>): () => void`:
- Attaches `fs.watch` to `./adapters` and `$DATA_DIR/adapters`.
- Debounces file events by 300ms to prevent duplicate triggers during atomic writes.
- Calls `onReload()` on `.yaml` or `.yml` additions, modifications, or deletions.
- Returns cleanup function to unwatch handles on gateway shutdown.

### Task 2.4: Gated Bootstrap Refactor (`apps/gateway/src/index.ts`)
Refactor the boot sequence in `index.ts`:
1. Run migrations.
2. Load all adapters from `./adapters` and `$DATA_DIR/adapters`.
3. Run `reconcileLegacyAccounts()`.
4. Iterate over `loadedAdapters`:
   - If `!adapter.resolvedExecutable.isInstalled`:
     - Upsert `adapters` with `isInstalled = false`, `status = 'NOT_INSTALLED'`, `resolvedPath = null`.
     - **DO NOT** create default account or sandbox folder.
   - If `adapter.resolvedExecutable.isInstalled`:
     - Upsert `adapters` with `isInstalled = true`, `status = 'INSTALLED'`, `resolvedPath`.
     - Check if any accounts exist for this adapter in SQLite. If count is 0, call `provisionSandbox()` and insert `{id}-acc-01` with status `READY`.
5. Start adapter file watcher to support hot-reload.

---

## Verification Commands
```bash
# Verify reconciler tests
pnpm --filter @cli-to-api/gateway test tests/unit/reconciler.test.ts

# Verify prober bounded execution
pnpm --filter @cli-to-api/gateway test tests/unit/prober.test.ts

# Verify clean startup behavior
pnpm --filter @cli-to-api/gateway test tests/unit/account-pool.test.ts
```

## Definition of Done
- Clean boot creates accounts and sandboxes strictly for installed tools.
- Legacy phantom accounts with 0 requests are purged automatically.
- Version probing executes safely within $\le 1.5\text{s}$ without hanging or leaving zombie processes.
