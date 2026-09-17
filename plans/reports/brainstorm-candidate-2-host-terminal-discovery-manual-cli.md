# Architectural Brainstorm & Bounded Contract: Host Server Terminal, Registry-Aware Auto-Discovery, and Universal Manual CLI Studio

**Candidate:** Candidate 2  
**Mode:** `ak-brainstorm --ultra`  
**Target Subsystems:** Web Console (Cyber-Deck), Gateway Ingress & WebSocket Supervisor, Binary Prober, Model Catalog & Routing Router  
**Date:** 2026-09-16  

---

## Executive Summary

`cli-to-api` bridges local command-line AI tools into OpenAI-compatible endpoints. However, running AI CLIs in a local developer workflow exposes three severe operational and architectural challenges:

1. **Sandboxed Jail Isolation vs. Host System Package Management:**  
   The existing WebShell (`/api/ws/terminal`) unconditionally provisions an account directory jail (`$DATA_DIR/sandboxes/{adapter}/{account}`), remapping `$HOME`, `%USERPROFILE%`, `%APPDATA%`, and setting `CI=1`. Consequently, developers cannot install global CLI tools (`npm i -g @google/gemini-cli`, `scoop install opencode`, `pip install aider-chat`, `brew install devin`) from the browser. Furthermore, in `apps/gateway/src/api/server.ts`, `/api/ws` is completely exempted from authentication with CORS set to wildcard (`*`). Exposing a host shell naively without addressing this creates a critical Cross-Site WebSocket Hijacking (CSWSH) Remote Code Execution (RCE) vulnerability.
2. **The Windows Stale-PATH Dilemma on Live Discovery:**  
   When a developer installs a CLI in a running environment, package managers on Windows write executable shims to user/system registry keys (`HKCU\Environment\Path` and `HKLM\...\Environment\Path`). Node.js inherits `process.env.PATH` once at startup and never updates it. Standard `PATH.split(';')` auto-discovery continues to report the CLI as missing even after successful installation, forcing an inconvenient manual server restart.
