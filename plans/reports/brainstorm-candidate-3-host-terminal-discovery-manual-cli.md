# Architectural Brainstorm & Contract Proposal: Host Server Terminal, Reactive Provider Discovery, and Manual CLI Registration

**Candidate:** Candidate 3  
**Mode:** `ak-brainstorm --ultra`  
**Target:** `cli-to-api` Core Gateway, Supervisor, WebShell & Web Console Subsystems  
**Date:** 2026-09-16  

---

## Executive Summary

`cli-to-api` currently exposes an interactive WebShell (`/api/ws/terminal`) that forcibly mounts every terminal session into an isolated directory jail (`provisionSandbox`). While this sandbox isolation is essential for authenticating multi-tenant CLI accounts (`claude login`, `codex login`) without corrupting host profile configs, it creates a fatal catch-22 for platform operators:
1. **Inability to Install Packages from Web Console:** Operators cannot execute `npm i -g @anthropic-ai/claude-code`, `brew install`, `winget`, `scoop`, or `pip` from the web terminal because the sandbox jail rewrites `$HOME`, `%USERPROFILE%`, and `%APPDATA%` to ephemeral sandbox folders and strips path permissions.
2. **Static Boot Probing with No Manual Reload:** The gateway resolves host binaries once at boot. When an administrator installs a new CLI on the host machine or modifies `PATH`, the running daemon remains blind to the change until fully killed and restarted.
3. **Absence of Manual CLI Registration:** When a CLI executable resides outside standard `PATH` (e.g., `/opt/bin/internal-cli` or `D:\Tools\custom-agent.exe`) or uses custom arguments/models, the gateway offers no fallback mechanism to manually register executables, test execution flags, or define model routing parameters.

Candidate 3 proposes the **Dual-Substrate Execution Engine with Reactive Discovery & Custom Studio**:
- **Dual-Substrate WebShell:** Explicit separation of **Account Sandbox Jail** (credential-isolated, sandboxed $HOME) and **Host Server Terminal** (unconfined host shell with token-gated loopback authorization, explicit UI warnings, and process supervisor lifecycle control).
- **Reactive Provider Discovery Engine:** An instant **"Reload & Discover"** action that dynamically interrogates OS environment tables, package manager paths, and active blueprints, streaming differential SSE state changes and re-projecting `/v1/models` in $<500\text{ms}$ with zero daemon restarts.
- **Declarative Manual CLI Studio:** A guided manual registration pipeline that validates arbitrary executable paths, models, and flags against Zod schemas, performs dry-run probes inside Win32 Job Objects / POSIX process groups, and persists custom blueprints in `$DATA_DIR/adapters/`.

---

## 1. Outcome

The gateway transitions to a resilient control plane supporting both unconfined host administration and sandboxed client execution:

