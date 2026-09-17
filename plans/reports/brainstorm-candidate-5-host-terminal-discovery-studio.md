# Architectural Brainstorm & Contract Proposal: Host Server Terminal, Dynamic Discovery Engine, and Universal Manual CLI Registration

**Candidate:** Candidate 5  
**Mode:** `ak-brainstorm --ultra`  
**Target:** `cli-to-api` Web Console, WebSocket Gateway & Process Supervisor Subsystems  
**Date:** 2026-09-16  

---

## 1. Outcome

`cli-to-api` transitions from a passive, sandboxed-only CLI reverse proxy into an **active, self-contained AI CLI Operations Platform (Cyber-Deck Ops Console)**. The platform enables developers to install host packages, discover installed CLIs on the fly, and onboard arbitrary internal or third-party AI tools directly from the browser without leaving the Web Console or restarting the daemon.

```
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    OBSIDIAN CYBER-DECK WEB CONSOLE                                        |
|  [Fleet Overview]   [Model Catalog]   [Accounts]   [WebShell (Dual-Plane)]   [Playground]   [Inspector]   |
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
       │                                     │                                      │
       │ 1. Ephemeral Ticket Handshake       │ 2. Re-Scan Trigger                   │ 3. Schema & Dry-Run
       ▼                                     ▼                                      ▼
+──────────────────────+          +─────────────────────────+            +──────────────────────────────────+
|  DUAL-PLANE WEBSHELL |          |    DYNAMIC DISCOVERY    |            |       MANUAL CLI STUDIO          |
|      GATEWAY         |          |         ENGINE          |            |           (WIZARD)               |
|                      |          |                         |            |                                  |
| • Loopback Guard     |          | • Single-Flight Mutex   |            | • Zod Pre-flight Validation      |
| • Ephemeral OTT Auth |          | • PATH/PATHEXT Prober   |            | • Isolated 3s Dry-Run Probe      |
| • Terminal Planes:   |          | • Package Root Sweep    |            | • Dual-Plane Persistence:        |
|   - Host System Shell|          |   (npm/pnpm/cargo/brew) |            |   YAML ($DATA_DIR/adapters/*.yaml|
|   - Account Sandbox  |          | • Reactive Catalog Sync |            |   + SQLite WAL Schema Sync       |
+──────────────────────+          +─────────────────────────+            +──────────────────────────────────+
       │                                     │                                      │
       ▼                                     ▼                                      ▼
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                        PROCESS SUPERVISOR SUBSTRATE                                       |
|  • Win32 Job Objects (KILL_ON_JOB_CLOSE)  /  POSIX Process Groups (setsid + SIGKILL to -pgid)             |
|  • Zero-Zombie Termination Guarantee (<= 200ms on socket disconnect or client abort)                     |
|  • Dynamic Model Catalog Projection (`GET /v1/models`) & Load Balancing (`POST /v1/chat/completions`)     |
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

### Core System Deliverables

1. **Dual-Plane Web Terminal Architecture (Host Shell vs. Account Sandbox Jail):**
   - **Plane A: Account Sandbox Jail:** The existing contained terminal, strictly isolated to `$DATA_DIR/sandboxes/{adapter}/{account}` with isolated `$HOME` / `%USERPROFILE%`, purged host credentials (`OPENAI_API_KEY`, `GH_TOKEN`), and `CI=1`. Used strictly for isolated CLI login sessions (`claude login`, `codex login`) without host contamination.
   - **Plane B: Host Server Terminal:** An unrestricted administrative terminal running in the host user's environment (`os.homedir()`, host `PATH`, host npm/pnpm/pip/cargo roots). Enables developers to execute package installations directly on the machine hosting the daemon (e.g., `npm i -g @anthropic-ai/claude-code`, `pnpm add -g @openpipe/opencode`, `pip install aider-chat`, `winget install ...`).
   - **Zero-Trust Access Boundary:** Defends against Remote Code Execution (RCE) and Cross-Site WebSocket Hijacking (CSWSH) via loopback-only IP binding guards, cryptographic One-Time Ticket (OTT) handshakes, explicit user safety confirmation modals, and visual cyber-deck status demarcation.

2. **Reactive Provider Reload & Auto-Discovery Engine:**
   - A dedicated UI action (**"Reload & Discover Providers"**) coupled with an idempotent backend sweep endpoint (`POST /api/adapters/discover`).
   - Re-scans host system `PATH`, Windows `PATHEXT` (`.com`, `.exe`, `.bat`, `.cmd`, `.ps1`), and package manager global directories (`%APPDATA%/npm`, `%LOCALAPPDATA%/pnpm`, `~/.cargo/bin`, Scoop, Homebrew, WinGet links).
   - Reconciles discovered tools against declarative blueprints in real time, updating adapter operational status (`NOT_INSTALLED` $\rightarrow$ `INSTALLED`), auto-provisioning verified accounts, refreshing the in-memory Model Catalog, and broadcasting SSE status deltas without restarting the server.

3. **Universal Manual CLI Registration Studio:**
   - An interactive UI Studio modal and REST API (`POST /api/adapters/manual`) empowering users to configure any custom or internal CLI when auto-detection is impossible (e.g., custom binary paths, wrapper scripts, virtualenvs, specific flags, or internal enterprise models).
   - End-to-end configuration: executable path, invocation argument templates, prompt transport modes (`stdin`, `argv`, `temp_file`), execution modes (`pipe` vs `pty`), model lists with tier mappings (`low`, `medium`, `high`, `xhigh`), context windows, and rate-limit regex patterns.
   - Pre-flight validation pipeline with an isolated $\le 3{,}000\text{ms}$ dry-run probe executing within a Win32 Job Object / POSIX process group to verify execution viability before saving.
   - Dual-plane persistence: stores human-readable configurations in `$DATA_DIR/adapters/{id}.yaml` and syncs them into SQLite WAL, surviving daemon updates and reinstalls.

---

## 2. Constraints

1. **Host Terminal Access Control & Zero-Trust Boundary:**
   - Host Server Terminal access must default to **Loopback Only (`127.0.0.1` / `::1`)**. If the gateway is started on `HOST=0.0.0.0`, all incoming WebSocket connections to the host terminal from non-loopback IP addresses must be rejected immediately (HTTP 403 / WS 1008 Policy Violation) unless explicitly authorized via an environment flag (`CTA_ALLOW_REMOTE_HOST_TERMINAL=true`) and validated against `ADMIN_TOKEN`.
   - Long-lived API keys or Admin tokens must **never** be transmitted via WebSocket URL query parameters (e.g., `ws://localhost:8080/api/ws/terminal?token=...`), which leak in HTTP server access logs, reverse-proxy telemetry, and browser history. Authentication must use a short-lived, single-use **Ephemeral Ticket (TTL $\le 15\text{s}$)** exchanged via an authenticated `POST /api/ws/ticket` request.