3. **Inflexible Onboarding for Custom / Enterprise / Portable CLIs:**  
   When auto-detection fails (e.g., custom enterprise wrappers, virtualenv binaries, portable tools in `D:\tools\`, or unlisted models like `devin`, `omp`, or `openhands`), users have no Web Console interface or REST API to manually define executable paths, argument templates, and model tiers.

Candidate 2 proposes the **Dual-Plane WebShell Architecture with Ticketed Gatekeeper, Registry-Aware Dynamic Discovery, and Universal Custom CLI Studio**.

---

## 1. Outcome

```
+───────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    WEB CONSOLE (FRONTEND LAYER)                                       |
|                                                                                                       |
|  [ Model Catalog ]    [ Accounts & Sandboxes ]    [ Custom CLI Studio ]    [ Provider Re-Scan 🔄 ]    |
|                                                                                                       |
|  +──────────────────────────────────────── Dual-Plane WebShell ────────────────────────────────────+  |
|  | [⚡ Host Server Terminal (Privileged)]        | [🔒 Account Sandbox Jail: codex-acc-01]          |  |
|  | • Host CWD, real %USERPROFILE% / $HOME         | • Isolated directory jail: /sandboxes/...        |  |
|  | • Runs package managers (npm, scoop, brew)     | • OAuth auth sessions (`codex login`, etc.)       |  |
|  | • Visual: Amber "ELEVATED HOST CONSOLE"        | • Visual: Indigo "TENANT SANDBOX JAIL"           |  |
|  | • Quick Actions: npm list -g, scoop list       | • Quick Actions: Login CLI, Whoami               |  |
|  +─────────────────────────────────────────────────────────────────────────────────────────────────+  |
+───────────────────────────────────────────────────────────────────────────────────────────────────────+
                                    │                                  │
                          Ticket Auth Handshake                REST / WebSocket
                                    ▼                                  ▼
+───────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                      GATEWAY CONTROL PLANE                                            |
|                                                                                                       |
|  +── Ticketed Gatekeeper ────────────────────────+  +── Dynamic Registry-Aware PATH Engine ────────+  |
|  | • Ephemeral Single-Use Ticket (30s TTL)       |  | • Windows Registry + POSIX PATH Sweeper     |  |
|  | • Strict Origin Check (Defeats CSWSH)         |  | • Multi-manager shims (npm/pnpm/scoop/cargo) |  |
|  | • Loopback Guard (127.0.0.1 default)          |  | • Live Hot-Reload: POST /api/adapters/reload|  |
|  +───────────────────────────────────────────────+  +──────────────────────────────────────────────+  |
|                                                                                                       |
|  +── Universal CLI Studio & Manifest Persistence +  +── Win32 Job Object / POSIX Containment ──────+  |
|  | • Manual Executable Path & Flag Builder       |  | • Guaranteed process tree kill (≤200ms)      |  |
|  | • Dry-Run Probe Validation (2s hard timeout)  |  | • Prevents zombie shells & orphan builds     |  |
|  | • Persistent YAML ($DATA_DIR/adapters/*.yaml) |  | • Session limits & idle reaper               |  |
|  +───────────────────────────────────────────────+  +──────────────────────────────────────────────+  |
+───────────────────────────────────────────────────────────────────────────────────────────────────────+
```

1. **Dual-Plane WebShell System:** The Web Console provides two visually and architecturally separated execution planes:
   - **Host Server Terminal (Privileged Host Plane):** Spawns the native host shell (`pwsh`/`cmd` on Windows, `$SHELL`/`bash` on POSIX) in the host user's environment. Enables package installation (`npm i -g @google/gemini-cli`, `pip install aider-chat`, `scoop install opencode`) directly from the browser.
   - **Account Sandbox Jail (Isolated Tenant Plane):** Continues running inside `$DATA_DIR/sandboxes/{adapter}/{account}` with isolated `HOME`/`APPDATA` and scrubbed credentials for safe OAuth authentication (`claude login`, `codex login`) and multi-tenant isolation.
2. **Cryptographically Guarded Access Boundary:** Host Terminal WebSocket access is shielded by a three-tiered security boundary: (a) Localhost-only network binding by default; (b) CSWSH origin defense; and (c) an Ephemeral Single-Use Ticket Handshake (`POST /api/terminal/ticket` with master admin bearer auth) eliminating unauthenticated WebSocket hijack vectors.
3. **Registry-Aware Provider Reload & Auto-Discovery:** A single click on "Reload & Auto-Discover" (or `POST /api/adapters/reload`) re-evaluates the host `PATH` (actively querying Windows Registry environment trees on Windows to pick up freshly installed binaries without restarting Node), probes all known manifests, updates SQLite adapter states, and instantly projects live models to `GET /v1/models`.
4. **Universal Manual CLI Registration Studio:** An interactive Web Console modal and REST endpoint (`POST /api/adapters`) allowing operators to configure non-standard or private AI CLIs (e.g., custom binary paths, argument templates, prompt transport, models, and tiers), backed by a live **Pre-Flight Dry-Run Probe** (`POST /api/adapters/dry-run`) that validates execution viability before saving.

---

## 2. Constraints

1. **Cross-Platform Host Shell Parity:** Host Terminal execution must adapt seamlessly between Windows (detecting and launching `pwsh.exe`, `powershell.exe`, or `cmd.exe`) and POSIX (`$SHELL`, `/bin/bash`, `/bin/zsh`), retaining proper TTY sizing, ANSI color escape sequences, and standard keymaps.
2. **Windows Dynamic PATH Staleness:** On Windows, Node.js inherits `process.env.PATH` once at startup. When a package manager installs a CLI, it updates `HKCU\Environment\Path` or `HKLM\System\CurrentControlSet\Control\Session Manager\Environment`. The discovery engine MUST inspect active registry paths and probe package roots (`%APPDATA%\npm`, `%LOCALAPPDATA%\pnpm`, `%USERPROFILE%\scoop\shims`, `%LOCALAPPDATA%\Microsoft\WinGet\Links`, `~/.cargo/bin`) rather than relying on stale cached `process.env.PATH`.
3. **Access Boundary & Anti-CSWSH Protection:** Arbitrary command execution on the host machine is catastrophic if exposed to the web or LAN. Host terminal websockets MUST NOT be accessible without master admin credentials, MUST validate the HTTP `Origin` header against permitted gateway hostnames, and MUST be disabled over non-loopback network interfaces unless an explicit override flag (`CLI_TO_API_ALLOW_REMOTE_HOST_SHELL=true`) is configured.
4. **Zero-Zombie Guarantee ($\le 200\text{ms}$):** Both host terminal sessions, sandbox shells, and dry-run probes must be strictly bound to Win32 Job Objects (`KILL_ON_JOB_CLOSE`) or POSIX Process Groups (`setsid` + `SIGKILL` tree). When a WebSocket disconnects, all spawned processes and descendant compiler/installer forks must terminate completely in $\le 200\text{ms}$.
5. **OpenAI Protocol Integrity:** Manual CLI registration and dynamic reload must never corrupt or emit invalid responses on `/v1/chat/completions` or `/v1/models`. Uninstalled or misconfigured providers must return standard OpenAI `invalid_request_error` JSON envelopes.
6. **Non-Blocking Ingress SLA:** Provider re-scanning and manual probe tests must run asynchronously with a hard $\le 2{,}000\text{ms}$ per-probe timeout. Chat completion requests must never experience latency spikes during background discovery sweeps.
7. **Storage Persistence:** Custom user-registered CLI manifests must be persisted as human-readable YAML files in `$DATA_DIR/adapters/{id}.yaml` so they survive daemon updates, git pulls, and SQLite migrations.

---

## 3. Non-goals

1. **Automated Package Management / Silent Upgrades:** The gateway will not automatically trigger `npm install` or `brew upgrade` behind the user's back. The user controls installation via the Host Server Terminal.
2. **Multi-Tenant Public Cloud IAM:** Not designing enterprise OAuth2/SAML user management or multi-tenant billing. The gateway is a local-first workstation or private LAN developer bridge.
3. **Desktop Window Emulator Replacement:** Not replacing Windows Terminal, iTerm2, or Alacritty. The WebShell is an embedded, context-aware bridge for setup, management, and authentication.
4. **Hardware-Level Hypervisor Virtualization:** Not requiring Docker Desktop, WSL2 containers, or MicroVMs. The gateway operates with native process isolation and directory jails to maintain zero-overhead performance.

---

## 4. Acceptance Criteria (Concrete, Verifiable)

### AC-1: Dual-Plane WebShell Separation & Execution Context
- **Given** the gateway Web Console in browser,
- **When** the operator selects the **Host Server Terminal** tab:
  1. The spawned PTY process starts in `projectRoot` or host `$HOME` / `%USERPROFILE%`.
  2. The process environment retains native un-jailed host variables (`APPDATA`, `LOCALAPPDATA`, `USERPROFILE`, `HOME`, full host `PATH`).
  3. The terminal header displays a distinctive amber warning badge: `⚡ HOST SERVER CONSOLE (PRIVILEGED)` and an alert banner indicating system-wide changes.
- **When** the operator selects an **Account Sandbox** tab (e.g. `codex-acc-01`):
  1. The spawned PTY runs inside `$DATA_DIR/sandboxes/codex-cli/codex-acc-01/workspace`.
  2. System variables (`HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`) point strictly inside that sandbox directory.
  3. API keys (`OPENAI_API_KEY`, etc.) are purged, and `CI=1` is enforced.
  4. The terminal header displays an indigo badge: `🔒 TENANT JAIL: /sandboxes/codex-cli/codex-acc-01`.

### AC-2: Host Terminal Access Boundary & CSWSH Defense
- **Given** the Host Terminal WebSocket endpoint `/api/ws/terminal?mode=host`:
  - **When** a client connects without an authorized handshake ticket, connection is rejected immediately with HTTP 401 / WebSocket close code `4401` ("Unauthorized: Missing or invalid terminal ticket").
  - **When** a cross-origin web page initiates a connection (e.g. `Origin: http://evil-site.com`), the gateway rejects the handshake with HTTP 403 / close code `4403` ("Forbidden: CSWSH Origin mismatch").
  - **When** the gateway listens on `0.0.0.0` and a remote IP connects to `mode=host` without `CLI_TO_API_ALLOW_REMOTE_HOST_SHELL=true`, connection is refused with HTTP 403 ("Host shell restricted to loopback interface").
  - **When** the user clicks "Launch Host Terminal", the frontend first requests an ephemeral single-use ticket via `POST /api/terminal/ticket` (passing `Authorization: Bearer <ADMIN_TOKEN>`), which returns `{ ticket: string, expiresIn: 30 }`. The WebSocket connects using `ticket` as a query parameter, consumes the ticket once, and invalidates it.

### AC-3: Host Package Installation & Immediate Usability
- **Given** a connected Host Server Terminal session,
- **When** the operator runs a global package installation (e.g., `npm install -g @google/gemini-cli` or `scoop install opencode`),
- **Then:**
  1. The package installs into the host user's global directory, outside any sandbox.
  2. The binary becomes runnable on the host machine.

### AC-4: Provider Reload & Auto-Discovery Re-Scan
- **Given** a newly installed CLI binary on host `PATH` (or registered in Windows Registry),
- **When** the operator clicks "Reload & Auto-Discover Providers" in the Web Console (or issues `POST /api/adapters/reload`),
- **Then:**
  1. The gateway executes the discovery engine in $\le 3{,}000\text{ms}$.
  2. The discovery engine checks the host's dynamic PATH (including Registry/package shims).
  3. The status of the corresponding adapter transitions from `NOT_INSTALLED` to `INSTALLED`, recording `resolvedPath` and `detectedVersion`.
  4. An SSE event `adapter:discovered` is broadcast over `/api/admin/events`.
  5. The Web Console UI reflects the newly discovered tool with a green badge, and `GET /v1/models` immediately advertises the tool's models without requiring a gateway restart.

### AC-5: Manual CLI Input & Universal Registration
- **Given** an unlisted or custom AI CLI (e.g., binary at `C:\tools\my-ai.exe` or `/usr/local/bin/devin`),
- **When** the operator submits the "Register Custom CLI" form or calls `POST /api/adapters` with:
  ```json
  {
    "id": "devin-cli",
    "name": "Devin CLI",
    "executable": "devin",
    "customPath": "C:\\tools\\devin.exe",
    "executionMode": "pipe",
    "invocation": {
      "args_template": ["run", "--model", "{model}", "--prompt", "{prompt}"],
      "prompt_transport": "argv",
      "timeout_seconds": 300
    },
    "models": [
      { "id": "devin-v1", "name": "Devin Autonomous Engineer", "tier": "xhigh", "context_window": 128000 }
    ]
  }
  ```
- **Then:**
  1. The gateway validates the configuration against `AdapterConfigSchema`.
  2. A persistent manifest is saved to `$DATA_DIR/adapters/devin-cli.yaml`.
  3. The adapter is registered into the database and active memory registry.
  4. A default account `devin-cli-acc-01` is provisioned.
  5. `devin-v1` and `devin-cli/devin-v1` immediately become routable on `POST /v1/chat/completions`.

### AC-6: Dry-Run Pre-Flight Validation Endpoint
- **Given** manual CLI inputs with an invalid executable path or failing parameters,
- **When** `POST /api/adapters/dry-run` is invoked,
- **Then:**
  1. The gateway attempts a non-destructive execution (e.g. `<executable> --version`) inside a Win32 Job Object with a 2-second timeout.
  2. If the executable is missing or fails, the API returns HTTP 400 with `{ "valid": false, "error": "Executable '...' not found or returned exit code 1", "output": "..." }`.
  3. No dirty records or partial files are created in the database or filesystem.

### AC-7: Containment & Zero-Zombie Teardown SLA
- **Given** an active Host Terminal session running a build or interactive command,
- **When** the WebSocket is closed or the browser tab is navigated away,
- **Then** the gateway terminates the underlying PTY and its entire child process tree via `killProcessTree()` within $\le 200\text{ms}$. Zero orphan subshell or compilation processes remain active in task manager / `ps aux`.

---

## 5. Compared Approaches

| Evaluation Criteria | Approach 1: Ephemeral Dual-Plane with Ticket Gatekeeper & Registry Discovery (Recommended) | Approach 2: Containerized Sidecar & Privileged Docker Socket | Approach 3: Guarded API Subprocess Runner (No Host Terminal) |
| :--- | :--- | :--- | :--- |
| **Architectural Model** | Native host PTY with dual visual planes, ticketed WebSocket auth, registry-aware PATH discovery, and YAML persistence. | Host commands and CLIs run inside Docker dev-containers mounted to host Docker daemon socket. | No host terminal; package installation exposed as rigid, unattended API endpoints (`POST /api/install`). |
| **Package Installation Viability** | **Optimal:** Full interactive PTY supporting prompts, sudo/admin passwords, progress bars, and custom package managers. | **High:** Installs inside containers or volumes, but cannot install packages natively on the host workstation. | **Poor:** Breaks as soon as an installer asks an interactive confirmation prompt (`[y/N]`) or requires sudo. |
| **Security Boundary & Isolation** | **Strict & Layered:** Ephemeral ticket handshake, loopback-only default, CSWSH origin validation, and Win32 Job Object cleanup. | **High container isolation**, but mounting `/var/run/docker.sock` grants root-equivalent host access if compromised. | **High:** No interactive shell, but rigid API endpoints remain vulnerable to argument injection if unvalidated. |
| **Windows PATH Refresh** | **Native Registry Scanner:** Dynamic inspection of Windows registry environment and package shims without reboot. | **Not applicable:** PATH is inside Docker containers, but host filesystem path translation is notoriously brittle. | **Stale:** Node's internal `process.env.PATH` remains stale unless process is killed and restarted. |
| **Interactive OAuth Support** | **Full:** `claude login` / `codex login` work seamlessly inside account sandboxes or host shell with browser callbacks. | **Difficult:** Browser OAuth callbacks to `http://localhost:port` fail to route inside container networks without complex port mapping. | **Fails:** Cannot perform interactive browser logins without a terminal emulator. |
| **Resource Overhead** | **Negligible:** Native processes ($\le 5\text{MB}$ RAM for PTY buffers). | **Heavy:** Requires running Docker Desktop ($\ge 1.5\text{GB}$ RAM, virtualization overhead). | **Negligible:** Raw child processes only. |
| **Primary Assumption** | Host operator runs gateway with permissions to manage developer packages on their own workstation. | Developer has Docker Desktop installed, running, and configured with host volume sharing permissions. | All AI CLIs can be installed completely silently via unattended CLI flags with zero prompts. |
| **First Failure Condition** | Operator runs gateway under an unprivileged restricted service account unable to write to global npm/brew paths. | Machine lacks Docker Desktop or user is in a corporate environment where container daemons are blocked. | An installer prompts for license agreement or sudo password, hanging the background subprocess indefinitely. |

---

## 6. Recommended Direction & Rationale

Candidate 2 recommends **Approach 1: Ephemeral Dual-Plane Architecture with Ticketed Gatekeeper, Registry-Aware Discovery, and Universal YAML Persistence**.

This approach provides maximum developer ergonomics without sacrificing security, operates with zero container overhead, respects Windows OS nuances, and cleanly separates privileged host administration from tenant credential sandboxes.

---

### 6.1 Subsystem 1: Dual-Plane WebShell & Access Boundary Security

#### The Dual-Plane Execution Contract
The WebShell must provide two fundamentally different operational planes, visually separated and technically decoupled:

```
+────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    DUAL-PLANE WEBSHELL CONTRACT                                    |
+──────────────────────────────────┬─────────────────────────────────────────────────────────────────+
| Dimension                        | Plane 1: Host Server Terminal   | Plane 2: Account Sandbox Jail |
+──────────────────────────────────┼─────────────────────────────────┼───────────────────────────────+
| Target Audience                  | Workstation Developer / Admin   | AI Provider Tenant Instance   |
| Primary Use Case                 | Package installs (`npm -g`,     | CLI OAuth logins (`codex      |
|                                  | `scoop`), system debugging      | login`), `whoami`, prompt test|
| Working Directory                | `projectRoot` or `$HOME`        | `$DATA_DIR/sandboxes/{a}/{acc}|
| Environment Variables            | Unrestricted host environment   | Overridden `HOME`, `APPDATA`, |
|                                  | (real `%USERPROFILE%`, `$PATH`) | `USERPROFILE`; scrubbed keys  |
| Visual Styling                   | Amber Header, Alert Banner,     | Indigo Header, Cyber-Deck     |
|                                  | "⚡ PRIVILEGED HOST CONSOLE"     | "🔒 TENANT SANDBOX JAIL"      |
| Security Boundary                | Ephemeral Ticket + CSWSH origin | Admin auth + Account ID check |
| Network Binding                  | Loopback only (unless enabled)  | Bound to gateway interfaces   |
| Process Containment              | Win32 Job Object / Group Kill   | Win32 Job Object / Group Kill |
+──────────────────────────────────┴─────────────────────────────────┴───────────────────────────────+
```

#### Securing the Access Boundary (Anti-CSWSH & Ticket Handshake)
Currently, `apps/gateway/src/api/server.ts` bypasses all authentication on `/api/ws`. To prevent malicious websites from hijacking the Host Terminal via Cross-Site WebSocket Hijacking (CSWSH), we enforce a three-stage barrier:

1. **Origin Verification Hook:**
   During the WebSocket upgrade, verify that the `Origin` header matches the gateway host (e.g. `http://localhost:8080` or `http://127.0.0.1:8080`). Reject untrusted origins immediately with HTTP 403.
2. **Ephemeral Single-Use Ticket Exchange:**
   The Web Console must never pass master API keys directly over WebSocket URLs (which leak into browser history and proxy access logs). Instead:
   - Frontend requests a ticket via an authenticated REST call:
     ```http
     POST /api/terminal/ticket
     Authorization: Bearer <ADMIN_TOKEN>
     Content-Type: application/json

     { "mode": "host" }
     ```
   - Gateway generates a cryptographically random 256-bit token stored in an in-memory TTL map:
     ```ts
     interface TerminalTicket {
       ticket: string;
       mode: "host" | "sandbox";
       adapterId?: string;
       accountId?: string;
       clientIp: string;
       expiresAt: number; // 30 seconds TTL
     }
     ```
   - Gateway responds with `{ "ticket": "tkt_8f9a2b1c...", "expiresIn": 30 }`.
   - Frontend connects via WebSocket:
     ```
     ws://localhost:8080/api/ws/terminal?ticket=tkt_8f9a2b1c...
     ```
   - Gateway validates the ticket, verifies matching IP address, immediately deletes the ticket (single-use), and spawns the PTY.
3. **Loopback-Only Network Guard:**
   ```ts
   const isLoopback = (ip: string) => ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
   if (mode === "host" && !isLoopback(req.socket.remoteAddress || "")) {
     if (!process.env.CLI_TO_API_ALLOW_REMOTE_HOST_SHELL) {
       socket.close(4403, "Host terminal forbidden over remote network interfaces");
       return;
     }
   }
   ```

#### Host Terminal PTY Spawning Logic (`apps/gateway/src/api/ws/webshell.ts`)
```ts
export function spawnHostPty(): pty.IPty {
  const isWin = process.platform === "win32";
  let shellBinary: string;
  let shellArgs: string[] = [];

  if (isWin) {
    // Prefer PowerShell Core -> Windows PowerShell -> cmd.exe
    const pwshCore = resolveBinary("pwsh.exe");
    const pwshWin = resolveBinary("powershell.exe");
    if (pwshCore.isInstalled) {
      shellBinary = pwshCore.resolvedPath!;
      shellArgs = ["-NoLogo"];
    } else if (pwshWin.isInstalled) {
      shellBinary = pwshWin.resolvedPath!;
      shellArgs = ["-NoLogo"];
    } else {
      shellBinary = process.env.ComSpec || "cmd.exe";
    }
  } else {
    shellBinary = process.env.SHELL || "/bin/bash";
  }

  return pty.spawn(shellBinary, shellArgs, {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd: projectRoot,
    env: { ...process.env }, // Native un-jailed host environment
  });
}
```

---

### 6.2 Subsystem 2: Dynamic Provider Reload & Windows Registry PATH Discovery

#### The Windows Registry PATH Invalidation Challenge
On Windows systems, when a developer runs `npm install -g @google/gemini-cli` or `scoop install opencode` in the Host Terminal, the installer writes the new binary directory to the Windows Registry:
- User PATH: `HKCU\Environment\Path`
- System PATH: `HKLM\System\CurrentControlSet\Control\Session Manager\Environment\Path`

The running Node.js gateway process **does not** receive this updated PATH; `process.env.PATH` remains identical to when the daemon was launched. If the user clicks "Reload", a standard `PATH.split(';')` check will still fail!

#### Dynamic PATH Sweeper (`apps/gateway/src/adapters/resolver.ts`)
We augment the binary resolver with dynamic registry inspection on Windows and comprehensive POSIX fallback:

```ts
import { execSync } from "node:child_process";

export function getFreshHostSearchPaths(): string[] {
  const isWin = process.platform === "win32";
  const searchDirs = new Set<string>();

  // 1. Current process PATH
  const currentPath = process.env.PATH || "";
  for (const dir of currentPath.split(isWin ? ";" : ":")) {
    if (dir.trim()) searchDirs.add(path.normalize(dir.trim()));
  }

  // 2. On Windows: Query live registry to catch newly installed tools without reboot
  if (isWin) {
    try {
      const userReg = execSync('reg query "HKCU\\Environment" /v Path', { encoding: "utf8", timeout: 1000 });
      const match = userReg.match(/REG_(?:EXPAND_)?SZ\s+(.*)/i);
      if (match && match[1]) {
        for (const dir of match[1].split(";")) {
          if (dir.trim()) searchDirs.add(path.normalize(dir.trim()));
        }
      }
    } catch { /* Ignore registry read errors */ }

    // Known global package roots
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
      searchDirs.add(path.join(userProfile, "AppData", "Local", "Programs", "Python", "Scripts"));
    }
  } else {
    // POSIX standard paths
    searchDirs.add("/opt/homebrew/bin");
    searchDirs.add("/usr/local/bin");
    searchDirs.add(path.expand("~/.cargo/bin"));
    searchDirs.add(path.expand("~/.local/bin"));
  }

  return Array.from(searchDirs).filter((d) => fs.existsSync(d));
}
```

#### Provider Reload API Contract (`POST /api/adapters/reload`)
- **Route:** `POST /api/adapters/reload`
- **Behavior:**
  1. Re-scans all YAML blueprints in `./adapters` and `$DATA_DIR/adapters`.
  2. Executes `getFreshHostSearchPaths()` and probes binary presence for each blueprint.
  3. Executes a fast version check (`<executable> --version`) with a 2-second timeout inside a Win32 Job Object.
  4. Updates database columns in `adapters` table (`is_installed`, `resolved_path`, `detected_version`, `last_probed_at`).
  5. Invalidates the Model Catalog cache in `apps/gateway/src/router/model-catalog.ts`.
  6. Emits an SSE event `adapter:reloaded` over `/api/admin/events`.
  7. Returns detailed JSON summary:
     ```json
     {
       "scanned": 6,
       "installed": 3,
       "missing": 3,
       "changes": [
         { "id": "opencode-cli", "previousStatus": "NOT_INSTALLED", "newStatus": "INSTALLED", "resolvedPath": "C:\\Users\\Dev\\scoop\\shims\\opencode.exe" }
       ],
       "timestamp": 1726500000
     }
     ```

---

### 6.3 Subsystem 3: Universal Manual CLI Registration Studio

When auto-discovery cannot resolve a tool (e.g., custom enterprise binary, portable `.exe`, unconventional flag structure), users must not be blocked.

#### Storage Architecture & Persistence
User-registered adapters are saved as declarative YAML files in `$DATA_DIR/adapters/{id}.yaml`.
- **Why YAML in `$DATA_DIR/adapters`?** Preserves human editability, enables version control, and decouples configuration from SQLite database wipe/migration cycles.
- On startup and on reload, the gateway loads manifests from both the bundled `./adapters` directory and the persistent `$DATA_DIR/adapters` directory.

#### Pre-Flight Dry-Run Validation (`POST /api/adapters/dry-run`)
Before saving a custom adapter, the Web Console triggers a non-destructive dry-run:
```ts
fastify.post("/api/adapters/dry-run", async (req, reply) => {
  const parseResult = AdapterDraftSchema.safeParse(req.body);
  if (!parseResult.success) {
    return reply.status(400).send({ error: "Invalid adapter configuration schema", details: parseResult.error.format() });
  }

  const { executable, customPath, testArgs = ["--version"] } = parseResult.data;
  const targetBin = customPath || resolveBinary(executable).resolvedPath || executable;

  try {
    const startTime = Date.now();
    const result = await execa(targetBin, testArgs, {
      timeout: 2000,
      reject: false,
      env: { ...process.env },
    });

    return reply.send({
      valid: result.exitCode === 0,
      exitCode: result.exitCode,
      resolvedPath: targetBin,
      stdout: result.stdout.slice(0, 500),
      stderr: result.stderr.slice(0, 500),
      durationMs: Date.now() - startTime,
    });
  } catch (err: any) {
    return reply.status(400).send({
      valid: false,
      error: `Executable probe failed: ${err.message}`,
    });
  }
});
```

#### Registration REST Endpoint (`POST /api/adapters`)
- Validates the full `AdapterConfigSchema`.
- Writes `$DATA_DIR/adapters/{id}.yaml`.
- Upserts the `adapters` and `models` tables in SQLite.
- If `autoProvisionAccount: true` (default), provisions an initial sandbox `$DATA_DIR/sandboxes/{id}/{id}-acc-01` and inserts an account record.
- Hot-registers the adapter into `globalAdapterRegistry`.

---

### 6.4 Web Console UX & Cyber-Deck Visual Design

#### Segmented Plane WebShell (`apps/web/src/views/WebShellView.tsx`)
1. **Top Segmented Switcher:**
   - Tab 1: `⚡ Host Server Terminal (Privileged)` (Gold/Amber accent, pulsing badge)
   - Tab 2: `🔒 Account Sandboxes` (Indigo/Cyan accent, dropdown selector for provisioned accounts)
2. **Terminal Status Bar:**
   - When Host Terminal is active:
     - Badge: `ELEVATED HOST CONSOLE` in `#F59E0B` (Amber-500)
     - Working Dir: Displays real host repository root (`E:\Projects\cli-to-api`)
     - Quick Action Chips: `npm list -g`, `scoop list`, `pnpm env`, `Clear`
   - When Account Sandbox is active:
     - Badge: `SANDBOX JAIL` in `#6366F1` (Indigo-500)
     - Working Dir: `/sandboxes/{adapter}/{account}`
     - Quick Action Chips: `Login CLI`, `Whoami`, `Clear`