```
+──────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    OBSIDIAN CYBER-DECK WEB CONSOLE                                       |
|  [Reload & Discover] ──▶ Re-scans PATH & Blueprints      [Register Custom CLI] ──▶ Manual Config Wizard  |
+──────────────────────────────────────────────────────────────────────────────────────────────────────────+
                                          │                              │
                   ┌──────────────────────┴──────────────┐               │
                   ▼                                     ▼               ▼
+─────────────────────────────────────+   +─────────────────────────────────────+  +──────────────────────+
|          HOST SERVER SHELL          |   |        ACCOUNT SANDBOX JAIL         |  |   MANUAL ADAPTER     |
| • Purpose: Global pkg install       |   | • Purpose: Account CLI login/auth   |  |   REGISTRATION       |
| • Env: Native Host $PATH, $HOME     |   | • Env: Cloned & Jailed $HOME/AppData|  | • Exact bin path     |
| • PWD: Host Home / Project Root     |   | • PWD: $DATA_DIR/sandboxes/{id}/ws  |  | • Custom CLI args    |
| • Border: Crimson/Amber Danger Glow |   | • Border: Slate/Indigo Brand Glow   |  | • Model definitions  |
| • Gate: Auth Token + Loopback Policy|   | • Gate: Standard API Key            |  | • Live Dry-Run Probe |
+─────────────────────────────────────+   +─────────────────────────────────────+  +──────────────────────+
                   │                                     │                             │
                   ▼                                     ▼                             ▼
+──────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                        GATEWAY RUNTIME SUBSTRATE                                         |
|  • Dynamic Binary Prober: Resolves Windows (PATHEXT, Scoop, pnpm, npm) & POSIX (/opt, Homebrew)          |
|  • Blueprint Registry: Builtin (`./adapters/*.yaml`) + Custom (`$DATA_DIR/adapters/*.yaml`)              |
|  • Dynamic Catalog Projection: `/v1/models` updates dynamically without restarting Fastify server        |
|  • Process Supervisor: Win32 Job Objects (KILL_ON_JOB_CLOSE) / POSIX setsid process groups               |
+──────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

1. **Uninhibited Host Server Administration:** Operators can open a dedicated **Host Server Shell** tab in the Web Console to run `npm i -g @anthropic-ai/claude-code`, `brew install`, `pip install aider-chat`, or `cargo install` directly on the host machine.
2. **Deterministic Jail vs Host Demarcation:** The Web Console and Gateway API enforce strict isolation between host administrative sessions and sandboxed account runtime jails, backed by explicit query contracts (`mode=host` vs `mode=sandbox`), distinct visual themes, and token-gated authorization fences.
3. **One-Click Hot Reload & Discovery:** A single button click on the console re-scans host system environment tables and package directories, updates provider installation status (`INSTALLED`, `NOT_INSTALLED`, `DEGRADED`), and re-projects the `/v1/models` catalog in real time.
4. **Resilient Manual Registration Fallback:** Users can manually onboard proprietary or unlisted AI CLIs by entering executable paths, invocation templates, and model metadata, backed by real-time dry-run verification.

---

## 2. Constraints

1. **Access Boundary & RCE Security:** The Host Server Terminal provides shell execution on the host machine. It must **never** be accessible without explicit authorization. It must default to disabled unless explicitly enabled via server config (`CLI_TO_API_ALLOW_HOST_TERMINAL=true`), enforce bearer token authentication on WebSocket handshake, and reject non-loopback requests unless an explicit remote override flag is active.
2. **Platform & Shell Agnosticism:** Must function seamlessly across Windows 11 (PowerShell 7/Windows PowerShell, `cmd.exe`, `PATHEXT`, `.cmd`/`.bat`/`.ps1`, `LOCALAPPDATA\pnpm`, `APPDATA\npm`, `USERPROFILE\.cargo\bin`, Scoop) and POSIX (Linux/macOS, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.cargo/bin`, `~/.local/bin`, `bash`, `zsh`).
3. **Zero Zombie Guarantee ($\le 200\text{ms}$):** All spawned terminal shells, probe runs, and manual dry-runs must be contained within Win32 Job Objects (`KILL_ON_JOB_CLOSE`) on Windows or POSIX Process Groups (`setsid` + `SIGKILL` to negative PGID). Socket disconnects must terminate child processes cleanly.
4. **Non-Blocking Hot-Discovery ($\le 1{,}500\text{ms}$):** Re-scanning system `PATH` and probing binaries must execute asynchronously without blocking ongoing chat completion requests (`/v1/chat/completions`) or event streams.
5. **OpenAI Protocol Invariant:** Dynamic discovery or manual registration must never disrupt `/v1/models` or `/v1/chat/completions` contracts. Uninstalled or unconfigured models must return compliant OpenAI JSON error envelopes (`invalid_request_error`).
6. **Persistent Blueprint Isolation:** Custom adapters registered via the Web Console must be stored in `$DATA_DIR/adapters/{id}.yaml` so they survive git updates, container recreations, and application restarts.

---

## 3. Non-goals

1. **Automated Package Sudo/Root Escalation:** The gateway will not attempt automated root/administrator privilege escalation. If an install command requires `sudo` or elevation, the user inputs credentials in the interactive host terminal session.
2. **Built-in Package Manager Wrapper:** The gateway will not build a custom GUI package manager abstraction (e.g., an npm package search UI). Operators use the native host terminal with standard CLI tooling.
3. **Arbitrary In-Memory Monkey-Patching:** The gateway will not inject code into third-party CLI binaries or alter binary assembly. It interacts strictly via external stdin/stdout/PTY process streams.
4. **Public Multi-Tenant SaaS Hosting:** The architecture is tailored for single-operator workstations, localized lab servers, and trusted internal dev networks.
5. **Full Web-Based IDE Replacement:** The terminal is scoped for administration, package maintenance, and CLI authentication, not for replacing IDEs (VS Code, Cursor).

---

## 4. Acceptance Criteria (Concrete, Verifiable)

### AC-1: Host Terminal vs Sandbox Jail Visual & Execution Demarcation
- **Given** an operator navigating to the WebShell view in the Web Console.
- **When** the operator toggles between "Account Sandbox" and "Host Server Shell":
  - **Account Sandbox:** Spawns a PTY in `$DATA_DIR/sandboxes/{adapterId}/{accountId}/workspace`, sets `$HOME` to the sandbox directory, strips host API credentials, and renders an indigo/slate header pill: `JAIL: /sandboxes/{adapter}/{account}`.
  - **Host Server Shell:** Spawns a PTY in host user home (`process.env.USERPROFILE` or `process.env.HOME`), passes full unmodified host environment variables, and renders an amber/crimson glowing border and banner: `HOST SERVER TERMINAL: UNCONFINED HOST OS ACCESS`.

### AC-2: Host Terminal Security Guardrails & Loopback Auth Fence
- **Given** the gateway daemon running with default security configuration.
- **When** a client initiates a WebSocket connection to `/api/ws/terminal?mode=host`:
  - If `CLI_TO_API_ALLOW_HOST_TERMINAL` is not set to `true`, the connection is immediately rejected with HTTP 403 (`Host terminal disabled by server policy`).
  - If the connection does not provide a valid `token` matching `CLI_API_KEY` (in query param or `Sec-WebSocket-Protocol`), the connection is closed with WebSocket code `4401` (`Unauthorized`).
  - If the connection originates from a non-loopback IP (not `127.0.0.1`, `::1`, or `::ffff:127.0.0.1`) and `CLI_TO_API_ALLOW_REMOTE_HOST_TERMINAL` is `false`, the connection is rejected with HTTP 403 (`Forbidden: Remote host terminal access denied`).

### AC-3: Host Shell Package Installation & Persistence Verification
- **Given** an authenticated Host Server Shell session on Windows or Linux.
- **When** the user executes a package installation command (e.g., `npm i -g @anthropic-ai/claude-code` or `pnpm add -g opencode-ai`).
- **Then:**
  1. The executable is written to the actual host package bin directory (`%APPDATA%\npm`, `%LOCALAPPDATA%\pnpm`, or `/usr/local/bin`), NOT a sandbox folder.
  2. Running `which <cli>` or `where <cli>` inside the host terminal outputs the host system path.
  3. Closing the terminal tab terminates the PTY process and any running sub-processes within $\le 200\text{ms}$ without leaving orphaned shell instances.

### AC-4: One-Click Provider Reload & Auto-Discovery Button
- **Given** a newly installed CLI binary on host `PATH` while the gateway is active.
- **When** the operator clicks the **"Reload & Discover"** button in the Web Console (or issues `POST /api/adapters/scan`):
  1. The gateway executes `refreshEnvironmentPaths()`, re-reading system registry environment variables on Windows or re-evaluating standard bin directories.
  2. Probes all registered manifests in parallel with a bounded timeout ($\le 1{,}500\text{ms}$).
  3. Updates database adapter status from `NOT_INSTALLED` to `INSTALLED` and records `resolvedPath` and `detectedVersion`.
  4. Broadcasts an SSE event `adapter:status_changed` across `/api/events`.
  5. The Web Console updates without requiring a page reload, displaying a green `INSTALLED` badge and enabling account creation.

### AC-5: Hot Dynamic Model Catalog & Zero-Restart Routing
- **Given** an adapter that transitions from `NOT_INSTALLED` to `INSTALLED` following a reload.
- **When** an API client requests `GET /v1/models`:
  - The models belonging to the newly verified provider immediately appear in the returned list.
  - Virtual auto-tier routes (`auto`, `auto-high`) immediately include the new provider's models in candidate routing pools.
  - Zero Fastify daemon restarts or TCP socket drops occur.

### AC-6: Manual CLI Registration Wizard & Custom Path Override
- **Given** a non-standard CLI binary located at a custom absolute path (e.g., `D:\MyAITools\custom-cli.exe` or `/opt/bin/internal-llm`).
- **When** the user opens the "Register Custom CLI" modal in the Web Console, inputs:
  - Adapter ID: `internal-llm`
  - Name: `Internal Corporate LLM`
  - Executable Path: `D:\MyAITools\custom-cli.exe`
  - Execution Mode: `pipe`
  - Arguments Template: `["--query", "{prompt}", "--format", "json"]`
  - Models: `[{"id": "corp-v1", "name": "Corp Model", "tier": "high"}]`
- **And** submits the form:
  1. The gateway validates the configuration against `AdapterConfigSchema`.
  2. Writes the valid manifest to `$DATA_DIR/adapters/internal-llm.yaml`.
  3. Registers the blueprint into `globalAdapterRegistry`.
  4. Returns HTTP 201 with `{ adapterId: "internal-llm", isInstalled: true, resolvedPath: "..." }`.

### AC-7: Dry-Run Probe & Schema Pre-Flight Validation
- **Given** the user filling out the Manual CLI Registration form.
- **When** clicking the **"Dry-Run Probe"** button before saving:
  1. The gateway runs a pre-flight execution: verifies file existence, checks execution bit permissions, and runs `<executable> --version` with a hard $1{,}500\text{ms}$ timeout.
  2. Returns `{ ok: true, version: "2.4.1", latencyMs: 84 }` if successful.
  3. If the path does not exist or fails execution, returns `{ ok: false, error: "Executable not found or returned exit code 127" }` with exact stderr diagnostic output, preventing faulty manifests from being saved.

### AC-8: Job Object & Process Group Containment SLA
- **Given** any interactive Host Terminal session, probe execution, or custom CLI process.
- **When** the terminal tab is closed, the probe times out, or the client disconnects.
- **Then** the process and all spawned child processes (including shell wrappers `cmd.exe`, `powershell.exe`, or child build tools) must be killed within $\le 200\text{ms}$. Zero orphan processes remain in the OS process table.

---

## 5. Compared Approaches

| Dimension | Approach A: Monolithic Unconfined Terminal & Blind Re-Scan | Approach B: Dual-Substrate Subsystem with Reactive Engine & Manual Studio (Recommended) | Approach C: Containerized Sidecar & MicroVM Virtualization |
| :--- | :--- | :--- | :--- |
| **Terminal Architecture** | Single WebShell mode; removes sandbox jail entirely so all sessions run on host. | Dual-mode WebShell: Sandbox Jail (`mode=sandbox`) vs Host Server Shell (`mode=host`). | Terminal runs inside Docker container / microVM; host remains untouched. |
| **Security & Isolation** | **Critical Hazard:** CLI account logins store tokens in host profile; credentials can leak between accounts. | **High:** Accounts strictly jailed; Host Shell is explicitly gated by token + loopback + kill switch. | **Maximum:** Isolated container filesystem, but breaks native hardware and host CLI access. |
| **Package Installation** | Works directly, but risks accidental mutation of user's personal workstation configs. | **Optimal:** Intentional, explicitly warned host administration with native tool access. | Fails or requires Docker container rebuilding (`Dockerfile`) for every new CLI. |
| **Provider Reload** | Polling loop (re-reads `PATH` every 5s on a background timer). | **Reactive On-Demand & Hot-Watcher:** Button-triggered scan + differential SSE updates + debounced `fs.watch`. | Container restart / image rebuild required on CLI addition. |
| **Manual CLI Fallback** | User must manually create YAML files on server disk via SSH or external editor. | **Integrated Web Studio:** Interactive form, schema validation, live dry-run probe, dual-directory storage. | User mounts volume and configures environment variables inside container spec. |
| **OS Compatibility** | Basic `PATH` lookup; breaks on Windows package manager paths not in system PATH. | **Full Matrix:** Deep interrogation of `PATHEXT`, Scoop, npm/pnpm, Cargo, Homebrew, and custom paths. | Dependent on container runtime (WSL2 / Docker Desktop on Windows). |
| **Primary Assumption** | Host machine is single-user and isolation between accounts is unnecessary. | Operators need full host maintenance capabilities while guaranteeing multi-account isolation for inference. | Users have Docker/container runtimes installed and are comfortable managing container images. |
| **First Failure Condition** | Multi-account isolation breaks: `codex login` overwrites auth token for all accounts simultaneously. | Host terminal connection attempted over untrusted network when remote access flag is disabled. | Host tools (e.g. proprietary Windows GUI-assisted CLI) cannot run inside Linux container. |

---

## 6. Recommended Direction & Rationale

Candidate 3 recommends **Approach B: Dual-Substrate Subsystem with Reactive Engine & Manual Studio**.

### 6.1 Host Server Terminal Architecture & Access Boundary Security

#### WebSocket Endpoint Protocol Specification (`/api/ws/terminal`)

The terminal WebSocket protocol is upgraded to accept an explicit `mode` parameter and mandatory authentication:

```
ws://127.0.0.1:3000/api/ws/terminal?mode={sandbox|host}&adapterId={id}&accountId={accId}&token={apiKey}
```

```ts
// apps/gateway/src/api/ws/webshell.ts
export interface WebShellQuery {
  mode?: "sandbox" | "host";
  adapterId?: string;
  accountId?: string;
  token?: string;
  cols?: string;
  rows?: string;
}
```

#### Dual-Execution Routing Logic

1. **When `mode === "sandbox"` (Default):**
   - Requires `adapterId` and `accountId`.
   - Invokes `provisionSandbox({ dataDir, adapterId, accountId })`.
   - Mounts filesystem jail: `$HOME`, `%USERPROFILE%`, `%APPDATA%`, `XDG_*` redirected to `$DATA_DIR/sandboxes/{adapterId}/{accountId}`.
   - Shell binary: `cmd.exe` (Windows) or `bash` (POSIX).
   - Working directory: `{sandboxDir}/workspace`.
   - Purpose: Running `<cli> login`, `<cli> auth`, inspecting account logs.

2. **When `mode === "host"` (Host Server Administration):**
   - **Access Boundary Guard 1 (Kill Switch):** Verify `env.CLI_TO_API_ALLOW_HOST_TERMINAL === "true"`. If false, close socket immediately with code `4403` (`Policy Violation: Host terminal disabled`).
   - **Access Boundary Guard 2 (Token Authentication):** Validate `query.token === env.CLI_API_KEY`. If invalid, close with code `4401` (`Unauthorized`).
   - **Access Boundary Guard 3 (Loopback Restriction):** Inspect `req.socket.remoteAddress`. If remote address is not `127.0.0.1`, `::1`, or `::ffff:127.0.0.1`, and `env.CLI_TO_API_ALLOW_REMOTE_HOST_TERMINAL !== "true"`, reject connection.
   - **Environment:** Clones host `process.env` completely without sandbox redirection. Preserves native `$HOME`, `%USERPROFILE%`, `%APPDATA%`, and global `$PATH`.
   - **Shell Binary:**
     - Windows: Uses PowerShell 7 (`pwsh.exe`) if installed on host, falling back to `powershell.exe` or `ComSpec` (`cmd.exe`).
     - POSIX: Uses user's configured default shell (`process.env.SHELL`) or `bash`.
   - **Working Directory:** Host project root or user home directory (`os.homedir()`).
   - **Supervisor Lifecycle:** Spawns via `node-pty` enclosed in a Win32 Job Object (Windows) or POSIX Process Group. On socket disconnect, executes `ptyProcess.kill()` followed by supervisor process tree verification within $\le 200\text{ms}$.

#### Visual Safety Guardrail in Web Console

```
+----------------------------------------------------------------------------------------------------+
|  [!] HOST SERVER TERMINAL - UNCONFINED HOST SYSTEM ACCESS                                           |
|  Commands executed here run natively on the host OS with gateway server privileges.                 |
|  Use this shell to run: npm i -g <cli>, brew install <cli>, scoop install <cli>, pip install <cli>  |
+----------------------------------------------------------------------------------------------------+
```
- Amber/Crimson hazard glow around the terminal container (`border-amber-500/50 shadow-amber-500/10`).
- Dedicated cursor color (`#F59E0B` amber).
- Audio/Visual confirmation dialog before switching from Sandbox mode to Host Shell mode.

---

### 6.2 Reactive Provider Discovery & Dynamic PATH Re-Scan

#### Windows & POSIX Environment Refresh Engine (`apps/gateway/src/adapters/prober.ts`)

When packages are installed globally via Windows package managers, the current Node.js process does not inherit modified system `PATH` variables unless updated. The discovery engine dynamically re-queries the host environment:

```ts
export function refreshEnvironmentPaths(): string[] {
  const isWin = process.platform === "win32";
  const pathEnv = process.env.PATH || "";
  const dirs = new Set<string>(
    pathEnv.split(isWin ? ";" : ":").map(d => d.replace(/^"|"$/g, "").trim()).filter(Boolean)
  );

  if (isWin) {
    // 1. Interrogate Windows User & System Registry PATH (PowerShell/CMD updates)
    try {
      const userPath = execSync('powershell.exe -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'PATH\', \'User\')"', { timeout: 1000 }).toString().trim();
      userPath.split(";").forEach(d => d && dirs.add(d.trim()));
    } catch {
      // Fallback to standard well-known Windows package locations
    }

    // 2. Explicit package manager locations
    const localAppData = process.env.LOCALAPPDATA;
    const appData = process.env.APPDATA;
    const userProfile = process.env.USERPROFILE;

    if (localAppData) {
      dirs.add(path.join(localAppData, "pnpm"));
      dirs.add(path.join(localAppData, "Microsoft", "WinGet", "Links"));
    }
    if (appData) {
      dirs.add(path.join(appData, "npm"));
    }
    if (userProfile) {
      dirs.add(path.join(userProfile, ".cargo", "bin"));
      dirs.add(path.join(userProfile, "scoop", "shims"));
    }
    dirs.add("C:\\ProgramData\\chocolatey\\bin");
  } else {
    // POSIX standard and package paths
    const home = os.homedir();
    dirs.add("/opt/homebrew/bin");
    dirs.add("/usr/local/bin");
    dirs.add(path.join(home, ".cargo", "bin"));
    dirs.add(path.join(home, ".local", "bin"));
    dirs.add(path.join(home, ".pnpm"));
  }

  return Array.from(dirs).filter(d => fs.existsSync(d));
}
```

#### Scan REST API Contract (`POST /api/adapters/scan`)

```ts
// Endpoint: POST /api/adapters/scan
// Triggered by Web Console "Reload & Discover" button
export async function handleScanAdapters(req: FastifyRequest, reply: FastifyReply) {
  const activePaths = refreshEnvironmentPaths();
  const allAdapters = globalAdapterRegistry.getAllAdapters();
  
  const scanResults = await Promise.all(
    allAdapters.map(async (adapter) => {
      const probeResult = await probeExecutable(adapter.config.executable, activePaths);
      return {
        adapterId: adapter.config.id,
        ...probeResult,
      };
    })
  );

  // Update SQLite adapters table & in-memory registry
  for (const res of scanResults) {
    await db.update(adapters)
      .set({
        isInstalled: res.isInstalled,
        status: res.isInstalled ? "INSTALLED" : "NOT_INSTALLED",
        resolvedPath: res.resolvedPath,
        detectedVersion: res.detectedVersion,
        lastProbedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(adapters.id, res.adapterId));
    
    globalAdapterRegistry.updateStatus(res.adapterId, res);
  }

  // Broadcast differential change to active Web Consoles
  globalEventBus.emit("adapters:scanned", { results: scanResults });

  return reply.send({
    ok: true,
    scannedCount: scanResults.length,
    installedCount: scanResults.filter(r => r.isInstalled).length,
    results: scanResults,
  });
}
```

---

### 6.3 Manual CLI Input & Universal Adapter Registration

When automated discovery fails or for proprietary internal AI CLIs, the gateway provides a manual registration wizard.

#### Data Directory Resolution Pipeline

Blueprints load from two locations:
1. **Built-in Reference Blueprints:** `./adapters/*.yaml` (shipped templates: `codex-cli`, `claude-code`, `opencode-cli`, `grok-cli`, `omp-cli`, `devin-cli`).
2. **User Custom Blueprints:** `$DATA_DIR/adapters/*.yaml` (e.g. `~/.cli-to-api/adapters/*.yaml` or `./data/adapters/*.yaml`). Custom blueprints persist independently of git updates.

#### Manual Registration REST API (`POST /api/adapters/manual`)

```ts
export const ManualAdapterInputSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/, "ID must be lowercase alphanumeric or hyphenated"),
  name: z.string().min(1, "Display name is required"),
  executable: z.string().min(1, "Executable path or command name is required"),
  executionMode: z.enum(["pipe", "pty"]).default("pipe"),
  argsTemplate: z.array(z.string()).min(1, "At least one argument or placeholder required"),
  promptTransport: z.enum(["auto", "argv", "stdin", "temp_file"]).default("auto"),
  models: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    tier: z.enum(["low", "medium", "high", "xhigh"]).default("medium"),
    contextWindow: z.number().int().default(128000),
    costWeight: z.number().default(1.0),
    isDefault: z.boolean().default(false),
  })).min(1, "At least one model must be specified"),
  rateLimitRegex: z.string().optional(),
  timeoutSeconds: z.number().int().default(300),
});
```

#### Pre-Flight Dry-Run Probe API (`POST /api/adapters/dry-run`)

Before writing files or mutating the database, the operator can click **"Test Executable"**:
1. Verifies executable existence on host disk (`fs.existsSync(executable)` or resolution via refreshed `PATH`).
2. Executes test command: `<executable> --version` or `<executable> --help`.
3. Bounded by a Win32 Job Object or POSIX process group with a strict $1{,}500\text{ms}$ timeout.
4. Returns exact diagnostic feedback:
   ```json
   {
     "ok": true,
     "resolvedPath": "D:\\MyAITools\\custom-cli.exe",
     "detectedVersion": "custom-cli v2.1.0",
     "latencyMs": 42
   }
   ```
   Or on failure:
   ```json
   {
     "ok": false,
     "error": "ENOENT: Command not found at specified path 'D:\\MyAITools\\custom-cli.exe'",
     "exitCode": 127
   }
   ```

---

### 6.4 Obsidian Cyber-Deck Web Console UX Specification

#### 1. Header & Quick Actions
- **Reload & Discover Button:** Placed on the top navigation bar alongside the Gateway Status indicator.
  - Normal State: `<RefreshCw className="w-3.5 h-3.5 text-brand" /> <span>Reload & Discover</span>`.
  - Scanning State: Button animates with a spinning icon and displays `Scanning PATH...`.
  - On Complete: Displays a toast: `Discovery Complete: 3 CLI providers active, 2 dormant`.

#### 2. Dual-Mode WebShell View (`apps/web/src/views/WebShellView.tsx`)
- Sub-Navigation Tab Selector:
  - **Account Jails (Default):** Dropdown to select provisioned account (`codex-acc-01`, `claude-acc-01`). Allows running `login` and `whoami`.
  - **Host Server Shell (Admin):** Marked with an alert pill (`UNCONFINED`). When clicked, presents a modal confirmation:  
    *"Enter Host Server Shell? Commands execute natively with gateway privileges."*
- Dynamic Terminal Frame:
  - Account Jail: Slate border (`#1E2230`), indigo accent prompt, displays `Jail: /sandboxes/{id}/{acc}`.
  - Host Server: Glowing amber border (`#F59E0B`), crimson accent prompt, displays `Host: PowerShell 7 (PID 18420) | CWD: E:\Projects\cli-to-api`.

#### 3. Custom CLI Registration Modal (`apps/web/src/components/adapters/CustomAdapterStudioModal.tsx`)
- **Step 1: Executable & Mode:** Input for exact executable path or command name, PTY vs Pipe radio switch.
- **Step 2: Dry-Run Test:** Clickable "Test Executable" button with immediate green checkmark / red error output.
- **Step 3: Model Configuration:** Add/remove model rows (Model ID, display name, tier selector pill, context size).
- **Step 4: Arguments Template:** Interactive token inputs (e.g. `[exec] [--model] [{model}] [{prompt}]`).
- **Save Action:** Persists to `$DATA_DIR/adapters/` and immediately registers with the live gateway.

---

### 6.5 Implementation Architecture & Delivery Sequence

```
apps/gateway/src/
├── api/
│   ├── routes/
│   │   ├── admin-adapters.ts       [MODIFY] Add POST /api/adapters/scan, POST /api/adapters/manual, POST /api/adapters/dry-run
│   │   └── admin-terminal.ts       [CREATE] Host terminal policy & pre-flight permission check
│   └── ws/
│       └── webshell.ts             [MODIFY] Implement dual-mode routing: mode=sandbox (jailed) vs mode=host (unconfined)
├── adapters/
│   ├── prober.ts                   [CREATE] refreshEnvironmentPaths(), bounded version check (<=1500ms), Job Object wrapping
│   ├── resolver.ts                 [MODIFY] Support exact absolute path override, Windows package manager dirs
│   ├── registry.ts                 [MODIFY] Hot update methods for dynamic adapter statuses
│   └── loader.ts                   [MODIFY] Dual-dir loader (./adapters + $DATA_DIR/adapters)
├── supervisor/
│   └── sandbox.ts                  [MODIFY] Export unconfined host environment builder alongside jailed sandbox builder
└── router/
    └── model-catalog.ts            [MODIFY] Reactive /v1/models projection keyed to adapter.isInstalled

apps/web/src/
├── components/
│   ├── webshell/
│   │   └── TerminalView.tsx        [MODIFY] Support host shell mode with amber styling and unconfined warning banner
│   └── adapters/
│       └── CustomAdapterStudioModal.tsx [CREATE] Modal for manual CLI registration with dry-run runner
├── views/
│   ├── WebShellView.tsx            [MODIFY] Mode switch tabs (Account Sandboxes vs Host Server Shell)
│   └── AccountsView.tsx            [MODIFY] Add "Reload & Discover" and "Register Custom CLI" action bar
└── lib/
    └── api-client.ts               [MODIFY] Add scanAdapters(), dryRunAdapter(), registerManualAdapter()
```

---

## 7. Verifiable Architectural Guarantees

1. **Deterministic Security Boundary:** Unauthenticated or remote network clients cannot spawn a host server shell. The host terminal is strictly gated behind bearer token authentication, loopback IP verification, and an explicit server-side opt-in environment toggle.
2. **True Global Package Persistence:** Packages installed via the Host Server Shell (`npm i -g`, `brew`, `scoop`, `pip`) persist in the host system's native directories and immediately become discoverable to the gateway substrate.
3. **Sub-Second Provider Discovery:** The **"Reload & Discover"** button re-interrogates Windows/POSIX path tables, updates provider statuses, and synchronizes the `/v1/models` catalog in $<500\text{ms}$ with zero socket interruptions or process restarts.
4. **Complete Extensibility:** Any standard or proprietary AI CLI can be registered manually via absolute path or custom flags, validated via real-time dry-run probing, and immediately participate in intelligent tier routing.