2. **Process Containment & Zero-Zombie Guarantee ($\le 200\text{ms}$):**
   - Every spawned host terminal process, sandbox terminal process, and manual CLI dry-run probe must be contained in an OS-level supervisory wrapper: Win32 Job Objects with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` on Windows, and POSIX Process Groups (`setsid` + `SIGKILL` to `-pgid`) on Linux/macOS.
   - Upon browser disconnect, WebSocket error, or probe timeout, all descendant processes (including package managers, npm/npx wrappers, Python sub-shells, and shell interpreters) must be killed within $\le 200\text{ms}$.
3. **Cross-Platform Shell & Environment Agnosticism:**
   - Terminal spawning and binary probing must operate deterministically across Windows 11 (`cmd.exe`, `powershell.exe`, PowerShell Core `pwsh.exe`, `PATHEXT`, `.bat`/`.cmd`/`.ps1`) and POSIX systems (Linux, macOS, `bash`, `zsh`, system `PATH`, Homebrew).
   - Windows PowerShell scripts (`.ps1`) must be executed via `-NoProfile -ExecutionPolicy Bypass -File <path>` wrappers to eliminate Node.js CVE-2024-27980 command injection and `EINVAL` spawn errors.
4. **Non-Blocking Ingress & Discovery Mutex:**
   - Auto-discovery PATH rescans and dry-run CLI test probes must run fully asynchronously. The Fastify event loop and active OpenAI streaming completions (`/v1/chat/completions`) must never block.
   - Concurrent discovery triggers (e.g., rapid button clicks or concurrent webhook invocations) must be protected by a Single-Flight Mutex: exactly one scan runs, with at most one trailing scan debounced. Full host PATH inspection must complete within $\le 300\text{ms}$.
5. **OpenAI Protocol Compliance:**
   - Newly discovered or manually registered models must conform 100% to OpenAI API JSON envelopes (`GET /v1/models`, `POST /v1/chat/completions`). Uninstalled, misconfigured, or broken CLIs must yield standard OpenAI error envelopes (`invalid_request_error`) without non-standard error codes.
6. **Dual-Plane Data Persistence Safety:**
   - Manual CLI registrations must write atomic YAML files to `$DATA_DIR/adapters/{id}.yaml` and execute SQLite WAL transactions using Drizzle ORM. Changes must survive application binary updates, container re-creations, and schema migrations.

---

## 3. Non-goals

1. **Automated Headless Package Installation:** The gateway will not execute package manager install scripts autonomously without user direction (e.g., it will not silently run `npm i -g @anthropic-ai/claude-code`). Package installation is performed interactively by the user inside the Host Server Terminal.
2. **OS Privilege Escalation (Sudo/UAC Bypass):** The Host Server Terminal runs with the exact security token and privilege level of the parent Node.js gateway process. The gateway will not include privilege escalation exploits, UAC bypasses, or setuid escalations.
3. **Public Multi-Tenant SaaS Isolation:** The system is explicitly engineered for local developer workstations, team edge boxes, and private LAN development appliances. It is not designed to serve as an unauthenticated multi-tenant public internet hosting provider.
4. **General-Purpose IDE / File Manager Replacement:** The Web Console terminal and studio are dedicated to CLI operations, package management, authentication, and adapter configuration; building a full cloud IDE (Monaco file explorer, git staging GUI) is out of scope.
5. **Direct Binary Decompilation or Protocol Reverse Engineering:** The gateway treats CLIs as standard black-box stdin/stdout/PTY executables and does not decompile or bypass third-party proprietary CLI binaries.

---

## 4. Acceptance Criteria (Concrete, Verifiable)

### AC-1: Dual-Plane Terminal Demarcation & Environment Isolation
- **Given** an authenticated user in the Web Console.
- **When** the user launches an **Account Sandbox Terminal** for `codex-cli / codex-acc-1`:
  1. The working directory (`cwd`) is `$DATA_DIR/sandboxes/codex-cli/codex-acc-1/workspace`.
  2. `HOME` and `USERPROFILE` resolve strictly to `$DATA_DIR/sandboxes/codex-cli/codex-acc-1`.
  3. Sensitive host environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CODEX_API_KEY`, `GH_TOKEN`, `GITHUB_TOKEN`) are completely stripped (`undefined`).
  4. The UI displays an Indigo/Slate Sandbox badge: `SANDBOX JAIL: /sandboxes/codex-cli/codex-acc-1`.
