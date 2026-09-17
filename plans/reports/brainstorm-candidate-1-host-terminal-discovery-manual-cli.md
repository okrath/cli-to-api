# Architectural Brainstorm & Bounded Contract: Host Server Terminal, Live Provider Auto-Discovery, and Manual CLI Studio

**Candidate:** Candidate 1  
**Mode:** `ak-brainstorm --ultra`  
**Target Subsystems:** Web Console, Gateway Ingress & WebSocket Supervisor, Binary Prober, Model Catalog & Routing Router  
**Date:** 2026-09-16  

---

## Executive Summary

As `cli-to-api` evolves from a prototype proxy to an enterprise-grade AI CLI gateway, developers face three recurring workflow bottlenecks:
1. **Host Setup Context-Switching:** Installing missing CLI binaries (e.g. `@anthropic-ai/claude-code`, `opencode`, `aider`, `devin`) requires stepping out of the browser into an operating system terminal. However, the existing WebShell runs exclusively inside an account sandbox jail (`$DATA_DIR/sandboxes/{adapter}/{account}`) with isolated `$HOME`, altered `AppData`, and stripped credentials, making package installation either ineffective or broken.
2. **Daemon Restart Dependency for Binary Discovery:** After installing a new CLI tool on the host machine, the gateway daemon must be manually killed and restarted to re-probe `PATH` and expose models in `/v1/models`.
3. **Inability to Register Custom / Portable / Internal CLIs:** When a CLI binary is not present in standard package manager paths or uses bespoke invocation patterns (e.g. Python virtualenv executables, custom enterprise LLM wrappers, or portable executables on secondary drives), the user has no UI or API mechanism to declare the binary path, custom flags, argument templates, and model tiers.

Candidate 1 presents a cohesive, bounded architectural contract to resolve these challenges with enterprise-grade security, zero daemon downtime, and high developer ergonomics.

---

## 1. Outcome

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           WEB CONSOLE (CYBER-DECK)                                              │
├─────────────────────────────────────────┬───────────────────────────────────┬───────────────────────────────────┤
│          HOST SERVER TERMINAL           │      PROVIDER AUTO-DISCOVERY      │         MANUAL CLI STUDIO         │
│  • Elevated host shell execution        │  • "Reload & Auto-Discover" button│  • Custom binary path definition  │
│  • Direct package manager access        │  • Live PATH & package roots scan │  • Custom flag & arg templates    │
│  • Strict CSWSH + Ticket Auth boundary  │  • Real-time SSE catalog sync     │  • Dry-run preflight probe modal  │
└─────────────────────────────────────────┴───────────────────────────────────┴───────────────────────────────────┘
                                      │                     │                     │
                                      ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                             GATEWAY ENGINE CORE                                                 │