#### Provider Reload & Auto-Discovery UI
1. **Header & Catalog Action:** A prominent `"Scan Host PATH"` button in the Header and Model Catalog view.
2. **Micro-Interactions:** On click, button displays a spinning `RefreshCw` icon with label `"Scanning host PATH..."`.
3. **Notification Toast:** Upon completion, renders a toast summary (e.g. `✨ Discovered 1 new provider: opencode-cli. 3 models added to catalog.`).

#### Custom CLI Studio Modal (`apps/web/src/views/AccountsView.tsx` or new `CustomCliModal.tsx`)
1. **Drawer / Modal Workflow:**
   - **Step 1: Executable & Mode:** Name, Adapter ID, Executable (with "Browse / Detect" and custom absolute path input), Mode (`pipe` vs `pty`).
   - **Step 2: Command & Prompt Transport:** Input template arguments (`run --model {model} --prompt {prompt}`), select transport (`stdin`, `argv`, `temp_file`).
   - **Step 3: Model Mapping:** Dynamic row builder to declare Model ID, Display Name, Tier pill (`low`, `medium`, `high`, `xhigh`), and context window.
   - **Step 4: Live Probe Verification:** "Test Executable" button that runs the dry-run endpoint and renders live terminal-like stdout confirmation before committing.

---