- **When** the user launches the **Host Server Terminal**:
  1. The working directory (`cwd`) defaults to the host user's actual home directory (`os.homedir()`).
  2. `HOME`, `USERPROFILE`, `APPDATA`, and `PATH` match the host machine's environment.
  3. Commands such as `npm i -g @anthropic-ai/claude-code` or `pnpm add -g opencode` successfully install binaries into the host machine's global bin directory.
  4. The UI displays a distinct Amber/Crimson Warning banner: `⚠️ HOST SYSTEM SHELL - UNRESTRICTED OS ACCESS`.
- **When** the browser tab is closed or the WebSocket disconnects:
  1. All child processes spawned in either terminal plane are terminated via Win32 Job Object or POSIX process group in $\le 200\text{ms}$. Zero zombie processes remain.

### AC-2: Host Terminal Access Boundary & Ephemeral Ticket Security
- **Given** the gateway daemon running on `HOST=0.0.0.0:8080`.
- **When** a client initiates a WebSocket connection to `/api/ws/host-terminal` without a valid ticket:
  1. The gateway rejects the connection with WebSocket Close Code `1008 (Policy Violation)` and HTTP 401/403.
- **When** a client attempts to connect using an API key directly in query params (e.g. `?token=sk-cta-...`):
  1. The gateway rejects the connection with Close Code `1008` and logs an explicit security advisory.
- **When** an authenticated user opens the Host Terminal:
  1. The browser issues `POST /api/ws/ticket` with `Authorization: Bearer <API_KEY>` or `Admin Token`.
  2. The server generates a single-use crypto ticket `{ ticket: string, expiresAt: number }` with a 15-second TTL.
  3. The browser connects to `ws://localhost:8080/api/ws/host-terminal?ticket=<TICKET>`.
  4. The server validates, immediately invalidates (single-use), and upgrades the connection.
- **When** an incoming connection to Host Terminal originates from a non-loopback IP address (e.g., `192.168.1.50`):
  1. If `CTA_ALLOW_REMOTE_HOST_TERMINAL` is `false` (default), the gateway immediately aborts the connection with HTTP 403 / Close Code `1008` and logs a security audit warning.
  2. If `CTA_ALLOW_REMOTE_HOST_TERMINAL` is `true`, access is permitted only if the ticket was acquired using `ADMIN_TOKEN`.

### AC-3: Provider Reload & Auto-Discovery Button
- **Given** an adapter blueprint `claude-code.yaml` with operational status `NOT_INSTALLED`.
- **When** the user installs `@anthropic-ai/claude-code` via the Host Server Terminal and clicks **"Reload & Discover Providers"** in the Web Console (or issues `POST /api/adapters/discover`):
  1. The gateway executes an asynchronous host PATH and package root scan in $\le 300\text{ms}$.
  2. The resolver detects the executable `claude` (`.cmd` / `.exe` / POSIX binary) at its global installation path.
  3. The database record in `adapters` transitions from `is_installed = false, status = "NOT_INSTALLED"` to `is_installed = true, status = "INSTALLED", resolved_path = "<path>"`.
  4. If `claude-code` has 0 accounts, a default verified account (`claude-code-acc-01`) is auto-provisioned.
  5. The in-memory `AdapterRegistry` and `ModelCatalog` register all declared models for `claude-code`.
  6. An SSE event `adapter:discovered` is broadcast over `/api/admin/events`.
  7. The Web Console UI dynamically transitions the status pill from gray `NOT INSTALLED` to green `READY` without requiring a full browser refresh.
- **When** multiple reload requests are dispatched simultaneously:
  1. The backend Single-Flight Mutex coalesces requests, ensuring only 1 active probe runs at a time.

### AC-4: Manual CLI Input & Universal Registration Studio
- **Given** a user navigating to the "Model Catalog & Adapters" view in Web Console.
- **When** the user clicks **"Register Custom CLI"** and completes the Studio modal with:
  - Adapter ID: `devin-cli`
  - Name: `Cognition Devin CLI`
  - Executable: `D:\tools\devin.exe` (or `devin`)
  - Execution Mode: `pipe`
  - Prompt Transport: `argv`
  - Invocation Args: `["run", "--prompt", "{prompt}", "--model", "{model}"]`
  - Declared Models: `[{"id": "devin-v1", "name": "Devin Autonomous Model", "tier": "high", "context_window": 200000}]`
- **When** the user clicks **"Test & Verify"**:
  1. The gateway executes a pre-flight probe: spawns the executable with `--version` or `--help` inside a Win32 Job Object with a hard $3{,}000\text{ms}$ timeout.
  2. If execution fails, exits non-zero, or times out, the UI renders the exact stderr output with inline remediation guidance.
  3. If execution succeeds, the UI renders the detected version string and enables the **"Save Adapter"** button.
- **When** the user clicks **"Save Adapter"**:
  1. The gateway writes the configuration to `$DATA_DIR/adapters/devin-cli.yaml`.
  2. The gateway records the adapter into the SQLite `adapters` and `models` tables.
  3. A default account `devin-cli-acc-01` and directory sandbox `$DATA_DIR/sandboxes/devin-cli/devin-cli-acc-01` are created.
  4. The model `devin-cli/devin-v1` immediately appears in `GET /v1/models` and is dispatchable via `POST /v1/chat/completions`.

---

## 5. Compared Approaches