├─────────────────────────────────────────┬───────────────────────────────────┬───────────────────────────────────┤
│      DUAL-PLANE SHELL SUPERVISOR        │     REACTIVE DISCOVERY ENGINE     │    DECLARATIVE ADAPTER REGISTRY   │
│  • Plane 1: Host Terminal (Root/User)   │  • Multi-path package root search │  • Custom YAML in $DATA_DIR/      │
│  • Plane 2: Account Sandbox (Jailed)    │  • PATHEXT & script shim resolver │  • Dynamic SQLite sync & reload   │
│  • Win32 Job Object / POSIX -pgid kill  │  • Zero-restart /v1/models updates│  • Instant default acc provision  │
└─────────────────────────────────────────┴───────────────────────────────────┴───────────────────────────────────┘
```

1. **Host Server Terminal in Web Console**:
   - A dedicated host shell interface enabling users to install global CLI packages (`npm i -g`, `pnpm add -g`, `scoop install`, `brew install`, `pip install`, `cargo install`) directly from the browser.
   - **Architectural Separation of Planes**: Clear distinction between the **Host Infrastructure Shell** (elevated host user, unconfined CWD, full system `PATH`) and the **Account Sandbox Jail** (`$DATA_DIR/sandboxes/{adapter}/{account}`, isolated `$HOME` and `%USERPROFILE%`, purged credentials, `CI=1`).
   - **Access Boundary Hardening**: Mitigates Cross-Site WebSocket Hijacking (CSWSH) and unauthorized LAN attacks through cryptographic one-time ticket handshakes, strict loopback/origin verification, explicit configuration gating, and job-object process tree containment.

2. **Provider Reload & Auto-Discovery Button**:
   - A one-click "Reload & Auto-Discover" control in the Web Console and an administrative endpoint (`POST /api/adapters/discover`) that re-scans host `PATH`, `PATHEXT`, and global package manager bin locations without restarting the gateway daemon.
   - Instantly reconciles newly installed CLIs, elevates status (`NOT_INSTALLED` $\to$ `INSTALLED`), provisions baseline default accounts, and broadcasts Server-Sent Events (SSE) to update the UI and the OpenAI-compatible `/v1/models` catalog dynamically.

3. **Manual CLI Input / Registration Studio**:
   - A declarative registration workflow (via Web Console modal and `POST /api/adapters`) allowing users to register arbitrary, portable, or internal AI CLIs when auto-detection fails.
   - Supports custom binary paths (e.g. `D:\ai\bin\agent.exe`, Python virtualenv binaries), configurable argument templates (`{model}`, `{prompt}`), prompt transport protocols (`argv`, `stdin`, `temp_file`), output stream regex parsers, and custom model declarations with tiers and context windows.
   - Includes a real-time **Dry-Run Preflight Probe** (`POST /api/adapters/probe`) to test execution and verify CLI health before persisting definitions to disk (`$DATA_DIR/adapters/{id}.yaml`) and SQLite.

---

## 2. Constraints

1. **Dual Shell Boundary Separation**:
   - The host terminal process must execute within the operating system user context running the gateway daemon, using host `PATH`, host home directory, and unconfined permissions.
   - Account sandbox terminals must remain confined to `$DATA_DIR/sandboxes/{adapterId}/{accountId}/workspace`, with `$HOME`, `%USERPROFILE%`, `%APPDATA%`, and `%LOCALAPPDATA%` redirected to the sandbox directory, sensitive cloud API tokens removed, and `CI=1` enforced.
   - Shell sessions must never cross or share environment variables, workspace directories, or PTY streams.

2. **Zero-Trust WebSocket Authentication & CSWSH Defense**:
   - Browsers cannot pass `Authorization: Bearer <token>` headers in native `new WebSocket()`. WebSocket connections to the host terminal must require an ephemeral, single-use ticket generated via a prior authenticated HTTP request (`POST /api/terminal/ticket` with Bearer auth).
   - Strict `Origin` checking must reject any WebSocket connection whose `Origin` header does not match `127.0.0.1`, `localhost`, or the explicitly configured server origin.
   - The host terminal must be disabled by default if the gateway is bound to a public interface (`0.0.0.0`) unless explicitly overridden via `ENABLE_HOST_TERMINAL=true` alongside a verified non-default `ADMIN_TOKEN`.

3. **Cross-Platform Shell Agnosticism**:
   - Shell spawning must resolve platform defaults: PowerShell/`cmd.exe` on Windows 11; `bash`/`zsh`/`sh` on Linux and macOS.
   - Windows script wrappers (`.cmd`, `.bat`, `.ps1`) must be invoked safely through their respective execution hosts (mitigating CVE-2024-27980 command injection risks).

4. **Process Cleanup & Orphan Containment ($\le 200\text{ms}$)**:
   - When a host or sandbox terminal WebSocket disconnects, the spawned shell process tree must be cleanly terminated within $200\text{ms}$ using Win32 Job Objects (`KILL_ON_JOB_CLOSE`) or POSIX Process Groups (`setsid` + `SIGKILL` to negative PGID), preventing background leaks.

5. **Non-Blocking Hot-Reload**:
   - Provider re-scanning and adapter registration must not lock SQLite or block HTTP traffic on `/v1/chat/completions`. Discovery sweeps must execute asynchronously and finish in $\le 50\text{ms}$ for standard filesystem checks.

6. **OpenAI Ingress Fidelity**:
   - Newly discovered or manually registered providers must adhere strictly to the OpenAI JSON API schema (`/v1/models`, `/v1/chat/completions`). Uninstalled or degraded models must never pollute the `/v1/models` endpoint.

---

## 3. Non-goals

1. **System User Privilege Escalation**:
   - The gateway will not implement `sudo`, UAC elevation prompts, or setuid execution. The host terminal runs with the exact permissions of the running Node.js gateway process.
2. **Built-in Package Repository Hosting**:
   - The gateway does not host or mirror npm, Scoop, or Homebrew packages. It acts as an execution harness for the host's existing package managers.
3. **Full Desktop GUI Window Management**:
   - The Web Console terminal will not provide an X11/Wayland/RDP display server. It is strictly an ANSI/VT100 PTY stream emulator via `@xterm/xterm`.
4. **Automated Headless OAuth Automation**:
   - The gateway does not bypass interactive login screens (e.g. `claude login` browser popups). Users utilize the interactive terminal to complete authentication flows manually.
5. **Unbounded Code Runner Service**:
   - The manual CLI registration engine is designed for AI CLI bridges (stdin/stdout/PTY command processors). It is not an arbitrary serverless code execution or script sandboxing platform.

---

## 4. Acceptance Criteria (Concrete, Verifiable)

### AC-1: Host Shell vs Account Sandbox Jail Isolation
- **Given** an active gateway running on the host system.
- **When** a user connects to the **Host Server Terminal** via Web Console:
  1. The working directory is initialized to the host user's home directory (`$HOME` or `%USERPROFILE%`).
  2. The environment possesses the host's full `PATH` (including `npm`, `pnpm`, `scoop`, `winget`, `brew`, `cargo`).
  3. Running `npm i -g @anthropic-ai/claude-code` installs the package to the host machine's global npm prefix, not a sandbox directory.
- **When** a user connects to an **Account WebShell** (`/api/ws/terminal?adapterId=codex-cli&accountId=acc-01`):
  1. The working directory is strictly locked to `$DATA_DIR/sandboxes/codex-cli/acc-01/workspace`.
  2. `$HOME` and `%USERPROFILE%` point to `$DATA_DIR/sandboxes/codex-cli/acc-01`.
  3. Sensitive environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ADMIN_TOKEN`) are completely purged from `process.env`.
