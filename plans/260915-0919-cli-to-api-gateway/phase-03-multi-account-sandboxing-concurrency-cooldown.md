---
phase: 3
title: "Multi-Account Directory Sandboxing, Concurrency Semaphores & Dynamic Cooldown Engine"
status: pending
priority: P1
effort: "2d"
dependencies: ["phase-01-substrate-engine-sqlite-wal-adapter-schema", "phase-02-process-supervisor-job-objects-stream-sanitizer"]
---

# Phase 3: Multi-Account Directory Sandboxing, Concurrency Semaphores & Dynamic Cooldown Engine

## Goal
Implement directory jail sandboxing to completely isolate multiple accounts of the same CLI on disk (`$DATA_DIR/sandboxes/{adapterId}/{accountId}`), build an in-memory concurrency semaphore to enforce single-worker slots per account, and establish an automated cooldown state machine with dynamic reset timers.

## Files to Create / Modify
- Create: `apps/gateway/src/supervisor/sandbox.ts`
- Create: `apps/gateway/src/router/account-pool.ts`
- Create: `apps/gateway/src/router/cooldown-tracker.ts`
- Create: `apps/gateway/src/api/routes/admin-accounts.ts`
- Create: `tests/unit/sandbox.test.ts`
- Create: `tests/unit/account-pool.test.ts`
- Create: `tests/unit/cooldown-tracker.test.ts`

## Tasks & Steps

### Task 3.1: Account Directory Jail & Environment Sanitization
1. Implement `apps/gateway/src/supervisor/sandbox.ts`:
   - Path resolution: `$DATA_DIR/sandboxes/{adapterId}/{accountId}/`.
   - Create subdirectories: `workspace/`, `tmp/`, `.config/`, `AppData/Roaming/`, `AppData/Local/`.
   - Override environment variables:
     - `HOME` = sandbox path
     - `USERPROFILE` = sandbox path
     - `XDG_CONFIG_HOME` = `$SANDBOX/.config`
     - `APPDATA` = `$SANDBOX/AppData/Roaming`
     - `LOCALAPPDATA` = `$SANDBOX/AppData/Local`
     - `TMPDIR` / `TEMP` / `TMP` = `$SANDBOX/tmp`
   - Explicitly purge parent host credentials from environment:
     - Delete `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CODEX_API_KEY`, `GH_TOKEN`, `GITHUB_TOKEN`.
   - Apply custom adapter environment variable overrides with token substitution (`{sandbox_dir}`, `{account_dir}`, `{workspace_dir}`).

### Task 3.2: Account Concurrency Semaphore
1. Implement `apps/gateway/src/router/account-pool.ts`:
   - Track `activeSlots` and `maxSlots` (default 1) per account.
   - Implement `acquireSlot(accountId): Promise<boolean>`:
     - If `activeSlots < maxSlots`, increment `activeSlots` atomically and return true.
     - Otherwise, return false (or enqueue request in FIFO queue).
   - Implement `releaseSlot(accountId): Promise<void>`:
     - Decrement `activeSlots` atomically.
     - Persist usage metrics to SQLite.

### Task 3.3: Dynamic Cooldown State Machine
1. Implement `apps/gateway/src/router/cooldown-tracker.ts`:
   - When a CLI process exits with a rate limit match (from `rate-limit-detector.ts`):
     - Transition account status to `COOLDOWN`.
     - Set `cooldownUntil = now() + cooldownSeconds`.
     - Record cooldown event in SQLite `cooldown_history`.
     - Schedule internal `setTimeout` timer to auto-transition account back to `READY` upon expiration.
     - Expose `clearCooldown(accountId)` to allow manual administrator overrides from the Web Console.

### Task 3.4: Account Management REST Endpoints
1. Implement `apps/gateway/src/api/routes/admin-accounts.ts`:
   - `GET /api/accounts`: List accounts with status (`READY`, `BUSY`, `COOLDOWN`, `ERROR`), active slots, and cooldown timers.
   - `POST /api/accounts`: Provision a new account and initialize its sandbox jail directories.
   - `POST /api/accounts/:id/reset-cooldown`: Clear cooldown status manually.
   - `DELETE /api/accounts/:id`: Remove account record and safely delete its sandbox directory.

## Todo
- [x] Implement `apps/gateway/src/supervisor/sandbox.ts` with directory jail and env purging
- [x] Implement `apps/gateway/src/router/account-pool.ts` with slot semaphore management
- [x] Implement `apps/gateway/src/router/cooldown-tracker.ts` with auto-recovery timers
- [x] Implement `apps/gateway/src/api/routes/admin-accounts.ts` CRUD endpoints
- [x] Write unit tests for sandbox creation and env isolation
- [x] Write concurrency tests verifying slot semaphores prevent parallel collisions
- [x] Write tests verifying dynamic cooldown transitions and auto-recovery

## Verification
- Run `pnpm --filter @cli-to-api/gateway test tests/unit/sandbox.test.ts` and verify two accounts for the same CLI operate with discrete paths and stripped parent credentials.
- Run `pnpm --filter @cli-to-api/gateway test tests/unit/account-pool.test.ts` and verify account slots block overlapping executions.
- Run `pnpm --filter @cli-to-api/gateway test tests/unit/cooldown-tracker.test.ts` and verify cooldown countdown and auto-recovery back to `READY`.