| Evaluation Criterion | Approach A: Unified Shell with In-Band Privilege Elevation | Approach B: Bifurcated Dual-Plane PTY with Ephemeral Ticket Security (Recommended) | Approach C: Containerized Sidecar Virtualization (Docker / Podman) |
| :--- | :--- | :--- | :--- |
| **Architectural Model** | Single terminal endpoint. Commands run with mixed permissions; user manually switches paths. | Two strictly segregated PTY planes: Sandbox Jail vs Host System Shell, gated by ticket auth. | Web terminal connects to an isolated Docker container with host socket mounted. |
| **Package Installation on Host** | Broken or hazardous: npm installs into sandbox directories, or pollutes sandbox node_modules. | **Native & Clean:** Host terminal runs in host user context; packages install directly into host global bin. | Indirect & Complex: Requires mounting host root filesystem and chrooting into host. |
| **Security & Containment Boundary** | **Severe Security Hazard:** Arbitrary shell access without ticket auth; easily exploitable via CSWSH. | **Airtight:** Loopback-only gate, 15s single-use ephemeral ticket, explicit UI warning modal. | Strong container boundaries, but mounting host Docker socket grants root host takeover anyway. |
| **Auto-Discovery & Dynamic Reload** | Manual daemon restart required to re-read system PATH. | **Reactive & Instant:** Debounced single-flight PATH sweep with SSE broadcast; UI updates dynamically. | Slow: Must inspect container mounts or restart sidecar containers. |
| **Manual CLI Registration** | Users must manually craft YAML files in filesystem with zero UI feedback or validation. | **Interactive Studio:** Web form with Zod schema validation and live pre-flight dry-run execution probe. | Complex: Users must build custom Docker images for every newly added CLI tool. |
| **Platform Compatibility** | Windows, Linux, macOS. | Windows 11 (`cmd`/`pwsh`/Job Objects), Linux (`bash`/setsid), macOS (`zsh`). Zero native dependencies outside `node-pty`. | **Fails on non-Docker hosts:** Fails on plain dev machines or corporate laptops lacking Docker Desktop. |
| **Resource Overhead** | $\le 10\text{MB}$ RAM. | $\le 15\text{MB}$ RAM, zero container daemon dependency. | $\ge 1.5\text{GB}$ RAM, persistent container engine daemon. |
| **Primary Assumption** | Developers can be trusted to manage path variables and sandbox hygiene manually without guardrails. | Host system package operations and multi-account sandboxing require distinct execution contexts and security policies. | Every developer machine running `cli-to-api` has a running, configured Docker daemon. |
| **First Failure Condition** | Untrusted scripts or LAN attackers access terminal via CSWSH and compromise host machine credentials. | Gateway bound to public internet with default admin password and remote host terminal explicitly enabled. | User runs daemon on a standard Windows machine without WSL2/Docker installed. |

---

## 6. Recommended Direction & Rationale

**Approach B (Bifurcated Dual-Plane PTY with Ephemeral Ticket Security)** is recommended. It delivers complete administrative autonomy for host CLI installation while maintaining an uncompromising security boundary around the gateway's core multi-tenant directory sandboxes.

---

### 6.1 Dual-Plane Terminal Architecture & Host Security Boundary

The existing `apps/gateway/src/api/ws/webshell.ts` and `apps/web/src/views/WebShellView.tsx` conflate interactive CLI authentication (`codex login`) with system maintenance. These are separated into two distinct architectural planes:

```
                                  [ WEB BROWSER CONSOLE ]
                                             │
             ┌───────────────────────────────┴───────────────────────────────┐
             │ 1. POST /api/ws/ticket (Authorization: Bearer <token>)        │
             ▼                                                               ▼
  [ Plane A: Sandbox WebShell ]                                   [ Plane B: Host Server Terminal ]
  ws://host/api/ws/terminal?ticket=...                            ws://host/api/ws/host-terminal?ticket=...
             │                                                               │
             ▼                                                               ▼
  [ SandboxPtyManager ]                                           [ HostPtyManager ]
  • Target: Account directory                                     • Target: Host user root (os.homedir())
  • Jail: $DATA_DIR/sandboxes/{adp}/{acc}                         • CWD: Real host user workspace
  • Environment: Cloned host with:                               • Environment: Full host process.env
    - Purged API Keys (OPENAI_*, GH_*)                            • System PATH preserved (npm, pnpm, pip, cargo)
    - HOME & USERPROFILE rewritten to Jail                        • Interactive shell: cmd.exe / pwsh / bash
    - CI="1"                                                      • Boundary Guard: Loopback only (127.0.0.1)
  • Containment: Win32 Job Object                                 • Containment: Win32 Job Object
```

#### 6.1.1 Cryptographic Ephemeral Ticket Handshake (Preventing CSWSH & Query Log Leaks)
Because native browser `WebSocket(url)` cannot include custom HTTP headers (`Authorization: Bearer ...`), passing credentials in URL queries is a recognized vulnerability (CWE-598). We introduce a cryptographic single-use ticket mechanism:

```
Client                             Fastify Gateway Server                       PTY Process
  │                                           │                                      │
  │ 1. POST /api/ws/ticket                    │                                      │
  │    Header: "Authorization: Bearer ..."    │                                      │
  │    Body: { type: "host" | "sandbox" }     │                                      │
  ├──────────────────────────────────────────>│                                      │
  │                                           │ [Validate API Key / Admin Token]     │
  │                                           │ [Generate 128-bit Token, TTL: 15s]   │
  │ 2. HTTP 200 { ticket: "ott_3f9a..." }     │                                      │
  │<──────────────────────────────────────────┤                                      │
  │                                           │                                      │
  │ 3. WebSocket Connect:                     │                                      │
  │    ws://localhost:8080/api/ws/host-terminal?ticket=ott_3f9a...                   │
  ├──────────────────────────────────────────>│                                      │
  │                                           │ [Validate Ticket & Revoke (Burn)]    │
  │                                           │ [Loopback Verification]              │
  │                                           │ [Spawn Host PTY]                     │
  │                                           ├─────────────────────────────────────>│
  │ 4. WS Upgrade Success                     │                                      │
  │<──────────────────────────────────────────┤                                      │
```

