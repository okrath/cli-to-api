# Architectural Brainstorm & Contract Proposal: Host Server Terminal, Dynamic PATH Auto-Discovery, and Manual CLI Registration

**Candidate:** Candidate 4  
**Mode:** `ak-brainstorm --ultra`  
**Target:** `cli-to-api` Core Gateway, Supervisor, WebShell, and Management Console  
**Date:** 2026-09-16  

---

## Executive Summary

`cli-to-api` bridges local command-line AI tools into OpenAI-compatible HTTP APIs. However, developers managing these tools face three severe operational bottlenecks in real-world deployment:

1. **Host Terminal vs. Account Jail Dilemma:** The existing WebShell (`/api/ws/terminal`) unconditionally provisions an account-isolated directory jail (`HOME`, `USERPROFILE`, and `APPDATA` mapped to `$DATA_DIR/sandboxes/{adapter}/{account}` with `CI=1` and stripped environment variables). While this is essential for isolating CLI OAuth logins (`claude login`, `codex login`), it makes installing packages impossible: running `npm i -g @anthropic-ai/claude-code`, `pnpm add -g ...`, `pip install ...`, or `cargo install ...` either pollutes a throwaway sandbox directory or fails outright. Developers have no way to install tools on the host without switching to an external OS terminal. Conversely, exposing the host shell over a web interface without strict boundaries introduces critical Remote Code Execution (RCE) and Cross-Site WebSocket Hijacking (CSWSH) vulnerabilities.
2. **Static Environment & Inability to Hot-Reload Providers:** Node.js caches `process.env.PATH` once at startup. When a developer installs a new CLI on the host, the running gateway process cannot discover the new binary. Restarting the daemon disrupts active streaming requests, clears in-memory cooldown trackers, and requires process restarts. There is no one-click runtime mechanism to re-evaluate the host environment, update adapter presence, and reflect changes in `/v1/models`.
3. **Fragile Auto-Detection & Lack of Manual Overrides:** When an executable resides in a non-standard location (e.g., a Python virtual environment `C:\envs\agent\Scripts\cli.exe`, a standalone portable binary, or an internal enterprise tool requiring specific flags), automated `PATH` heuristics fail. Users have no guided UI or REST API to manually define executable paths, flags, invocation modes, and model tiers with real-time test verification.

Candidate 4 proposes the **Dual-Zone Guarded Execution Architecture**:
- **Zone 1 (Host Server Terminal):** An authenticated, unconfined host terminal mode with strict cryptographic single-use ticket handshakes, loopback/LAN access boundaries, and distinct visual alerting, enabling safe package installations directly within the browser.
- **Zone 2 (Account Sandbox Jail):** The existing sandboxed environment dedicated to account-level OAuth logins and isolated state.
- **Dynamic Live PATH Re-Scanner & Auto-Discovery Engine:** Queries live OS environment registries and standard package manager roots to hot-discover newly installed tools without server restarts.
- **Manual CLI Registration Studio:** An interactive form/YAML onboarding modal with live dry-run probes, persistent YAML storage in `$DATA_DIR/adapters/`, and immediate registration into the model catalog and load balancer.

---

## 1. Outcome

A unified, closed-loop CLI lifecycle management experience directly within the Web Console:

```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    WEB CONSOLE (MANAGEMENT UI)                                    |
|  [Host Shell]  [Account Sandboxes]  [Reload & Auto-Discover (Radar)]  [+ Register Custom CLI]     |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
          │                                      │                                │
          ▼                                      ▼                                ▼
┌─────────────────────────┐            ┌──────────────────────┐        ┌──────────────────────┐
│  Zone 1: Host Terminal  │            │  Provider Re-Scan    │        │  Manual CLI Studio   │
│  (Privileged / Unbound) │            │  & Auto-Discovery    │        │  (Custom Overrides)  │
└────────────┬────────────┘            └──────────┬───────────┘        └──────────┬───────────┘
             │                                    │                               │
   Ticketed WS Handshake               Live PATH / Registry Probe         Dry-Run Validation Probe
   (CSWSH / LAN Guards)                (HKCU / HKLM / POSIX)              (Arg Template & Latency)
             │                                    │                               │
             ▼                                    ▼                               ▼
┌─────────────────────────┐            ┌──────────────────────────────────────────────────────┐
│  Host Shell (node-pty)  │            │              GLOBAL ADAPTER REGISTRY                 │
│  • Real Host User HOME  │            │  • Builtin Blueprints (`./adapters/*.yaml`)          │
│  • Live System PATH     │──Installs──▶  • User Blueprints (`$DATA_DIR/adapters/*.yaml`)     │
│  • Win32 Job Object /   │   Package  │  • Status: INSTALLED | NOT_INSTALLED | DEGRADED      │
│    setsid PGID Tracked  │            └──────────────────────────┬───────────────────────────┘
└─────────────────────────┘                                       │
                                              Dynamic Catalog Sync & SSE Broadcast
                                                                  │
                                                                  ▼
                                       ┌──────────────────────────────────────────────────────┐
                                       │        GET /v1/models & Virtual Tier Router          │
                                       │  (Auto-updated; zero downtime; zero phantom records) │
                                       └──────────────────────────────────────────────────────┘
```

1. **Native Host Package Installation:** Developers can launch an unconfined host terminal directly in the browser to run `npm i -g @anthropic-ai/claude-code`, `pnpm add -g @google/gemini-cli`, `scoop install`, or `brew install`.
2. **Air-Tight Privilege Separation:** The system enforces an explicit boundary between the **Host Server Terminal** (unrestricted host access, requires administrative enablement and cryptographic token exchange) and the **Account Sandbox Jail** (isolated directory jail for OAuth credentials, `CI=1`, sanitized environment).
3. **One-Click Hot Reload & Auto-Discovery:** Clicking "Reload & Auto-Discover" re-scans system and user PATHs (including Windows registry values updated mid-process), detects newly installed CLIs, runs non-blocking health checks, and updates the model catalog in real time without daemon restarts.
4. **Manual CLI Registration Studio:** If auto-detection cannot locate a tool or non-standard flags are needed, users can configure executable paths, prompt transports (`stdin`, `argv`, `temp_file`), invocation templates, and model tiers via an interactive wizard with a **Dry-Run Probe** that validates execution before persisting to `$DATA_DIR/adapters/{id}.yaml`.

---

## 2. Constraints

1. **Zero Unauthenticated Host Execution:** The Host Server Terminal executes with the full privileges of the host OS process. It must **never** be accessible via an unauthenticated WebSocket connection or standard account API key. It must require explicit daemon opt-in (`ENABLE_HOST_TERMINAL=true`), loopback binding or dedicated admin-secret validation, and single-use ephemeral ticket handshakes to eliminate Cross-Site WebSocket Hijacking (CSWSH).
2. **Process Hierarchy & Zombie Immunity ($\le 200\text{ms}$):** All PTY processes (both host shells and account jails) and probe subprocesses must be governed by Win32 Job Objects (`KILL_ON_JOB_CLOSE`) on Windows or POSIX Process Groups (`setsid` + `-pgid` `SIGKILL`) on Linux/macOS. Terminating the browser session, closing the socket, or shutting down the gateway must terminate the entire process tree within $200\text{ms}$.
3. **Windows Dynamic PATH Refresh:** Because Node.js does not update `process.env.PATH` when Windows environment variables are modified externally, the discovery engine must directly inspect the live Windows Registry (`HKCU\Environment` and `HKLM\System\CurrentControlSet\Control\Session Manager\Environment`) and known package manager roots (`%APPDATA%\npm`, `%LOCALAPPDATA%\pnpm`, `%USERPROFILE%\.cargo\bin`, `%USERPROFILE%\scoop\shims`, `%LOCALAPPDATA%\Microsoft\WinGet\Links`).
4. **OpenAI Protocol Strictness:** Hot discovery and manual CLI registration must preserve strict OpenAI API compatibility. Models added or refreshed must conform to `OpenAiModelObject` schemas. Uninstalled models must immediately return standard JSON error envelopes (`invalid_request_error`) without server crashes.
5. **Persistence Isolation:** Custom registered adapters must be written to `$DATA_DIR/adapters/*.yaml` and recorded in SQLite WAL. They must never mutate the version-controlled `./adapters/` directory, ensuring update persistence across git pulls and releases.
6. **Low Latency & Non-Blocking Ingress:** Hot re-scanning and test probes must run asynchronously with a hard timeout ($\le 2{,}000\text{ms}$). Model routing and chat completions must continue serving without lock contention or I/O stalls during discovery sweeps.

---

## 3. Non-goals

1. **Multi-User Role-Based Access Control (RBAC):** `cli-to-api` is designed for developer workstations, local development environments, and private LAN dev-servers. Enterprise multi-tenant IAM, LDAP, or fine-grained role matrices are explicitly out of scope.
2. **OS Package Manager Emulation / Auto-Updaters:** The gateway does not automatically run background `npm update -g` or `apt-get upgrade` commands without user intervention. The host terminal provides the interactive shell; the user controls what gets installed.
3. **Full Desktop GUI Emulation / X11 / Wayland Forwarding:** The terminal supports standard terminal ANSI/xterm-256color streams for command-line tools. Graphical browser forwarding or desktop streaming is out of scope.
4. **Container / VM Hypervisor Management:** The gateway runs directly on the bare-metal host OS. Orchestrating Docker daemons, Podman, or WSL2 microVMs is not required.

---

## 4. Acceptance Criteria (Concrete, Verifiable)

### AC-1: Host Terminal vs. Account Sandbox Jail Isolation
- **Given** an active gateway instance with `ENABLE_HOST_TERMINAL=true`.
- **When** a user connects to the WebShell in **Account Sandbox Mode** (`adapterId="codex-cli", accountId="codex-acc-01"`):
  1. `process.env.USERPROFILE` (or `HOME`) equals `$DATA_DIR/sandboxes/codex-cli/codex-acc-01`.
  2. `CI` is set to `"1"`.
  3. API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) are scrubbed.
  4. Running `npm i -g dummy-test-pkg` does **not** install into the host's global system directory.
- **When** a user connects in **Host Terminal Mode** (`mode="host"`):
  1. `USERPROFILE` (or `HOME`) equals the real host user's profile directory (e.g., `C:\Users\<username>` or `/home/<username>`).
  2. The working directory defaults to the user's home directory or gateway workspace.
  3. `CI` is unset or inherited naturally, allowing interactive installation prompts.
  4. Global install commands (`npm i -g`, `pnpm add -g`, `cargo install`) write directly to the host's actual global binaries directory.

### AC-2: Ephemeral Ticketed Security Handshake & CSWSH Immunity
- **Given** the gateway listening on `http://127.0.0.1:4000`.
- **When** a client attempts a raw WebSocket connection to `ws://127.0.0.1:4000/api/ws/terminal?mode=host` without a ticket:
  - The server rejects the WebSocket upgrade with HTTP 401 Unauthorized or immediately closes the socket with code `4401 ("Unauthorized Ticket Required")`.
- **When** an authenticated client calls `POST /api/terminal/ticket` with valid `Authorization: Bearer <ADMIN_API_KEY>`:
  - The server returns `{ ticket: "<cryptographic-hex-32>", expiresInSeconds: 30 }`.
- **When** the client establishes `ws://127.0.0.1:4000/api/ws/terminal?ticket=<ticket>`:
  - The server verifies the ticket, immediately invalidates it (single-use / nonce burn), and upgrades the connection.
  - If an attacker attempts to reuse the same ticket, the connection is rejected.
- **When** `ENABLE_HOST_TERMINAL=false` (default configuration) and any client requests a host terminal ticket:
  - The server returns HTTP 403 Forbidden with `{ "error": "Host terminal access is disabled by configuration (ENABLE_HOST_TERMINAL=false)." }`.

### AC-3: Dynamic PATH Re-Scan & Provider Discovery
- **Given** a CLI (e.g., `claude-code`) is uninstalled, and its blueprint is marked `NOT_INSTALLED`.
- **When** the developer installs the CLI via the Host Terminal or external terminal.
- **And** triggers the discovery sweep by clicking the Web Console "Reload & Auto-Discover" button (`POST /api/adapters/scan`).
- **Then:**
  1. The scanner reads the live Windows registry / POSIX search paths and locates the newly created binary.
  2. The scanner runs a non-blocking version probe (`claude --version`) with a $2{,}000\text{ms}$ timeout.
  3. The adapter state in SQLite and memory transitions from `NOT_INSTALLED` to `INSTALLED` with its detected version and resolved path.
  4. An SSE event `adapter:status_changed` is broadcast over `/api/events`.
  5. The API returns `{ scanned: number, discoveredCount: 1, discovered: ["claude-code"], latencyMs: number }`.
  6. Subsequent calls to `GET /v1/models` immediately include the newly discovered provider's models.

### AC-4: Web Console Provider Reload Action & State Synchronization
- **Given** the Web Console Fleet View or Navigation Header.
- **When** the user clicks the "Reload & Auto-Discover" button:
  1. The button enters an active spinning state (`aria-busy="true"`), disabling multiple submissions.
  2. Upon response ($\le 500\text{ms}$ typical), the UI renders an obsidian-styled Cyber-Deck toast showing scan results (e.g., `"Discovery complete: 1 new provider active"`).
  3. The adapter cards and status badges instantly transition from Slate (`NOT INSTALLED`) to Emerald (`READY` or `UNPROVISIONED`) without a full browser reload.

### AC-5: Manual CLI Input, Schema Validation & Dry-Run Test Probe
- **Given** a custom CLI tool installed at an arbitrary location (e.g., `D:\custom-tools\my-agent.exe`).
- **When** the user opens the "Register Custom CLI" studio modal and inputs:
  - ID: `custom-agent`
  - Name: `Custom Agent`
  - Executable: `D:\custom-tools\my-agent.exe`
  - Mode: `pipe`
  - Args Template: `["run", "--model", "{model}", "--input", "{prompt}"]`
  - Model: `{ id: "default-v1", name: "Agent Default", tier: "high", context_window: 64000 }`
- **When** the user clicks "Test Probe":
  - The gateway issues `POST /api/adapters/probe` with the payload.
  - The gateway verifies file existence, attempts execution with `--version` (or configured probe flag) under a $2{,}000\text{ms}$ timeout, and returns `{ ok: true, latencyMs: 64, stdout: "my-agent v0.1.0\n" }`.
  - The Web Console displays the green execution latency badge and a monospace terminal output preview.
- **When** the user clicks "Save & Register":
  - The manifest is written to `$DATA_DIR/adapters/custom-agent.yaml`.
  - SQLite `adapters` record is inserted with `isInstalled = true`.
  - A default sandbox account (`custom-agent-acc-01`) is provisioned.
  - The model `custom-agent/default-v1` becomes immediately dispatchable via `POST /v1/chat/completions`.

### AC-6: Process Group & Win32 Job Object Containment
- **Given** an active Host Terminal session or interactive Account Sandbox session.
- **When** the user closes the browser tab or disconnects the WebSocket.
- **Then:**
  1. The server receives the socket `close` event.
  2. The supervisor immediately calls `ptyProcess.kill()`.
  3. The underlying Win32 Job Object (`KILL_ON_JOB_CLOSE`) or POSIX Process Group (`kill(-pgid, SIGKILL)`) terminates the root shell and all spawned sub-processes (such as running `npm` or compilation tools) within $\le 200\text{ms}$.
  4. Zero zombie processes linger in the host OS process table.

---

## 5. Compared Approaches

| Dimension | Approach A: Monolithic Unrestricted Host Shell with Periodic Polling | Approach B: Containerized / Sidecar MicroVM Virtualization | Approach C: Dual-Zone Guarded Host Terminal with Dynamic Registry Scanning & Blueprint Studio (Recommended) |
| :--- | :--- | :--- | :--- |
| **Architectural Model** | Single terminal endpoint for all tasks; background periodic polling loop checks disk every 5s. | Spins up Docker/Podman sidecars for every CLI; web terminal attaches to container shell. | Decoupled Host Shell (unconfined, ticketed) vs. Account Jail (confined, credentials safe); on-demand dynamic registry re-scan + manual YAML studio. |
| **Security & Blast Radius** | **Critical Risk:** A single compromised terminal socket or XSS/CSWSH attack gives unrestricted host root/user shell access. No ticket validation. | High containment, but requires root/privileged daemon on host; breaks host hardware access. | **Strictly Guarded:** Host shell disabled by default; protected by single-use tickets and origin validation; visual security barriers warn users. |
| **Host Package Installation** | Fully supported, but pollutes user context without separation of concern. | **Fails:** `npm i -g` inside a container does not install onto the host machine. Cannot use host-installed CLIs. | **Optimal:** Developers install native host packages in the Host Terminal; binaries persist directly on host OS. |
| **Environment Dynamism (Windows PATH)** | Fails on Windows: `process.env.PATH` is static; `exec("which")` misses changes made by installers mid-process. | High overhead: must rebuild container images or mount dynamic volumes for every package update. | **Optimal:** Re-evaluates live Windows Registry keys and standard package manager bin roots on demand. |
| **Custom / Non-Standard CLI Overrides** | Requires manually writing YAML files into the codebase root with a text editor. | Must author a custom `Dockerfile`, rebuild, and configure container network routing. | **First-Class Studio:** Web UI wizard with live dry-run probe, latency metrics, and persistent user-data storage. |
| **System Overhead** | Low CPU/RAM, but high disk/process churn from continuous 5s polling sweeps. | Extremely high ($\ge 1.5\text{GB}$ RAM per CLI, minutes of build time, requires Docker Desktop). | **Minimal:** $\le 5\text{MB}$ RAM, zero background polling churn; sub-millisecond route checks from memory cache. |
| **Primary Assumption** | Developers operate in completely safe, isolated local networks where security boundaries are unnecessary. | Developers have Docker/container runtimes installed and are willing to run CLI tools inside virtualized containers. | Host OS execution is preferred for developer productivity, but requires strict ticketed security boundaries and live registry introspection. |
| **First Failure Condition** | Malicious web page invokes `ws://localhost:4000/api/ws/terminal` via CSWSH and executes arbitrary shell commands on developer's machine. | User attempts to run a CLI that requires host hardware, GPU, or host-specific enterprise credential helpers (`gh`, `az`, `gcloud`). | User runs in an air-gapped system where live registry query APIs are restricted by custom enterprise Group Policy. |

---

## 6. Recommended Direction & Rationale

### 6.1 Architectural Core: Dual-Zone Execution Architecture

The gateway must explicitly separate execution into two isolated operational zones:

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     EXECUTION SUB-SYSTEM                                          │
├──────────────────────────────────────────────────┬────────────────────────────────────────────────┤
│           ZONE 1: HOST SERVER TERMINAL           │          ZONE 2: ACCOUNT SANDBOX JAIL          │
├──────────────────────────────────────────────────┼────────────────────────────────────────────────┤
│ • Context: Unconfined Host User Environment      │ • Context: Isolated Directory Jail             │
│ • Working Dir: `%USERPROFILE%` or Project Root   │ • Working Dir: `$DATA_DIR/sandboxes/{id}/{acc}`│
│ • Env: Real host `PATH`, `APPDATA`, `HOME`       │ • Env: Virtualized `HOME`, `APPDATA`, `TEMP`   │
│ • Guard: `CI` unset (supports interactive TTY)   │ • Guard: `CI=1`, sensitive API keys purged     │
│ • Purpose: Package installs (`npm`, `cargo`),    │ • Purpose: Account-level OAuth authentication   │
│   git operations, inspecting host environment    │   (`claude login`, `codex login`), testing     │
│ • Security: Ephemeral single-use tickets,        │ • Security: Session bound to specific account, │
│   `ENABLE_HOST_TERMINAL=true` check, origin lock │   cannot overwrite host global binaries        │
└──────────────────────────────────────────────────┴────────────────────────────────────────────────┘
```

#### Refactoring WebSocket Ingress (`apps/gateway/src/api/ws/webshell.ts`)
The terminal WebSocket handler inspects the requested mode and enforces the security boundary:

```ts
import { FastifyInstance, FastifyRequest } from "fastify";
import * as pty from "node-pty";
import { consumeTerminalTicket } from "../auth/terminal-tickets.js";
import { provisionSandbox } from "../../supervisor/sandbox.js";
import { resolveBinary } from "../../adapters/resolver.js";
import { dataDir } from "../../config/paths.js";
import { env } from "../../config/env.js";
import type { WebSocket } from "ws";

export async function registerWebShellWs(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/ws/terminal", { websocket: true }, async (socket: WebSocket, req: FastifyRequest) => {
    const query = (req.query || {}) as Record<string, string | undefined>;
    const mode = query.mode === "host" ? "host" : "sandbox";

    let cwd: string;
    let shellEnv: Record<string, string>;

    if (mode === "host") {
      // 1. Security Gate: Verify host terminal is enabled by daemon configuration
      if (!env.ENABLE_HOST_TERMINAL) {
        socket.send(JSON.stringify({ type: "error", message: "Host terminal disabled by daemon policy." }));
        socket.close(4403, "Host Terminal Disabled");
        return;
      }

      // 2. Security Gate: Validate and consume single-use cryptographic ticket
      const ticket = query.ticket;
      const isValidTicket = ticket ? consumeTerminalTicket(ticket, "host") : false;
      if (!isValidTicket) {
        socket.send(JSON.stringify({ type: "error", message: "Invalid or expired host terminal ticket." }));
        socket.close(4401, "Unauthorized Ticket");
        return;
      }

      // 3. Configure unconfined host shell environment
      const isWin = process.platform === "win32";
      cwd = isWin ? (process.env.USERPROFILE || process.cwd()) : (process.env.HOME || process.cwd());
      shellEnv = { ...process.env } as Record<string, string>;
      delete shellEnv["CI"]; // Permit interactive prompts (e.g. npm install confirmations)
    } else {
      // Zone 2: Account Sandbox Jail
      const adapterId = query.adapterId || "system";
      const accountId = query.accountId || "default";

      const sandbox = await provisionSandbox({ dataDir, adapterId, accountId });
      cwd = sandbox.workspaceDir;
      shellEnv = sandbox.env as Record<string, string>;
    }

    const isWin = process.platform === "win32";
    const shellBinary = isWin
      ? (process.env.ComSpec || resolveBinary("cmd.exe").spawnExecutable)
      : (process.env.SHELL || "bash");

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(shellBinary, [], {
        name: "xterm-256color",
        cols: 100,
        rows: 28,
        cwd,
        env: shellEnv,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      socket.send(JSON.stringify({ type: "error", message }));
      socket.close();
      return;
    }

    // Bi-directional pipe with Win32 Job Object / POSIX cleanup on disconnect
    ptyProcess.onData((data: string) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "data", data }));
      }
    });

    socket.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "data" && typeof msg.data === "string") {
          ptyProcess.write(msg.data);
        } else if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
          ptyProcess.resize(msg.cols, msg.rows);
        }
      } catch {
        ptyProcess.write(raw.toString());
      }
    });

    socket.on("close", () => {
      try {
        ptyProcess.kill();
      } catch {
        // Suppress kill error if already exited
      }
    });
  });
}
```

---

### 6.2 Ephemeral Ticket Handshake (CSWSH & Unauthorized Ingress Defense)

Browsers executing `new WebSocket(...)` cannot pass custom HTTP authorization headers (such as `Authorization: Bearer <KEY>`). Passing long-lived API keys via query parameters (`?apiKey=...`) exposes credentials in server access logs, browser history, and proxy logs. Furthermore, any malicious website running in the user's browser could open a socket to `ws://localhost:4000/api/ws/terminal?mode=host` (Cross-Site WebSocket Hijacking).

To eliminate this vulnerability, the gateway introduces an **ephemeral ticket exchange service** (`apps/gateway/src/api/auth/terminal-tickets.ts`):

```ts
import crypto from "node:crypto";

interface TerminalTicket {
  id: string;
  mode: "host" | "sandbox";
  targetAccount?: string;
  expiresAt: number;
}

const ticketVault = new Map<string, TerminalTicket>();

export function issueTerminalTicket(mode: "host" | "sandbox", targetAccount?: string): string {
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 30_000; // 30-second TTL
  ticketVault.set(id, { id, mode, targetAccount, expiresAt });
  return id;
}

export function consumeTerminalTicket(ticketId: string, expectedMode: "host" | "sandbox"): boolean {
  const ticket = ticketVault.get(ticketId);
  if (!ticket) return false;

  // Immediate nonce burn (single-use guarantee)
  ticketVault.delete(ticketId);

  if (Date.now() > ticket.expiresAt) return false;
  if (ticket.mode !== expectedMode) return false;
  return true;
}

// Periodic cleanup of stale expired tickets
setInterval(() => {
  const now = Date.now();
  for (const [id, t] of ticketVault.entries()) {
    if (now > t.expiresAt) ticketVault.delete(id);
  }
}, 60_000);
```

#### Ticket Acquisition Route (`apps/gateway/src/api/routes/admin-terminal.ts`)
```ts
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { issueTerminalTicket } from "../auth/terminal-tickets.js";
import { env } from "../../config/env.js";

export function registerAdminTerminalRoutes(fastify: FastifyInstance): void {
  fastify.post("/api/terminal/ticket", async (req: FastifyRequest, reply: FastifyReply) => {
    // Authenticated via preHandler auth middleware (Bearer check)
    const body = (req.body || {}) as { mode?: "host" | "sandbox"; accountId?: string };
    const mode = body.mode === "host" ? "host" : "sandbox";

    if (mode === "host" && !env.ENABLE_HOST_TERMINAL) {
      return reply.status(403).send({
        error: "Host terminal access is disabled by configuration (ENABLE_HOST_TERMINAL=false).",
      });
    }

    const ticket = issueTerminalTicket(mode, body.accountId);
    return reply.send({ ticket, expiresInSeconds: 30 });
  });
}
```

---

### 6.3 Live PATH Refresh & Dynamic Auto-Discovery Engine

When a CLI package is installed via `npm i -g`, `cargo install`, or Windows installers, the system `PATH` updates on disk, but Node.js's in-memory `process.env.PATH` remains static. The auto-discovery engine implements **dynamic environment hydration** (`apps/gateway/src/adapters/discovery.ts`):

```ts
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { globalAdapterRegistry } from "./registry.js";
import { resolveBinary } from "./resolver.js";
import { db } from "../db/index.js";
import { adapters } from "../db/schema.js";
import { eq } from "drizzle-orm";

const execFileAsync = promisify(execFile);

export class DynamicDiscoveryEngine {
  /**
   * Retrieves live, hydrated search paths directly from host registries and package roots.
   */
  public async getHydratedSearchPaths(): Promise<string[]> {
    const isWin = process.platform === "win32";
    const pathDirs = new Set<string>();

    // 1. Ingest existing process.env.PATH
    const currentPath = process.env.PATH || "";
    for (const d of currentPath.split(isWin ? ";" : ":")) {
      const trimmed = d.replace(/^"|"$/g, "").trim();
      if (trimmed) pathDirs.add(trimmed);
    }

    // 2. Query Windows Registry for newly committed environment changes
    if (isWin) {
      try {
        const { stdout: userPathOut } = await execFileAsync("reg", [
          "query", "HKCU\\Environment", "/v", "PATH"
        ]);
        const match = userPathOut.match(/REG_(?:EXPAND_)?SZ\s+(.*)/i);
        if (match && match[1]) {
          for (const d of match[1].split(";")) {
            const trimmed = d.trim();
            if (trimmed) pathDirs.add(trimmed);
          }
        }
      } catch {
        // Ignore registry query failure in non-elevated or restricted containers
      }

      // 3. Append standard Windows package manager roots
      const appData = process.env.APPDATA;
      const localAppData = process.env.LOCALAPPDATA;
      const userProfile = process.env.USERPROFILE;
      if (appData) pathDirs.add(path.join(appData, "npm"));
      if (localAppData) {
        pathDirs.add(path.join(localAppData, "pnpm"));
        pathDirs.add(path.join(localAppData, "Microsoft", "WinGet", "Links"));
      }
      if (userProfile) {
        pathDirs.add(path.join(userProfile, ".cargo", "bin"));
        pathDirs.add(path.join(userProfile, "scoop", "shims"));
      }
      pathDirs.add("C:\\ProgramData\\chocolatey\\bin");
    } else {
      // 4. Append standard POSIX package roots
      pathDirs.add("/opt/homebrew/bin");
      pathDirs.add("/usr/local/bin");
      const home = process.env.HOME;
      if (home) {
        pathDirs.add(path.join(home, ".cargo", "bin"));
        pathDirs.add(path.join(home, ".local", "bin"));
        pathDirs.add(path.join(home, ".bun", "bin"));
      }
    }

    return Array.from(pathDirs).filter((d) => fs.existsSync(d));
  }

  /**
   * Re-evaluates all blueprints against live search paths and synchronizes database & catalog.
   */
  public async scanAndSynchronize(): Promise<{
    scanned: number;
    discovered: string[];
    missing: string[];
    latencyMs: number;
  }> {
    const startTime = Date.now();
    const livePaths = await this.getHydratedSearchPaths();
    const allAdapters = globalAdapterRegistry.getAllAdapters();

    const discovered: string[] = [];
    const missing: string[] = [];

    for (const adapter of allAdapters) {
      const resolved = resolveBinary(adapter.config.executable, livePaths);

      if (resolved.isInstalled) {
        // Fast, non-blocking version verification probe
        let detectedVersion = adapter.detectedVersion || "unknown";
        try {
          const { stdout } = await execFileAsync(resolved.spawnExecutable, [...resolved.spawnPrefixArgs, "--version"], {
            timeout: 2000,
            windowsHide: true,
          });
          detectedVersion = stdout.trim().split("\n")[0].substring(0, 40);
        } catch {
          // Keep version as unknown if --version is unsupported
        }

        adapter.isInstalled = true;
        adapter.status = "INSTALLED";
        adapter.detectedVersion = detectedVersion;
        adapter.resolvedExecutable = resolved;
        discovered.push(adapter.config.id);

        await db.update(adapters).set({
          isInstalled: true,
          status: "INSTALLED",
          resolvedPath: resolved.resolvedPath,
          detectedVersion,
          lastProbedAt: Math.floor(Date.now() / 1000),
        }).where(eq(adapters.id, adapter.config.id));
      } else {
        adapter.isInstalled = false;
        adapter.status = "NOT_INSTALLED";
        missing.push(adapter.config.id);

        await db.update(adapters).set({
          isInstalled: false,
          status: "NOT_INSTALLED",
          lastProbedAt: Math.floor(Date.now() / 1000),
        }).where(eq(adapters.id, adapter.config.id));
      }
    }

    const latencyMs = Date.now() - startTime;
    return { scanned: allAdapters.length, discovered, missing, latencyMs };
  }
}