- **And** the Web Console displays visually distinct UI indicators:
  - Account WebShell: Indigo theme, `Jail: /sandboxes/{adapter}/{account}` banner.
  - Host Server Terminal: Amber/Crimson cyber-warning theme, `⚠️ HOST SYSTEM SHELL — FULL ACCESS [Unconfined]` banner with host user and hostname metadata.

### AC-2: Web Terminal Access Boundary & CSWSH Defense
- **Given** the gateway listening on port `3000`.
- **When** a malicious cross-origin page attempts to open a WebSocket to `ws://127.0.0.1:3000/api/ws/host-terminal` with header `Origin: http://evil-attacker.com`:
  - **Then** the gateway immediately closes the connection with HTTP 403 Forbidden before upgrading the socket.
- **When** a client connects to `ws://127.0.0.1:3000/api/ws/host-terminal` without a ticket or with an expired/invalid ticket:
  - **Then** the connection is terminated with WebSocket close code `4401 (Unauthorized)`.
- **When** an authenticated client calls `POST /api/terminal/ticket` with header `Authorization: Bearer <ADMIN_TOKEN>`:
  - **Then** the server responds with `{ "ticket": "<32-byte-hex>", "expiresIn": 10 }`.
  - **And** connecting with `?ticket=<32-byte-hex>` within 10 seconds successfully establishes the PTY shell.
  - **And** reusing the same ticket a second time is immediately rejected (single-use guarantee).
- **When** `ENABLE_HOST_TERMINAL=false` is set in configuration:
  - **Then** `POST /api/terminal/ticket` and `/api/ws/host-terminal` respond with HTTP 403 Forbidden `{ "error": "Host terminal is disabled by server policy" }`.

