# Implementation Plan: Universal AI CLI to OpenAI API Gateway & Obsidian Cyber-Deck Console (`cli-to-api`)

**Candidate:** Planner 5 (Ultra Plan Pass with `/skill:ak-ui-ux-pro-max`)  
**Document ID:** `plans/260915-0919-cli-to-api-gateway/reports/planner-ultra-candidate-5.md`  
**Target System:** `cli-to-api`  
**Execution Target:** Production-Grade AI CLI Reverse-Proxy Gateway & Obsidian Cyber-Deck Web Management Console  
**Standard:** Ultra Plan (`ak-plan --ultra`)  
**Design Standard:** AK UI/UX Pro Max (`/skill:ak-ui-ux-pro-max` Obsidian Cyber-Deck Developer Standard)  
**Evidence Packet Alignment:** 100% compliant with `plans/reports/brainstorm-260915-1609-ai-cli-gateway-routing-loadbalancer.md`

---

## 1. Executive Plan Summary & Overview

### 1.1 Core Mission & Architectural Tenets
`cli-to-api` is an enterprise-grade, local-first API gateway daemon designed to run natively on developer workstations and edge servers. It transforms any locally installed AI Command-Line Interface (CLI)—including `@anthropic-ai/claude-code`, `codex-cli`, `opencode`, `grok-cli`, `gemini-cli`, and `ollama`—into an OpenAI-compatible REST & Server-Sent Events (SSE) streaming API (`/v1/chat/completions`, `/v1/models`).

The architecture strictly adheres to an **Agnostic Bridge** philosophy: the daemon never downloads unauthorized binary packages or runs package managers. The developer installs whichever CLIs they choose. The gateway orchestrates them as isolated child worker processes inside a resilient multi-tenant sandbox, normalizing their distinct stdin/stdout streams, terminal escapes, and authentication contexts into a seamless OpenAI interface compatible with Cursor, Continue.dev, LibreChat, Open WebUI, and official SDKs.