export const globalDiscoveryEngine = new DynamicDiscoveryEngine();
```

#### Scan Trigger Route (`POST /api/adapters/scan`)
```ts
fastify.post("/api/adapters/scan", async (_req: FastifyRequest, reply: FastifyReply) => {
  const result = await globalDiscoveryEngine.scanAndSynchronize();
  return reply.send({ success: true, ...result });
});
```

---

### 6.4 Manual CLI Registration & Universal Dry-Run Prober

For non-standard or proprietary tools, the gateway introduces a **Dry-Run Probe & Registration API** (`apps/gateway/src/api/routes/admin-adapters.ts`):

```ts
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { AdapterConfigSchema } from "../../adapters/schema.js";
import { globalAdapterRegistry } from "../../adapters/registry.js";
import { resolveBinary } from "../../adapters/resolver.js";
import { dataDir } from "../../config/paths.js";
import { db } from "../../db/index.js";
import { adapters, accounts } from "../../db/schema.js";
import { provisionSandbox } from "../../supervisor/sandbox.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function registerAdapterManagementRoutes(fastify: FastifyInstance): void {
  // 1. Dry-Run Verification Probe
  fastify.post("/api/adapters/probe", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { executable: string; testArgs?: string[] };
    if (!body.executable) {
      return reply.status(400).send({ error: "Executable name or absolute path is required." });
    }

    const resolved = resolveBinary(body.executable);
    if (!resolved.isInstalled) {
      return reply.send({
        ok: false,
        isInstalled: false,
        error: `Binary '${body.executable}' could not be resolved on host disk.`,
      });
    }

    const startTime = Date.now();
    try {
      const probeArgs = body.testArgs && body.testArgs.length > 0 ? body.testArgs : ["--version"];
      const { stdout, stderr } = await execFileAsync(resolved.spawnExecutable, [...resolved.spawnPrefixArgs, ...probeArgs], {
        timeout: 2000,
        windowsHide: true,
      });

      return reply.send({
        ok: true,
        isInstalled: true,
        latencyMs: Date.now() - startTime,
        resolvedPath: resolved.resolvedPath,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.send({
        ok: false,
        isInstalled: true,
        latencyMs: Date.now() - startTime,
        resolvedPath: resolved.resolvedPath,
        error: `Probe invocation failed: ${msg}`,
      });
    }
  });

  // 2. Register & Persist Custom Adapter
  fastify.post("/api/adapters/custom", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = AdapterConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: "Schema validation failed", details: parseResult.error.flatten() });
    }

    const config = parseResult.data;
    const resolved = resolveBinary(config.executable);

    // Persist YAML to $DATA_DIR/adapters/{id}.yaml (survives updates)
    const userAdaptersDir = path.join(dataDir, "adapters");
    await fs.mkdir(userAdaptersDir, { recursive: true });
    const manifestPath = path.join(userAdaptersDir, `${config.id}.yaml`);
    await fs.writeFile(manifestPath, yaml.dump(config), "utf8");

    // Upsert into SQLite
    await db.insert(adapters).values({
      id: config.id,
      name: config.name,
      version: config.version,
      executable: config.executable,
      resolvedPath: resolved.resolvedPath,
      executionMode: config.execution_mode,
      configJson: JSON.stringify(config),
      isInstalled: resolved.isInstalled,
      status: resolved.isInstalled ? "INSTALLED" : "NOT_INSTALLED",
    }).onConflictDoUpdate({
      target: adapters.id,
      set: {
        name: config.name,
        executable: config.executable,
        resolvedPath: resolved.resolvedPath,
        executionMode: config.execution_mode,
        configJson: JSON.stringify(config),
        isInstalled: resolved.isInstalled,
        status: resolved.isInstalled ? "INSTALLED" : "NOT_INSTALLED",
      }
    });

    // Register into memory
    globalAdapterRegistry.register({
      config,
      resolvedExecutable: resolved,
      isInstalled: resolved.isInstalled,
      status: resolved.isInstalled ? "INSTALLED" : "NOT_INSTALLED",
    });

    // Auto-provision initial sandbox account if binary is confirmed present
    if (resolved.isInstalled) {
      const defaultAccId = `${config.id}-acc-01`;
      const sandbox = await provisionSandbox({ dataDir, adapterId: config.id, accountId: defaultAccId });
      await db.insert(accounts).values({
        id: defaultAccId,
        adapterId: config.id,
        name: `Default ${config.name} Account`,
        sandboxDir: sandbox.sandboxDir,
        status: "READY",
        maxSlots: config.concurrency.max_concurrent_per_account,
      }).onConflictDoNothing();
    }

    return reply.status(201).send({
      success: true,
      id: config.id,
      isInstalled: resolved.isInstalled,
      manifestPath,
    });
  });
}
```

---

### 6.5 Web Console UI/UX Design (Obsidian Cyber-Deck Architecture)

The Web Console introduces three dedicated controls adhering to modern Dark Obsidian standards:

#### 1. Dual-Mode WebShell Header (`apps/web/src/views/WebShellView.tsx`)
The WebShell interface features a high-contrast segmented control distinguishing the two zones:
- **Host Console Tab:** Styled with caution amber highlights (`#F59E0B`), an alert shield icon, and an explicit visual banner:
  ```
  [!] HOST SERVER TERMINAL — UNCONFINED SYSTEM EXECUTION
  Changes affect the host machine directly. Package installs (npm, pnpm, cargo) write to host global directories.
  ```