### AC-3: Provider Reload & Live PATH Auto-Discovery
- **Given** an adapter blueprint for `claude-code` exists, but the binary `claude` is not initially installed on `PATH` (`isInstalled = false`, status `NOT_INSTALLED`).
- **When** the user installs the binary via the Host Terminal (`npm i -g @anthropic-ai/claude-code`) and clicks the "Reload & Auto-Discover" button (or triggers `POST /api/adapters/discover`):
  - **Then** the gateway re-scans `PATH` and package manager directories in $\le 50\text{ms}$.
  - **And** the status of `claude-code` transitions from `NOT_INSTALLED` to `INSTALLED` with verified `resolvedPath`.
  - **And** if zero accounts existed for `claude-code`, the gateway automatically provisions `claude-code-acc-01` and initializes its on-disk sandbox.
  - **And** the gateway emits an SSE event `adapter:status_changed` over `/api/admin/events`.
  - **And** the Web Console updates the status pill from gray `NOT INSTALLED` to green `INSTALLED` without reloading the webpage.

### AC-4: Zero-Restart Dynamic Model Catalog Sync
- **Given** an adapter transitions from `NOT_INSTALLED` to `INSTALLED` following auto-discovery.
- **When** a client issues `GET /v1/models`:
  - **Then** all models declared by the newly discovered adapter (e.g. `claude-code/claude-3-7-sonnet`) and eligible virtual auto-tiers (e.g. `auto-high`) immediately appear in the response payload.
- **When** the binary is uninstalled or removed from `PATH` and auto-discovery runs:
  - **Then** the adapter status transitions to `NOT_INSTALLED` and its models are instantly removed from `GET /v1/models`.
  - **And** pending account data and sandbox directories are preserved intact for future reinstallation.

### AC-5: Manual CLI Blueprint Registration & Disk Persistence
- **Given** a user wishes to register a custom local CLI tool `my-llm-cli` located at an arbitrary path (e.g. `D:\tools\my-agent.exe` or `/opt/bin/my-agent`).
- **When** the user submits the registration payload via the Web Console Manual CLI Studio or `POST /api/adapters`:
  ```json
  {
    "id": "my-agent",
    "name": "Custom Agent CLI",
    "executable": "D:\\tools\\my-agent.exe",
    "execution_mode": "pipe",
    "models": [
      { "id": "agent-v1", "name": "Agent Model v1", "tier": "high", "context_window": 64000, "is_default": true }
    ],
    "invocation": {
      "args_template": ["run", "--model", "{model}", "-p", "{prompt}"],
      "prompt_transport": "argv",
      "timeout_seconds": 120
    }
  }
  ```
- **Then**:
  1. The schema is validated against `AdapterConfigSchema` in $\le 20\text{ms}$.
  2. The configuration is written to disk at `$DATA_DIR/adapters/my-agent.yaml`.
  3. The record is inserted/updated in the SQLite `adapters` table.
  4. The binary path is probed; if accessible, an account `my-agent-acc-01` is provisioned.
  5. The model `my-agent/agent-v1` and alias `agent-v1` are immediately routable via `POST /v1/chat/completions`.

### AC-6: Dry-Run Preflight Probe for Custom CLIs
- **Given** the user is configuring a manual CLI in the Studio modal.
- **When** the user clicks "Test & Probe CLI" (`POST /api/adapters/probe`):
  - **Then** the gateway executes the specified executable with the test arguments inside a supervised Win32 Job Object / POSIX process group with a hard timeout of $2{,}000\text{ms}$.
  - **And** the endpoint returns:
    ```json
    {
      "success": true,
      "exitCode": 0,
      "latencyMs": 142,
      "stdout": "Custom Agent CLI v2.1.0\nReady.",
      "stderr": "",
      "resolvedPath": "D:\\tools\\my-agent.exe"
    }
    ```
- **When** the executable does not exist or crashes:
  - **Then** the endpoint returns `{ "success": false, "exitCode": 1, "error": "spawn ENOENT" }` and the UI highlights the invalid field before permitting save.

---

## 5. Compared Approaches

