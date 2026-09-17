# Architectural Brainstorm & Contract Proposal: Dynamic CLI Discovery, Phantom Account Prevention, and Universal Adapter Extensibility

**Candidate:** Candidate 3  
**Mode:** `ak-brainstorm --ultra`  
**Target:** `cli-to-api` Core Gateway, Supervisor & Router Subsystems  
**Date:** 2026-09-16  

---

## Executive Summary

`cli-to-api` currently couples adapter YAML declarations directly with account instantiation on boot. When the gateway starts, `apps/gateway/src/index.ts` iterates over every adapter manifest found in `adapters/` (including `opencode-cli.yaml`, `codex-cli.yaml`, `claude-code.yaml`, `grok-cli.yaml`) and unconditionally creates a default account in SQLite and on-disk sandbox directories—even when the corresponding CLI binary is not installed on the host system. This causes three critical system defects:
1. **Phantom Accounts & Ghost Sandboxes:** Accounts for uninstalled tools enter SQLite with `status = "READY"`, creating disk clutter and confusing the load balancer into routing virtual tiers (`auto`, `auto-xhigh`) to non-existent executables, which fail at runtime.
2. **Opaque Binary Presence:** `resolveBinary()` falls back to treating unresolved executable names as valid strings, leaving the registry, database, and Web Console blind to whether a CLI is actually present on host `PATH`.
3. **Inflexible Adapter Onboarding:** Adding arbitrary new CLIs (e.g., `omp`, `devin`, `aider`, `openhands`) requires manually creating files in the project root's `adapters/` folder without schema guidance, UI feedback, or runtime binary validation.

Candidate 3 proposes the **Blueprint-Instance Separation Architecture with Reactive Discovery**: decoupling static adapter capability declarations (Blueprints) from credentialed runtime sandboxes (Accounts), backed by an asynchronous binary prober, dynamic model catalog filtering, and a multi-path universal adapter onboarding engine.

---

## 1. Outcome

The gateway transitions from an eager, static seeding model to an **asynchronous, reactive capability-discovery engine**:

```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                                      ADAPTER BLUEPRINT LAYER                                      |
|  Bundled Blueprints (`./adapters/*.yaml`)  +  User Blueprints (`$DATA_DIR/adapters/*.yaml`)       |
|  (codex-cli, opencode-cli, claude-code, grok-cli, devin-cli, omp-cli, custom-cli)                |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
                                                  │
                                                  ▼
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    DYNAMIC DISCOVERY ENGINE                                       |
|  • Probes host PATH, PATHEXT (.cmd/.ps1/.exe), Scoop, pnpm, npm, Cargo, Homebrew                  |
|  • Resolves binary presence (isInstalled: true/false), detected version, and executable path      |
|  • Dynamic watchers: Periodic 30s background sweep + fs.watch on adapter dirs + POST /api/probe   |
|  • Emits SSE events: `adapter:discovered`, `adapter:missing`, `adapter:registered`                |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
                         │                                                   │
        [isInstalled = true]                                [isInstalled = false]
                         ▼                                                   ▼
+─────────────────────────────────────────+         +───────────────────────────────────────────────+
|           ACTIVE PROVIDER               |         |             DORMANT BLUEPRINT                 |
|  • Status: `INSTALLED`                  |         |  • Status: `NOT_INSTALLED`                    |
|  • Explicit or auto-provisioned Account |         |  • ZERO accounts created (NO phantom rows)    |
|  • Directory sandbox provisioned        |         |  • ZERO filesystem directories created        |
|  • Projected into `GET /v1/models`      |         |  • Excluded from `GET /v1/models`             |
|  • Enters `auto-*` load-balancer pools  |         |  • Excluded from `auto-*` virtual tier pools  |
+─────────────────────────────────────────+         +───────────────────────────────────────────────+
```

1. **Zero Phantom Accounts & Sandboxes:** The gateway never inserts account rows or provisions filesystem directories for CLIs whose executables cannot be resolved on host disk.
2. **Clean Discovery State:** Adapters expose discrete lifecycle states: `INSTALLED` (binary located and verified), `NOT_INSTALLED` (blueprint known, executable absent from `PATH`), or `DEGRADED` (binary present but non-executable or probe failed).
3. **Dynamic Catalog & Routing Integrity:** `GET /v1/models` and virtual tier routes (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`) strictly query only adapters with `isInstalled = true` and at least one healthy account. Namespaced requests to uninstalled adapters immediately fail with an explicit 404/400 without attempting process spawn.
4. **Universal CLI Adapter Onboarding:** Users can add CLIs like `omp`, `devin`, or proprietary internal AI CLIs via:
   - File drop in `$DATA_DIR/adapters/*.yaml` (persisting across updates).
   - REST API (`POST /api/adapters`).
   - Web Console UI with interactive scaffolding, pre-validation test probe, and one-click account creation.

---

## 2. Constraints

1. **Platform & Shell Agnosticism:** Discovery and execution must operate identically across Windows 11 (PowerShell, `cmd.exe`, `PATHEXT`, `.bat`/`.cmd`/`.ps1`, npm/pnpm/Scoop paths) and POSIX systems (Linux, macOS, system `PATH`, Homebrew).
2. **Zero Zombie Guarantee ($\le 200\text{ms}$):** Any probe commands (e.g., version checks) or CLI completions must be strictly contained within Win32 Job Objects (`KILL_ON_JOB_CLOSE`) or POSIX Process Groups (`setsid` + `-pgid` `SIGKILL`). Probes must enforce a hard $\le 2{,}000\text{ms}$ timeout.
3. **OpenAI Protocol Compliance:** No non-standard error codes or payloads may be sent to `/v1/chat/completions` or `/v1/models`. Uninstalled or missing tools must return standardized OpenAI JSON error envelopes (`invalid_request_error`).
4. **Boot Performance & Non-Blocking I/O:** Discovery probes must not freeze daemon startup. Database migrations and HTTP ingress must start immediately; binary probing executes asynchronously or synchronously via cached stats ($\le 15\text{ms}$ total overhead for 10 adapters).
5. **Database Migration Safety:** Changes to SQLite WAL schema must use additive migrations that preserve existing valid accounts, history, and metrics.
6. **Local-First Isolation:** No telemetry or external cloud checks during discovery. All probes must be local host inspections.

---

## 3. Non-goals

1. **Package Management & Auto-Installation:** The gateway will not invoke package managers (`npm i -g`, `brew install`, `winget`, `pip`) to install third-party CLIs automatically. Installation remains the user's responsibility.
2. **Proprietary Protocol Reverse Engineering:** The gateway does not bypass CLIs to speak directly to undocumented backend cloud APIs; it remains an agnostic CLI bridge utilizing stdin/stdout/PTY transports.
3. **Arbitrary Remote Code Execution (RCE):** The gateway is not an arbitrary bash runner. Adapters require explicit Zod-validated schemas defining immutable flags and arguments.
4. **Multi-Tenant Public Cloud Hosting:** The architecture is strictly scoped for local workstations, developer machines, and private LAN dev-servers.
5. **Native GUI Terminal Replacement:** The in-browser WebShell is scoped for interactive CLI logins (`claude login`, `codex login`) and sandbox inspection, not replacing full desktop terminal emulators.

---

## 4. Acceptance Criteria (Concrete, Verifiable)

### AC-1: Zero Startup Phantom Accounts & Disk Footprint
- **Given** adapter files for `codex-cli.yaml`, `opencode-cli.yaml`, `claude-code.yaml`, and `grok-cli.yaml` in `adapters/`.
- **When** the gateway boots on a system where only `codex` is installed on `PATH`.
- **Then:**
  1. `accounts` table in SQLite contains only accounts for `codex-cli` (or 0 accounts if user has not yet initialized one).
  2. Exactly 0 rows exist in `accounts` for `opencode-cli`, `claude-code`, or `grok-cli`.
  3. No directory path `$DATA_DIR/sandboxes/opencode-cli` exists on the filesystem.
  4. Gateway logs explicitly state: `[Discovery] opencode-cli: executable 'opencode' not found on PATH. Blueprint registered as NOT_INSTALLED.`

### AC-2: Binary Detection & Adapter State Contract
- **Given** `resolveBinary(executable)` is called.
- **When** the executable exists on disk (including `.cmd`, `.bat`, `.ps1` on Windows or POSIX executable in `PATH`).
- **Then** it returns `{ isInstalled: true, resolvedPath: string, spawnExecutable: string, spawnPrefixArgs: string[] }`.
- **When** the executable does not exist on disk.
- **Then** it returns `{ isInstalled: false, resolvedPath: null, spawnExecutable: "", spawnPrefixArgs: [] }`.
- **And** `GET /api/adapters` returns records with `{ id, name, isInstalled: boolean, status: "INSTALLED" | "NOT_INSTALLED" | "DEGRADED", resolvedPath: string | null }`.

### AC-3: Strict Model Catalog & Routing Isolation
- **Given** `opencode-cli` is registered as `NOT_INSTALLED`.
- **When** a client issues `GET /v1/models`.
- **Then** none of `opencode`'s models (`gpt-5.6-asta`, `deepseek-r1`, `qwen-2.5-coder` under provider `opencode`) appear in the response payload.
- **When** a client issues `POST /v1/chat/completions` with `{ "model": "auto-xhigh" }`.
- **Then** the load balancer strictly considers candidate models from installed providers with healthy accounts; it never dispatches to `opencode`.
- **When** a client issues `POST /v1/chat/completions` with `{ "model": "opencode/gpt-5.6-asta" }`.
- **Then** the gateway responds immediately with HTTP 404/400 in $\le 15\text{ms}$ with payload:
  ```json
  {
    "error": {
      "message": "Provider 'opencode' is not installed or available on this system.",
      "type": "invalid_request_error",
      "param": "model",
      "code": "adapter_not_installed"
    }
  }
  ```
- **And** zero child processes are spawned, and no slot semaphores are locked.

### AC-4: Dynamic Hot-Discovery & Re-Probe
- **Given** `opencode` is initially `NOT_INSTALLED`.
- **When** the user installs `opencode` on the host and invokes `POST /api/adapters/probe` (or waits $\le 30\text{s}$ for the background discovery sweep).
- **Then:**
  1. The adapter status transitions to `INSTALLED` with its verified `resolvedPath`.
  2. An SSE event `adapter:status_changed` is broadcast over `/api/events` with `{ adapterId: "opencode-cli", isInstalled: true }`.
  3. The Web Console UI dynamically updates the status pill from gray `NOT INSTALLED` to green `INSTALLED (NEEDS ACCOUNT)`.

### AC-5: Universal Adapter Registration (`omp`, `devin`, Arbitrary CLIs)
- **Given** a new adapter configuration file `devin-cli.yaml` or `omp-cli.yaml` placed in `$DATA_DIR/adapters/` or submitted via `POST /api/adapters`.
- **When** submitted with valid schema:
  - Validated by `AdapterConfigSchema` in $\le 100\text{ms}$.
  - Stored in SQLite `adapters` and loaded into `globalAdapterRegistry`.
  - Probed against host `PATH`.
- **Then:**
  - If binary is installed, it is immediately available for account creation and model routing.
  - If binary is not installed, it registers as `NOT_INSTALLED` without error or phantom accounts.

### AC-6: Guarded Account Creation API
- **Given** an adapter with `isInstalled = false`.
- **When** an API client attempts `POST /api/accounts` with `{ "adapterId": "opencode-cli", ... }`.
- **Then** the API rejects the request with HTTP 400:
  ```json
  {
    "error": "Cannot provision account for 'opencode-cli': executable 'opencode' is not installed on host PATH."
  }
  ```
- **Unless** explicitly invoked with `{ "force": true }` for manual offline provisioning.

---

## 5. Compared Approaches

| Dimension | Approach A: Runtime JIT Lazy Probe | Approach B: Blueprint-Instance Separation with Reactive Discovery (Recommended) | Approach C: Containerized Sidecar Virtualization (Docker/WASI) |
| :--- | :--- | :--- | :--- |
| **Architectural Model** | Pure on-demand probing; accounts generated at runtime when first request arrives. | Decoupled blueprints vs. runtime instances; continuous local discovery engine. | Every CLI packaged and run inside a container/microVM sidecar. |
| **Phantom Account Prevention** | No accounts created until first request hits the gateway. | Adapters tracked as blueprints; accounts created strictly for verified installed CLIs. | Containers spun up on demand; no host accounts. |
| **Catalog Accuracy (`GET /v1/models`)** | Broken or slow: must probe entire filesystem on every catalog request, or return phantom models. | High: catalog is a projected view of `installed = true && accounts > 0`. | Predictable: queries container registry or images. |
| **OAuth / Interactive CLI Support** | **Fails:** CLIs requiring pre-login (`codex login`, `claude login`) crash when invoked JIT. | **Optimal:** WebShell operates on provisioned accounts of installed CLIs before routing. | Difficult: passing interactive OAuth tokens and browser callbacks through containers is painful. |
| **Extensibility (`omp`, `devin`)** | Drop file; discovery deferred to first error. | Drop file or API post; validated immediately with real-time UI probe feedback. | User must build or pull a custom Docker container image for every CLI. |
| **Resource Overhead** | Very low, but high tail latency on first execution. | Extremely low ($\le 2\text{MB}$ RAM, sub-millisecond route checks from memory cache). | Extremely high ($\ge 1.5\text{GB}$ RAM, Docker daemon requirement, gigabytes of disk). |
| **Primary Assumption** | CLIs are stateless and do not require interactive user authentication prior to prompt execution. | Executable availability on host disk is the required precondition for account viability. | Users are willing and able to run Docker/WASI daemons on their workstation. |
| **First Failure Condition** | Breaks immediately on OAuth-authenticated CLIs (`codex`, `claude`) because JIT accounts have no auth sessions. | A CLI binary is installed as a dummy script/stub that exits with failure during execution. | Gateway fails completely on machines lacking Docker Desktop or in restricted environments. |

---

## 6. Recommended Direction & Rationale

### 6.1 Architectural Core: Blueprint vs. Instance Separation

The fundamental flaw in the existing codebase is treating the presence of an `adapter.yaml` file as an instruction to create an account. The architecture must separate:
- **Adapter Blueprint:** An immutable definition of capabilities, CLI flags, execution modes, and models.
- **Provider Status:** The operational availability of that blueprint on the host machine (`INSTALLED`, `NOT_INSTALLED`, `DEGRADED`).
- **Account Instance:** An authenticated, sandboxed runtime identity possessing a distinct `$DATA_DIR/sandboxes/{adapter}/{account}` directory, environment variables, and concurrency semaphore.

#### Startup Refactor in `apps/gateway/src/index.ts`
Replace the blind account creation loop with discovery-driven initialization:

```ts
// 1. Run database migrations (including new columns on adapters)
runMigrations();

// 2. Load all declarative adapter blueprints (built-in + user dataDir)
const loadedAdapters = await loadAndSyncAllAdapters([builtinAdaptersDir, userAdaptersDir]);
globalAdapterRegistry.registerAll(loadedAdapters);

// 3. Run Async Discovery Prober across all blueprints
const discoveryResults = await globalBinaryProber.probeAll(loadedAdapters);

// 4. Update database adapter statuses
await syncDiscoveryResultsToDb(discoveryResults);

// 5. Auto-provision default accounts ONLY for INSTALLED adapters that have zero accounts
for (const adapter of loadedAdapters) {
  const probe = discoveryResults.get(adapter.config.id);
  if (!probe?.isInstalled) {
    console.log(`[Discovery] Skipping account provisioning for '${adapter.config.id}' (CLI not installed)`);
    continue;
  }

  const existingAccounts = await db.select().from(accounts).where(eq(accounts.adapterId, adapter.config.id));
  if (existingAccounts.length === 0) {
    const defaultAccId = `${adapter.config.id}-acc-01`;
    const sandbox = await provisionSandbox({
      dataDir,
      adapterId: adapter.config.id,
      accountId: defaultAccId,
    });

    await db.insert(accounts).values({
      id: defaultAccId,
      adapterId: adapter.config.id,
      name: `Default ${adapter.config.name} Account`,
      sandboxDir: sandbox.sandboxDir,
      status: "READY",
      maxSlots: adapter.config.concurrency.max_concurrent_per_account,
    });
    console.log(`[Discovery] Auto-provisioned verified account: ${defaultAccId}`);
  }
}
```

---

### 6.2 Binary Resolver & Prober Enhancement

#### Schema Migration (`apps/gateway/src/db/schema.ts` & `migrate.ts`)
Add status and detection metadata to the `adapters` table:
```ts
export const adapters = sqliteTable("adapters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  executable: text("executable").notNull(),
  resolvedPath: text("resolved_path"),
  executionMode: text("execution_mode").notNull().default("pipe"),
  configJson: text("config_json").notNull(),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  
  // New Discovery Columns
  isInstalled: integer("is_installed", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("NOT_INSTALLED"), // "INSTALLED" | "NOT_INSTALLED" | "DEGRADED"
  detectedVersion: text("detected_version"),
  lastProbedAt: integer("last_probed_at"),
  probeError: text("probe_error"),
  
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at").notNull().default(sql`(strftime('%s', 'now'))`),
});
```

#### Robust Discovery Engine (`apps/gateway/src/adapters/prober.ts`)
Refactor `resolver.ts` and introduce `BinaryProber`:
1. **Accurate File Resolution:** `resolveBinary(executable)` must return `null` if the binary does not exist on disk, rather than falling back to the raw name.
2. **Multi-Location Search:** Probes system `PATH`, Windows package managers (`%LOCALAPPDATA%\pnpm`, `%APPDATA%\npm`, `%USERPROFILE%\.cargo\bin`, `%LOCALAPPDATA%\Microsoft\WinGet\Links`, `C:\ProgramData\chocolatey\bin`, `C:\Users\<User>\scoop\shims`), and Unix standard paths (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.cargo/bin`, `~/.local/bin`).
3. **Safe Probe Execution:** When verifying a binary, optionally execute `<executable> --version` wrapped in a child process with a hard $\le 2{,}000\text{ms}$ timeout, terminating cleanly via Win32 Job Object or POSIX process group to extract detected version and confirm execution viability without side effects.

---

### 6.3 Projected Model Catalog & Load Balancer Guarding

#### Model Catalog Projection (`apps/gateway/src/router/model-catalog.ts`)
The catalog returned to OpenAI clients (`GET /v1/models`) must represent only **real, dispatchable capabilities**:

```ts
public getOpenAiModelsList(): { object: "list"; data: OpenAiModelObject[] } {
  const list: OpenAiModelObject[] = [];
  const now = Math.floor(Date.now() / 1000);

  // 1. Virtual Tiers: Only register a tier if at least one candidate provider is installed & has healthy accounts
  const tiers: ModelTier[] = ["low", "medium", "high", "xhigh"];
  for (const tier of tiers) {
    const candidateModels = this.getModelsByTier(tier);
    const hasViableProvider = candidateModels.some((m) => {
      const adapter = this.registry.getAdapter(m.adapterId);
      return adapter?.isInstalled && adapter.hasHealthyAccounts;
    });

    if (hasViableProvider) {
      list.push(this.createModelObject(`auto-${tier}`, now, "system", { ... }));
    }
  }

  // 2. Concrete Adapter Models: Filter out uninstalled adapters or accounts = 0
  for (const adapter of this.registry.getAllAdapters()) {
    if (!adapter.isInstalled || !adapter.hasHealthyAccounts) {
      continue; // Never expose models for CLIs that cannot be executed
    }
    for (const m of adapter.config.models) {
      list.push(this.createModelObject(`${adapter.config.id}/${m.id}`, now, adapter.config.id, { ... }));
      if (m.is_default) {
        list.push(this.createModelObject(m.id, now, adapter.config.id, { ... }));
      }
    }
  }

  return { object: "list", data: list };
}
```

#### Load Balancer Guard (`apps/gateway/src/router/load-balancer.ts`)
Add instant pre-flight validation in `resolveTarget`:
- If `requestedModel` targets a specific namespace (e.g., `opencode/gpt-5.6-asta`), check `adapter.isInstalled`. If `false`, throw an immediate `AdapterNotInstalledError(providerId)`.
- The route handler catches this and returns HTTP 404 with standard OpenAI payload.

---

### 6.4 Universal Adapter Onboarding (`omp`, `devin`, Custom CLIs)

To make adding CLIs effortless without requiring changes to the core gateway repository:

1. **Dual Directory Resolution (`apps/gateway/src/config/paths.ts`):**
   - Shipped Bundled Directory: `./adapters/` (contains tested reference templates: `codex-cli.yaml`, `claude-code.yaml`, `opencode-cli.yaml`, `grok-cli.yaml`, `devin-cli.yaml`, `omp-cli.yaml`).
   - User Custom Directory: `$DATA_DIR/adapters/` (e.g. `~/.cli-to-api/adapters/` or `./data/adapters/`).
   - Adapters in the user directory can override or extend built-in blueprints and persist across `git pull` or container updates.

2. **Hot Reload & Filesystem Watcher (`apps/gateway/src/adapters/watcher.ts`):**
   - Gateway attaches `fs.watch` to both adapter directories.
   - Adding, editing, or deleting a `.yaml` file triggers a debounced (300ms) re-load, re-probe, and DB sync without restarting the server.

3. **Admin Management REST API (`apps/gateway/src/api/routes/admin-adapters.ts`):**
   - `GET /api/adapters`: Lists all blueprints, their install status, detected paths, and associated account counts.
   - `POST /api/adapters`: Uploads or posts a new YAML/JSON configuration. Validates schema, tests binary resolution, writes file to `$DATA_DIR/adapters/`, and syncs to registry.
   - `POST /api/adapters/probe`: Forces an immediate re-probe of all adapters and broadcasts status changes over SSE.
   - `POST /api/adapters/:id/probe`: Probes a single adapter.
   - `DELETE /api/adapters/:id`: Deletes a custom adapter (fails if active accounts exist unless `cascade: true`).

4. **Example Blueprints for Devin and OMP:**

```yaml
# adapters/devin-cli.yaml
id: "devin-cli"
name: "Devin Autonomous AI CLI"
version: "1.0.0"
executable: "devin"
execution_mode: "pty"  # Devin operates with interactive progress display

models:
  - id: "devin-v1"
    name: "Devin Core Engineer"
    tier: "xhigh"
    context_window: 200000
    cost_weight: 15
    is_default: true

invocation:
  args_template:
    - "prompt"
    - "--stream"
    - "{prompt}"
  prompt_transport: "argv"
  prompt_threshold_chars: 4000
  working_dir_template: "{account_dir}/workspace"
  timeout_seconds: 600

environment_isolation:
  home_dir_override: true
  xdg_override: true
  env_overrides:
    DEVIN_NON_INTERACTIVE: "1"

output_parser:
  type: "json_lines"
  strip_ansi: true
  resolve_carriage_return: true

error_handling:
  rate_limit_patterns:
    - pattern: "rate limit reached|credit balance depleted"
      cooldown_seconds_default: 3600
      dynamic_extractor: false

concurrency:
  max_concurrent_per_account: 1
```

```yaml
# adapters/omp-cli.yaml
id: "omp-cli"
name: "OpenMultiPrompt / OMP CLI"
version: "1.0.0"
executable: "omp"
execution_mode: "pipe"

models:
  - id: "omp-fast"
    name: "OMP Fast Worker"
    tier: "low"
    context_window: 64000
    cost_weight: 1
    is_default: true
  - id: "omp-reasoning"
    name: "OMP Reasoning Core"
    tier: "high"
    context_window: 128000
    cost_weight: 4
    is_default: false

invocation:
  args_template:
    - "--model"
    - "{model}"
    - "-q"
    - "{prompt}"
  args_template_file:
    - "--model"
    - "{model}"
    - "--file"
    - "{prompt_file}"
  prompt_transport: "auto"
  prompt_threshold_chars: 4000
  working_dir_template: "{account_dir}/workspace"
  timeout_seconds: 300

environment_isolation:
  home_dir_override: true
  xdg_override: true
  env_overrides: {}

output_parser:
  type: "regex_stream"
  strip_ansi: true
  resolve_carriage_return: true
  chunk_regex: "(?s)(.*)"

error_handling:
  rate_limit_patterns:
    - pattern: "throttled: retry in (\\d+s|\\d+m)"
      cooldown_seconds_default: 1800
      dynamic_extractor: true

concurrency:
  max_concurrent_per_account: 2
```

---

### 6.5 Web Console Experience (UI/UX Pro Max)

1. **Adapter Registry & Discovery View:**
   - Adapters are grouped visually:
     - **Installed & Active:** Green glow pill (`INSTALLED`), displaying resolved path, account count, and active slots.
     - **Installed (Needs Account):** Amber pill, offering a 1-click `Provision Default Account` button that launches the WebShell for initial OAuth login.
     - **Not Installed:** Dimmed slate card with a `Copy Install Command` button (e.g., `npm i -g @anthropic-ai/claude-code` or `curl ...`) and a `Re-Probe` button.
2. **Add Custom CLI Studio Modal:**
   - Built-in YAML editor with syntax highlighting, schema error diagnostics, and a `Test Binary Resolution` button that probes `PATH` before saving.
   - Template dropdown to prefill standard patterns: "Pipe Stream (e.g. Codex)", "Interactive PTY (e.g. Claude/Devin)", "JSON Lines / NDJSON".
3. **Clean Accounts Matrix:**
   - Displays only genuine accounts. Phantom rows are completely eliminated.

---

## 7. Implementation File Map & Delivery Sequence

```
apps/gateway/src/
├── adapters/
│   ├── resolver.ts         [MODIFY] Return ResolvedBinary with isInstalled: boolean & null fallback
│   ├── prober.ts           [CREATE] BinaryProber with path traversal and cached status
│   ├── watcher.ts          [CREATE] fs.watch dynamic loader for user adapters
│   ├── loader.ts           [MODIFY] Multi-dir support (builtin + user), no blind DB account insert
│   └── registry.ts         [MODIFY] Expose isInstalled filters for catalog and tiers
├── db/
│   ├── schema.ts           [MODIFY] Add isInstalled, status, detectedVersion, lastProbedAt to adapters
│   └── migrate.ts          [MODIFY] Run additive migration for new adapter columns
├── router/
│   ├── model-catalog.ts    [MODIFY] Filter /v1/models by adapter.isInstalled && healthyAccounts > 0
│   └── load-balancer.ts    [MODIFY] Guard target resolution with AdapterNotInstalledError (HTTP 404)
├── api/routes/
│   ├── admin-adapters.ts   [MODIFY] Add /api/adapters/probe, CRUD endpoints for custom adapters
│   └── admin-accounts.ts   [MODIFY] Guard account creation against uninstalled adapters (force flag)
└── index.ts                [MODIFY] Refactor bootstrap to probe before provisioning accounts
```

This design provides a deterministic, zero-clutter substrate that guarantees stability for existing tools while welcoming arbitrary new AI CLIs into the `cli-to-api` ecosystem.