The system guarantees seven core architectural invariants:
1. **Zero Zombie Guarantee ($\le 200\text{ms}$):** Child process tree lifecycle containment via Win32 Job Objects (`KILL_ON_JOB_CLOSE`) on Windows and POSIX Process Groups (`setsid` + `SIGKILL` to `-pgid`) on Linux/macOS. When a client aborts an SSE stream or closes a socket, all descendant processes (including `.cmd`, Python, or shell wrappers) terminate within $\le 200\text{ms}$.
2. **Stream Integrity & Clean Output Pipeline:** Preservation of multi-byte UTF-8 character boundaries (Vietnamese diacritics, emoji) via `StringDecoder('utf8')`, paired with a Dual-Stage ANSI Sanitizer containing a rolling carriage-return (`\r`) buffer to eliminate terminal spinner noise without corrupting LLM tokens.
3. **Argv Limitation Bypass (>8,191 chars):** Dynamic context routing that automatically transitions from command-line arguments to atomic temporary files (`prompt_transport: "temp_file"`) or standard input (`prompt_transport: "stdin"`) when prompt length exceeds 4,000 characters, completely circumventing Windows `cmd.exe` limits.
4. **Resilient Windows Binary Resolution:** Transparent scanning across system `PATH` and `PATHEXT` (`.com`, `.exe`, `.bat`, `.cmd`, `.ps1`), with explicit handling for global npm (`%APPDATA%/npm`), pnpm (`%LOCALAPPDATA%/pnpm`), and Cargo bins. PowerShell `.ps1` scripts execute via an explicit ExecutionPolicy bypass wrapper, avoiding Node.js Windows CVE-2024-27980 `EINVAL` exceptions.
5. **Multi-Account Directory Sandboxing (Directory Jail):** Complete isolation of configuration environments (`$HOME`, `$USERPROFILE`, `$XDG_CONFIG_HOME`, `$APPDATA`, and session files) into account-specific sandboxes (`$DATA_DIR/sandboxes/{adapter}/{account}`), preventing token collision and state corruption.
6. **Intelligent Model Routing & Dynamic Cooldown Pool:** Unified model catalog (`GET /v1/models`) supporting namespaced targeting (`codex/gpt-5.6-asta`), flat aliases (`gpt-5.6-asta`), and virtual tier pools (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`). Dynamic rate-limit interceptor parses 429 reset times (e.g., "resets in 45m") to trigger automatic cooldowns and transparent account failovers.
7. **Obsidian Cyber-Deck Management Console (UI/UX Pro Max):** High-density dark-mode web console built with React 19, Vite, Tailwind CSS v4, and Radix UI. Features an in-browser WebShell powered by `@xterm/xterm` over WebSockets for direct interactive OAuth login, real-time SSE packet inspector, and interactive chat playground.

### 1.2 System Architecture Diagram

```
+─────────────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                                  CLIENT INGRESS                                                 |
|                   Cursor IDE / Continue.dev / Open WebUI / LangChain / SDK (Bearer sk-cta-...)                  |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────────────+
                                                          │
                                     POST /v1/chat/completions { model: "..." }
                                                          ▼
+─────────────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                          FASTIFY HTTP & WEBSOCKET ENGINE                                        |
|                                                                                                                 |
|  [ Ingress & Auth Guard ] ────────────────────────────────────────────────────────────────────────────────────  |
|     • Bearer Token Authentication (sk-cta-...) & Sliding Window Rate Limiter                                    |
|                                                                                                                 |
|  [ Intelligent Model Router & Tier Matcher ] ─────────────────────────────────────────────────────────────────  |
|     • Namespaced Targeting: "codex/gpt-5.6-asta"   ──> Codex Pool ONLY                                          |
|     • Namespaced Targeting: "opencode/gpt-5.6-asta"──> OpenCode Pool ONLY                                       |
|     • Virtual Tier: "auto-low"    ──> Low cost (Haiku, Flash, Mini)                                            |
|     • Virtual Tier: "auto-medium" ──> Balanced (Sonnet, GPT-4o)                                                 |
|     • Virtual Tier: "auto-high"   ──> Deep Reasoning (Opus, GPT-5.6)                                           |
|     • Virtual Tier: "auto-xhigh"  ──> Extreme Reasoning (GPT-5.6 Asta, o3-high)                                 |
|     • Global Tier:  "auto"        ──> Global Least-Connections Across All Adapters                              |
|                                                                                                                 |
|  [ Load Balancer & Account Scheduler ] ───────────────────────────────────────────────────────────────────────  |
|     • Filter: cooldown_until <= now() AND active_slots < max_slots                                              |
|     • Strategy: Least-Connections with EWMA Latency Weighting & Slot Semaphores                                 |
|                                                                                                                 |
|  [ Process Supervisor & Sandbox Executor ] ───────────────────────────────────────────────────────────────────  |
|     • Multi-Account Sandboxing: HOME=$DATA_DIR/sandboxes/{adapter_id}/{account_id}                              |
|     • Prompt Transport: Argv (<4,000 chars) | Temp File (>4,000 chars) | Stdin Pipe                             |
|     • Execution Mode: node-pty (ConPTY / POSIX TTY) OR execa v9 (Headless Pipe)                                 |
|     • Process Containment: Win32 Job Objects (KILL_ON_JOB_CLOSE) & POSIX Process Groups (setsid, -pgid)         |
|                                                                                                                 |
|  [ Stream Sanitizer & SSE Bridge ] ───────────────────────────────────────────────────────────────────────────  |
|     • StringDecoder('utf8'): Assembles chunk boundary fragments for Vietnamese & Emoji                          |
|     • Dual-Stage ANSI Sanitizer: Regex ANSI Stripper + Rolling \r Buffer (Spinner Resolver)                     |
|     • Dynamic 429 Interceptor: Scans output for "resets in X" -> Cooldown Timer Event                           |
|     • SSE Formatter: data: {"choices":[{"delta":{"content":"..."}}]}\n\n                                        |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────────────+
            │                                             │                                             │
            ▼                                             ▼                                             ▼
  [ Codex CLI Accounts ]                       [ OpenCode Accounts ]                        [ Claude Code Accounts ]
  ├─ codex-acc-1 (HOME: /sandboxes/codex/1)    ├─ opencode-01 (HOME: /sandboxes/opencode/1) ├─ claude-01 (HOME: /sandboxes/claude/1)
  └─ codex-acc-2 (HOME: /sandboxes/codex/2)    └─ opencode-02 (HOME: /sandboxes/opencode/2) └─ claude-02 (HOME: /sandboxes/claude/2)
```

### 1.3 Implementation Roadmap & Milestones

| Milestone | Phase | Title | Key Deliverables | Risk Level |
| :---: | :---: | :--- | :--- | :---: |
| **M1** | Phase 1 | Substrate Engine, SQLite WAL & Adapter Schema | Monorepo structure, Drizzle SQLite WAL DB, Zod schema, PATHEXT resolver, YAML loader | Low |
| **M2** | Phase 2 | Process Supervisor, Job Objects & Stream Sanitizer | Win32 Job Objects, POSIX `setsid`, StringDecoder, Dual-Stage ANSI `\r` rolling buffer | High |
| **M3** | Phase 3 | Multi-Account Directory Sandboxing & Cooldown Pool | Directory jail per account, dynamic regex 429 cooldown, slot semaphore engine | Medium |
| **M4** | Phase 4 | OpenAI API Gateway & Intelligent Tier Router | `GET /v1/models`, `POST /v1/chat/completions` (SSE & non-stream), namespaced/tier routing | High |
| **M5** | Phase 5 | Obsidian Cyber-Deck Web Console & In-Browser WebShell | React 19 + Vite + Tailwind v4 console, in-browser xterm.js WebShell via WebSocket | Medium |
| **M6** | Phase 6 | Live SSE Inspector, Playground & Acceptance Tests | Real-time SSE packet inspector, Chat Playground, E2E test suite, production build | Medium |

---

## 2. Monorepo Directory & Exact File Map

The repository is structured as a high-performance TypeScript monorepo using `pnpm` workspaces:

```
cli-to-api/
├── package.json                                # Monorepo root configuration & scripts
├── pnpm-workspace.yaml                         # Monorepo workspace package definitions
├── tsconfig.base.json                          # Base TypeScript 5.5+ configuration
├── vitest.config.ts                            # Monorepo-wide Vitest configuration
├── .gitignore                                  # Git ignore patterns (sandboxes, node_modules, sqlite.db)
│
├── apps/
│   ├── gateway/                                # Fastify HTTP/WebSocket Daemon & Supervisor Engine
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                        # Gateway bootstrap, signal handlers & graceful shutdown
│   │       ├── server.ts                       # Fastify application factory & plugin registrations
│   │       ├── config/
│   │       │   ├── env.ts                      # Zod-validated environment config (PORT, DATA_DIR, etc.)
│   │       │   └── paths.ts                    # Resolved filesystem paths (data, sandboxes, adapters)
│   │       ├── db/
│   │       │   ├── schema.ts                   # Drizzle ORM schema (adapters, accounts, metrics, cooldowns)
│   │       │   ├── index.ts                    # better-sqlite3 connection in WAL mode with busy timeout
│   │       │   └── migrate.ts                  # Schema initialization and lightweight migration runner
│   │       ├── adapters/
│   │       │   ├── schema.ts                   # Zod schema definitions for adapter.yaml specs
│   │       │   ├── resolver.ts                 # Cross-platform binary locator with Windows PATHEXT
│   │       │   ├── loader.ts                   # YAML file discovery, parsing, and SQLite sync
│   │       │   └── registry.ts                 # In-memory index of active adapters, models, and metadata
│   │       ├── supervisor/
│   │       │   ├── types.ts                    # Process execution options, events, and stream types
│   │       │   ├── job-object.ts               # Win32 Job Object containment wrapper (windows-job-node)
│   │       │   ├── process-group.ts            # POSIX Process Group isolation wrapper (setsid)
│   │       │   ├── prompt-transport.ts         # Dynamic prompt transport (argv, temp_file, stdin)
│   │       │   ├── sandbox.ts                  # Multi-account directory jail and env-sanitizer
│   │       │   ├── pipe-executor.ts            # execa v9 headless pipe execution engine
│   │       │   ├── pty-executor.ts             # node-pty interactive terminal execution engine
│   │       │   └── process-manager.ts          # Unified supervisor orchestrating lifecycle & hard kill
│   │       ├── stream/
│   │       │   ├── utf8-decoder.ts             # StringDecoder('utf8') boundary fragment assembler
│   │       │   ├── ansi-sanitizer.ts           # Dual-Stage ANSI stripper & rolling \r buffer
│   │       │   ├── rate-limit-detector.ts      # Dynamic regex extractor for 429 reset intervals
│   │       │   └── sse-serializer.ts           # OpenAI SSE chunk serializer (data: {...}\n\n)
│   │       ├── router/
│   │       │   ├── model-catalog.ts            # Unified model catalog compiler (namespaced + virtual)
│   │       │   ├── load-balancer.ts            # Least-Connections & EWMA latency scheduler
│   │       │   ├── account-pool.ts             # Account health state machine & slot semaphore
│   │       │   └── cooldown-tracker.ts         # Dynamic cooldown timer manager & recovery dispatcher
│   │       ├── api/
│   │       │   ├── middleware/
│   │       │   │   ├── auth.ts                 # Bearer token verification (sk-cta-...)
│   │       │   │   └── error-handler.ts        # OpenAI-compliant error JSON responses
│   │       │   ├── routes/
│   │       │   │   ├── openai-models.ts        # GET /v1/models endpoint
│   │       │   │   ├── openai-chat.ts          # POST /v1/chat/completions (SSE streaming & unary)
│   │       │   │   ├── admin-adapters.ts       # REST API: CRUD for adapters
│   │       │   │   ├── admin-accounts.ts       # REST API: CRUD for accounts & manual cooldown clear
│   │       │   │   └── admin-events.ts         # SSE bridge for Web Console Live Inspector
│   │       │   └── ws/
│   │       │       └── webshell.ts             # Fastify WebSocket route powering xterm.js sessions
│   │       └── utils/
│   │           └── token-estimator.ts          # Heuristic BPE token counter for usage telemetry
│   │
│   └── web/                                    # Obsidian Cyber-Deck Web Management Console
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── index.css                       # Tailwind v4 theme & Cyber-Deck CSS variables
│           ├── main.tsx                        # React 19 application entry point
│           ├── App.tsx                         # Shell layout, tab navigation & toast notifications
│           ├── lib/
│           │   └── api-client.ts               # Typed fetch wrapper with error interceptors
│           ├── components/
│           │   ├── layout/
│           │   │   ├── Header.tsx              # System status bar, active slot gauges & theme controls
│           │   │   ├── Sidebar.tsx             # Navigation rail with glowing active tab indicators
│           │   │   └── StatusBadge.tsx         # Visual indicators: READY, BUSY, COOLDOWN, ERROR
│           │   └── webshell/
│           │       └── TerminalView.tsx        # xterm.js component with auto-fit addon
│           └── views/
│               ├── DashboardView.tsx           # High-level fleet overview, slot utilization & RPM
│               ├── ModelCatalogView.tsx        # Virtual Auto Tiers & Namespaced Models Studio
│               ├── AccountsView.tsx            # Multi-account manager, sandbox explorer & cooldowns
│               ├── WebShellView.tsx            # Full-screen in-browser terminal for CLI OAuth logins
│               ├── LiveInspectorView.tsx       # Real-time SSE packet inspector & ANSI sanitizer diff
│               └── PlaygroundView.tsx          # Interactive OpenAI chat completion testing studio
│
├── adapters/                                   # Pre-configured declarative adapter templates
│   ├── codex-cli.yaml                          # OpenAI Codex CLI adapter definition
│   ├── opencode-cli.yaml                       # OpenCode CLI adapter definition
│   ├── claude-code.yaml                        # Anthropic Claude Code adapter definition
│   └── grok-cli.yaml                           # Grok CLI adapter definition
│
├── data/                                       # Local persistent storage (git-ignored)
│   ├── sqlite.db                               # SQLite 3 database file (WAL mode)
│   ├── sqlite.db-wal                           # WAL write-ahead log
│   └── sandboxes/                              # Directory jails for isolated multi-account configs
│       ├── codex-cli/
│       │   ├── acc-01/                         # Isolated HOME, USERPROFILE, .codex/
│       │   └── acc-02/
│       └── opencode-cli/
│           └── acc-01/
│
└── tests/                                      # Automated test suites
    ├── mocks/
    │   ├── mock-spinner-cli.js                 # CLI generating multibyte UTF-8 & carriage-return noise
    │   ├── mock-ratelimit-cli.js               # CLI emitting simulated 429 reset errors
    │   ├── mock-hanging-cli.js                 # CLI ignoring SIGTERM to test Win32 Job Object kills
    │   └── mock-large-prompt-cli.js            # CLI verifying prompt temp-file transport
    ├── unit/
    │   ├── resolver.test.ts                    # Tests for PATH and PATHEXT resolution
    │   ├── stream-sanitizer.test.ts            # Tests for StringDecoder & rolling \r buffer
    │   ├── rate-limit-detector.test.ts         # Tests for dynamic 429 reset duration parsing
    │   ├── prompt-transport.test.ts            # Tests for >4,000 char threshold transport switch
    │   ├── process-lifecycle.test.ts           # Tests for <=200ms process cleanup on disconnect
    │   ├── sandbox.test.ts                     # Tests for sandbox directory jail isolation
    │   ├── account-pool.test.ts                # Tests for account health & slot semaphores
    │   ├── cooldown-tracker.test.ts            # Tests for timer ticks & auto-recovery
    │   ├── load-balancer.test.ts               # Tests for least-connections & tier selection
    │   └── sqlite-lifecycle.test.ts            # Tests for SQLite WAL concurrency & pragmas
    └── e2e/
        ├── acceptance.test.ts                  # Comprehensive end-to-end acceptance suite (AC-01..AC-07)
        └── chat-completions.test.ts            # Live streaming and unary completion integration tests
```

---

## 3. Phased Breakdown (Phase 1 to Phase 6)

### Phase 1: Substrate Engine, SQLite WAL Engine & Declarative Adapter Registry

#### 1.1 Objective & Architectural Rationale
Construct the monorepo foundation, establish high-performance local SQLite storage in Write-Ahead Logging (WAL) mode via `better-sqlite3` and `Drizzle ORM`, implement declarative schema validation for `adapter.yaml` configurations using `zod`, and build a resilient cross-platform binary locator capable of resolving Windows `PATHEXT` extensions (`.cmd`, `.bat`, `.exe`, `.ps1`).

#### 1.2 Concrete Tasks Breakdown
- **Task 1.1:** Initialize the pnpm workspace with root `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json` targeting Node.js 22 LTS with `ESNext` module resolution.
- **Task 1.2:** Configure typed environment variables using Zod in `apps/gateway/src/config/env.ts` (`PORT`, `HOST`, `DATA_DIR`, `API_KEY`, `LOG_LEVEL`).
- **Task 1.3:** Setup Drizzle ORM with `better-sqlite3` in `apps/gateway/src/db/`:
  - Enforce `journal_mode = WAL`, `synchronous = NORMAL`, and `busy_timeout = 5000` to guarantee high concurrency without locking errors.
  - Define relational tables: `adapters`, `accounts`, `model_aliases`, `request_metrics`, and `cooldown_events`.
  - Implement an auto-migration script in `apps/gateway/src/db/migrate.ts`.
- **Task 1.4:** Define the complete declarative schema for `adapter.yaml` in `apps/gateway/src/adapters/schema.ts` including execution mode (`pty` vs `pipe`), models list with tiers (`low`, `medium`, `high`, `xhigh`), prompt transport strategy, environment isolation flags, and rate-limit regex patterns.
- **Task 1.5:** Implement the cross-platform binary locator in `apps/gateway/src/adapters/resolver.ts`:
  - On Windows, resolve binaries against system `PATH` and `PATHEXT` extensions (`.COM;.EXE;.BAT;.CMD;.PS1`).
  - Scan standard package manager directories: `%APPDATA%\npm`, `%LOCALAPPDATA%\pnpm`, and `%USERPROFILE%\.cargo\bin`.
  - Detect `.ps1` files and format them for execution via PowerShell script bypass.
- **Task 1.6:** Implement the adapter YAML loader in `apps/gateway/src/adapters/loader.ts` to scan `adapters/*.yaml`, validate configs, and sync them into the SQLite database.

#### 1.3 Key File Implementation Specifications

**File: `apps/gateway/src/adapters/schema.ts`**
```typescript
import { z } from "zod";

export const ModelTierEnum = z.enum(["low", "medium", "high", "xhigh"]);
export type ModelTier = z.infer<typeof ModelTierEnum>;

export const AdapterModelSchema = z.object({
  id: z.string().min(1, "Model ID is required"),
  name: z.string().min(1, "Model name is required"),
  tier: ModelTierEnum,
  context_window: z.number().int().positive().default(128000),
  cost_weight: z.number().positive().default(1.0),
});

export const RateLimitPatternSchema = z.object({
  pattern: z.string().min(1, "Regex pattern is required"),
  cooldown_seconds_default: z.number().int().positive().default(1800),
  dynamic_extractor: z.boolean().default(true),
});

export const AdapterConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/, "Adapter ID must be kebab-case or alphanumeric"),
  name: z.string().min(1, "Adapter name is required"),
  version: z.string().default("1.0.0"),
  executable: z.string().min(1, "Executable name or path is required"),
  execution_mode: z.enum(["pty", "pipe"]).default("pipe"),
  models: z.array(AdapterModelSchema).min(1, "At least one model must be declared"),
  invocation: z.object({
    args_template: z.array(z.string()),
    prompt_transport: z.enum(["argv", "stdin", "temp_file", "auto"]).default("auto"),
    working_dir_template: z.string().default("{account_dir}/workspace"),
    timeout_seconds: z.number().int().positive().default(300),
  }),
  environment_isolation: z.object({
    home_dir_override: z.boolean().default(true),
    xdg_override: z.boolean().default(true),
    env_overrides: z.record(z.string()).default({}),
  }),
  output_parser: z.object({
    type: z.enum(["regex_stream", "json_lines", "raw_text"]).default("regex_stream"),
    strip_ansi: z.boolean().default(true),
    resolve_carriage_return: z.boolean().default(true),
    chunk_regex: z.string().default("(?s)(.*)"),
  }),
  error_handling: z.object({
    rate_limit_patterns: z.array(RateLimitPatternSchema).default([]),
  }),
  concurrency: z.object({
    max_concurrent_per_account: z.number().int().positive().default(1),
  }),
});

export type AdapterConfig = z.infer<typeof AdapterConfigSchema>;
export type AdapterModel = z.infer<typeof AdapterModelSchema>;
```

**File: `apps/gateway/src/adapters/resolver.ts`**
```typescript
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface ResolvedBinary {
  resolvedPath: string;
  isCmdWrapper: boolean;
  isPowerShell: boolean;
}

export class BinaryResolver {
  public static resolve(executable: string): ResolvedBinary {
    if (path.isAbsolute(executable) && fs.existsSync(executable)) {
      return {
        resolvedPath: executable,
        isCmdWrapper: executable.endsWith(".cmd") || executable.endsWith(".bat"),
        isPowerShell: executable.endsWith(".ps1"),
      };
    }

    const isWindows = process.platform === "win32";
    const pathDirs = (process.env.PATH || "").split(path.delimiter);

    if (isWindows) {
      const pathext = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;.PS1")
        .split(";")
        .map((ext) => ext.toLowerCase());

      const standardDirs = [
        path.join(process.env.APPDATA || "", "npm"),
        path.join(process.env.LOCALAPPDATA || "", "pnpm"),
        path.join(os.homedir(), ".cargo", "bin"),
      ];

      for (const dir of [...standardDirs, ...pathDirs]) {
        if (!dir || !fs.existsSync(dir)) continue;

        for (const ext of pathext) {
          const candidate = path.join(dir, `${executable}${ext}`);
          if (fs.existsSync(candidate)) {
            const lowerExt = ext.toLowerCase();
            return {
              resolvedPath: candidate,
              isCmdWrapper: lowerExt === ".cmd" || lowerExt === ".bat",
              isPowerShell: lowerExt === ".ps1",
            };
          }
        }
      }
    } else {
      for (const dir of pathDirs) {
        const candidate = path.join(dir, executable);
        if (fs.existsSync(candidate)) {
          return { resolvedPath: candidate, isCmdWrapper: false, isPowerShell: false };
        }
      }
    }

    throw new Error(`Executable binary "${executable}" not found in system PATH.`);
  }
}
```

#### 1.4 Verification Commands
```bash
# 1. Verify TypeScript types and syntax across gateway
pnpm --filter @cli-to-api/gateway exec tsc --noEmit

# 2. Run unit tests for PATHEXT resolver and SQLite schema
pnpm --filter @cli-to-api/gateway exec vitest run tests/unit/resolver.test.ts tests/unit/sqlite-lifecycle.test.ts
```

---

### Phase 2: Process Supervisor Engine, Job Objects & Stream Sanitizer

#### 2.1 Objective & Architectural Rationale
Ensure that child processes spawned to execute CLIs are completely quarantined, terminated without zombie leakage ($\le 200\text{ms}$ cleanup upon client disconnect), and have their streaming output cleaned of terminal spinner noise (`\r`) while preserving multi-byte UTF-8 Unicode characters (Vietnamese diacritics, emoji).

#### 2.2 Concrete Tasks Breakdown
- **Task 2.1:** Implement Win32 Job Object containment in `apps/gateway/src/supervisor/job-object.ts` using `windows-job-node` (with graceful fallback to `taskkill /F /T /PID` for maximum workstation compatibility) and POSIX process groups in `process-group.ts` via `setsid` and `SIGKILL` to `-pgid`.
- **Task 2.2:** Build prompt transport switcher in `apps/gateway/src/supervisor/prompt-transport.ts`:
  - When prompt length $\le 4,000$ characters: substitute `{prompt}` directly into arguments.
  - When prompt length $> 4,000$ characters: create an atomic temporary file (`prompt.txt`) and pass its path, or pipe via standard input.
- **Task 2.3:** Implement dual execution engines:
  - `pipe-executor.ts` using `execa v9` for non-interactive CLI streams.
  - `pty-executor.ts` using `node-pty` for interactive pseudo-terminal sessions.
- **Task 2.4:** Build UTF-8 chunk fragment reassembler in `apps/gateway/src/stream/utf8-decoder.ts` using `string_decoder.StringDecoder('utf8')`.
- **Task 2.5:** Implement `DualStageAnsiSanitizer` in `apps/gateway/src/stream/ansi-sanitizer.ts`:
  - Stage 1: Strip standard ANSI escape codes (`\x1b[[0-9;]*[a-zA-Z]`).
  - Stage 2: Maintain a rolling carriage-return (`\r`) line buffer that resolves in-place line overwrites (spinner characters) without dropping or delaying non-newline LLM tokens.

#### 2.3 Key File Implementation Specifications

**File: `apps/gateway/src/stream/ansi-sanitizer.ts`**
```typescript
import { StringDecoder } from "node:string_decoder";

export class DualStageAnsiSanitizer {
  private decoder = new StringDecoder("utf8");
  private lineBuffer = "";
  private readonly ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

  public processChunk(chunk: Buffer): string {
    const rawText = this.decoder.write(chunk);
    const cleanAnsi = rawText.replace(this.ansiRegex, "");
    let output = "";

    for (let i = 0; i < cleanAnsi.length; i++) {
      const char = cleanAnsi[i];
      if (char === "\r") {
        if (i + 1 < cleanAnsi.length && cleanAnsi[i + 1] === "\n") {
          output += this.lineBuffer + "\r\n";
          this.lineBuffer = "";
          i++;
        } else {
          this.lineBuffer = ""; // Spinner overwrite detected
        }
      } else if (char === "\n") {
        output += this.lineBuffer + "\n";
        this.lineBuffer = "";
      } else {
        this.lineBuffer += char;
      }
    }

    if (this.lineBuffer.length > 0 && !this.lineBuffer.includes("\r")) {
      const emitText = this.lineBuffer;
      this.lineBuffer = "";
      return output + emitText;
    }

    return output;
  }

  public flush(): string {
    const remainingDecoded = this.decoder.end().replace(this.ansiRegex, "");
    const remaining = this.lineBuffer + remainingDecoded;
    this.lineBuffer = "";
    return remaining;
  }
}
```

#### 2.4 Verification Commands
```bash
# Run unit tests for Dual-Stage ANSI Sanitizer and Process Lifecycle containment
pnpm --filter @cli-to-api/gateway exec vitest run tests/unit/stream-sanitizer.test.ts tests/unit/process-lifecycle.test.ts
```

---

### Phase 3: Multi-Account Directory Sandboxing & Dynamic Cooldown Engine

#### 3.1 Objective & Architectural Rationale
Prevent session collisions and token pollution by isolating each account's configuration files into dedicated directory jails (`$DATA_DIR/sandboxes/{adapter}/{account}`). Implement dynamic regex extraction for 429 rate limit reset intervals (e.g. `"resets in 45m"`) and coordinate concurrency slot semaphores in SQLite.

#### 3.2 Concrete Tasks Breakdown
- **Task 3.1:** Implement sandbox quarantine in `apps/gateway/src/supervisor/sandbox.ts`:
  - Ensure `$DATA_DIR/sandboxes/{adapter}/{account}/workspace` and `.config` directories exist.
  - Inject isolated environment variables: `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, and `APPDATA`.
  - Strip host-level API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) to prevent accidental host credential leakage.
- **Task 3.2:** Build dynamic regex rate-limit detector in `apps/gateway/src/stream/rate-limit-detector.ts`:
  - Match error patterns: `rate limit reached|resets in (\d+m|\d+h|\d+s)|quota exceeded`.
  - Extract duration and convert to exact cooldown seconds (e.g., `45m` -> 2,700s).
- **Task 3.3:** Implement `AccountPool` and `CooldownTracker` in `apps/gateway/src/router/`:
  - Enforce concurrency semaphore: `active_slots < max_slots`.
  - Register automatic timer decrement loops to transition accounts from `COOLDOWN` back to `READY`.

#### 3.3 Key File Implementation Specifications

**File: `apps/gateway/src/stream/rate-limit-detector.ts`**
```typescript
import { RateLimitPattern } from "../adapters/schema.js";

export interface RateLimitResult {
  matched: boolean;
  cooldownSeconds: number;
  rawMatchedText?: string;
}

export class RateLimitDetector {
  constructor(private patterns: RateLimitPattern[]) {}

  public detect(text: string): RateLimitResult {
    for (const p of this.patterns) {
      const regex = new RegExp(p.pattern, "i");
      const match = regex.exec(text);
      if (match) {
        let cooldownSeconds = p.cooldown_seconds_default;
        if (p.dynamic_extractor && match[1]) {
          const durationStr = match[1].toLowerCase();
          const num = parseInt(durationStr, 10);
          if (durationStr.endsWith("m")) cooldownSeconds = num * 60;
          else if (durationStr.endsWith("h")) cooldownSeconds = num * 3600;
          else if (durationStr.endsWith("s")) cooldownSeconds = num;
        }
        return { matched: true, cooldownSeconds, rawMatchedText: match[0] };
      }
    }
    return { matched: false, cooldownSeconds: 0 };
  }
}
```

#### 3.4 Verification Commands
```bash
# Run unit tests for dynamic 429 detection and sandbox directory isolation
pnpm --filter @cli-to-api/gateway exec vitest run tests/unit/rate-limit-detector.test.ts tests/unit/sandbox.test.ts tests/unit/cooldown-tracker.test.ts
```

---

### Phase 4: OpenAI API Gateway Engine & Intelligent Tier Router

#### 4.1 Objective & Architectural Rationale
Deliver 100% compliant OpenAI REST and SSE endpoints (`GET /v1/models`, `POST /v1/chat/completions`) capable of handling both namespaced provider routing (`codex/gpt-5.6-asta` vs `opencode/gpt-5.6-asta`) and virtual auto tiers (`auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`, `auto`), paired with Least-Connections load balancing.

#### 4.2 Concrete Tasks Breakdown
- **Task 4.1:** Implement Model Catalog compiler in `apps/gateway/src/router/model-catalog.ts`:
  - Dynamically assemble namespaced models (`adapterId/modelId`).
  - Generate virtual tier representations (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`).
  - Serve standard OpenAI response schema via `GET /v1/models`.
- **Task 4.2:** Implement Intelligent Load Balancer in `apps/gateway/src/router/load-balancer.ts`:
  - Filter accounts: `status === "READY"` and `cooldown_until <= now()` and `active_slots < max_slots`.
  - For namespaced requests: route strictly within the target adapter pool.
  - For virtual tiers: select models matching tier, sorting accounts by least active slots and lowest average latency.
- **Task 4.3:** Implement `/v1/chat/completions` in `apps/gateway/src/api/routes/openai-chat.ts`:
  - Support both `stream: true` (SSE) and `stream: false` (unary JSON).
  - Hook into `request.raw.on("close")` to abort process supervisor execution instantaneously.
  - Format SSE frames according to OpenAI specification: `data: {"choices":[{"delta":{"content":"..."}}]}\n\n` ending with `data: [DONE]\n\n`.

#### 4.3 Key File Implementation Specifications

**File: `apps/gateway/src/api/routes/openai-chat.ts`**
```typescript
import { FastifyPluginAsync } from "fastify";
import { db } from "../../db/index.js";
import { accounts } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { LoadBalancer } from "../../router/load-balancer.js";
import { DualStageAnsiSanitizer } from "../../stream/ansi-sanitizer.js";
import { RateLimitDetector } from "../../stream/rate-limit-detector.js";
import { ProcessManager } from "../../supervisor/process-manager.js";
import { formatSseDelta, formatSseDone } from "../../stream/sse-serializer.js";

export const openaiChatRoutes: FastifyPluginAsync = async (fastify) => {
  const router = new LoadBalancer();

  fastify.post("/v1/chat/completions", async (request, reply) => {
    const body = request.body as any;
    const requestedModel = body.model || "auto";
    const messages = body.messages || [];
    const isStream = Boolean(body.stream);
    const prompt = messages.map((m: any) => `${m.role}: ${m.content}`).join("\n");

    const resolution = await router.resolve(requestedModel);
    const account = resolution.account;
    const adapter = resolution.adapter;
    const adapterConfig = JSON.parse(adapter.configJson);

    // Atomically increment active slot semaphore
    await db.update(accounts)
      .set({
        activeSlots: sql`${accounts.activeSlots} + 1`,
        totalRequests: sql`${accounts.totalRequests} + 1`,
        lastActiveAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(accounts.id, account.id));

    const abortController = new AbortController();
    const requestId = `chatcmpl-${crypto.randomUUID()}`;
    const createdTimestamp = Math.floor(Date.now() / 1000);

    // Bind socket close for instantaneous zombie cleanup
    request.raw.on("close", () => {
      if (!request.raw.complete) {
        abortController.abort();
      }
    });

    const sanitizer = new DualStageAnsiSanitizer();
    const rateLimitDetector = new RateLimitDetector(adapterConfig.error_handling.rate_limit_patterns);
    const processManager = new ProcessManager();

    if (isStream) {
      reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.flushHeaders();

      try {
        await processManager.execute({
          adapterConfig,
          account,
          prompt,
          model: resolution.actualModelId,
          abortSignal: abortController.signal,
          onChunk: (rawChunk) => {
            const cleanText = sanitizer.processChunk(rawChunk);
            if (cleanText) {
              reply.raw.write(formatSseDelta(requestId, resolution.actualModelId, cleanText, createdTimestamp));
            }
            const rateLimit = rateLimitDetector.detect(rawChunk.toString("utf8"));
            if (rateLimit.matched) {
              const cooldownUntil = Math.floor(Date.now() / 1000) + rateLimit.cooldownSeconds;
              db.update(accounts)
                .set({ status: "COOLDOWN", cooldownUntil, cooldownReason: rateLimit.rawMatchedText })
                .where(eq(accounts.id, account.id))
                .execute();
            }
          },
        });

        const finalChunk = sanitizer.flush();
        if (finalChunk) {
          reply.raw.write(formatSseDelta(requestId, resolution.actualModelId, finalChunk, createdTimestamp));
        }
        reply.raw.write(formatSseDone());
        reply.raw.end();
      } finally {
        await db.update(accounts)
          .set({ activeSlots: sql`MAX(0, ${accounts.activeSlots} - 1)` })
          .where(eq(accounts.id, account.id));
      }
    } else {
      let accumulatedOutput = "";
      try {
        await processManager.execute({
          adapterConfig,
          account,
          prompt,
          model: resolution.actualModelId,
          abortSignal: abortController.signal,
          onChunk: (rawChunk) => {
            accumulatedOutput += sanitizer.processChunk(rawChunk);
          },
        });
        accumulatedOutput += sanitizer.flush();

        return {
          id: requestId,
          object: "chat.completion",
          created: createdTimestamp,
          model: resolution.actualModelId,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: accumulatedOutput.trim() },
              finish_reason: "stop",
            },
          ],
        };
      } finally {
        await db.update(accounts)
          .set({ activeSlots: sql`MAX(0, ${accounts.activeSlots} - 1)` })
          .where(eq(accounts.id, account.id));
      }
    }
  });
};
```

#### 4.4 Verification Commands
```bash
# Run unit and route tests for load balancing and OpenAI endpoints
pnpm --filter @cli-to-api/gateway exec vitest run tests/unit/load-balancer.test.ts tests/e2e/chat-completions.test.ts
```

---

### Phase 5: Obsidian Cyber-Deck Web Management Console & In-Browser WebShell

#### 5.1 Objective & Architectural Rationale
Provide developers with an Obsidian Cyber-Deck management console adhering to AK UI/UX Pro Max standards. The console features an in-browser WebShell powered by `@xterm/xterm` over WebSockets connected directly to a Fastify PTY session running inside the specific account's sandbox directory, enabling direct interactive OAuth login (`codex login`, `claude login`) without host workstation terminal access.

#### 5.2 Concrete Tasks Breakdown
- **Task 5.1:** Set up frontend workspace in `apps/web/` using React 19, Vite, Tailwind CSS v4, Lucide icons, and Radix UI primitives.
- **Task 5.2:** Define the Obsidian Cyber-Deck theme variables in `apps/web/src/index.css`:
  - Canvas: `#090B0F`, Surface: `#12141C`, Elevated: `#181B26`, Border: `#242B3B`.
  - Brand Indigo: `#6366F1`, Status Emerald: `#10B981`, Status Amber: `#F59E0B`, Status Ruby: `#EF4444`.
- **Task 5.3:** Implement Fastify WebSocket PTY bridge in `apps/gateway/src/api/ws/webshell.ts`:
  - Handle client connections at `/ws/terminal/:accountId`.
  - Spawn `node-pty` session inside account sandbox workspace.
  - Forward raw stdin keystrokes and stdout chunks bi-directionally with terminal resize support (`{ type: "resize", cols, rows }`).
- **Task 5.4:** Implement WebShell UI component in `apps/web/src/components/webshell/TerminalView.tsx` with `@xterm/xterm`, `@xterm/addon-fit`, and quick OAuth macro action buttons.
- **Task 5.5:** Implement Fleet Overview & Accounts View in `apps/web/src/views/AccountsView.tsx` with dynamic cooldown countdown timers and manual cooldown reset.

#### 5.3 Key File Implementation Specifications

**File: `apps/gateway/src/api/ws/webshell.ts`**
```typescript
import { FastifyPluginAsync } from "fastify";
import pty from "node-pty";
import os from "node:os";
import { db } from "../../db/index.js";
import { accounts, adapters } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { initializeSandbox } from "../../supervisor/sandbox.js";
import { env } from "../../config/env.js";

export const webshellRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/ws/terminal/:accountId", { websocket: true }, async (socket, req) => {
    const { accountId } = req.params as { accountId: string };

    const accountRecord = await db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    });

    if (!accountRecord) {
      socket.send(JSON.stringify({ error: "Account not found" }));
      socket.close();
      return;
    }

    const adapterRecord = await db.query.adapters.findFirst({
      where: eq(adapters.id, accountRecord.adapterId),
    });

    const isWindows = os.platform() === "win32";
    const defaultShell = isWindows ? "powershell.exe" : (process.env.SHELL || "bash");
    const sandbox = await initializeSandbox(env.DATA_DIR, adapterRecord!.id, accountRecord.id);

    const ptyProcess = pty.spawn(defaultShell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: sandbox.workspaceDir,
      env: sandbox.env,
    });

    ptyProcess.onData((data) => socket.send(data));

    socket.on("message", (message: Buffer | string) => {
      const text = message.toString();
      try {
        const parsed = JSON.parse(text);
        if (parsed.type === "resize") {
          ptyProcess.resize(parsed.cols, parsed.rows);
          return;
        }
      } catch {
        // Raw keyboard input
      }
      ptyProcess.write(text);
    });

    socket.on("close", () => {
      ptyProcess.kill();
    });
  });
};
```

**File: `apps/web/src/components/webshell/TerminalView.tsx`**
```tsx
import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  accountId: string;
  accountName: string;
  adapterExecutable: string;
  onClose: () => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ accountId, accountName, adapterExecutable, onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

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
      fontFamily: "JetBrains Mono, Fira Code, monospace",
      fontSize: 14,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal/${accountId}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      term.writeln(`\x1b[38;2;99;102;241m[⚡ Cyber-Deck Terminal Connected: ${accountName}]\x1b[0m\r\n`);
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (event) => term.write(event.data);
    term.onData((data) => ws.readyState === WebSocket.OPEN && ws.send(data));

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
  }, [accountId, accountName]);

  const runQuickCommand = (cmd: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(cmd + "\r");
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#090B0F] border border-[#242B3B] rounded-lg overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 bg-[#12141C] border-b border-[#242B3B]">
        <div className="flex items-center space-x-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse" />
          <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
            WebShell // {accountName}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => runQuickCommand(`${adapterExecutable} login`)}
            className="px-2.5 py-1 text-xs font-mono bg-[#181B26] hover:bg-[#6366F1] text-slate-200 rounded border border-[#242B3B] transition-colors"
          >
            Run Login
          </button>
          <button
            onClick={() => runQuickCommand("whoami")}
            className="px-2.5 py-1 text-xs font-mono bg-[#181B26] hover:bg-[#1A1E29] text-slate-200 rounded border border-[#242B3B] transition-colors"
          >
            whoami
          </button>
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-mono bg-[#181B26] hover:bg-[#EF4444] text-slate-200 rounded border border-[#242B3B] transition-colors"
          >
            Exit Shell
          </button>
        </div>
      </div>
      <div ref={terminalRef} className="flex-1 p-2 overflow-hidden" />
    </div>
  );
};
```

#### 5.4 Verification Commands
```bash
# Build the web console bundle to ensure zero TypeScript or bundling errors
pnpm --filter @cli-to-api/web build
```

---

### Phase 6: Live SSE Inspector, Chat Playground Studio & Acceptance Suite

#### 6.1 Objective & Architectural Rationale
Ensure end-to-end operational visibility by implementing a real-time SSE packet inspector, a Playground Studio for prompt verification, and a comprehensive automated test suite guaranteeing that all 7 Acceptance Criteria (AC-01 through AC-07) pass reliably.

#### 6.2 Concrete Tasks Breakdown
- **Task 6.1:** Implement Live SSE Inspector in `apps/web/src/views/LiveInspectorView.tsx`:
  - Hook into `GET /api/events` SSE broadcast.
  - Display latency per token, chunk size in bytes, and real-time diff between raw CLI stdout and sanitized tokens.
- **Task 6.2:** Implement Chat Playground in `apps/web/src/views/PlaygroundView.tsx`:
  - Interactive chat session supporting namespaced models and virtual auto tiers.
  - Real-time token streaming with syntax highlighting and latency telemetry.
- **Task 6.3:** Implement End-to-End Acceptance Test Suite in `tests/e2e/acceptance.test.ts` covering all ACs:
  - AC-01: Full catalog return.
  - AC-02: Namespaced model routing isolation.
  - AC-03: Virtual tier auto-routing least-connections.
  - AC-04: Multi-account sandboxing isolation.
  - AC-05: Dynamic 429 rate limit extraction and automatic cooldown failover.
  - AC-06: Zero-zombie child cleanup $\le 200\text{ms}$.
  - AC-07: In-browser WebShell authentication flow.

#### 6.3 Key File Implementation Specifications

**File: `tests/e2e/acceptance.test.ts`**
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../../apps/gateway/src/server.js";
import { FastifyInstance } from "fastify";

describe("cli-to-api Acceptance Test Suite (AC-01 through AC-07)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer({ testMode: true });
    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  it("AC-01: GET /v1/models returns namespaced models and virtual auto tiers", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/models" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.data.map((m: any) => m.id);
    expect(ids).toContain("auto");
    expect(ids).toContain("auto-low");
    expect(ids).toContain("auto-high");
    expect(ids.some((id: string) => id.includes("/"))).toBe(true);
  });

  it("AC-02: Namespaced model routing strictly targets the specified adapter", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-default" },
      payload: {
        model: "codex/gpt-5.6-asta",
        messages: [{ role: "user", content: "ping" }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.model).toBe("gpt-5.6-asta");
  });

  it("AC-03: Virtual tier auto-routing selects low cost models for auto-low", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-cta-default" },
      payload: {
        model: "auto-low",
        messages: [{ role: "user", content: "ping" }],
      },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

#### 6.4 Verification Commands
```bash
# Execute entire test suite across unit and e2e acceptance specs
pnpm test
```

---

## 4. Test Matrix & Acceptance Verification

| Test ID | Category | Target Component | Scenario & Test Conditions | Expected Assertion |
| :---: | :--- | :--- | :--- | :--- |
| **AC-01** | E2E | `GET /v1/models` | 2+ adapters registered with multiple models | Returns HTTP 200 with namespaced (`codex/gpt-5.6-asta`) and virtual (`auto-low`, `auto-xhigh`) models. |
| **AC-02** | E2E | Route Dispatcher | Model requested: `codex/gpt-5.6-asta` while OpenCode is idle | Request routes strictly to Codex account pool; never routes to OpenCode. |
| **AC-03** | E2E | Tier Matcher | Model requested: `auto-low` | Filters only `tier: low` models, applying least-connections across eligible accounts. |
| **AC-04** | Unit/E2E | Directory Sandbox | 2 concurrent requests to distinct accounts of same CLI | Processes launch with distinct `HOME` (`/sandboxes/claude/acc-1` vs `/sandboxes/claude/acc-2`). |
| **AC-05** | Unit/E2E | Dynamic 429 Interceptor | CLI emits `"resets in 45m"` | Account transitions to `COOLDOWN` for exactly 2,700s; subsequent requests failover to standby. |
| **AC-06** | Unit/E2E | Process Supervisor | Streaming connection aborted by client | All child and grandchild processes terminate in $\le 200\text{ms}$ via Win32 Job Object / POSIX setsid. |
| **AC-07** | E2E | Web Console & WebShell | Connect to `/ws/terminal/:accountId` | Interactive PTY session connects over WebSocket in account sandbox directory with resize support. |
| **UT-01** | Unit | Binary Resolver | Windows PATH and PATHEXT resolution | Successfully discovers `.cmd`, `.bat`, `.exe`, and `.ps1` binaries in npm/pnpm global directories. |
| **UT-02** | Unit | Dual-Stage Sanitizer | Stream with terminal spinner `\r` and Vietnamese UTF-8 | Overwrite noise is stripped; Vietnamese diacritics and emojis remain intact across chunk splits. |
| **UT-03** | Unit | Prompt Transport | Prompt length exceeds 4,000 characters | System dynamically writes prompt to atomic temporary file instead of passing via argv. |
| **UT-04** | Unit | SQLite Concurrency | Concurrent DB reads and writes in WAL mode | Zero SQLite busy lock exceptions; slot semaphores increment and decrement with ACID guarantees. |

---

## 5. UI/UX Specifications (AK UI/UX Pro Max Obsidian Cyber-Deck)

### 5.1 Obsidian Cyber-Deck Design Philosophy & Design Tokens
The console implements a high-density, mission-critical Cyber-Deck aesthetic inspired by high-throughput network control rooms and spacecraft telemetry dashboards. It is tailored for developers running high-volume AI workloads locally.

#### Color Tokens Palette (WCAG 2.1 AAA Compliant)
- **Canvas Base:** `#090B0F` (Deep Void - 0% distraction)
- **Deck Surface (Panels):** `#12141C` (High-contrast obsidian surface)
- **Deck Elevated (Cards & Modals):** `#181B26` (Layered component elevation)
- **Deck Hover Surface:** `#1F2433` (Subtle interaction luminance)
- **Hairline Border:** `#242B3B` (Crisp 1px borders)
- **Subtle Divider:** `#1A202C`
- **Primary Brand Accent:** `#6366F1` (Electric Indigo)
- **Secondary Cyan:** `#06B6D4` (Telemetry Cyan)
- **Text Primary:** `#F8FAFC` (Slate 50, contrast ratio 17.5:1 against `#090B0F`)
- **Text Secondary:** `#94A3B8` (Slate 400, contrast ratio 7.2:1 against `#12141C`)
- **Text Muted:** `#64748B` (Slate 500)
- **Status Badges:**
  - **Ready / Active:** `#10B981` (Emerald Glow: `rgba(16, 185, 129, 0.25)`)
  - **Cooldown / Throttled:** `#F59E0B` (Amber Glow: `rgba(245, 158, 11, 0.25)`)
  - **Busy / Executing:** `#0EA5E9` (Sky Blue Glow: `rgba(14, 165, 233, 0.25)`)
  - **Error / Fault:** `#EF4444` (Ruby Glow: `rgba(239, 68, 68, 0.25)`)
- **Virtual Tier Badges:**
  - `auto-low`: `#06B6D4` (Cyan)
  - `auto-medium`: `#3B82F6` (Blue)
  - `auto-high`: `#8B5CF6` (Purple)
  - `auto-xhigh`: `#EC4899` (Fuchsia / Neon Pink)

### 5.2 Typography & Tabular Layout Hierarchy
- **Font Stack:**
  - Monospace / Telemetry: `JetBrains Mono`, `Fira Code`, monospace
  - Body UI: `Inter`, -apple-system, BlinkMacSystemFont, sans-serif
- **Tabular Figures:** All numeric readouts (RPM, slot counts, latency ms, countdown seconds) enforce `font-mono tabular-nums` to prevent visual jittering during live polling.
- **Hierarchy Scale:**
  - Display / Fleet Totals: `text-2xl font-bold font-mono tracking-tight`
  - Panel Headers: `text-sm font-semibold uppercase tracking-wider text-slate-400`
  - Body Text: `text-sm text-slate-200`
  - Code / Terminal: `text-xs font-mono leading-relaxed`

### 5.3 View-by-View Specifications

#### 1. Fleet Dashboard View (`DashboardView.tsx`)
- **Fleet HUD Bar:** Displays 4 top-level metric cards:
  1. *Active Slots:* Circular progress ring showing `active_slots / total_slots` with real-time color shifts (Green $\le 60\%$, Amber $>60\%$, Red $= 100\%$).
  2. *Fleet Health:* Percentage of accounts in `READY` state.
  3. *Throughput:* Real-time Requests Per Minute (RPM) rolling counter.
  4. *Gateway Latency:* Exponentially Weighted Moving Average (EWMA) in milliseconds.
- **Account Health Grid:** Interactive grid of account cards. Each card displays:
  - Account ID & Adapter Provider badge (`codex`, `claude`, `opencode`).
  - Visual status pill (`READY`, `BUSY`, `COOLDOWN`, `ERROR`).
  - Active slot bar (`0/1` or `1/1`).
  - Live cooldown countdown timer (e.g. `resets in 42m 18s`) updating every second.
  - Action buttons: "Open WebShell" and "Clear Cooldown".

#### 2. Model Catalog & Routing Studio (`ModelCatalogView.tsx`)
- **Virtual Auto Tiers Table:** Lists `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`, and `auto` with description, eligible model counts, and active accounts ready for dispatch.
- **Namespaced Models Table:** Searchable table listing all discovered models (e.g. `codex/gpt-5.6-asta`, `claude/claude-3-7-sonnet`), showing context window size, cost weight, and routing target.

#### 3. Account Manager & Directory Sandbox Explorer (`AccountsView.tsx`)
- **Accounts Table:** Lists all registered accounts across adapters.
- **Sandbox Breadcrumbs:** Shows absolute filesystem path (`$DATA_DIR/sandboxes/{adapter}/{account}`) with quick "Copy Path" button.
- **Manual Cooldown Override:** Instant "Clear Cooldown" button triggering an atomic SQLite reset and immediate dispatcher notification.
- **Add Account Dialog:** Modal allowing administrators to attach new accounts to any active CLI adapter.

#### 4. In-Browser WebShell (`WebShellView.tsx` & `TerminalView.tsx`)
- **Terminal Canvas:** Obsidian dark xterm.js instance running over WebSockets inside the specific account sandbox directory.
- **Quick Action Macros Bar:**
  - "Run Login" button: Sends `{executable} login\r` directly to the PTY.
  - "Check Auth" button: Sends `whoami\r` or `{executable} auth status\r`.
  - "Clear Screen" button: Sends `clear\r`.
- **Interactive Links:** Embedded OAuth authentication URLs (e.g., `https://github.com/login/device`) render as clickable links opening directly in a new browser tab.

#### 5. Live SSE Stream Inspector (`LiveInspectorView.tsx`)
- **Live Stream Viewer:** Real-time token flow visualizer connected to `/api/events`.
- **Telemetry Indicators:** Displays Time-To-First-Token (TTFT), tokens per second (TPS), and total chunk count.
- **ANSI Sanitizer Diff Inspector:** Split-pane view comparing raw incoming stdout bytes against the sanitized tokens emitted to the OpenAI SSE client, highlighting filtered carriage returns and stripped escape sequences.

#### 6. Chat Playground Studio (`PlaygroundView.tsx`)
- **Chat Interface:** Multi-turn message thread with Markdown rendering and code block copy buttons.
- **Model Selector Dropdown:** Grouped select supporting all virtual tiers (`auto-*`) and namespaced CLI models (`codex/*`, `claude/*`).
- **Telemetry Footer:** Shows token generation speed, elapsed streaming time, and active account utilized.

### 5.4 Interaction States & Micro-Interactions
- **Buttons & Action Triggers:**
  - *Default:* `bg-[#181B26] border border-[#242B3B] text-slate-200`
  - *Hover:* `bg-[#1F2433] border-[#6366F1] text-white shadow-[0_0_12px_rgba(99,102,241,0.2)]`
  - *Active / Pressed:* `scale-[0.98] bg-[#12141C]`
  - *Focus-Visible:* `outline-none ring-2 ring-[#6366F1] ring-offset-2 ring-offset-[#090B0F]`
  - *Disabled:* `opacity-40 cursor-not-allowed border-transparent`
- **Loading & Skeleton Shimmer:** High-density skeleton pulses transitioning from `#12141C` to `#1F2433` and back to `#12141C` at 1.5s ease-in-out.
- **Pulsing Status Indicators:**
  - Active streaming sessions emit a subtle 1Hz emerald pulse.
  - Accounts in cooldown display a warning amber pulse with countdown timer.

### 5.5 Accessibility (WCAG 2.1 AAA Compliant) & Usability
1. **High-Contrast Text Hierarchy:** Every text element meets or exceeds 7:1 contrast against its background. Slate 50 (`#F8FAFC`) on Obsidian Void (`#090B0F`) provides an exceptional 17.5:1 ratio.
2. **Keyboard Navigation & Focus Traps:**
   - Full keyboard navigability via `Tab` and `Shift+Tab`.
   - Modals (WebShell, Add Account) implement focus traps via Radix UI primitives.
   - Global keyboard shortcuts: `Escape` closes active overlays; `Ctrl+K` launches the model selector palette.
3. **Screen Reader Support & ARIA:**
   - Real-time telemetry readouts and SSE stream buffers utilize `aria-live="polite"`.
   - Dynamic countdown timers utilize `role="timer"` and `aria-atomic="true"`.
   - Modals and dropdowns feature explicit `aria-expanded` and `aria-controls` bindings.
4. **Reduced Motion Mode:** Under `@media (prefers-reduced-motion: reduce)`, glowing pulse animations and layout transitions are suppressed in favor of static, high-contrast borders.

### 5.6 Error Recovery & Edge State UX
1. **WebSocket Reconnection Overlay:** If the WebShell connection drops, a non-blocking toast appears with an automatic 5-second countdown timer and a manual "Reconnect Now" button.
2. **Cascade Rate-Limit Banner:** If all accounts in a requested model tier hit rate limits, an amber alert ribbon notifies the user of the active cooldown and indicates the exact seconds remaining until automatic recovery.
3. **Missing CLI Executable Warning:** If an adapter binary is missing from system `PATH`, the UI displays a warning banner with the exact copyable installation command (e.g. `npm install -g @anthropic-ai/claude-code`).

---

## 6. Execution Command Quick-Reference

```bash
# -----------------------------------------------------------------------------
# Monorepo Operations & Verification
# -----------------------------------------------------------------------------

# 1. Install workspace dependencies
pnpm install

# 2. Run SQLite migrations
pnpm --filter @cli-to-api/gateway exec tsx src/db/migrate.ts

# 3. Run complete automated test suite (Unit, Integration, Acceptance AC-01..AC-07)
pnpm test

# 4. Start Gateway daemon and Web Management Console concurrently in development
pnpm dev

# 5. Build production bundles for backend daemon and frontend console
pnpm build

# 6. Launch production gateway daemon
pnpm start
```