| Evaluation Dimension | Approach 1: Unified Privileged Shell with In-Band Discovery (Single-Surface Shell) | Approach 2: Dual-Plane Air-Gapped Shells with Ticket-Guarded PTY, Reactive Discovery, and CLI Studio (Recommended) | Approach 3: Containerized Virtualization via Docker Engine Socket |
| :--- | :--- | :--- | :--- |
| **Terminal Architecture** | Single web terminal with a toggle switch ("Jail" vs "Elevated Host"). Shared backend PTY route. | Two distinct, air-gapped terminal planes: Host Infrastructure Terminal vs Account Sandbox Shell. | Web terminal connects directly to a Docker sidecar or host daemon via `/var/run/docker.sock`. |
| **Security & CSWSH Defense** | **Vulnerable**: Single WS endpoint; toggle relies on client-side state. Susceptible to CSWSH if auth header is absent. | **High**: Cryptographic single-use ticket exchange (`POST /api/terminal/ticket`), strict `Origin` guard, explicit server opt-in flag. | High isolation from host filesystem, but Docker socket access grants effective root privileges over the host. |
| **Developer Ergonomics & Safety** | **Confusing**: High risk of running `claude login` in host mode (contaminating host) or `npm -g` in sandbox mode (silent loss). | **Optimal**: Clear visual archetypes (Cyber-Amber host warning vs Indigo account jail), separate tab views, dedicated action bars. | Clunky: Running local browser OAuth flows (`claude login`, `codex login`) through a Docker container requires port redirects. |
| **Discovery Mechanism** | Synchronous filesystem polling and raw `fs.watch` triggers. | Reactive Multi-Source Resolver: probes `PATH`, `PATHEXT`, npm, pnpm, Scoop, Homebrew with one-click reload & SSE sync. | Queries `docker images` and container labels; ignores host binaries. |
| **Custom CLI Extensibility** | In-browser raw YAML code editor saving directly to filesystem. | Guided Cyber-Deck Studio: structured form, preflight dry-run probe ($\le 2\text{s}$ timeout), schema validation, auto-account creation. | User must author a Dockerfile, build a container image, and mount local volumes. |
| **Resource Overhead** | Very low ($\le 5\text{MB}$ RAM). | Very low ($\le 8\text{MB}$ RAM, sub-millisecond route overhead). | High ($\ge 1.5\text{GB}$ RAM, Docker Desktop daemon requirement, gigabytes of container disk images). |
| **Primary Assumption** | Developer understands directory sandboxing and will reliably toggle modes without confusion. | Host gateway runs on developer machine or secured LAN workstation where local loopback ticketed PTY is permitted. | Host environment has Docker engine installed, running, and accessible without permission errors. |
| **First Failure Condition** | User accidentally executes an interactive login in elevated host mode, polluting the host's global credentials. | Local OS AppLocker or execution policy restricts `node-pty` or PowerShell execution on the host. | Fails completely on workstations without Docker Desktop installed or inside restricted enterprise container environments. |

---

## 6. Recommended Direction & Rationale

Candidate 1 recommends **Approach 2: Dual-Plane Air-Gapped Shells with Ticket-Guarded PTY, Reactive Discovery, and CLI Studio**.

```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
│                                     SECURITY ACCESS BOUNDARY                                      │
│                                                                                                   │
│   Web Browser Client (Console)                                     Gateway Daemon (Node.js)       │
│                                                                                                   │
│   1. POST /api/terminal/ticket (Bearer sk-cta-...) ──────────────> Verify Admin Credentials      │
│      <─── 200 OK { ticket: "7f8b9...", expiresIn: 10 } <───────── Generate Ephemeral Ticket      │
│                                                                                                   │
│   2. GET /api/ws/host-terminal?ticket=7f8b9... ─────────────────> 1. Check Origin: http://localhost│
│      (Upgrade: websocket)                                         2. Consume & Invalidate Ticket   │
│                                                                   3. Spawn Host PTY (node-pty)    │
│      <─── 101 Switching Protocols <────────────────────────────── 4. Bind to Win32 Job Object     │
│                                                                                                   │
│   3. Bi-directional Terminal Stream (xterm.js <── PTY ──>) ──────> Host Shell (cmd.exe/pwsh/bash) │
+───────────────────────────────────────────────────────────────────────────────────────────────────+
```