#### 6.1.2 Ticket Service Implementation Specification (`apps/gateway/src/api/ws/ticket-store.ts`)
```typescript
import crypto from "node:crypto";

export interface WsTicket {
  ticket: string;
  type: "host" | "sandbox";
  adapterId?: string;
  accountId?: string;
  createdAt: number;
  expiresAt: number;
}

export class TicketStore {
  private tickets = new Map<string, WsTicket>();

  public createTicket(type: "host" | "sandbox", context?: { adapterId?: string; accountId?: string }): string {
    const ticket = `ott_${crypto.randomBytes(24).toString("hex")}`;
    const now = Date.now();
    this.tickets.set(ticket, {
      ticket,
      type,
      adapterId: context?.adapterId,
      accountId: context?.accountId,
      createdAt: now,
      expiresAt: now + 15_000, // 15-second single-use TTL
    });
    return ticket;
  }

  public consumeTicket(ticket: string): WsTicket | null {
    const record = this.tickets.get(ticket);
    if (!record) return null;
    this.tickets.delete(ticket); // Instant single-use burn
    if (Date.now() > record.expiresAt) return null;
    return record;
  }

  public purgeExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.tickets.entries()) {
      if (now > v.expiresAt) this.tickets.delete(k);
    }
  }
}

export const globalTicketStore = new TicketStore();
```

#### 6.1.3 Host Server Terminal WebSocket Route (`apps/gateway/src/api/ws/host-terminal.ts`)
```typescript
import { FastifyInstance, FastifyRequest } from "fastify";
import * as pty from "node-pty";
import os from "node:os";
import type { WebSocket } from "ws";
import { globalTicketStore } from "./ticket-store.js";
import { env } from "../../config/env.js";
import { resolveBinary } from "../../adapters/resolver.js";
import { createProcessGroupOrJob } from "../../supervisor/process-group.js";

export async function registerHostTerminalWs(fastify: FastifyInstance): Promise<void> {
  // Ticket issuance endpoint (Guarded by standard auth middleware)
  fastify.post("/api/ws/ticket", async (req, reply) => {
    const body = req.body as { type: "host" | "sandbox"; adapterId?: string; accountId?: string };
    const type = body?.type === "host" ? "host" : "sandbox";

    // Enforce admin privileges for host terminal
    if (type === "host") {
      const authHeader = req.headers.authorization?.replace("Bearer ", "").trim();
      const isAdmin = authHeader === env.ADMIN_TOKEN || authHeader === env.DEFAULT_API_KEY;
      if (!isAdmin) {
        return reply.status(403).send({ error: "Admin token required to open host terminal" });
      }
    }

    const ticket = globalTicketStore.createTicket(type, body);
    return reply.send({ ticket, expiresIn: 15 });
  });

  // Host Terminal WebSocket
  fastify.get("/api/ws/host-terminal", { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    const ip = req.socket.remoteAddress || "";
    const isLoopback = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";

    // 1. Loopback Access Boundary Gate
    if (!isLoopback && !env.ALLOW_REMOTE_HOST_TERMINAL) {
      socket.close(1008, "Host terminal access restricted to loopback (127.0.0.1)");
      return;
    }

    // 2. Consume Ephemeral Ticket
    const query = (req.query || {}) as { ticket?: string };
    const ticketRecord = query.ticket ? globalTicketStore.consumeTicket(query.ticket) : null;
    if (!ticketRecord || ticketRecord.type !== "host") {
      socket.close(1008, "Invalid or expired host terminal ticket");
      return;
    }

    // 3. Resolve Host Shell
    const isWin = process.platform === "win32";
    const shellBinary = isWin
      ? (process.env.ComSpec || resolveBinary("powershell.exe").spawnExecutable || "cmd.exe")
      : (process.env.SHELL || "bash");

    // 4. Spawn Unrestricted Host PTY under Supervisor Job Object
    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(shellBinary, [], {
        name: "xterm-256color",
        cols: 100,
        rows: 30,
        cwd: os.homedir(), // Real host user home directory
        env: process.env as Record<string, string>, // Unaltered host environment with full PATH
      });
    } catch (err: unknown) {
      socket.send(JSON.stringify({ type: "error", message: String(err) }));
      socket.close();
      return;
    }

    // Register with OS containment to eliminate zombies on crash
    const containment = createProcessGroupOrJob(ptyProcess.pid);

    ptyProcess.onData((data: string) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "data", data }));
      }
    });

    socket.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "data") ptyProcess.write(msg.data);
        if (msg.type === "resize") ptyProcess.resize(msg.cols, msg.rows);
      } catch {
        ptyProcess.write(raw.toString());
      }
    });

    socket.on("close", () => {
      try {
        containment.terminateSync(); // Guarantees <= 200ms process tree kill
        ptyProcess.kill();
      } catch {}
    });
  });
}
```

---

### 6.2 Provider Reload & Dynamic Auto-Discovery Engine

When a developer installs a new tool in the Host Terminal (e.g. `npm i -g @anthropic-ai/claude-code`), the gateway must recognize its presence without a daemon restart.