## 7. Migration & Rollout Sequence

```
Phase 1: Ticketed Terminal Gatekeeper & CSWSH Defense
         ├── Implement POST /api/terminal/ticket (ephemeral TTL ticket generator)
         ├── Enforce Origin validation and loopback checks on /api/ws/terminal
         └── Unit test: Reject unauthorized, cross-origin, and remote WebSocket attempts

Phase 2: Dual-Plane WebShell Implementation
         ├── Refactor webshell.ts to support mode="host" vs mode="sandbox"
         ├── Connect Host PTY with Win32 Job Object process containment
         └── Upgrade TerminalView.tsx and WebShellView.tsx with segmented switcher & styling

Phase 3: Registry-Aware Dynamic PATH Discovery Engine
         ├── Enhance resolver.ts with getFreshHostSearchPaths() (Windows Registry + POSIX)
         ├── Implement POST /api/adapters/reload with version probes and model sync
         └── Add "Reload & Auto-Discover" button to Web Console with SSE feedback

Phase 4: Universal CLI Studio & Manifest Persistence
         ├── Implement POST /api/adapters/dry-run for pre-flight testing
         ├── Implement POST /api/adapters with YAML persistence in $DATA_DIR/adapters/
         └── Add "Register Custom CLI" modal in Web Console with interactive validation
```

This contract establishes a complete, secure, and production-grade substrate that gives developers full host environment control while strictly safeguarding system boundaries and automating CLI discovery.