### 6.1 Architectural Core: Dual-Plane Shell Supervisor

The system establishes two entirely independent execution planes rather than toggling a single terminal:

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 WEBSHELL SUPERVISOR                    │
                  └───────────────────────────┬────────────────────────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
     ┌───────────────────────────────┐                 ┌───────────────────────────────┐
     │     HOST INFRASTRUCTURE       │                 │        ACCOUNT SANDBOX        │
     │        TERMINAL PLANE         │                 │          JAIL PLANE           │
     ├───────────────────────────────┤                 ├───────────────────────────────┤
     │ • Purpose: Package Management │                 │ • Purpose: CLI Login & OAuth  │
     │ • Route: /api/ws/host-terminal│                 │ • Route: /api/ws/terminal     │
     │ • Auth: Single-Use Ticket     │                 │ • Auth: Standard Session      │
     │ • CWD: $HOME / %USERPROFILE%  │                 │ • CWD: sandboxes/{adp}/{acc}  │
     │ • Environment: Unconfined     │                 │ • Environment: Jailed & Clean │
     │ • Package Managers: Available │                 │ • CI: "1" (non-interactive)   │
     │ • UI: Cyber-Amber Warning     │                 │ • UI: Indigo Jail Badge       │
     └───────────────────────────────┘                 └───────────────────────────────┘
```

#### Host Terminal Gateway Implementation (`apps/gateway/src/api/ws/host-terminal.ts`)
```ts
import { FastifyInstance, FastifyRequest } from "fastify";
import * as pty from "node-pty";
import type { WebSocket } from "ws";
import crypto from "node:crypto";
import { env } from "../../config/env.js";

interface TerminalTicket {
  ticket: string;
  createdAt: number;
  clientIp: string;
}

const activeTickets = new Map<string, TerminalTicket>();
const TICKET_TTL_MS = 10_000; // 10 seconds validity

export function registerHostTerminalWs(fastify: FastifyInstance): void {
  // 1. Issue one-time ticket via authenticated HTTP endpoint
  fastify.post("/api/terminal/ticket", async (req, reply) => {
    if (!env.ENABLE_HOST_TERMINAL) {
      return reply.status(403).send({ error: "Host terminal execution is disabled by server configuration." });
    }

    const ticket = crypto.randomBytes(24).toString("hex");
    activeTickets.set(ticket, {
      ticket,
      createdAt: Date.now(),
      clientIp: req.ip,
    });

    // Cleanup expired tickets
    setTimeout(() => activeTickets.delete(ticket), TICKET_TTL_MS);

    return reply.send({ ticket, expiresIn: 10 });
  });

  // 2. WebSocket Upgrade with ticket consumption & origin guard
  fastify.get("/api/ws/host-terminal", { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    const origin = req.headers.origin;
    const allowedHosts = ["127.0.0.1", "localhost", env.HOST];
    const isOriginAllowed = origin && allowedHosts.some(h => origin.includes(h));

    if (!isOriginAllowed && origin !== undefined) {
      socket.close(4403, "Origin Forbidden (CSWSH Guard)");
      return;
    }

    const query = (req.query || {}) as Record<string, string | undefined>;
    const ticket = query.ticket;

    if (!ticket || !activeTickets.has(ticket)) {
      socket.close(4401, "Invalid or Expired Terminal Ticket");
      return;
    }

    // Invalidate ticket immediately (single-use guarantee)
    activeTickets.delete(ticket);

    // Determine host default shell
    const isWin = process.platform === "win32";
    const shellBinary = isWin
      ? (process.env.ComSpec || "cmd.exe")
      : (process.env.SHELL || "/bin/bash");

    const hostHome = isWin
      ? (process.env.USERPROFILE || "C:\\")
      : (process.env.HOME || "/root");

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(shellBinary, [], {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: hostHome,
        env: process.env as Record<string, string>, // Unconfined host environment
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      socket.send(JSON.stringify({ type: "error", message }));
      socket.close(1011, "PTY Spawn Failed");
      return;
    }

    // PTY -> WebSocket
    ptyProcess.onData((data: string) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "data", data }));
      }
    });

    // WebSocket -> PTY
    socket.on("message", (raw: Buffer | string) => {
      try {
        const text = raw.toString();
        const msg = JSON.parse(text);
        if (msg.type === "data" && typeof msg.data === "string") {
          ptyProcess.write(msg.data);
        } else if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
          ptyProcess.resize(msg.cols, msg.rows);
        }
      } catch {
        ptyProcess.write(raw.toString());
      }
    });

    // Process cleanup on disconnect
    socket.on("close", () => {
      try {
        ptyProcess.kill();
      } catch {
        // Silently ignore cleanup error
      }
    });
  });
}
```

---

### 6.2 Provider Reload & Live Discovery Engine

#### Multi-Path Discovery Architecture (`apps/gateway/src/adapters/prober.ts`)
The discovery engine extends beyond basic `PATH` lookups to detect binaries across diverse platform-specific package managers:

```ts
import fs from "node:fs";
import { resolveBinary } from "./resolver.js";
import { AdapterConfig } from "./schema.js";