```
                    [ RELOAD & AUTO-DISCOVERY LIFECYCLE ]

  [ UI: "Reload & Discover" ] ──> POST /api/adapters/discover
                                            │
                                            ▼
                           +─────────────────────────────────+
                           |    SINGLE-FLIGHT MUTEX LOCK     |
                           | (Prevents Stampeding Rescans)   |
                           +─────────────────────────────────+
                                            │
                                            ▼
                           +─────────────────────────────────+
                           |      MULTI-PATH PATH PROBER     |
                           | • Host PATH + PATHEXT (.cmd/ps1)|
                           | • %APPDATA%/npm, %LOCALAPPDATA% |
                           | • ~/.cargo/bin, Scoop, Brew     |
                           +─────────────────────────────────+
                                            │
                      ┌─────────────────────┴─────────────────────┐
                      ▼                                           ▼
             [ Blueprint Found ]                         [ Blueprint Absent ]
                      │                                           │
                      ▼                                           ▼
         Probe Binary via `--version`                Auto-Match Recipe Blueprint
           (3,000ms Hard Timeout)                     (claude, opencode, aider)
                      │                                           │
                      ▼                                           ▼
         Status: INSTALLED / DEGRADED                Create SQLite Blueprint Row
                      │                                           │
                      └─────────────────────┬─────────────────────┘
                                            │
                                            ▼
                           +─────────────────────────────────+
                           |  SYNCHRONIZE ADAPTER REGISTRY   |
                           | • Update isInstalled & Status   |
                           | • Auto-provision default acc    |
                           | • Re-project Model Catalog      |
                           | • Broadcast SSE Discovery Event |
                           +─────────────────────────────────+
                                            │
                                            ▼
                            HTTP 200 { scanned, discovered: [...] }
```

#### 6.2.1 Discovery Engine & Single-Flight Mutex (`apps/gateway/src/adapters/discovery.ts`)
```typescript
import { globalAdapterRegistry } from "./registry.js";
import { resolveBinary } from "./resolver.js";
import { db } from "../db/index.js";
import { adapters, accounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { provisionSandbox } from "../supervisor/sandbox.js";
import { dataDir } from "../config/paths.js";
import { broadcastAdminEvent } from "../api/routes/admin-events.js";

export interface DiscoveryReport {
  scannedAt: number;
  durationMs: number;
  totalBlueprints: number;
  installedCount: number;
  discoveredAdapters: Array<{ id: string; name: string; resolvedPath: string; isNew: boolean }>;
}

export class DynamicDiscoveryEngine {
  private scanPromise: Promise<DiscoveryReport> | null = null;

  public async discoverAll(): Promise<DiscoveryReport> {
    // Single-Flight Coalescing: Return running scan if one is already active
    if (this.scanPromise) {
      return this.scanPromise;
    }

    this.scanPromise = this.executeScan().finally(() => {
      this.scanPromise = null;
    });

    return this.scanPromise;
  }

  private async executeScan(): Promise<DiscoveryReport> {
    const startTime = Date.now();
    const loadedAdapters = globalAdapterRegistry.getAllAdapters();
    const discovered: DiscoveryReport["discoveredAdapters"] = [];

    for (const adapter of loadedAdapters) {
      const probe = resolveBinary(adapter.config.executable);
      const isCurrentlyInstalled = probe.isInstalled;
      const wasInstalled = adapter.isInstalled;

      // Update in-memory registry
      adapter.isInstalled = isCurrentlyInstalled;
      adapter.resolvedExecutable = probe;

      // Update SQLite WAL
      await db
        .update(adapters)
        .set({
          isInstalled: isCurrentlyInstalled,
          resolvedPath: probe.resolvedPath || "",
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(adapters.id, adapter.config.id));

      if (isCurrentlyInstalled) {
        discovered.push({
          id: adapter.config.id,
          name: adapter.config.name,
          resolvedPath: probe.resolvedPath!,
          isNew: !wasInstalled,
        });

        // Auto-provision initial sandbox account if none exists
        const existingAccs = await db.select().from(accounts).where(eq(accounts.adapterId, adapter.config.id));
        if (existingAccs.length === 0) {
          const accId = `${adapter.config.id}-acc-01`;
          const sandbox = await provisionSandbox({ dataDir, adapterId: adapter.config.id, accountId: accId });
          await db.insert(accounts).values({
            id: accId,
            adapterId: adapter.config.id,
            name: `Default ${adapter.config.name} Account`,
            sandboxDir: sandbox.sandboxDir,
            status: "READY",
            maxSlots: adapter.config.concurrency.max_concurrent_per_account,
          });
        }
      }
    }

    // Broadcast Real-Time SSE to all open Web Consoles
    broadcastAdminEvent("discovery:completed", {
      discoveredCount: discovered.length,
      timestamp: Date.now(),
    });

    return {
      scannedAt: Date.now(),
      durationMs: Date.now() - startTime,
      totalBlueprints: loadedAdapters.length,
      installedCount: discovered.length,
      discoveredAdapters: discovered,
    };
  }
}

export const globalDiscoveryEngine = new DynamicDiscoveryEngine();
```

#### 6.2.2 Admin Discovery REST Route (`apps/gateway/src/api/routes/admin-adapters.ts`)
```typescript
fastify.post("/api/adapters/discover", async (_req, reply) => {
  const report = await globalDiscoveryEngine.discoverAll();
  return reply.send({ success: true, report });
});
```

---

### 6.3 Manual CLI Input & Universal Registration Studio

For internal enterprise tools, custom wrapper scripts, or third-party CLIs without pre-bundled YAML blueprints, the system provides an interactive registration pipeline.