- **Account Sandboxes Tab:** Styled with emerald status badges (`#10B981`) and a dropdown targeting specific provisioned accounts (`codex-acc-01`, `claude-acc-01`) for safe OAuth logins.

```tsx
<div className="flex items-center space-x-2 bg-surface border border-borderSubtle p-1 rounded-xl">
  <button
    onClick={() => setTerminalMode("sandbox")}
    className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-mono transition ${
      terminalMode === "sandbox"
        ? "bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 shadow-sm"
        : "text-slate-400 hover:text-white"
    }`}
  >
    <Box className="w-3.5 h-3.5" />
    <span>Account Sandboxes (Jail)</span>
  </button>
  <button
    onClick={() => setTerminalMode("host")}
    className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-mono transition ${
      terminalMode === "host"
        ? "bg-amber-950/60 text-amber-300 border border-amber-500/40 shadow-sm"
        : "text-slate-400 hover:text-white"
    }`}
  >
    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
    <span>Host Server Terminal (Privileged)</span>
  </button>
</div>
```

#### 2. Provider Reload & Auto-Discovery Action Button
Positioned in both the top navigation header and the Accounts Fleet View:
- Displays a radar/refresh icon with text: `"Reload & Auto-Discover"`.
- On click, triggers `POST /api/adapters/scan`. Shows an animated radar pulse for $\ge 400\text{ms}$.
- Renders an ephemeral cyber-deck toast:
  - `"Scan Complete: 1 new CLI discovered (devin v1.0.2). Catalog updated."`