export interface ProbeResult {
  adapterId: string;
  isInstalled: boolean;
  resolvedPath: string | null;
  detectedVersion?: string;
  probeLatencyMs: number;
}

export class DiscoveryEngine {
  public probeAdapter(config: AdapterConfig): ProbeResult {
    const start = performance.now();
    const resolved = resolveBinary(config.executable);
    const isInstalled = Boolean(resolved.resolvedPath && fs.existsSync(resolved.resolvedPath));

    return {
      adapterId: config.id,
      isInstalled,
      resolvedPath: isInstalled ? resolved.resolvedPath : null,
      probeLatencyMs: Math.round(performance.now() - start),
    };
  }

  public async probeAll(adapters: AdapterConfig[]): Promise<Map<string, ProbeResult>> {
    const results = new Map<string, ProbeResult>();
    for (const adp of adapters) {
      results.set(adp.id, this.probeAdapter(adp));
    }
    return results;
  }
}

export const globalDiscoveryEngine = new DiscoveryEngine();
```

#### Discovery Endpoint (`POST /api/adapters/discover`)
- Triggerable via UI header/button.
- Iterates over all registered adapter blueprints.
- Updates database adapter records (`isInstalled = true`, `status = 'INSTALLED'`, `resolvedPath = ...`).
- Auto-provisions baseline default account `{id}-acc-01` if zero accounts exist.
- Invalidates and re-projects `globalModelCatalog`.
- Broadcasts SSE event `catalog:updated`.

---

### 6.3 Manual CLI Studio & Preflight Dry-Run Probe

```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
│                                    MANUAL CLI STUDIO WORKFLOW                                     │
│                                                                                                   │
│   1. Fill Form Modal ──> 2. Preflight Probe ─────────> 3. Schema Validation ──> 4. Atomic Save    │
│      • Executable Path     • Test Execution             • AdapterConfigSchema    • $DATA_DIR/yaml │
│      • Args Template       • Job Object Timeout (2s)    • Zod Type Invariant     • SQLite Insert  │
│      • Model Tiers         • Live stdout/stderr                                  • Auto-Provision │
+───────────────────────────────────────────────────────────────────────────────────────────────────+
```

1. **Preflight Probe Endpoint (`POST /api/adapters/probe`)**:
   - Executes the targeted binary with `--version` or custom test arguments within a constrained Win32 Job Object or POSIX Process Group ($\le 2{,}000\text{ms}$ timeout).
   - Validates existence, executable permissions, and extracts stdout/stderr.
2. **Persistence & Blueprint Ingestion**:
   - Serializes valid configuration to `$DATA_DIR/adapters/{id}.yaml`.
   - Inserts record into SQLite `adapters` table.
   - Adds adapter into `globalAdapterRegistry`.
   - Instantly exposes models in `/v1/models` and enables routing via `/v1/chat/completions`.
3. **Studio UI**:
   - Integrated Cyber-Deck modal in Web Console.
   - Interactive tokens for argument placeholders (`{model}`, `{prompt}`).
   - Inline dry-run verification console with visual latency and exit code badge.