```
                           [ MANUAL CLI REGISTRATION PIPELINE ]

  [ Web Studio Modal ] ──> Input: Executable, Args Template, Transport, Models
                                            │
                                            ▼
                           +─────────────────────────────────+
                           |    1. ZOD SCHEMA SANITIZATION   |
                           | Check ID, executable, arguments |
                           +─────────────────────────────────+
                                            │
                                            ▼
                           +─────────────────────────────────+
                           |    2. PRE-FLIGHT DRY-RUN PROBE  |
                           | • Spawns binary with --version  |
                           | • Win32 Job / POSIX PGID        |
                           | • 3,000ms Hard Timeout Kill     |
                           +─────────────────────────────────+
                                            │
                      ┌─────────────────────┴─────────────────────┐
                      ▼                                           ▼
             [ Probe Exited 0 ]                         [ Probe Failed / Timeout ]
                      │                                           │
                      ▼                                           ▼
     +─────────────────────────────────+             Return HTTP 400 with Stderr
     |    3. DUAL-PLANE PERSISTENCE    |
     | • Write $DATA_DIR/adapters/*.yaml|
     | • Insert into SQLite DB         |
     +─────────────────────────────────+
                      │
                      ▼
     +─────────────────────────────────+
     | 4. REGISTRY & SANDBOX PROVISION |
     | • Register in globalAdapterReg  |
     | • Provision Default Sandbox Acc |
     | • Project into GET /v1/models   |
     +─────────────────────────────────+
                      │
                      ▼
        HTTP 201 Created & Model Live in Cursor / Continue.dev
```

#### 6.3.1 Manual Adapter Input Zod Contract (`apps/gateway/src/adapters/schema.ts`)
```typescript
import { z } from "zod";

export const ManualAdapterInputSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/, "Adapter ID must be kebab-case or alphanumeric"),
  name: z.string().min(2, "Display name is required"),
  version: z.string().default("1.0.0"),
  executable: z.string().min(1, "Executable path or binary name is required"),
  execution_mode: z.enum(["pipe", "pty"]).default("pipe"),
  prompt_transport: z.enum(["argv", "stdin", "temp_file", "auto"]).default("auto"),
  args_template: z.array(z.string()).min(1, "At least one argument or flag must be provided"),
  models: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      tier: z.enum(["low", "medium", "high", "xhigh"]).default("medium"),
      context_window: z.number().int().positive().default(128000),
      cost_weight: z.number().positive().default(1.0),
      is_default: z.boolean().default(false),
    })
  ).min(1, "At least one model definition is required"),
  working_dir_template: z.string().default("{account_dir}/workspace"),
  timeout_seconds: z.number().int().positive().default(300),
});

export type ManualAdapterInput = z.infer<typeof ManualAdapterInputSchema>;
```

#### 6.3.2 Pre-Flight Dry-Run Execution Probe (`apps/gateway/src/adapters/prober.ts`)
```typescript
import { execa } from "execa";
import { resolveBinary } from "./resolver.js";
import { createProcessGroupOrJob } from "../supervisor/process-group.js";

export interface DryRunProbeResult {
  ok: boolean;
  resolvedPath: string;
  detectedVersion?: string;
  error?: string;
  durationMs: number;
}

export async function executeDryRunProbe(executable: string): Promise<DryRunProbeResult> {
  const start = Date.now();
  const binary = resolveBinary(executable);

  if (!binary.isInstalled || !binary.resolvedPath) {
    return {
      ok: false,
      resolvedPath: "",
      error: `Executable '${executable}' could not be located on host PATH or filesystem.`,
      durationMs: Date.now() - start,
    };
  }

  try {
    const child = execa(binary.spawnExecutable, [...binary.spawnPrefixArgs, "--version"], {
      timeout: 3000, // Strict 3s containment
      cleanup: true,
      env: { ...process.env, CI: "1" },
    });

    const containment = createProcessGroupOrJob(child.pid!);
    const { stdout, stderr } = await child;
    containment.terminateSync();

    return {
      ok: true,
      resolvedPath: binary.resolvedPath,
      detectedVersion: (stdout || stderr).trim().split("\n")[0].substring(0, 100),
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      resolvedPath: binary.resolvedPath,
      error: `Probe execution failed: ${msg}`,
      durationMs: Date.now() - start,
    };
  }
}
```

#### 6.3.3 Registration Controller (`apps/gateway/src/api/routes/admin-adapters.ts`)
```typescript
import yaml from "js-yaml";
import fs from "node:fs/promises";
import path from "node:path";
import { ManualAdapterInputSchema } from "../../adapters/schema.js";
import { executeDryRunProbe } from "../../adapters/prober.js";
import { dataDir } from "../../config/paths.js";
import { globalAdapterRegistry } from "../../adapters/registry.js";
import { loadAdapterFromPath } from "../../adapters/loader.js";
import { db } from "../../db/index.js";
import { adapters, models } from "../../db/schema.js";

export function registerManualAdapterRoutes(fastify: FastifyInstance): void {
  fastify.post("/api/adapters/manual", async (req, reply) => {
    // 1. Zod Schema Validation
    const parseResult = ManualAdapterInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.format(),
      });
    }
    const input = parseResult.data;

    // 2. Pre-Flight Dry-Run Containment Probe
    const probe = await executeDryRunProbe(input.executable);
    if (!probe.ok) {
      return reply.status(400).send({
        error: "CLI dry-run probe failed",
        message: probe.error,
        resolvedPath: probe.resolvedPath,
      });
    }

    // 3. Serialize to YAML in $DATA_DIR/adapters/
    const userAdaptersDir = path.join(dataDir, "adapters");
    await fs.mkdir(userAdaptersDir, { recursive: true });
    const yamlPath = path.join(userAdaptersDir, `${input.id}.yaml`);

    const fullConfig = {
      id: input.id,
      name: input.name,
      version: input.version,
      executable: input.executable,
      execution_mode: input.execution_mode,
      invocation: {
        args_template: input.args_template,
        prompt_transport: input.prompt_transport,
        working_dir_template: input.working_dir_template,
        timeout_seconds: input.timeout_seconds,
      },
      models: input.models,
      environment_isolation: {
        home_dir_override: true,
        xdg_override: true,
        env_overrides: {},
      },
      output_parser: {
        type: "regex_stream",
        strip_ansi: true,
        resolve_carriage_return: true,
        chunk_regex: "(?s)(.*)",
      },
      error_handling: {
        rate_limit_patterns: [],
      },
      concurrency: {
        max_concurrent_per_account: 1,
      },
    };

    await fs.writeFile(yamlPath, yaml.dump(fullConfig), "utf8");

    // 4. Load into Registry and Database
    const loaded = await loadAdapterFromPath(yamlPath);
    if (!loaded) {
      return reply.status(500).send({ error: "Failed to parse generated adapter YAML" });
    }
    globalAdapterRegistry.register(loaded);

    // 5. Sync to SQLite
    await db.insert(adapters).values({
      id: loaded.config.id,
      name: loaded.config.name,
      version: loaded.config.version,
      executable: loaded.config.executable,
      resolvedPath: probe.resolvedPath,
      executionMode: loaded.config.execution_mode,
      configJson: JSON.stringify(loaded.config),
      isInstalled: true,
    }).onConflictDoUpdate({
      target: adapters.id,
      set: {
        name: loaded.config.name,
        resolvedPath: probe.resolvedPath,
        configJson: JSON.stringify(loaded.config),
        isInstalled: true,
      },
    });

    for (const m of loaded.config.models) {
      await db.insert(models).values({
        id: `${loaded.config.id}/${m.id}`,
        adapterId: loaded.config.id,
        modelId: m.id,
        name: m.name,
        tier: m.tier,
        contextWindow: m.context_window,
        costWeight: m.cost_weight,
        isDefault: m.is_default || false,
      }).onConflictDoNothing();
    }

    return reply.status(201).send({
      success: true,
      adapter: {
        id: loaded.config.id,
        name: loaded.config.name,
        resolvedPath: probe.resolvedPath,
        detectedVersion: probe.detectedVersion,
      },
    });
  });
}
```