- Real-time SSE updates refresh the adapter cards without requiring a page reload.

#### 3. Custom CLI Studio Modal (`apps/web/src/components/adapters/CustomAdapterStudioModal.tsx`)
A guided modal offering two authoring modes:
1. **Guided Form:**
   - Provider Name and Identifier (`^[a-z0-9_-]+$`).
   - Executable path input with live `"Test Probe"` trigger.
   - Presets dropdown: `"Subcommand Pipe (Codex, OMP)"`, `"Interactive PTY Agent (Devin, Claude)"`, `"Script Wrapper"`.
   - Models configuration table: ID, display name, tier (`low` / `medium` / `high` / `xhigh`), context window size.
2. **Raw YAML Editor:**
   - Syntax-highlighted editor with client-side Zod validation and instant schema feedback.
   - Built-in dry-run output preview drawer displaying stdout/stderr and execution latency in milliseconds.

---

### 6.6 Database Migration Contract (`apps/gateway/src/db/schema.ts`)

To track discovery states and manual overrides, the `adapters` table schema is updated with additive columns:

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const adapters = sqliteTable("adapters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull().default("1.0.0"),
  executable: text("executable").notNull(),
  resolvedPath: text("resolved_path"),
  executionMode: text("execution_mode").notNull().default("pipe"),
  configJson: text("config_json").notNull(),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),

  // Discovery & Presence Columns
  isInstalled: integer("is_installed", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("NOT_INSTALLED"), // "INSTALLED" | "NOT_INSTALLED" | "DEGRADED"
  isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
  detectedVersion: text("detected_version"),
  lastProbedAt: integer("last_probed_at"),
  probeError: text("probe_error"),

  createdAt: integer("created_at").notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at").notNull().default(sql`(strftime('%s', 'now'))`),
});
```

---

## 7. Implementation Roadmap & Verification Plan

```
Phase 1: Security & Host Terminal Core
├── Terminal ticket vault (issueTerminalTicket / consumeTerminalTicket)
├── Host vs. Sandbox branching in webshell.ts
├── Win32 Job Object & POSIX process group lifecycle verification
└── Unit tests: auth boundary, CSWSH rejection, ticket expiry

Phase 2: Dynamic Live PATH Re-Scanner
├── Windows Registry & standard POSIX package root query engine
├── POST /api/adapters/scan endpoint with fast version probe
├── In-memory registry and database synchronization
└── Integration tests: detecting newly placed mock binary without daemon reboot

Phase 3: Custom CLI Studio & Dry-Run Prober
├── POST /api/adapters/probe endpoint (sandboxed execution, 2s timeout)
├── POST /api/adapters/custom endpoint ($DATA_DIR persistence)
├── Auto-provisioning initial account for verified custom CLIs
└── Integration tests: invalid schema rejection, dry-run latency measurement

Phase 4: Web Console UI/UX Cyber-Deck Integration
├── WebShellView dual-mode tab switcher with high-visibility security banner
├── "Reload & Auto-Discover" radar button with cyber-deck notification toast
├── CustomAdapterStudioModal with Form & YAML modes + dry-run preview terminal
└── End-to-end verification across Windows 11 and Linux environments
```

This proposal establishes an air-tight, developer-friendly substrate that enables zero-downtime tool installations, eliminates security risks associated with unconfined web shells, and delivers an intuitive, self-healing CLI management lifecycle.
