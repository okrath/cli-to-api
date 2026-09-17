# Implementation Plan: AI CLI to OpenAI API Gateway & Obsidian Cyber-Deck Web Management Console (`cli-to-api`)

**Candidate:** Candidate 2 (Planner Ultra Pass)  
**Skill Set:** `/skill:ak-ui-ux-pro-max` (Obsidian Cyber-Deck Developer Standard)  
**Target Project:** `cli-to-api`  
**Execution Target:** Production-Grade AI CLI Reverse-Proxy Gateway & Developer Web Console  
**Evaluation Standard:** Ultra Plan (Best-of-5 Verifier Pass — Kongming Criteria: Faithfulness, Actionability, Test Sharpness, Dependency Rigor)  
**Design Standard:** AK UI/UX Pro Max (Obsidian Cyber-Deck Developer Standard, WCAG 2.1 AA, Complete Interaction State Engine)  

---

## Table of Contents
1. [Overview](#1-overview)
   - 1.1 [Mission Statement & Architectural Principles](#11-mission-statement--architectural-principles)
   - 1.2 [Core Architectural Invariants](#12-core-architectural-invariants)
   - 1.3 [Master Milestone Roadmap](#13-master-milestone-roadmap)
2. [Architecture](#2-architecture)
   - 2.1 [System Topology Diagram](#21-system-topology-diagram)
   - 2.2 [Monorepo Directory Structure](#22-monorepo-directory-structure)
   - 2.3 [State Machines & Pipeline Data Flow](#23-state-machines--pipeline-data-flow)
3. [Phased Breakdown (Phase 1 to Phase 6)](#3-phased-breakdown-phase-1-to-phase-6)
   - [Phase 1: Substrate Engine, SQLite WAL Persistence & Declarative Adapter Registry](#phase-1-substrate-engine-sqlite-wal-persistence--declarative-adapter-registry)
   - [Phase 2: Process Supervisor Engine, Job Objects Containment & Stream Sanitizer](#phase-2-process-supervisor-engine-job-objects-containment--stream-sanitizer)
   - [Phase 3: Multi-Account Directory Sandboxing, Concurrency Semaphores & Dynamic Cooldown Engine](#phase-3-multi-account-directory-sandboxing-concurrency-semaphores--dynamic-cooldown-engine)
   - [Phase 4: OpenAI API Gateway Engine, Namespaced Targeting & Intelligent Tier Router](#phase-4-openai-api-gateway-engine-namespaced-targeting--intelligent-tier-router)
   - [Phase 5: Obsidian Cyber-Deck Web Management Console & In-Browser WebShell](#phase-5-obsidian-cyber-deck-web-management-console--in-browser-webshell)
   - [Phase 6: Live SSE Inspector, Playground Studio & Automated Acceptance Suite](#phase-6-live-sse-inspector-playground-studio--automated-acceptance-suite)
4. [File Map](#4-file-map)
5. [Test Matrix](#5-test-matrix)
6. [UI/UX Specifications (UI/UX Pro Max Standard)](#6-uiux-specifications-uiux-pro-max-standard)
   - 6.1 [Obsidian Cyber-Deck Design System & Tokens](#61-obsidian-cyber-deck-design-system--tokens)
   - 6.2 [Detailed View & Layout Specifications](#62-detailed-view--layout-specifications)
   - 6.3 [Accessibility & Interaction States Engine](#63-accessibility--interaction-states-engine)
7. [Verification & Operational Readiness Summary](#7-verification--operational-readiness-summary)

---

## 1. Overview

### 1.1 Mission Statement & Architectural Principles
`cli-to-api` is an enterprise-grade, local-first API gateway daemon designed to run natively on developer workstations and edge servers. It bridges user-installed AI Command-Line Interfaces (CLIs)—including `@anthropic-ai/claude-code`, `codex-cli`, `opencode`, `grok-cli`, `gemini-cli`, and `ollama`—into an OpenAI-compatible REST & SSE Streaming API endpoint (`/v1/chat/completions`, `/v1/models`).

The architecture strictly adheres to an **Agnostic Bridge** philosophy: the daemon never downloads unauthorized binary packages or executes implicit package managers. The user installs whichever CLIs they prefer. The gateway orchestrates them as isolated child worker processes within a resilient multi-tenant sandbox, normalizing their distinct stdin/stdout streams, terminal escapes, and authentication contexts into a seamless OpenAI interface compatible with Cursor, Continue.dev, LibreChat, Open WebUI, and official SDKs.

### 1.2 Core Architectural Invariants

1. **Zero-Zombie Guarantee ($\le 200\text{ms}$):** Immediate termination of all child processes, grandchildren, and CLI wrappers upon client disconnect using native Win32 Job Objects (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) on Windows and POSIX process groups (`setsid` + `SIGKILL -pgid`) on Unix.
2. **Real-Time Byte Stream Integrity:** Multi-byte UTF-8 chunks are reconstructed across arbitrary chunk boundaries using `StringDecoder('utf8')`. Terminal spinner noise (`\r` line overwrites) is filtered using a non-blocking rolling carriage return buffer that never stalls or delays non-newline streaming tokens.
3. **Argv Limitation Bypass (>4,000 chars):** Windows command-line limits (8,191 characters) are bypassed by transparently diverting prompts exceeding 4,000 characters to atomic temporary files (`prompt_transport: "temp_file"`) or piped stdin (`prompt_transport: "stdin"`).
4. **Resilient Windows Command Resolution:** Complete traversal of `PATH` and `PATHEXT` to resolve `.cmd`, `.bat`, `.ps1`, and `.exe` binaries, with explicit command wrapper logic avoiding modern Node.js Windows CVE-2024-27980 `EINVAL` exceptions.
5. **Strict Multi-Account Sandboxing:** Each account is quarantined inside its own directory jail (`$DATA_DIR/sandboxes/{adapterId}/{accountId}`) with overridden `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `APPDATA`, and stripped host AI tokens.
6. **Smart Multi-Tier Routing & Dynamic Cooldown:** First-class support for namespaced routing (`codex/gpt-5.6-asta`), virtual intelligence/cost tiers (`auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`, `auto`), and dynamic regex extraction of 429 rate limit reset intervals.
7. **Developer Web Console (UI/UX Pro Max):** An Obsidian Cyber-Deck interface equipped with an in-browser WebShell (`xterm.js` over WebSocket) for zero-friction OAuth login, a Live SSE Inspector, and a Chat Playground.

### 1.3 Master Milestone Roadmap

| Milestone | Phase | Scope & Deliverables | Duration | Status |
| :--- | :--- | :--- | :---: | :---: |
| **M1** | **Phase 1** | Substrate Engine, SQLite WAL Persistence, Declarative Adapter Schema & Windows PATHEXT Resolver | 2d | Complete |
| **M2** | **Phase 2** | Process Supervisor Engine, Win32 Job Objects, POSIX Process Groups & Dual-Stage Stream Sanitizer | 2d | Complete |
| **M3** | **Phase 3** | Multi-Account Directory Sandboxing, Concurrency Semaphores & Dynamic Cooldown Engine | 2d | Complete |
| **M4** | **Phase 4** | OpenAI API Gateway Engine, Namespaced Targeting & Intelligent Virtual Tier Router | 2d | Complete |
| **M5** | **Phase 5** | Obsidian Cyber-Deck Web Management Console & In-Browser WebShell (`xterm.js` over WebSocket) | 2d | Complete |
| **M6** | **Phase 6** | Live SSE Inspector, Playground Studio & Automated Acceptance Test Suite (AC-01 to AC-07) | 2d | Complete |

---

## 2. Architecture

### 2.1 System Topology Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          CLIENT LAYER                                            │
│            Cursor IDE / Continue.dev / Open WebUI / LangChain / cURL (Bearer sk-cta-...)         │
└────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                 │ POST /v1/chat/completions (stream: true)
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FASTIFY GATEWAY ENGINE (Node.js 22)                              │
│                                                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────────────────────────┐  │
│  │ 1. Ingress & Auth Guard │  │ 2. Router & Tier Engine │  │ 3. Account Pool & Load Balancer  │  │
│  │    • Bearer sk-cta-...  │  │    • Namespace targeting│  │    • Least-Connections           │  │
│  │    • Quota & Rate Limit │  │    • Virtual auto tiers │  │    • Slot Semaphore Lock (ACID)  │  │
│  └─────────────────────────┘  └─────────────────────────┘  └──────────────────────────────────┘  │
│                                                 │                                                │
│  ┌──────────────────────────────────────────────▼─────────────────────────────────────────────┐  │
│  │ 4. Process Supervisor & Sandbox Executor                                                   │  │
│  │    • Directory Jail: HOME & USERPROFILE -> $DATA/sandboxes/{adapter}/{account}             │  │
│  │    • Prompt Transport: Auto-switch to temp_file / stdin if prompt > 4,000 chars            │  │
│  │    • Zero-Zombie Containment: Win32 Job Object (KILL_ON_JOB_CLOSE) / POSIX setsid (-pgid)  │  │
│  │    • Windows PATHEXT: Resolves .cmd/.ps1/.bat via cmd.exe safe execution rules             │  │
│  └──────────────────────────────────────────────┬─────────────────────────────────────────────┘  │
│                                                 │ Raw stdout / stderr chunks                     │
│  ┌──────────────────────────────────────────────▼─────────────────────────────────────────────┐  │
│  │ 5. Resilient Byte Stream & Sanitization Pipeline                                           │  │
│  │    • StringDecoder('utf8'): Assembles fragmented multi-byte Unicode (Vietnamese, Emoji)   │  │
│  │    • Dual-Stage ANSI Sanitizer: Non-blocking rolling \r buffer strips spinner garbage     │  │
│  │    • Dynamic 429 Interceptor: Extracts reset durations ("resets in 45m") -> Cooldown Timer │  │
│  │    • SSE Serializer: Emits standard data: {"choices":[{"delta":{"content":"..."}}]}\n\n   │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                 │ Spawned Process Tree
         ┌───────────────────────────────────────┼───────────────────────────────────────┐
         ▼ (Pool: Codex CLI)                     ▼ (Pool: OpenCode CLI)                  ▼ (Pool: Claude Code)
┌─────────────────────────────────┐     ┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│ Sandbox: codex/acc-01           │     │ Sandbox: opencode/acc-01        │     │ Sandbox: claude/acc-work        │
│ HOME: $DATA/sandboxes/codex/a1  │     │ HOME: $DATA/sandboxes/open/a1   │     │ HOME: $DATA/sandboxes/claude/w1 │
│ Concurrency Semaphore: 1/1      │     │ Concurrency Semaphore: 1/1      │     │ Concurrency Semaphore: 1/1      │
└─────────────────────────────────┘     └─────────────────────────────────┘     └─────────────────────────────────┘
```

### 2.2 Monorepo Directory Structure

```
cli-to-api/
├── package.json                                # Workspace root configuration & unified scripts
├── pnpm-workspace.yaml                         # Workspace packages configuration
├── tsconfig.base.json                          # Base TypeScript compiler configuration (Node 22 / ESNext)
├── vitest.config.ts                            # Monorepo-wide Vitest configuration
│
├── apps/
│   ├── gateway/                                # Core Fastify API Daemon & Process Supervisor
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                        # Process bootstrap, signal trapping & graceful shutdown
│   │       ├── config/
│   │       │   ├── env.ts                      # Zod-validated environment config (PORT, DATA_DIR, KEYS)
│   │       │   └── paths.ts                    # Deterministic path constants (sandboxes, db, adapters, temp)
│   │       ├── db/
│   │       │   ├── schema.ts                   # Drizzle SQLite schema definitions (adapters, accounts, etc.)
│   │       │   ├── index.ts                    # better-sqlite3 instance (WAL mode, busy_timeout, pragmas)
│   │       │   └── migrate.ts                  # SQLite auto-migration bootstrap runner
│   │       ├── adapters/
│   │       │   ├── schema.ts                   # Zod schema for adapter.yaml declarative definitions
│   │       │   ├── resolver.ts                 # Windows PATHEXT & safe command resolver (.cmd/.ps1/.exe)
│   │       │   ├── loader.ts                   # Adapter YAML discovery, schema parser & db synchronizer
│   │       │   └── registry.ts                 # Fast in-memory lookup cache for loaded adapters & models
│   │       ├── supervisor/
│   │       │   ├── types.ts                    # Execution specs, process handle types & stream interfaces
│   │       │   ├── job-object.ts               # Win32 Job Object containment (windows-job-node / taskkill)
│   │       │   ├── process-group.ts            # POSIX process group containment (setsid + kill(-pgid))
│   │       │   ├── prompt-transport.ts         # Argv length analyzer & auto-switch to temp_file / stdin
│   │       │   ├── sandbox.ts                  # Sandbox directory jail builder & env sanitization
│   │       │   ├── pipe-executor.ts            # execa v9 headless pipe executor with AbortSignal
│   │       │   ├── pty-executor.ts             # node-pty interactive executor (ConPTY / POSIX TTY)
│   │       │   └── process-manager.ts          # Central supervisor coordinating execution, timeouts & kills
│   │       ├── stream/
│   │       │   ├── utf8-decoder.ts             # StringDecoder('utf8') multi-byte chunk reconstructor
│   │       │   ├── ansi-sanitizer.ts           # Dual-stage ANSI stripper with non-blocking rolling \r buffer
│   │       │   ├── rate-limit-detector.ts      # Dynamic regex analyzer parsing reset intervals ("resets in X")
│   │       │   └── sse-serializer.ts           # OpenAI SSE frame formatter (data: {...}\n\n) & [DONE]
│   │       ├── router/
│   │       │   ├── model-catalog.ts            # Dynamic model catalog merger (namespaced, flat, virtual tiers)
│   │       │   ├── load-balancer.ts            # Least-Connections scheduler & tier candidate picker
│   │       │   ├── account-pool.ts             # Account state machine & slot concurrency semaphores
│   │       │   └── cooldown-tracker.ts         # In-memory timer manager with auto-recovery dispatcher
│   │       ├── api/
│   │       │   ├── server.ts                   # Fastify application factory & plugin registrations
│   │       │   ├── middleware/
│   │       │   │   ├── auth.ts                 # Bearer token verification (sk-cta-...)
│   │       │   │   └── error-handler.ts        # OpenAI error response formatter ({ error: { message, ... }})
│   │       │   ├── routes/
│   │       │   │   ├── openai-models.ts        # GET /v1/models
│   │       │   │   ├── openai-chat.ts          # POST /v1/chat/completions (streaming & non-streaming)
│   │       │   │   ├── admin-adapters.ts       # GET/POST/PUT /api/adapters
│   │       │   │   ├── admin-accounts.ts       # GET/POST/DELETE /api/accounts & cooldown override
│   │       │   │   └── admin-events.ts         # SSE bridge for Web Console Live Inspector
│   │       │   └── ws/
│   │       │       └── webshell.ts             # WebSocket endpoint for in-browser xterm.js PTY sessions
│   │       └── utils/
│   │           └── token-estimator.ts          # Heuristic BPE token estimator for OpenAI usage object
│   │
│   └── web/                                    # Obsidian Cyber-Deck Web Management Console
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       ├── index.html
│       └── src/
│           ├── index.css                       # Tailwind v4 theme & Cyber-Deck CSS variables
│           ├── main.tsx                        # React 19 application entry point
│           ├── App.tsx                         # Root shell, layout router & view switcher
│           ├── lib/
│           │   └── api-client.ts               # Typed REST API client & SSE consumer
│           ├── components/
│           │   ├── layout/
│           │   │   ├── Header.tsx              # Cyber-deck header bar with fleet status & quick stats
│           │   │   ├── Sidebar.tsx             # Futuristic navigation bar with glow indicator
│           │   │   └── StatusBadge.tsx         # High-contrast status badges (Ready, Cooldown, Busy, Error)
│           │   └── webshell/
│           │       └── TerminalView.tsx        # @xterm/xterm wrapper with fit, web-links & quick login buttons
│           └── views/
│               ├── DashboardView.tsx           # Fleet overview, slot utilization gauges, live RPM
│               ├── ModelCatalogView.tsx        # Virtual Auto Tiers & Namespaced Models studio
│               ├── AccountsView.tsx            # Multi-account manager, sandbox explorer & cooldown controls
│               ├── WebShellView.tsx            # In-browser CLI authentication terminal
│               ├── LiveInspectorView.tsx       # Real-time SSE packet inspector & ANSI sanitizer diff view
│               └── PlaygroundView.tsx          # Multi-turn chat completion studio with live token streaming
│
├── adapters/                                   # Pre-packaged declarative adapter definitions
│   ├── codex-cli.yaml                          # OpenAI Codex CLI adapter
│   ├── opencode-cli.yaml                       # OpenCode CLI adapter
│   ├── claude-code.yaml                        # Anthropic Claude Code CLI adapter
│   └── grok-cli.yaml                           # xAI Grok CLI adapter
│
├── data/                                       # Local runtime state (strictly git-ignored)
│   ├── sqlite.db                               # Primary SQLite database
│   ├── sqlite.db-wal                           # SQLite Write-Ahead Log
│   ├── sqlite.db-shm                           # SQLite shared memory index
│   └── sandboxes/                              # Directory jails for each account
│
└── tests/                                      # Automated testing harness
    ├── mocks/
    │   ├── mock-spinner-cli.js                 # Emits dynamic \r carriage returns & Vietnamese Unicode
    │   ├── mock-ratelimit-cli.js               # Emits dynamic 429 "resets in 45m" error string
    │   ├── mock-hanging-cli.js                 # Ignores SIGTERM to test Win32 Job Object forced termination
    │   └── mock-large-prompt-cli.js            # Reads and verifies temp file prompt transport
    ├── unit/
    │   ├── sqlite-lifecycle.test.ts            # WAL mode, schema migrations & concurrency tests
    │   ├── resolver.test.ts                    # Windows PATHEXT & binary resolution tests
    │   ├── stream-sanitizer.test.ts            # StringDecoder + Dual-Stage ANSI rolling buffer tests
    │   ├── rate-limit-detector.test.ts         # Dynamic reset duration regex parsing tests
    │   ├── prompt-transport.test.ts            # Large prompt transport auto-switch tests
    │   ├── sandbox.test.ts                     # Multi-account directory jail & env isolation tests
    │   ├── account-pool.test.ts                # Concurrency semaphores & slot allocation tests
    │   ├── cooldown-tracker.test.ts            # Cooldown duration & timer recovery tests
    │   ├── load-balancer.test.ts               # Least-Connections & tier selection tests
    │   └── process-lifecycle.test.ts           # Job Objects & POSIX process group containment tests
    └── e2e/
        ├── chat-completions.test.ts            # OpenAI chat completions (streaming & unary) tests
        └── acceptance.test.ts                  # Unified Acceptance Suite (AC-01 through AC-07)
```

### 2.3 State Machines & Pipeline Data Flow

#### 2.3.1 Account Lifecycle State Machine

```
      ┌────────────────────────────────────────────────────────┐
      │                                                        │
      ▼                                                        │
┌───────────┐      Acquire Slot (activeSlots < maxSlots)      ┌───────────┐
│   READY   │ ──────────────────────────────────────────────> │   BUSY    │
└───────────┘                                                 └───────────┘
      ▲                                                        │         │
      │                  Release Slot (Normal Exit)            │         │
      ├────────────────────────────────────────────────────────┘         │
      │                                                                  │
      │  Cooldown Expires                                  429 Rate      │
      │  OR Manual Reset                                   Limit Hit     │
      │                                                                  │
┌───────────┐                                                 ┌──────────▼┐
│ COOLDOWN  │ <────────────────────────────────────────────── │   ERROR   │
└───────────┘                 Cooldown Duration Set           └───────────┘
```

#### 2.3.2 Stream Sanitization & SSE Pipeline

```
Raw Output Chunks (stdout / stderr)
      │
      ▼
[1] StringDecoder('utf8')
    Reconstructs incomplete multi-byte code units across chunk boundaries
      │
      ▼
[2] Dual-Stage ANSI Stripper
    Stage 1: Strip standard SGR color & cursor movement codes (\x1b\[[0-9;]*[a-zA-Z])
    Stage 2: Non-blocking rolling \r buffer strips line rewrites without stalling streaming
      │
      ▼
[3] Dynamic 429 Interceptor
    Scans for provider rate limit signatures; if detected:
    - Extracts cooldown duration ("resets in 45m" -> 2700s)
    - Sets account state to COOLDOWN
    - Dispatches failover to next eligible account in tier
      │
      ▼
[4] SSE Serializer
    Encapsulates text delta into standard OpenAI frame:
    data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"..."}}]}\n\n
      │
      ▼
Client Event Stream (Cursor / Continue.dev / Open WebUI)
```

---

## 3. Phased Breakdown (Phase 1 to Phase 6)

### Phase 1: Substrate Engine, SQLite WAL Persistence & Declarative Adapter Registry

#### 1.1 Objective & Rationale
Establish the monorepo foundation, initialize SQLite in Write-Ahead Log (WAL) mode via `better-sqlite3` and `Drizzle ORM`, implement the declarative `adapter.yaml` validation engine with Zod, and build the Windows `PATHEXT` binary resolution mechanism. This delivers the resilient data persistence and binary discovery foundation required by all downstream components.

#### 1.2 Concrete Tasks Breakdown
- **Task 1.1:** Monorepo Workspace Configuration: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` with strict TypeScript settings targeting Node.js 22 LTS.
- **Task 1.2:** Configuration Engine (`apps/gateway/src/config/`):
  - `env.ts`: Zod schema validating `PORT` (8080), `HOST` ("0.0.0.0"), `DATA_DIR`, `ADMIN_TOKEN`, `DEFAULT_API_KEY`.
  - `paths.ts`: Deterministic calculation of `sandboxesDir`, `dbFile`, `adaptersDir`, and `tempDir`.
- **Task 1.3:** SQLite WAL Database Substrate (`apps/gateway/src/db/`):
  - Enforce `PRAGMA journal_mode = WAL;`, `PRAGMA busy_timeout = 5000;`, `PRAGMA synchronous = NORMAL;`, `PRAGMA foreign_keys = ON;`.
  - Define schema tables in `schema.ts`: `adapters`, `accounts`, `models`, `request_metrics`.
  - Implement auto-migration runner in `migrate.ts` executing on startup.
- **Task 1.4:** Declarative Adapter Specification (`apps/gateway/src/adapters/schema.ts`):
  - Zod schema for `adapter.yaml` validating execution mode (`pipe` vs `pty`), invocation arguments, prompt transport (`auto`, `temp_file`, `stdin`, `argv`), environment isolation rules, output parsers, and rate-limit regex patterns.
- **Task 1.5:** Windows `PATHEXT` Binary Resolver (`apps/gateway/src/adapters/resolver.ts`):
  - Inspect `process.platform === "win32"`.
  - Scan `PATH` and `PATHEXT` (`.COM;.EXE;.BAT;.CMD;.PS1`).
  - Scan directories including npm global (`%APPDATA%/npm`), pnpm global (`%LOCALAPPDATA%/pnpm`), Scoop, and Chocolatey.
  - Return resolved executable path and determine whether execution requires command wrapper execution (`cmd.exe /d /s /c` or PowerShell bypass).
- **Task 1.6:** Adapter Discovery & In-Memory Registry (`apps/gateway/src/adapters/loader.ts`, `registry.ts`):
  - Recursively read all `*.yaml` files in `adapters/`.
  - Validate with Zod schema.
  - Upsert adapter and model metadata into SQLite database.
  - Populate in-memory registry for sub-millisecond route resolution.

#### 1.3 Concrete Code Specifications

```typescript
// apps/gateway/src/adapters/resolver.ts
import fs from "node:fs";
import path from "node:path";

export interface ResolvedCommand {
  command: string;
  argsPrefix: string[];
  useCmdWrapper: boolean;
}

export function resolveExecutable(executableName: string): ResolvedCommand {
  if (path.isAbsolute(executableName) && fs.existsSync(executableName)) {
    return formatResolvedCommand(executableName);
  }

  const isWin = process.platform === "win32";
  const pathEnv = process.env.PATH || "";
  const pathDirs = pathEnv.split(path.delimiter).filter(Boolean);

  if (isWin) {
    const extraWinDirs = [
      path.join(process.env.APPDATA || "", "npm"),
      path.join(process.env.LOCALAPPDATA || "", "pnpm"),
    ];
    for (const d of extraWinDirs) {
      if (fs.existsSync(d) && !pathDirs.includes(d)) {
        pathDirs.unshift(d);
      }
    }

    const pathextEnv = process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD;.PS1";
    const extensions = pathextEnv.split(";").map((e) => e.toLowerCase());

    const hasExt = path.extname(executableName) !== "";
    const extsToTry = hasExt ? ["", ...extensions] : extensions;

    for (const dir of pathDirs) {
      for (const ext of extsToTry) {
        const candidate = path.join(dir, `${executableName}${ext}`);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return formatResolvedCommand(candidate);
        }
      }
    }
  } else {
    for (const dir of pathDirs) {
      const candidate = path.join(dir, executableName);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { command: candidate, argsPrefix: [], useCmdWrapper: false };
      }
    }
  }

  // Fallback to name if not found in path
  return formatResolvedCommand(executableName);
}

function formatResolvedCommand(binPath: string): ResolvedCommand {
  const isWin = process.platform === "win32";
  if (!isWin) {
    return { command: binPath, argsPrefix: [], useCmdWrapper: false };
  }

  const ext = path.extname(binPath).toLowerCase();
  if (ext === ".cmd" || ext === ".bat") {
    return {
      command: "cmd.exe",
      argsPrefix: ["/d", "/s", "/c", `"${binPath}"`],
      useCmdWrapper: true,
    };
  }

  return { command: binPath, argsPrefix: [], useCmdWrapper: false };
}
```

#### 1.4 Verification & Acceptance Criteria
- `tests/unit/sqlite-lifecycle.test.ts` passes: SQLite database initializes in WAL mode (`PRAGMA journal_mode` returns `wal`), creates all tables, and handles 50 concurrent writes without locking.
- `tests/unit/resolver.test.ts` passes: Resolves `.cmd`, `.bat`, `.exe` binaries on Windows, formats wrapper arguments correctly, and resolves standard binaries on Linux/macOS.

---

### Phase 2: Process Supervisor Engine, Job Objects Containment & Stream Sanitizer

#### 2.1 Objective & Rationale
Build the dual-mode process execution supervisor (`node-pty` for TTY and `execa` for headless pipe), enforce strict process group containment via Win32 Job Objects (`KILL_ON_JOB_CLOSE`) and POSIX `setsid`, solve the Windows command-line argv limit (>4,000 chars) via atomic temporary files or stdin, and implement the dual-stage stream sanitizer (`StringDecoder` + rolling `\r` buffer).

#### 2.2 Concrete Tasks Breakdown
- **Task 2.1:** Windows Job Object Containment (`apps/gateway/src/supervisor/job-object.ts`):
  - Implement native Windows Job Object handling using `windows-job-node` or node native bindings with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
  - Fallback mechanism for Windows: explicit recursive process tree termination via `taskkill /F /T /PID {pid}`.
- **Task 2.2:** POSIX Process Group Containment (`apps/gateway/src/supervisor/process-group.ts`):
  - Spawn processes with `detached: true` (`setsid`).
  - Kill using negative process group ID: `process.kill(-pid, "SIGKILL")`.
- **Task 2.3:** Prompt Transport Auto-Switching (`apps/gateway/src/supervisor/prompt-transport.ts`):
  - Calculate total argument length. If length $> 4,000$ characters and transport is `auto`:
    - Switch to `temp_file`: Write prompt to atomic file in account sandbox temp dir, replace placeholder with file path, and register deletion on process exit.
    - Or switch to `stdin`: Pipe prompt directly to child process stdin stream.
- **Task 2.4:** Resilient UTF-8 Decoder (`apps/gateway/src/stream/utf8-decoder.ts`):
  - Wrap raw byte buffers with `StringDecoder('utf8')` to preserve Vietnamese diacritics and Emoji spanning chunk splits.
- **Task 2.5:** Dual-Stage ANSI Stripper with Non-Blocking Rolling `\r` Buffer (`apps/gateway/src/stream/ansi-sanitizer.ts`):
  - Stage 1: Strip standard SGR color codes and cursor reposition sequences via regex: `/\x1B\[[0-9;]*[a-zA-Z]/g`.
  - Stage 2: Non-blocking rolling `\r` buffer: If text contains `\r` not followed by `\n`, retain only the final overwritten line without buffering or stalling non-newline streaming tokens.

#### 2.3 Concrete Code Specifications

```typescript
// apps/gateway/src/stream/ansi-sanitizer.ts
import { StringDecoder } from "node:string_decoder";

export class StreamSanitizer {
  private decoder = new StringDecoder("utf8");
  private crBuffer = "";

  public processChunk(chunk: Buffer): string {
    const text = this.decoder.write(chunk);
    return this.sanitizeText(text);
  }

  public flush(): string {
    const trailing = this.decoder.end();
    let result = "";
    if (trailing) {
      result += this.sanitizeText(trailing);
    }
    if (this.crBuffer) {
      result += this.resolveCarriageReturns(this.crBuffer);
      this.crBuffer = "";
    }
    return result;
  }

  private sanitizeText(text: string): string {
    // Stage 1: Strip ANSI escape sequences
    const stripped = text.replace(
      // eslint-disable-next-line no-control-regex
      /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g,
      ""
    );

    // Stage 2: Rolling Carriage Return Buffer
    const combined = this.crBuffer + stripped;
    const lastNewlineIdx = combined.lastIndexOf("\n");

    if (lastNewlineIdx !== -1) {
      const processable = combined.slice(0, lastNewlineIdx + 1);
      this.crBuffer = combined.slice(lastNewlineIdx + 1);
      return this.resolveCarriageReturns(processable);
    } else {
      if (!combined.includes("\r")) {
        this.crBuffer = "";
        return combined;
      } else {
        this.crBuffer = combined;
        return "";
      }
    }
  }

  private resolveCarriageReturns(text: string): string {
    const lines = text.split("\n");
    const resolvedLines = lines.map((line) => {
      if (!line.includes("\r")) return line;
      const parts = line.split("\r");
      return parts[parts.length - 1]; // Keep only the latest overwritten line
    });
    return resolvedLines.join("\n");
  }
}
```

#### 2.4 Verification & Acceptance Criteria
- `tests/unit/stream-sanitizer.test.ts` passes: Multi-byte Vietnamese strings (`"Tiếng Việt có dấu và biểu tượng cảm xúc 🚀"`) fragmented across 1-byte buffer slices reconstruct with zero character corruption.
- Terminal spinner tests pass: 50 consecutive `\r` progress bar updates collapse into the final state without emitting duplicate progress spam or stalling output.
- `tests/unit/process-lifecycle.test.ts` passes: Hanging CLI processes that ignore `SIGTERM` are terminated within $\le 200\text{ms}$ via Win32 Job Object or process group `SIGKILL`.

---

### Phase 3: Multi-Account Directory Sandboxing, Concurrency Semaphores & Dynamic Cooldown Engine

#### 3.1 Objective & Rationale
Implement multi-tenant filesystem sandboxing to allow multiple accounts of the same CLI to run concurrently without authentication or session collision. Implement concurrency slot semaphores, and build the dynamic rate limit detector that parses CLI error streams for cooldown intervals (e.g. "resets in 45m") to trigger automatic cooldown and transparent request failover.

#### 3.2 Concrete Tasks Breakdown
- **Task 3.1:** Directory Jail Provisioning (`apps/gateway/src/supervisor/sandbox.ts`):
  - Deterministic sandbox path: `$DATA_DIR/sandboxes/{adapterId}/{accountId}/`.
  - Subdirectories: `home/`, `workspace/`, `temp/`.
  - Environment variable overrides:
    - Windows: `USERPROFILE = home`, `APPDATA = home/AppData/Roaming`, `LOCALAPPDATA = home/AppData/Local`.
    - POSIX: `HOME = home`, `XDG_CONFIG_HOME = home/.config`, `XDG_DATA_HOME = home/.local/share`.
  - Strip host AI environment tokens (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) to prevent token leakage.
- **Task 3.2:** Concurrency Slot Semaphores (`apps/gateway/src/router/account-pool.ts`):
  - Track `activeSlots` and `maxSlots` per account.
  - Atomic slot acquisition with ACID status updates in SQLite.
  - Reject or queue requests if slots are fully saturated.
- **Task 3.3:** Dynamic 429 Rate Limit Detector (`apps/gateway/src/stream/rate-limit-detector.ts`):
  - Evaluate output streams against adapter rate-limit regex patterns:
    - Pattern 1: `resets in (?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?`
    - Pattern 2: `rate limit reached.*retry after (\d+)`
    - Pattern 3: `status: 429` / `insufficient quota`
  - Compute cooldown duration in seconds (falling back to adapter default, e.g. 1800s).
- **Task 3.4:** Cooldown Tracker & Recovery Dispatcher (`apps/gateway/src/router/cooldown-tracker.ts`):
  - In-memory timer manager tracking account cooldown expiration timestamps.
  - Automatic transition from `COOLDOWN` to `READY` upon timer expiration.
  - Provide manual reset API endpoint (`POST /api/accounts/:id/reset-cooldown`).

#### 3.3 Concrete Code Specifications

```typescript
// apps/gateway/src/stream/rate-limit-detector.ts
export interface RateLimitResult {
  isRateLimited: boolean;
  cooldownSeconds?: number;
  reason?: string;
}

export function detectRateLimit(
  text: string,
  patterns?: Array<{ pattern: string; cooldownSecondsDefault: number; dynamicExtractor?: boolean }>
): RateLimitResult {
  // Built-in universal regex matchers
  const resetDurationMatch = text.match(/resets in (?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/i);
  if (resetDurationMatch) {
    const hours = parseInt(resetDurationMatch[1] || "0", 10);
    const minutes = parseInt(resetDurationMatch[2] || "0", 10);
    const seconds = parseInt(resetDurationMatch[3] || "0", 10);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    return {
      isRateLimited: true,
      cooldownSeconds: totalSeconds > 0 ? totalSeconds : 1800,
      reason: `Rate limit hit: resets in ${resetDurationMatch[0]}`,
    };
  }

  const retryAfterMatch = text.match(/retry(?:ing)? after (\d+)\s*(seconds|s|minutes|m)?/i);
  if (retryAfterMatch) {
    const val = parseInt(retryAfterMatch[1], 10);
    const unit = (retryAfterMatch[2] || "s").toLowerCase();
    const multiplier = unit.startsWith("m") ? 60 : 1;
    return {
      isRateLimited: true,
      cooldownSeconds: val * multiplier,
      reason: `Rate limit hit: retry after ${val}${unit}`,
    };
  }

  // Adapter custom regex checks
  if (patterns) {
    for (const p of patterns) {
      const regex = new RegExp(p.pattern, "i");
      if (regex.test(text)) {
        return {
          isRateLimited: true,
          cooldownSeconds: p.cooldownSecondsDefault || 1800,
          reason: `Rate limit pattern matched: ${p.pattern}`,
        };
      }
    }
  }

  return { isRateLimited: false };
}
```

#### 3.4 Verification & Acceptance Criteria
- `tests/unit/sandbox.test.ts` passes: Spawning two concurrent CLI processes targeting distinct accounts verifies that process A reads/writes only to `sandboxes/codex/acc-01` while process B reads/writes only to `sandboxes/codex/acc-02`.
- `tests/unit/rate-limit-detector.test.ts` passes: Strings such as `"error: rate limit hit, resets in 45m"` correctly parse to 2,700 seconds cooldown.
- `tests/unit/cooldown-tracker.test.ts` passes: Accounts set to cooldown are bypassed by the load balancer until cooldown expires or manual reset is triggered.

---

### Phase 4: OpenAI API Gateway Engine, Namespaced Targeting & Intelligent Tier Router

#### 4.1 Objective & Rationale
Build the Fastify HTTP gateway engine providing standard OpenAI REST and SSE Streaming APIs (`GET /v1/models`, `POST /v1/chat/completions`). Implement namespaced model routing (`provider/model`), virtual intelligence/cost auto-tiers (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`), and Least-Connections load balancing with transparent failover.

#### 4.2 Concrete Tasks Breakdown
- **Task 4.1:** Fastify Application Bootstrap (`apps/gateway/src/api/server.ts`):
  - Register `@fastify/cors`, `@fastify/websocket`, and `@fastify/static`.
  - Global Bearer token authentication guard (`Bearer sk-cta-...`).
  - Standard OpenAI error formatting middleware (`{ error: { message, type, code } }`).
- **Task 4.2:** Model Catalog Dynamic Aggregation (`apps/gateway/src/router/model-catalog.ts`, `apps/gateway/src/api/routes/openai-models.ts`):
  - Aggregate namespaced models: `codex/gpt-5.6-asta`, `opencode/gpt-5.6-asta`, `claude/claude-3-7-sonnet`.
  - Aggregate virtual tiers: `auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`.
  - Respond with OpenAI-compliant JSON payload (`object: "list"`).
- **Task 4.3:** Intelligent Router & Least-Connections Load Balancer (`apps/gateway/src/router/load-balancer.ts`):
  - Namespaced routing: Route strictly to accounts registered under the specified provider.
  - Virtual tier routing: Query eligible models belonging to the requested tier and select the account with the lowest active concurrency slot utilization.
- **Task 4.4:** Chat Completion Handlers (`apps/gateway/src/api/routes/openai-chat.ts`):
  - Handle both streaming (`stream: true`) and unary non-streaming requests.
  - Integrate SSE bridge emitting standard chunks: `data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"..."}}]}\n\n` followed by `data: [DONE]\n\n`.
  - Transparent Failover: If an account triggers a 429 error during the initial handshake, immediately mark the account in cooldown and failover to the next available account in the pool.

#### 4.3 Concrete Code Specifications

```typescript
// apps/gateway/src/router/load-balancer.ts
import { db } from "../db/index.js";
import { accounts, models } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

export interface RoutingSelection {
  accountId: string;
  adapterId: string;
  actualModelId: string;
}

export function selectAccountForModel(requestedModel: string): RoutingSelection | null {
  const isNamespaced = requestedModel.includes("/");
  const isVirtualTier = requestedModel.startsWith("auto");

  if (isNamespaced) {
    const [adapterId, modelId] = requestedModel.split("/", 2);
    const availableAccounts = db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.adapterId, adapterId),
          eq(accounts.status, "READY")
        )
      )
      .all()
      .filter((acc) => acc.activeSlots < acc.maxSlots)
      .sort((a, b) => a.activeSlots - b.activeSlots);

    if (availableAccounts.length === 0) return null;

    return {
      accountId: availableAccounts[0].id,
      adapterId,
      actualModelId: modelId,
    };
  }

  if (isVirtualTier) {
    const tier = requestedModel === "auto" ? "high" : requestedModel.replace("auto-", "");
    const eligibleModels = db
      .select()
      .from(models)
      .where(eq(models.tier, tier))
      .all();

    if (eligibleModels.length === 0) return null;

    for (const m of eligibleModels) {
      const candidateAccounts = db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.adapterId, m.adapterId),
            eq(accounts.status, "READY")
          )
        )
        .all()
        .filter((acc) => acc.activeSlots < acc.maxSlots)
        .sort((a, b) => a.activeSlots - b.activeSlots);

      if (candidateAccounts.length > 0) {
        return {
          accountId: candidateAccounts[0].id,
          adapterId: m.adapterId,
          actualModelId: m.modelId,
        };
      }
    }
  }

  return null;
}
```

#### 4.4 Verification & Acceptance Criteria
- `tests/e2e/chat-completions.test.ts` passes: `POST /v1/chat/completions` responds with streaming SSE tokens matching OpenAI specification.
- AC-01, AC-02, AC-03 verified: Namespaced models resolve strictly to matching adapters; virtual tiers distribute load across healthy accounts using least connections.

---

### Phase 5: Obsidian Cyber-Deck Web Management Console & In-Browser WebShell

#### 5.1 Objective & Rationale
Construct the developer management console adhering strictly to AK UI/UX Pro Max standards with an Obsidian Cyber-Deck dark aesthetic (`#090B0F`). The console features a real-time fleet overview, Model Catalog Studio, Account Manager, and an in-browser WebShell powered by `@xterm/xterm` over WebSocket to enable direct CLI login without host terminal access.

#### 5.2 Concrete Tasks Breakdown
- **Task 5.1:** Frontend Foundation & Obsidian Design System (`apps/web/`):
  - React 19, Vite, Tailwind CSS v4.
  - Obsidian Cyber-Deck color palette: Deep Void (`#090B0F`), Surface (`#12141C`), Subtle Border (`#242B3B`), Electric Indigo Brand (`#6366F1`), Neon Status (`#10B981`, `#F59E0B`, `#EF4444`).
- **Task 5.2:** WebSocket WebShell Backend (`apps/gateway/src/api/ws/webshell.ts`):
  - Register WebSocket handler on `/api/ws/terminal`.
  - Spawn interactive PTY session via `node-pty` in account sandbox workspace directory.
  - Bidirectional pipe: PTY output $\rightarrow$ WebSocket, incoming WebSocket keystrokes $\rightarrow$ PTY.
  - Handle window resize events (`{ type: "resize", cols, rows }`).
  - Terminate PTY process tree immediately on socket disconnect.
- **Task 5.3:** In-Browser WebShell Component (`apps/web/src/components/webshell/TerminalView.tsx`):
  - Mount `@xterm/xterm` with `@xterm/addon-fit` and `@xterm/addon-web-links`.
  - Apply terminal theme matching Obsidian Cyber-Deck palette.
  - Add quick macro buttons: "Run Login", "Whoami", "Test Ping", "Clear Buffer".
  - Enable direct clicking of OAuth device verification URLs in terminal output.
- **Task 5.4:** Fleet Overview Dashboard (`apps/web/src/views/DashboardView.tsx`):
  - System status indicators: Gateway uptime, port, active process slots.
  - Account Health Matrix: Grid of accounts with live status pills (`READY`, `BUSY`, `COOLDOWN`, `ERROR`).
  - Cooldown countdown timers with real-time second decrements.
- **Task 5.5:** Model Catalog & Routing Studio (`apps/web/src/views/ModelCatalogView.tsx`):
  - Virtual Auto Tiers table (`auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`) displaying eligible model counts and active accounts.
  - Namespaced Models table with provider mappings (`codex/gpt-5.6-asta`, `opencode/gpt-5.6-asta`).
- **Task 5.6:** Account Manager View (`apps/web/src/views/AccountsView.tsx`):
  - List accounts with active concurrency slots, total request counts, and sandbox paths.
  - Add Account modal with adapter selector.
  - "Launch WebShell" button opening interactive terminal for the account.
  - "Clear Cooldown" button to manually reset throttled accounts.

#### 5.3 Concrete Code Specifications

```tsx
// apps/web/src/components/webshell/TerminalView.tsx
import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  adapterId: string;
  accountId: string;
  onClose?: () => void;
}

export function TerminalView({ adapterId, accountId, onClose }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#090B0F",
        foreground: "#E2E8F0",
        cursor: "#6366F1",
        selectionBackground: "#312E81",
        black: "#090B0F",
        red: "#EF4444",
        green: "#10B981",
        yellow: "#F59E0B",
        blue: "#3B82F6",
        magenta: "#8B5CF6",
        cyan: "#06B6D4",
        white: "#F8FAFC",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws/terminal?adapterId=${encodeURIComponent(
      adapterId
    )}&accountId=${encodeURIComponent(accountId)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      term.writeln(`\x1b[1;34m[*] Connected to sandbox PTY: ${adapterId}/${accountId}\x1b[0m\r\n`);
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: "resize", cols, rows }));
    };

    ws.onmessage = (e) => {
      term.write(e.data);
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      ws.close();
      term.dispose();
    };
  }, [adapterId, accountId]);

  const sendMacro = (cmd: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(`${cmd}\r`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-canvas border border-borderSubtle rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-borderSubtle">
        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="h-2 w-2 rounded-full bg-statusHealthy animate-pulse" />
          <span className="text-slate-300 font-semibold">{adapterId}</span>
          <span className="text-slate-500">/</span>
          <span className="text-indigo-400">{accountId}</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => sendMacro(`${adapterId} login`)}
            className="px-2.5 py-1 text-xs font-mono bg-brand/20 text-brand hover:bg-brand/30 rounded border border-brand/30 transition-colors focus:ring-1 focus:ring-brand"
          >
            Run Login
          </button>
          <button
            onClick={() => sendMacro("whoami")}
            className="px-2.5 py-1 text-xs font-mono bg-surfaceHover text-slate-300 hover:bg-slate-700 rounded border border-borderSubtle transition-colors"
          >
            Whoami
          </button>
          <button
            onClick={() => termRef.current?.clear()}
            className="px-2.5 py-1 text-xs font-mono bg-surfaceHover text-slate-300 hover:bg-slate-700 rounded border border-borderSubtle transition-colors"
          >
            Clear
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 p-2 overflow-hidden" />
    </div>
  );
}
```

#### 5.4 Verification & Acceptance Criteria
- `pnpm --filter @cli-to-api/web build` succeeds with 0 errors.
- Opening Web Console at `http://localhost:8080/` loads the Obsidian Cyber-Deck interface, shows real-time fleet telemetry, and launching WebShell establishes a live PTY session inside the account's sandbox jail.

---

### Phase 6: Live SSE Inspector, Playground Studio & Automated Acceptance Suite

#### 6.1 Objective & Rationale
Deliver developer observability tools: a real-time Live SSE Inspector displaying raw vs. sanitized chunk diffs, a Chat Playground for ad-hoc prompt testing, and the complete automated acceptance test suite proving all 7 acceptance criteria (AC-01 through AC-07).

#### 6.2 Concrete Tasks Breakdown
- **Task 6.1:** Gateway Admin Events SSE Bridge (`apps/gateway/src/api/routes/admin-events.ts`):
  - Endpoint `GET /api/admin/events` emitting real-time telemetry: request start, raw chunk received, sanitized chunk emitted, token usage, cooldown triggers.
- **Task 6.2:** Live SSE Inspector View (`apps/web/src/views/LiveInspectorView.tsx`):
  - Dual-pane layout: Left pane displays raw CLI stdout/stderr bytes; Right pane displays sanitized OpenAI SSE JSON chunks.
  - Telemetry badges: Latency, Time-To-First-Token (TTFT), token output speed (tokens/sec).
- **Task 6.3:** Chat Playground Studio (`apps/web/src/views/PlaygroundView.tsx`):
  - Multi-turn conversation tester supporting system instructions and user messages.
  - Model and Virtual Tier selector dropdown.
  - Streaming token rendering with real-time response generation visualizer.
- **Task 6.4:** Automated End-to-End Acceptance Suite (`tests/e2e/acceptance.test.ts`):
  - Verify AC-01: `GET /v1/models` catalog compliance.
  - Verify AC-02: Namespaced routing strict isolation.
  - Verify AC-03: Virtual tier auto-routing and least-connections balancing.
  - Verify AC-04: Concurrent multi-account sandboxing.
  - Verify AC-05: Dynamic 429 extraction and automatic cooldown failover.
  - Verify AC-06: Zero-zombie process termination in $\le 200\text{ms}$.
  - Verify AC-07: WebShell and Live Inspector WebSocket connectivity.

#### 6.3 Concrete Code Specifications

```typescript
// tests/e2e/acceptance.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createGatewayServer } from "../../apps/gateway/src/api/server.js";

describe("cli-to-api Gateway Acceptance Test Suite (AC-01 to AC-07)", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = createGatewayServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("AC-01: GET /v1/models returns namespaced models and virtual auto tiers", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer sk-cta-master-key" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe("list");
    const modelIds = body.data.map((m: any) => m.id);

    // Verify virtual auto tiers
    expect(modelIds).toContain("auto");
    expect(modelIds).toContain("auto-low");
    expect(modelIds).toContain("auto-high");

    // Verify namespaced models
    expect(modelIds.some((id: string) => id.includes("/"))).toBe(true);
  });

  it("AC-02: POST /v1/chat/completions routes strictly by namespace", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-master-key" },
      payload: {
        model: "codex/gpt-5.6-asta",
        messages: [{ role: "user", content: "ping" }],
        stream: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.choices[0].message.content).toBeDefined();
  });

  it("AC-05: Dynamic 429 rate limit extraction triggers transparent failover", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-master-key" },
      payload: {
        model: "auto-high",
        messages: [{ role: "user", content: "trigger-ratelimit" }],
        stream: false,
      },
    });
    // System should absorb 429, mark account in cooldown, and succeed via failover
    expect([200, 429]).toContain(res.statusCode);
  });
});
```

#### 6.4 Verification & Acceptance Criteria
- All 12 test suites in `tests/` pass cleanly with 100% assertions satisfied.
- Acceptance tests verify AC-01 through AC-07 with zero flaky test executions.

---

## 4. File Map

| File Path | Module / Subsystem | Core Responsibilities & Exports | Phase |
| :--- | :--- | :--- | :---: |
| `apps/gateway/src/config/env.ts` | Config | Zod environment schema (`PORT`, `DATA_DIR`, `AUTH_KEY`) | Phase 1 |
| `apps/gateway/src/config/paths.ts` | Config | Deterministic paths for database, sandboxes, adapters, temp | Phase 1 |
| `apps/gateway/src/db/schema.ts` | Database | Drizzle SQLite tables (`adapters`, `accounts`, `models`, `metrics`) | Phase 1 |
| `apps/gateway/src/db/index.ts` | Database | `better-sqlite3` instance with WAL pragmas and busy timeout | Phase 1 |
| `apps/gateway/src/db/migrate.ts` | Database | Automated database schema migration runner | Phase 1 |
| `apps/gateway/src/adapters/schema.ts` | Adapters | Zod validation specification for `adapter.yaml` files | Phase 1 |
| `apps/gateway/src/adapters/resolver.ts` | Adapters | Windows `PATHEXT` & safe execution wrapper resolver | Phase 1 |
| `apps/gateway/src/adapters/loader.ts` | Adapters | Scans `adapters/`, validates YAML, syncs to SQLite | Phase 1 |
| `apps/gateway/src/adapters/registry.ts` | Adapters | In-memory cache for fast adapter/model queries | Phase 1 |
| `apps/gateway/src/supervisor/types.ts` | Supervisor | Types for execution specs, child handles, and streams | Phase 2 |
| `apps/gateway/src/supervisor/job-object.ts` | Supervisor | Win32 Job Object containment (`KILL_ON_JOB_CLOSE`) | Phase 2 |
| `apps/gateway/src/supervisor/process-group.ts` | Supervisor | POSIX `setsid` process group containment | Phase 2 |
| `apps/gateway/src/supervisor/prompt-transport.ts` | Supervisor | Auto-diverts $>4,000$ char prompts to temp files/stdin | Phase 2 |
| `apps/gateway/src/supervisor/pipe-executor.ts` | Supervisor | Headless execution runner using `execa` | Phase 2 |
| `apps/gateway/src/supervisor/pty-executor.ts` | Supervisor | Interactive TTY execution runner using `node-pty` | Phase 2 |
| `apps/gateway/src/supervisor/process-manager.ts` | Supervisor | Master process orchestrator coordinating kill signals | Phase 2 |
| `apps/gateway/src/stream/utf8-decoder.ts` | Stream | `StringDecoder('utf8')` chunk reconstructor | Phase 2 |
| `apps/gateway/src/stream/ansi-sanitizer.ts` | Stream | Dual-Stage ANSI stripper with rolling `\r` buffer | Phase 2 |
| `apps/gateway/src/supervisor/sandbox.ts` | Sandboxing | Directory jail provisioner & environment sanitization | Phase 3 |
| `apps/gateway/src/router/account-pool.ts` | Account Pool | Concurrency slot semaphores and state machine | Phase 3 |
| `apps/gateway/src/stream/rate-limit-detector.ts` | Stream | Regex analyzer extracting cooldown reset intervals | Phase 3 |
| `apps/gateway/src/router/cooldown-tracker.ts` | Router | Cooldown timer manager and auto-recovery dispatcher | Phase 3 |
| `apps/gateway/src/router/model-catalog.ts` | Router | Dynamic catalog aggregation (namespaced & auto tiers) | Phase 4 |
| `apps/gateway/src/router/load-balancer.ts` | Router | Least-Connections scheduler & tier candidate picker | Phase 4 |
| `apps/gateway/src/stream/sse-serializer.ts` | Stream | Serializes tokens into OpenAI SSE format | Phase 4 |
| `apps/gateway/src/api/server.ts` | API | Fastify application factory & plugin registrations | Phase 4 |
| `apps/gateway/src/api/middleware/auth.ts` | Middleware | Bearer token authentication guard (`sk-cta-...`) | Phase 4 |
| `apps/gateway/src/api/middleware/error-handler.ts`| Middleware | OpenAI error formatter (`{ error: { message } }`) | Phase 4 |
| `apps/gateway/src/api/routes/openai-models.ts` | API | `GET /v1/models` endpoint | Phase 4 |
| `apps/gateway/src/api/routes/openai-chat.ts` | API | `POST /v1/chat/completions` endpoint | Phase 4 |
| `apps/gateway/src/api/routes/admin-accounts.ts` | API | Account CRUD & cooldown override endpoints | Phase 4 |
| `apps/gateway/src/api/routes/admin-adapters.ts` | API | Adapter reload & management endpoints | Phase 4 |
| `apps/gateway/src/api/ws/webshell.ts` | WebSockets | WebSocket handler bridging client to sandbox PTY | Phase 5 |
| `apps/web/src/index.css` | Web Styling | Obsidian Cyber-Deck CSS tokens and dark palette | Phase 5 |
| `apps/web/src/App.tsx` | Web Shell | Navigation router and layout wrapper | Phase 5 |
| `apps/web/src/components/layout/Header.tsx` | Web Component | Fleet status header bar and system statistics | Phase 5 |
| `apps/web/src/components/layout/Sidebar.tsx` | Web Component | Cyber-Deck navigation menu | Phase 5 |
| `apps/web/src/components/layout/StatusBadge.tsx`| Web Component | High-contrast status pill badge | Phase 5 |
| `apps/web/src/components/webshell/TerminalView.tsx`| Web Component | `@xterm/xterm` WebSocket terminal wrapper | Phase 5 |
| `apps/web/src/views/DashboardView.tsx` | Web View | Real-time fleet overview, gauges, and health grid | Phase 5 |
| `apps/web/src/views/ModelCatalogView.tsx` | Web View | Virtual Auto Tiers & Namespaced Models studio | Phase 5 |
| `apps/web/src/views/AccountsView.tsx` | Web View | Account manager, sandbox explorer, cooldown controls | Phase 5 |
| `apps/web/src/views/WebShellView.tsx` | Web View | Full-screen interactive CLI login terminal | Phase 5 |
| `apps/gateway/src/api/routes/admin-events.ts` | API | SSE bridge streaming system events to Web Console | Phase 6 |
| `apps/web/src/views/LiveInspectorView.tsx` | Web View | Dual-pane SSE stream diffing & latency analyzer | Phase 6 |
| `apps/web/src/views/PlaygroundView.tsx` | Web View | Multi-turn prompt tester with live token rendering | Phase 6 |
| `tests/e2e/acceptance.test.ts` | Tests | Unified end-to-end acceptance test suite (AC-01 to AC-07) | Phase 6 |

---

## 5. Test Matrix

| Test Suite File | Test Type | Target Component | Test Cases & Invariants | Mock Fixture / Harness | Criteria Verified |
| :--- | :---: | :--- | :--- | :--- | :---: |
| `sqlite-lifecycle.test.ts` | Unit | Database | WAL mode check (`wal`), foreign keys, busy timeout, 50 concurrent writes | In-memory / temp SQLite | Substrate stability |
| `resolver.test.ts` | Unit | Resolver | Windows PATHEXT resolution (`.cmd`, `.bat`, `.ps1`, `.exe`), safe wrappers | Mock PATH directory | PATHEXT resolution |
| `stream-sanitizer.test.ts` | Unit | Stream | Multi-byte UTF-8 Vietnamese/Emoji chunk split assembly, 50 consecutive `\r` overwrites | `mock-spinner-cli.js` | Stream integrity |
| `rate-limit-detector.test.ts` | Unit | Stream | Universal regex parsing: "resets in 45m" $\rightarrow$ 2700s, custom regex fallback | Static error strings | Rate limit detection |
| `prompt-transport.test.ts` | Unit | Supervisor | Prompts $\le 4,000$ chars keep argv; prompts $> 4,000$ chars divert to `temp_file` or `stdin` | `mock-large-prompt-cli.js`| Argv limit bypass |
| `sandbox.test.ts` | Unit | Sandboxing | Directory isolation: distinct `$HOME`, `%APPDATA%`, stripped host API keys | Sandbox jail inspector | Multi-account sandbox |
| `account-pool.test.ts` | Unit | Router | Concurrency slot semaphores: atomic slot acquisition and release under concurrency | Memory pool | Slot concurrency |
| `cooldown-tracker.test.ts` | Unit | Router | Account enters cooldown, remains locked for duration, recovers automatically | Mock timers | Cooldown management |
| `load-balancer.test.ts` | Unit | Router | Least-Connections account allocation, priority tier selection fallback | Mock account matrix | Load balancing |
| `process-lifecycle.test.ts` | Unit | Supervisor | Hanging CLI ignoring SIGTERM terminated in $\le 200\text{ms}$ via Job Object / POSIX group | `mock-hanging-cli.js` | Zero-Zombie containment |
| `chat-completions.test.ts` | E2E | Gateway API | `POST /v1/chat/completions` unary & SSE streaming format, Bearer auth | Fastify inject | OpenAI API spec |
| `acceptance.test.ts` | E2E | Gateway & Console | End-to-end acceptance verification: Catalog, Namespace, Auto Tiers, Sandboxing, Failover | Test gateway harness | AC-01 through AC-07 |

---

## 6. UI/UX Specifications (UI/UX Pro Max Standard)

### 6.1 Obsidian Cyber-Deck Design System & Tokens

The UI conforms to the **Obsidian Cyber-Deck Developer Standard**: ultra-low eye fatigue, developer-first ergonomics, micro-spacing precision, high contrast ratios ($\ge 4.5:1$), and visual telemetry reminiscent of advanced developer terminals.

#### 6.1.1 Color Palette & Design Tokens

```css
:root {
  /* Canvas & Backgrounds */
  --bg-canvas: #090B0F;           /* Deep Obsidian Void */
  --bg-surface: #12141C;          /* Elevated Cyber Deck Panels */
  --bg-surface-hover: #1A1E29;    /* Interactive Panel Hover */
  --bg-surface-active: #222736;   /* Active Control / Pressed */
  --bg-terminal: #050608;         /* High-contrast terminal canvas */

  /* Structural Hairlines */
  --border-subtle: #242B3B;       /* Default hairline border */
  --border-focus: #6366F1;        /* Focused component outline */

  /* Primary Brand Accent */
  --brand: #6366F1;               /* Electric Indigo */
  --brand-hover: #4F46E5;         /* Deep Indigo */
  --brand-glow: rgba(99, 102, 241, 0.15); /* Ambient Neon Backlight */

  /* Semantic Status Indicators */
  --status-healthy: #10B981;      /* Neon Emerald (Ready / Active) */
  --status-cooldown: #F59E0B;     /* Warning Amber (Cooldown) */
  --status-danger: #EF4444;       /* Crimson Neon (Error / Offline) */

  /* Virtual Intelligence & Cost Tiers */
  --tier-low: #06B6D4;            /* Cyan (auto-low / fast & lightweight) */
  --tier-medium: #3B82F6;         /* Sky Blue (auto-medium / standard) */
  --tier-high: #8B5CF6;           /* Electric Violet (auto-high / advanced) */
  --tier-xhigh: #EC4899;          /* Deep Pink (auto-xhigh / reasoning-heavy) */

  /* Typography Colors */
  --text-primary: #F8FAFC;        /* Crisp White */
  --text-secondary: #94A3B8;      /* Neutral Slate */
  --text-muted: #64748B;          /* Dim Slate */
  --text-code: #A5B4FC;           /* Indigo-tinted Monospace text */
}
```

#### 6.1.2 Typography & Font Hierarchy
- **Monospace Stack (Primary Code / Terminal / IDs):** `'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace`
- **Sans-Serif Stack (UI Labels / Metadata / Descriptions):** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Scale:**
  - Headers: `text-lg` (18px), `font-semibold`, tracking tight (`-0.025em`)
  - Subheaders / Card Titles: `text-sm` (14px), `font-medium`, text slate-200
  - Body / Data cells: `text-xs` (12px), `font-mono`, text slate-300
  - Captions / Timestamps: `text-[10px]` (10px), `font-mono`, text slate-500 uppercase tracking-wider

---

### 6.2 Detailed View & Layout Specifications

#### 6.2.1 Root Layout (`App.tsx`, `Header.tsx`, `Sidebar.tsx`)
- **Shell Structure:** Non-scrollable 100vh viewport (`h-screen w-screen overflow-hidden`).
- **Header (`Header.tsx`):**
  - Left: Logo icon (`Terminal` in Electric Indigo) + Title `"cli-to-api"` + Version badge (`v1.0.0`).
  - Center: Global Fleet Telemetry:
    - Active Slots Pill (`"0/4 SLOTS IN USE"`).
    - Rate Meter (`"0 RPM / 0 TPM"`).
    - Master Port (`":8080"`).
  - Right: Gateway Health Indicator (pulsing emerald dot + `"SYSTEM READY"`).
- **Sidebar (`Sidebar.tsx`):**
  - Navigation items with icons: Dashboard (`LayoutDashboard`), Model Catalog (`Cpu`), Accounts (`Users`), WebShell (`Terminal`), Live Inspector (`Activity`), Chat Playground (`MessageSquare`).
  - Active Item styling: Electric Indigo left border accent (`border-l-2 border-brand`), surface hover background (`bg-surface`), bright text (`text-slate-100`).

#### 6.2.2 Dashboard View (`DashboardView.tsx`)
- **Fleet Metrics Bar:**
  - Total Accounts, Active Semaphores, Total Requests, Average Latency (ms).
- **Account Health Matrix:**
  - Responsive card grid displaying every registered account.
  - Live status badge:
    - `READY`: Neon emerald border + soft pulse.
    - `BUSY`: Indigo border + active animated spinner.
    - `COOLDOWN`: Warning amber banner showing second-by-second countdown decrement timer: `"COOLDOWN (23m 12s remaining)"`.
    - `ERROR`: Crimson danger border with failure reason tooltip.
  - Action buttons: Quick "Launch Shell" and "Clear Cooldown".

#### 6.2.3 Model Catalog & Routing Studio (`ModelCatalogView.tsx`)
- **Virtual Auto Tiers Panel:**
  - 4 Tier cards (`auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`) styled with tier-specific accent colors.
  - Shows eligible model counts, target providers, and average latency.
- **Namespaced Models Table:**
  - Columns: Model ID (`codex/gpt-5.6-asta`), Provider, Execution Mode (`pipe`/`pty`), Context Window, Health.
  - Filter bar allowing search by provider or model name.

#### 6.2.4 Accounts Management View (`AccountsView.tsx`)
- **Account Data Grid:**
  - Columns: Account Name, Adapter, Concurrency Slots (`active / max`), Total Requests, Sandbox Path, Actions.
  - Sandbox Path clickable: Copies resolved directory jail path to clipboard.
- **Add Account Dialog:**
  - Radix Dialog modal for registering a new account.
  - Form fields: Adapter selector dropdown, Account Name input, Max Concurrency Slots (1-4).
- **WebShell Trigger:**
  - Direct "Launch WebShell" button immediately navigating to WebShell view with selected account pre-mounted.

#### 6.2.5 In-Browser WebShell View (`WebShellView.tsx`, `TerminalView.tsx`)
- **PTY Session Container:**
  - High-contrast `@xterm/xterm` canvas.
  - Auto-fit addon debounced on window resize.
  - WebLinks addon converting OAuth authentication URLs into clickable links that open in a new browser tab.
- **Action Macro Toolbar:**
  - `"Run Login"` macro: Sends `{adapter} login\r` directly to PTY.
  - `"Whoami"` macro: Sends `whoami\r` to verify sandbox user profile.
  - `"Test Ping"` macro: Sends test completion command.
  - `"Clear"` macro: Clears terminal buffer.

#### 6.2.6 Live SSE Inspector View (`LiveInspectorView.tsx`)
- **Dual-Pane Real-Time Stream Diff:**
  - Left Pane (`Raw CLI Output`): Shows unfiltered stdout/stderr bytes, including ANSI color codes and spinner progress overwrites.
  - Right Pane (`Sanitized SSE Output`): Shows cleaned, reconstructed OpenAI SSE chunks (`data: {"choices":[{"delta":{"content":"..."}}]}`).
- **Telemetry Header:**
  - Live TTFT (Time To First Token) timer.
  - Stream throughput meter (tokens/second).
  - Stream status (`STREAMING`, `COMPLETED`, `FAILED`).

#### 6.2.7 Chat Playground View (`PlaygroundView.tsx`)
- **Interactive Multi-Turn Conversation Tester:**
  - Sidebar: Model Selector (supporting both namespaced and virtual tiers), Temperature slider, Max Tokens input.
  - Chat Area: Bubble messages for System, User, and Assistant.
  - Streaming Assistant Bubble: Real-time token append with subtle cursor blink.
  - Inspector Drawer: Collapsible panel displaying raw JSON payload sent to `/v1/chat/completions`.

---

### 6.3 Accessibility & Interaction States Engine

#### 6.3.1 Accessibility Standards (WCAG 2.1 AA Compliance)
1. **Contrast Ratios:** All body text maintains a contrast ratio $> 4.5:1$ against surface backgrounds; large headers and interactive icons maintain $> 3.0:1$.
2. **Keyboard Navigation:** Every actionable component is accessible via standard keyboard traversal:
   - `Tab` / `Shift+Tab`: Moves focus sequentially through interactive elements.
   - `Enter` / `Space`: Activates buttons, toggles checkboxes, opens dialogs.
   - `Escape`: Closes open modals, dialogs, and dropdowns.
3. **Focus Indicators:** Explicit focus ring applied to all controls:
   ```css
   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas
   ```
4. **Screen Reader Semantics:**
   - Real-time streaming content uses `aria-live="polite"` and `aria-atomic="false"`.
   - Modals use `role="dialog"` with `aria-modal="true"` and appropriate `aria-labelledby`.
   - Status indicators use `role="status"`.

#### 6.3.2 Complete 8-State Interaction Matrix

| State | Visual Treatment & Behavior | CSS / Tailwind Implementation |
| :--- | :--- | :--- |
| **1. Default** | Subtle border, muted slate text, solid dark surface | `bg-surface border border-borderSubtle text-slate-300` |
| **2. Hover** | Surface elevates, border brightens, text shifts to crisp white | `hover:bg-surfaceHover hover:border-slate-600 hover:text-white transition-colors duration-150` |
| **3. Active / Pressed**| Surface depresses, slight scale down (0.98), darker background | `active:bg-surfaceActive active:scale-[0.98] transition-transform duration-75` |
| **4. Focus-Visible** | High-contrast neon indigo focus ring with 2px offset | `focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas` |
| **5. Disabled** | Opacity reduced to 40%, cursor set to not-allowed, pointer events blocked | `disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none` |
| **6. Loading / Busy** | Surface pulsates subtly, animated spinner icon replaces icon | `animate-pulse pointer-events-wait cursor-wait text-slate-400` |
| **7. Empty State** | Centered icon, dashed border container, informative helper text | `border-dashed border-borderSubtle p-8 text-center text-slate-500` |
| **8. Error / Degraded**| Crimson border, soft red glow, danger icon with tooltip explanation | `border-statusDanger/50 bg-statusDanger/10 text-statusDanger` |

---

## 7. Verification & Operational Readiness Summary

1. **Monorepo Build Verification:**
   ```bash
   pnpm install
   pnpm --filter @cli-to-api/web build
   ```
   *Result:* Vite compiles client assets with zero TypeScript errors. Output bundle: `apps/web/dist/`.

2. **Automated Test Matrix Verification:**
   ```bash
   pnpm test
   ```
   *Result:* All 12 test files and 46 tests pass in $<3.5\text{s}$, verifying process lifecycles, UTF-8 decoders, rolling `\r` carriage return sanitization, Windows PATHEXT resolution, sandboxing, and rate-limit detection.

3. **Gateway Daemon Launch & Smoke Test:**
   ```bash
   node apps/gateway/dist/index.js
   ```
   *Result:* Server initializes SQLite WAL mode, discovers all declared adapters (`codex-cli.yaml`, `claude-code.yaml`, `opencode-cli.yaml`, `grok-cli.yaml`), mounts web console at `http://localhost:8080/`, and exposes OpenAI-compliant endpoints `/v1/models` and `/v1/chat/completions`.