---

### 6.4 Obsidian Cyber-Deck Web Console UX Specifications

To guarantee clarity and prevent operational confusion, the Web Console UI implements distinct, accessible visual conventions.

#### 1. Dual-Plane Terminal View (`apps/web/src/views/WebShellView.tsx`)
- **Mode Toggle Header:** A segmented controller switching between:
  - `[Account Sandboxes]` (Default): Dropdown for provisioned accounts (`codex-cli/codex-acc-1`, `claude-code/acc-01`). Visual styling in Slate/Indigo with jail indicator: `Jail: /sandboxes/{adp}/{acc}`.
  - `[Host Server Terminal]`: Visual styling transitions to Dark Obsidian Canvas with an Amber warning border (`border-amber-500/40`) and glowing pill: `⚠️ HOST SYSTEM SHELL (ROOT OS ACCESS)`.
- **First-Time Launch Safety Modal:** Launching the Host Terminal opens a confirmation modal:
  > *"Caution: You are opening an interactive shell directly on the host machine. Commands executed here run with the host process privileges and can modify files, install global packages, or delete data. Ensure you trust all executed scripts."*  
  > `[Cancel]` | `[Acknowledge & Launch Host Shell]` (Persisted to `localStorage`).

#### 2. Provider Reload & Auto-Discovery Component
- Positioned in the top-right action bar of the **Model Catalog** and **Fleet Overview** views:
  - **Button:** `[ ⟳ Reload & Discover ]` with a spinning radar icon during active probe.
  - **State Feedback:**
    - `idle`: Displays "Last scanned: 2 mins ago".
    - `scanning`: Icon spins with text "Probing host PATH & package roots...".
    - `success`: Green checkmark with brief toast: "Discovered 1 new provider: claude-code".

#### 3. Custom CLI Registration Studio Modal
- Accessible via **"Register Custom CLI"** button in Model Catalog.
- **Three-Panel Wizard:**
  1. **Identity & Binary:** Adapter ID, Name, Executable Path, "Detect / Browse" helper.
  2. **Invocation & Transport:** Arguments Template (`["exec", "--model", "{model}"]`), Prompt Transport selector (`stdin`, `argv`, `temp_file`).
  3. **Models & Verification:** Model ID, Tier selector (`low` / `medium` / `high` / `xhigh`), Context Window slider, and an interactive **"Run Pre-flight Probe"** button that executes a 3-second live test and prints the binary's version output before enabling **"Commit Registration"**.

---

### 6.5 Implementation Roadmap

```
Phase 1: Security & Host Terminal Core
├── 1.1 Implement TicketStore with 15s TTL single-use crypto tokens.
├── 1.2 Implement /api/ws/ticket endpoint with admin authentication guard.
├── 1.3 Implement /api/ws/host-terminal WebSocket route with loopback IP guard.
└── 1.4 Wire Win32 Job Object / POSIX process group containment to host PTY disconnect.

Phase 2: Discovery Engine & Provider Reload
├── 2.1 Build DynamicDiscoveryEngine with Single-Flight Mutex coalescing.
├── 2.2 Wire resolveBinary across system PATH, PATHEXT, npm, pnpm, Cargo, and Scoop.
├── 2.3 Implement POST /api/adapters/discover endpoint and SSE broadcast integration.
└── 2.4 Add "Reload & Discover" action button to Web Console with state animations.

Phase 3: Manual CLI Studio & Pre-Flight Probe
├── 3.1 Implement ManualAdapterInputSchema and Zod validator.
├── 3.2 Implement executeDryRunProbe with isolated 3,000ms timeout containment.
├── 3.3 Implement POST /api/adapters/manual with YAML serialization to $DATA_DIR/adapters/.
├── 3.4 Sync manual adapters into SQLite WAL schema and globalAdapterRegistry.
└── 3.5 Build Custom CLI Registration Studio modal in Web Console with pre-flight feedback.
```

This proposal establishes an auditable security boundary between account sandboxes and the host operating system, enables seamless on-the-fly CLI discovery, and provides an intuitive studio for custom AI CLI registration.
