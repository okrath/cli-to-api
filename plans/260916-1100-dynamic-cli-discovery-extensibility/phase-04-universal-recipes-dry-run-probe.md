---
phase: 4
title: "Universal Adapter Library, Pre-Bundled Recipes & Dry-Run Probe API"
status: pending
priority: P1
effort: "0.5d"
dependencies: ["phase-01-schema-migration-binary-resolver", "phase-02-discovery-engine-legacy-reconciler"]
---

# Phase 4: Universal Adapter Library, Pre-Bundled Recipes & Dry-Run Probe API

## Goal
Expand the declarative adapter library with pre-bundled production recipes for `omp-cli.yaml` and `devin-cli.yaml`, implement dual-directory loading (`./adapters` and `$DATA_DIR/adapters`), and provide administrative REST endpoints to probe, scan, and safely test custom adapter definitions before production activation.

---

## Detailed Technical Context & Requirements

1. **User Requirement:**
   The user explicitly requested: "tôi mong muốn là user cài những cli khác, như omp, devin, thì cũng có thể sử dụng được" (I want users installing other CLIs like `omp`, `devin` to also be able to use them).

2. **Dual-Directory Storage:**
   - Shipped reference recipes: `./adapters/*.yaml` (read-only / repository-managed).
   - User custom recipes: `$DATA_DIR/adapters/*.yaml` (persists across git updates).
   - If a custom file shares an ID with a shipped recipe, the custom file overrides it.

3. **Dry-Run Probe API:**
   Before committing a newly written adapter YAML to disk, users or the Web UI need to verify:
   - Does the executable exist on PATH?
   - Does `--version` or a test prompt execute without crashing?
   - What is the execution latency and output format?
   This is exposed via `POST /api/adapters/probe`.

---

## Tasks Breakdown

### Task 4.1: Author Pre-Bundled Recipes (`adapters/omp-cli.yaml` & `adapters/devin-cli.yaml`)
1. Create `adapters/omp-cli.yaml`:
   - Executable: `omp`
   - Execution mode: `pipe`
   - Models: `omp-fast` (tier: `low`), `omp-reasoning` (tier: `high`, default: true)
   - Invocation: `args_template: ["--model", "{model}", "-q", "{prompt}"]`, `prompt_transport: "auto"`
   - Output parser: `regex_stream`, `strip_ansi: true`
   - Rate limit regex: `"throttled: retry in (\\d+s|\\d+m)"`
2. Create `adapters/devin-cli.yaml`:
   - Executable: `devin`
   - Execution mode: `pty`
   - Models: `devin-worker` (tier: `xhigh`, default: true, context_window: 200000)
   - Invocation: `args_template: ["prompt", "--stream", "{prompt}"]`, `prompt_transport: "auto"`
   - Output parser: `json_lines`, `strip_ansi: true`
   - Rate limit regex: `"rate limit reached|credit balance depleted"`

### Task 4.2: Dual-Directory Adapter Loader (`apps/gateway/src/adapters/loader.ts`)
Update `loadAndSyncAllAdapters()`:
- Scan `./adapters/*.yaml` (shipped library).
- Scan `$DATA_DIR/adapters/*.yaml` (user custom directory; create directory if missing).
- Merge collections with user custom files taking precedence by `adapter.id`.
- Upsert merged list into database via `syncAdapterToDatabase()`.

### Task 4.3: Administrative Discovery & Probe Endpoints (`apps/gateway/src/api/routes/admin-adapters.ts`)
Implement REST endpoints:
1. `GET /api/adapters`:
   - Returns list of all known adapters with discovery fields: `{ id, name, executable, resolvedPath, isInstalled, status, detectedVersion, lastProbedAt, isCustom, modelsCount, accountsCount }`.
2. `POST /api/adapters/scan`:
   - Re-evaluates binary resolution across all adapters against current host PATH.
   - Synchronizes database records and triggers reconciler.
   - Broadcasts SSE event `adapter:scanned` to connected consoles.
   - Returns `{ scanned: number, installed: number, uninstalled: number }`.
3. `POST /api/adapters/probe`:
   - Accepts draft YAML or JSON config payload in request body.
   - Validates against `AdapterConfigSchema` (Zod).
   - Tests binary resolution on disk.
   - If installed, executes bounded version probe ($\le 1.5\text{s}$) under Job Object.
   - Returns `{ valid: true, isInstalled: boolean, resolvedPath: string | null, detectedVersion: string | null, latencyMs: number }`.
4. `POST /api/adapters`:
   - Accepts new adapter YAML/JSON.
   - Validates schema, writes to `$DATA_DIR/adapters/{id}.yaml`.
   - Re-registers in `globalAdapterRegistry` and reconciles.
5. `POST /api/adapters/cleanup-orphans`:
   - Invokes `reconcileLegacyAccounts()`, manually clearing orphan accounts for missing CLIs.

---

## Verification Commands
```bash
# Verify YAML parsing and schema validation
pnpm --filter @cli-to-api/gateway test tests/unit/resolver.test.ts

# Test mock custom adapter registration
pnpm --filter @cli-to-api/gateway test tests/e2e/acceptance.test.ts
```

## Definition of Done
- `omp-cli.yaml` and `devin-cli.yaml` are validated and registered as dormant blueprints if binaries are missing, or active if installed.
- Dual-directory loading seamlessly reads both `./adapters` and `$DATA_DIR/adapters`.
- `POST /api/adapters/probe` returns accurate diagnostic metrics in $<2000\text{ms}$.
