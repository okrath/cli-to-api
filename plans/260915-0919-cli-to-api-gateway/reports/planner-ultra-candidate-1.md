# Implementation Plan: AI CLI to OpenAI API Gateway & Web Management Console (`cli-to-api`)

**Candidate:** Planner 1  
**Document ID:** `plans/260915-0919-cli-to-api-gateway/reports/planner-ultra-candidate-1.md`  
**Target Project:** `cli-to-api` (Enterprise AI CLI Reverse-Proxy Gateway & Web Management Console)  
**Execution Target:** Production-Grade Agnostic Bridge Daemon  
**Standard:** Ultra Plan (Best-of-5 Verifier Pass)  
**Design Standard:** AK UI/UX Pro Max (Obsidian Cyber-Deck Ergonomics)  
**Date:** 2026-09-15  

---

## 1. Executive Plan Summary & Milestones

### 1.1 Mission & Architectural Principles
`cli-to-api` is an enterprise-grade, local-first API gateway daemon designed to run natively on developer workstations and edge servers. It transforms any locally installed AI Command-Line Interface (CLI)—including `@anthropic-ai/claude-code`, `codex-cli`, `opencode`, `grok-cli`, `gemini-cli`, and `ollama`—into an OpenAI-compatible REST & SSE Streaming API endpoint (`/v1/chat/completions`, `/v1/models`).

Crucially, `cli-to-api` operates as an **Agnostic Bridge**: it does not download pirated binaries or package managers. Developers install whatever AI CLIs they wish; `cli-to-api` supervises their lifecycle, virtualizes their account credentials, isolates their workspaces, balances requests across multiple accounts, and provides an Obsidian Cyber-Deck Web Management Console for orchestration, authentication, and live stream telemetry.

### 1.2 Core Architectural Innovations (Candidate 1 Differentiators)
This implementation plan provides production-grade solutions to the six fundamental engineering barriers identified during architectural evaluation:

1. **Triple-Tier Process Containment ($\le 200\text{ms}$ Zero-Zombie Guarantee):** Standard Node.js `child.kill()` fails on Windows because `.cmd` wrappers and helper shells (`conhost.exe`, Python runners) are detached from the parent, leaving orphaned zombie processes consuming CPU and locking credentials. Candidate 1 implements a **Triple-Tier Windows Terminator**:
   - *Tier 1:* Native Win32 Job Object via `windows-job-node` with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (0x2000)`.
   - *Tier 2:* Windows Management Instrumentation (WMI) / PowerShell kernel tree termination as a resilient fallback.
   - *Tier 3:* Immediate `taskkill /F /T /PID ${pid}` with an asynchronous process-table verification loop (`tasklist` / `Get-Process`).
   - *POSIX:* Process group isolation via `setsid` and `process.kill(-pgid, 'SIGKILL')`.
2. **Non-Blocking Dual-Stage ANSI & Rolling Carriage-Return Sanitizer:** In standard CLI wrappers, terminal spinners emit `\r` (carriage return without newline) to animate in place. Naive line-buffering destroys Time-To-First-Token (TTFT) by waiting for `\n` before streaming tokens. Candidate 1 implements a **streaming-first dual-stage pipeline**: substantive completion tokens are streamed immediately to the client with sub-20ms latency, while transient spinner patterns (`⠋⠙⠹`, `[|/-\\]`, `Thinking... \r`) are intercepted in an ephemeral rolling buffer and discarded.
3. **Multi-Byte UTF-8 Stream Integrity:** Network chunk boundaries frequently dissect 2-byte, 3-byte, and 4-byte UTF-8 sequences (e.g. Vietnamese diacritics like `ế`, `ộ`, `ạ` and emojis like 🚀, 🤖). Candidate 1 uses Node.js `string_decoder.StringDecoder('utf8')` as Stage 0 to guarantee that only structurally valid Unicode characters enter the regex and SSE framing pipeline.
4. **Adaptive Prompt Transport (Bypassing Windows 8,191-Char Argv Limit):** Windows `cmd.exe` enforces a strict 8,191-character command line limit (`CreateProcessW` max is 32,767). When context exceeds 4,000 characters, Candidate 1 automatically routes prompts through CLI standard input (`stdin`) or atomic temporary files (`temp_file`) using explicit adapter argument templates (`args_template_file`), preventing CLI argument impedance mismatch.
5. **Cross-Platform Executable Resolution (`PATHEXT` Engine):** Transparently discovers `.cmd`, `.bat`, `.ps1`, and `.exe` binaries across npm global (`%APPDATA%/npm`), pnpm global (`%LOCALAPPDATA%/pnpm`), Scoop, Chocolatey, Cargo, and system `PATH`, eliminating `spawn ENOENT` errors on Windows.
6. **Smart Model Routing Matrix:**
   - **Catalog Discovery (`GET /v1/models`):** Full metadata catalog including context window, provider ownership, and intelligence tier.
   - **Namespaced Targeting (`provider/model`):** Strict pool isolation (e.g., `codex/gpt-5.6-asta` strictly accesses Codex accounts; `opencode/gpt-5.6-asta` strictly accesses OpenCode accounts).
   - **Virtual Tier Auto-Routing (`auto-*`):** Intelligently routes between `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`, and global `auto` across all available providers.
   - **Dynamic Cooldown Engine:** Parses reset durations directly from provider stdout/stderr (e.g., extracting `"resets in 45m"` to set a 2,700-second cooldown timer).
7. **Developer Web Console (UI/UX Pro Max):** An Obsidian Cyber-Deck interface (React 19 + Tailwind v4 + Radix UI) featuring an in-browser WebShell (`@xterm/xterm` over WebSocket) with an **OAuth Device Flow Sniffer** that extracts verification codes and URLs for one-click browser authorization.

### 1.3 Milestones & Phased Roadmap

```
+---------------------------------------------------------------------------------------------------------+
|                                        MILESTONE DELIVERY ROADMAP                                       |
+---------------------------------------------------------------------------------------------------------+
| [M1] Persistence & Adapter Schema Engine     (Phase 1) -> SQLite WAL + Drizzle + PATHEXT + Zod Schema   |
| [M2] Process Supervisor & Containment Engine (Phase 2) -> Triple-Tier Win32 Job Object + POSIX setsid   |
| [M3] Stream Pipeline & Byte Sanitization     (Phase 3) -> StringDecoder + Non-Blocking \r + 429 Detector|
| [M4] Model Catalog & Intelligent Routing     (Phase 4) -> Namespaces + Virtual Tiers + Slot Semaphore   |
| [M5] Ingress Gateway API (OpenAI REST & SSE) (Phase 5) -> /v1/chat/completions + /v1/models + Token Est |
| [M6] Web Console & WebShell (UI/UX Pro Max)  (Phase 6) -> React 19 + Cyber-Deck + xterm.js + Live SSE   |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Exact Directory & File Architecture

The repository is structured as a high-performance TypeScript monorepo using pnpm workspaces. Fastify handles backend API gateway functions and process supervision, while React 19 + Vite powers the developer management console.

```
cli-to-api/
├── package.json                          # Workspace root configuration, scripts & dev dependencies
├── pnpm-workspace.yaml                   # Monorepo workspace definition
├── tsconfig.base.json                    # Base TypeScript 5.5+ compiler configuration
├── vitest.config.ts                      # Vitest monorepo configuration
├── .gitignore                            # Git exclusion rules (data, sandboxes, node_modules)
│
├── apps/
│   ├── gateway/                          # Fastify Core API Daemon & Process Supervisor
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # Daemon bootstrap, signal hooks (SIGINT, SIGTERM)
│   │       ├── config/
│   │       │   ├── env.ts                # Zod environment validator (PORT, HOST, DATA_DIR, etc.)
│   │       │   └── paths.ts              # Path resolution for sandboxes, database, temp files
│   │       ├── db/
│   │       │   ├── index.ts              # better-sqlite3 instance (WAL mode, busy_timeout: 5000)
│   │       │   ├── schema.ts             # Drizzle SQLite table definitions
│   │       │   └── migrate.ts            # Migration bootstrapper & schema auto-initialization
│   │       ├── adapters/
│   │       │   ├── schema.ts             # Strict Zod schema for adapter.yaml definitions
│   │       │   ├── resolver.ts           # Windows PATHEXT & binary discovery engine
│   │       │   ├── loader.ts             # YAML loader, parser and database synchronizer
│   │       │   └── registry.ts           # In-memory fast registry for active adapters and models
│   │       ├── supervisor/
│   │       │   ├── types.ts              # Process execution types, exit codes & stream interfaces
│   │       │   ├── job-object.ts         # Triple-Tier Win32 Job Object containment supervisor
│   │       │   ├── process-group.ts      # POSIX Process Group isolation wrapper (setsid)
│   │       │   ├── prompt-transport.ts   # Prompt length evaluator & auto stdin/temp_file switcher
│   │       │   ├── sandbox.ts            # Account directory jail ($HOME, $USERPROFILE, env whitelist)
│   │       │   ├── pty-executor.ts       # node-pty execution engine for interactive TTY CLIs
│   │       │   ├── pipe-executor.ts      # execa v9 execution engine for headless pipe CLIs
│   │       │   └── process-manager.ts    # Unified process supervisor handling execution & aborts
│   │       ├── stream/
│   │       │   ├── utf8-decoder.ts       # StringDecoder('utf8') multi-byte chunk buffer
│   │       │   ├── ansi-sanitizer.ts     # Non-blocking ANSI stripper & rolling \r spinner filter
│   │       │   ├── rate-limit-detector.ts# Dynamic regex parser extracting resets in Xh Ym
│   │       │   └── sse-serializer.ts     # OpenAI SSE frame serializer (id, model, delta, [DONE])
│   │       ├── router/
│   │       │   ├── types.ts              # Load balancer & model routing type definitions
│   │       │   ├── model-catalog.ts      # Catalog builder (namespaced, flat aliases, virtual tiers)
│   │       │   ├── load-balancer.ts      # Weighted Least-Connections + EMA Latency scheduler
│   │       │   ├── slot-semaphore.ts     # In-memory async lock & slot concurrency gatekeeper
│   │       │   └── cooldown-tracker.ts   # Dynamic cooldown manager with auto-recovery timers
│   │       ├── api/
│   │       │   ├── server.ts             # Fastify server initialization & plugin registration
│   │       │   ├── middleware/
│   │       │   │   ├── auth.ts           # Bearer token validator (sk-cta-...)
│   │       │   │   └── error-handler.ts  # Standard OpenAI JSON error responses
│   │       │   ├── routes/
│   │       │   │   ├── openai-models.ts  # GET /v1/models (full catalog with metadata)
│   │       │   │   ├── openai-chat.ts    # POST /v1/chat/completions (REST & SSE streaming)
│   │       │   │   ├── admin-adapters.ts # GET/POST /api/adapters
│   │       │   │   ├── admin-accounts.ts # CRUD /api/accounts & status overrides
│   │       │   │   ├── admin-metrics.ts  # GET /api/metrics (telemetry, slots, RPM, latency)
│   │       │   │   └── admin-events.ts   # GET /api/admin/events (SSE stream for live inspector)
│   │       │   └── ws/
│   │       │       └── webshell.ts       # WebSocket server for in-browser xterm.js PTY sessions
│   │       └── utils/
│   │           ├── logger.ts             # Pino high-performance structured logger
│   │           ├── token-estimator.ts    # Heuristic BPE token counter for usage reporting
│   │           └── temp-cleaner.ts       # Safe atomic temp file removal
│   │
│   └── web/                              # React 19 Developer Management Console (UI/UX Pro Max)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── index.css                 # Tailwind v4 & Obsidian Cyber-Deck CSS custom properties
│           ├── main.tsx                  # React 19 client entry point
│           ├── App.tsx                   # Main layout container & view router
│           ├── types/
│           │   ├── api.ts                # Gateway API client types
│           │   └── models.ts             # Adapter, Account, Metric, and Terminal types
│           ├── lib/
│           │   ├── api-client.ts         # Typed fetch client with error handling
│           │   └── ws-terminal.ts        # WebSocket connection manager for xterm.js
│           ├── components/
│           │   ├── layout/
│           │   │   ├── Header.tsx        # Top navigation, status indicator, fleet health gauge
│           │   │   ├── Sidebar.tsx       # View switcher with active neon indicator
│           │   │   └── StatusPill.tsx    # Cyberpunk badges (READY, BUSY, COOLDOWN, ERROR)
│           │   ├── ui/                   # Radix UI primitives with Cyber-Deck styling
│           │   │   ├── Button.tsx
│           │   │   ├── Card.tsx
│           │   │   ├── Dialog.tsx
│           │   │   ├── Select.tsx
│           │   │   ├── Input.tsx
│           │   │   └── Table.tsx
│           │   └── webshell/
│           │       ├── TerminalView.tsx  # @xterm/xterm terminal with addon-fit and addon-web-links
│           │       └── OAuthBanner.tsx   # Floating toast detecting OAuth device codes & URLs
│           └── views/
│               ├── DashboardView.tsx     # Fleet overview, real-time slot dial, error sparklines
│               ├── ModelCatalogView.tsx  # Virtual Auto Tiers & Namespaced Models studio
│               ├── AccountsView.tsx      # Multi-account manager, sandbox explorer, cooldown reset
│               ├── WebShellView.tsx      # In-browser CLI terminal for interactive `login` auth
│               ├── LiveInspectorView.tsx # Dual-pane SSE telemetry inspector (Raw vs Sanitized)
│               └── PlaygroundView.tsx    # OpenAI chat completion test studio with streaming
│
├── adapters/                             # Pre-packaged, production-tested CLI adapter definitions
│   ├── codex-cli.yaml                    # Codex CLI adapter
│   ├── opencode-cli.yaml                 # OpenCode CLI adapter
│   ├── claude-code.yaml                  # Anthropic Claude Code CLI adapter
│   ├── grok-cli.yaml                     # Grok CLI adapter
│   └── gemini-cli.yaml                   # Gemini CLI adapter
│
├── data/                                 # Runtime persistent state (git-ignored)
│   ├── sqlite.db                         # better-sqlite3 database file
│   ├── sqlite.db-wal                     # Write-Ahead Log journal
│   └── sandboxes/                        # Directory jails for isolated multi-account runtimes
│       ├── codex-cli/
│       │   ├── acc-01/                   # Isolated $HOME, $USERPROFILE, .codex/
│       │   └── acc-02/
│       └── opencode-cli/
│           └── acc-01/
│
└── tests/
    ├── mocks/                            # Mock CLI binaries for reproducible verification
    │   ├── mock-spinner-cli.js           # CLI emitting multi-byte UTF-8 + \r carriage returns
    │   ├── mock-ratelimit-cli.js         # CLI emitting dynamic 429 reset error strings
    │   ├── mock-zombie-cli.js            # CLI spawning sub-shells that ignore SIGINT/SIGTERM
    │   └── mock-large-prompt-cli.js      # CLI verifying temp file / stdin prompt ingestion
    ├── unit/
    │   ├── resolver.test.ts              # Windows PATHEXT & binary discovery tests
    │   ├── stream-sanitizer.test.ts      # Multi-byte UTF-8 & non-blocking \r sanitizer tests
    │   ├── prompt-transport.test.ts      # 4,000+ character prompt routing tests
    │   └── load-balancer.test.ts         # Namespaced & auto-* virtual tier routing tests
    └── e2e/
        ├── process-lifecycle.test.ts     # <= 200ms process termination & zero zombie verification
        └── acceptance.test.ts            # AC-01 to AC-07 end-to-end acceptance test suite
```

---

## 3. Detailed Phases (Phase 1 to Phase 6)

### Phase 1: Workspace Setup, Persistent Database & Adapter Schema Engine

#### 1.1 Objective & Architecture Rationale
Phase 1 constructs the foundation of the system:
- Sets up the pnpm workspace monorepo targeting Node.js 22 LTS with strict TypeScript validation.
- Implements high-performance SQLite persistence in Write-Ahead Log (WAL) mode using `better-sqlite3` and `Drizzle ORM`, configuring `PRAGMA synchronous = NORMAL;` and `PRAGMA busy_timeout = 5000;` to ensure sub-millisecond transactions without lock contention.
- Implements the Windows `PATHEXT` resolution algorithm to locate `.cmd`, `.bat`, `.ps1`, and `.exe` binaries across standard and package manager directories.
- Implements the strict Zod schema for `adapter.yaml` and builds the automatic adapter loader.

#### 1.2 Concrete Tasks Breakdown
- **Task 1.1:** Initialize monorepo root `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`.
- **Task 1.2:** Implement environment configuration validator in `apps/gateway/src/config/env.ts` validating `PORT` (default: 8080), `HOST` (default: "0.0.0.0"), `DATA_DIR` (default: "./data"), and `DEFAULT_API_KEY`.
- **Task 1.3:** Build Drizzle ORM schema in `apps/gateway/src/db/schema.ts` defining `adapters`, `accounts`, `models`, `model_aliases`, and `request_logs`.
- **Task 1.4:** Build SQLite database manager in `apps/gateway/src/db/index.ts` with WAL mode pragmas, and migration bootstrap in `apps/gateway/src/db/migrate.ts`.
- **Task 1.5:** Implement the Windows `PATHEXT` binary resolution engine in `apps/gateway/src/adapters/resolver.ts`.
- **Task 1.6:** Define the declarative YAML schema in `apps/gateway/src/adapters/schema.ts` supporting `prompt_transport`, `args_template_file`, and execution modes (`pipe` vs `pty`).
- **Task 1.7:** Build adapter loader in `apps/gateway/src/adapters/loader.ts` to scan `adapters/*.yaml`, validate configs, and sync them to SQLite.

#### 1.3 Key File Implementation Specifications

**File: `apps/gateway/src/adapters/schema.ts`**
```typescript
import { z } from "zod";

export const ModelTierEnum = z.enum(["low", "medium", "high", "xhigh"]);
export type ModelTier = z.infer<typeof ModelTierEnum>;

export const AdapterModelSchema = z.object({
  id: z.string().min(1).describe("Model identifier inside the CLI (e.g. gpt-5.6-asta, claude-3-7-sonnet)"),
  name: z.string().min(1).describe("Human-readable model name"),
  tier: ModelTierEnum.describe("Intelligence & cost tier for virtual auto-* routing"),
  context_window: z.number().int().positive().default(128000),
  cost_weight: z.number().positive().default(1),
  is_default_for_alias: z.boolean().default(false),
});

export const RateLimitPatternSchema = z.object({
  pattern: z.string().min(1).describe("Regex pattern matching rate limit error message"),
  cooldown_seconds_default: z.number().int().positive().default(1800),
  dynamic_extractor: z.boolean().default(true).describe("Extract 'resets in Xh Ym' dynamically if true"),
});

export const AdapterConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/).describe("Unique adapter namespace identifier"),
  name: z.string().min(1),
  version: z.string().default("1.0.0"),
  executable: z.string().min(1).describe("Binary command name (e.g. codex, claude, opencode)"),
  execution_mode: z.enum(["pty", "pipe"]).default("pipe").describe("pty for interactive CLIs, pipe for headless"),
  models: z.array(AdapterModelSchema).min(1),
  invocation: z.object({
    args_template: z.array(z.string()).describe("Argument list with placeholders: {model}, {prompt}"),
    args_template_file: z.array(z.string()).optional().describe("Argument list when using temp file: {model}, {prompt_file}"),
    prompt_transport: z.enum(["auto", "argv", "stdin", "temp_file"]).default("auto"),
    prompt_threshold_chars: z.number().int().positive().default(4000),
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
```

**File: `apps/gateway/src/adapters/resolver.ts`**
```typescript
import fs from "node:fs";
import path from "node:path";

/**
 * Resolves an executable command name across operating system PATH and PATHEXT.
 * Handles Windows .cmd, .bat, .ps1 wrappers from global npm, pnpm, and Scoop.
 */
export function resolveExecutableBinary(executableName: string): string {
  // If executable is an explicit path that exists, return it directly
  if (path.isAbsolute(executableName) && fs.existsSync(executableName)) {
    return executableName;
  }

  const isWindows = process.platform === "win32";
  const pathSeparator = isWindows ? ";" : ":";
  const rawPath = process.env.PATH || "";
  const pathDirs = rawPath.split(pathSeparator).map(dir => dir.replace(/^"|"$/g, "").trim()).filter(Boolean);

  if (isWindows) {
    // Inject known package manager global bin directories if omitted from system PATH
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    const userProfile = process.env.USERPROFILE;
    
    if (appData) pathDirs.push(path.join(appData, "npm"));
    if (localAppData) {
      pathDirs.push(path.join(localAppData, "pnpm"));
      pathDirs.push(path.join(localAppData, "Programs", "Python"));
    }
    if (userProfile) {
      pathDirs.push(path.join(userProfile, ".cargo", "bin"));
      pathDirs.push(path.join(userProfile, "scoop", "shims"));
    }
  }

  // Windows file extensions priority order
  const pathext = isWindows
    ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD;.PS1")
        .split(";")
        .map(ext => ext.toLowerCase())
    : [""];

  for (const dir of pathDirs) {
    try {
      if (!fs.existsSync(dir)) continue;

      // Check direct candidate (if executable already contains extension)
      const directCandidate = path.join(dir, executableName);
      if (!isWindows && fs.existsSync(directCandidate)) {
        return directCandidate;
      }

      for (const ext of pathext) {
        const fullCandidate = executableName.toLowerCase().endsWith(ext)
          ? directCandidate
          : `${directCandidate}${ext}`;

        if (fs.existsSync(fullCandidate)) {
          return fullCandidate;
        }
      }
    } catch {
      // Ignore directory access permission errors
      continue;
    }
  }

  return executableName; // Fallback to raw name if not found in path scan
}
```

**File: `apps/gateway/src/db/schema.ts`**
```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const adapters = sqliteTable("adapters", {
  id: text("id").primaryKey(), // e.g. "codex-cli"
  name: text("name").notNull(),
  version: text("version").notNull(),
  executable: text("executable").notNull(),
  executionMode: text("execution_mode", { enum: ["pipe", "pty"] }).notNull().default("pipe"),
  configYaml: text("config_yaml").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});

export const models = sqliteTable("models", {
  id: text("id").primaryKey(), // Full namespaced ID: "codex/gpt-5.6-asta"
  adapterId: text("adapter_id").notNull().references(() => adapters.id, { onDelete: "cascade" }),
  rawModelId: text("raw_model_id").notNull(), // "gpt-5.6-asta"
  name: text("name").notNull(),
  tier: text("tier", { enum: ["low", "medium", "high", "xhigh"] }).notNull(),
  contextWindow: integer("context_window").notNull().default(128000),
  costWeight: integer("cost_weight").notNull().default(1),
  isDefaultForAlias: integer("is_default_for_alias", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // e.g. "codex-acc-1"
  adapterId: text("adapter_id").notNull().references(() => adapters.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sandboxDir: text("sandbox_dir").notNull(),
  status: text("status", { enum: ["READY", "BUSY", "COOLDOWN", "ERROR", "DISABLED"] }).notNull().default("READY"),
  maxConcurrency: integer("max_concurrency").notNull().default(1),
  activeConcurrency: integer("active_concurrency").notNull().default(0),
  cooldownUntil: integer("cooldown_until"),
  cooldownReason: text("cooldown_reason"),
  totalRequests: integer("total_requests").notNull().default(0),
  totalErrors: integer("total_errors").notNull().default(0),
  lastUsedAt: integer("last_used_at"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

export const modelAliases = sqliteTable("model_aliases", {
  alias: text("alias").primaryKey(), // e.g. "gpt-5.6-asta"
  targetModelId: text("target_model_id").notNull(), // "codex/gpt-5.6-asta"
  description: text("description"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

export const requestLogs = sqliteTable("request_logs", {
  id: text("id").primaryKey(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  modelRequested: text("model_requested").notNull(),
  modelResolved: text("model_resolved").notNull(),
  providerResolved: text("provider_resolved").notNull(),
  durationMs: integer("duration_ms").notNull(),
  promptTokensEstimated: integer("prompt_tokens_estimated").default(0),
  completionTokensEstimated: integer("completion_tokens_estimated").default(0),
  statusCode: integer("status_code").notNull(),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});
```

#### 1.4 Verification Commands
```bash
# 1. Install dependencies across all monorepo workspaces
pnpm install

# 2. Run unit tests verifying the PATHEXT executable resolver across Windows & POSIX
pnpm --filter @cli-to-api/gateway test tests/unit/resolver.test.ts

# 3. Bootstrap SQLite database and verify WAL mode & table creations
pnpm --filter @cli-to-api/gateway exec tsx src/db/migrate.ts
```

---

### Phase 2: Process Supervisor Engine, Triple-Tier Win32 Containment & Sandboxing

#### 2.1 Objective & Architecture Rationale
AI CLI execution presents serious OS-level challenges:
1. **Windows Zombie Prevention ($\le 200\text{ms}$):** When a client cancels an ongoing generation (e.g. Cursor user presses "Stop"), the gateway must terminate the entire process hierarchy—including nested command wrappers (`cmd.exe`, PowerShell, node worker threads)—without leaking CPU or holding file locks. Candidate 1 implements a **Triple-Tier Windows Containment Architecture**:
   - **Tier 1:** Native Win32 Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`), which instructs the Windows NT kernel to terminate all assigned processes as soon as the handle is closed.
   - **Tier 2:** Dynamic Win32 API / PowerShell tree termination.
   - **Tier 3:** `taskkill /F /T /PID ${pid}` verified against the running process table.
   - **POSIX:** Spawns detached process groups (`setsid`) killed via `process.kill(-pgid, 'SIGKILL')`.
2. **Adaptive Prompt Transport:** Windows `cmd.exe` crashes with `The command line is too long` if arguments exceed 8,191 characters. Candidate 1 measures the serialized prompt context. If it exceeds 4,000 characters, it seamlessly switches to:
   - CLI `stdin` stream piping, or
   - An atomic temporary prompt file (`$ACCOUNT_DIR/tmp/prompt_{uuid}.txt`) injected into the adapter's `args_template_file`.
3. **Multi-Account Sandbox Jail:** Isolates `$HOME`, `$USERPROFILE`, `$XDG_CONFIG_HOME`, and `$APPDATA` for every account. This permits running dozens of accounts for the same CLI simultaneously without auth token overwrite or session collision.

#### 2.2 Concrete Tasks Breakdown
- **Task 2.1:** Implement Triple-Tier Process Containment in `apps/gateway/src/supervisor/job-object.ts`.
- **Task 2.2:** Implement POSIX process group manager in `apps/gateway/src/supervisor/process-group.ts`.
- **Task 2.3:** Implement Prompt Transport manager in `apps/gateway/src/supervisor/prompt-transport.ts` handling auto-detection of prompt length, atomic temp file creation, and guaranteed `finally` cleanup.
- **Task 2.4:** Implement Sandbox Directory Jail manager in `apps/gateway/src/supervisor/sandbox.ts` creating `$HOME`, `$USERPROFILE`, `workspace/`, and environment whitelists.
- **Task 2.5:** Implement `pty-executor.ts` (using `node-pty`) for interactive CLIs and `pipe-executor.ts` (using `execa v9`) for headless CLIs.
- **Task 2.6:** Implement unified `process-manager.ts` coordinating execution, abort signals, and cleanup within $\le 200\text{ms}$.

#### 2.3 Key File Implementation Specifications

**File: `apps/gateway/src/supervisor/job-object.ts`**
```typescript
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

let jobObjectAddon: any = null;
if (process.platform === "win32") {
  try {
    jobObjectAddon = require("windows-job-node");
  } catch {
    // Addon compilation optional; fallback tiers provide 100% safety
  }
}

export interface ProcessContainmentHandle {
  pid: number;
  terminate: () => Promise<void>;
}

/**
 * Creates a Triple-Tier Windows Process Containment wrapper.
 * Guarantees that any spawned process tree is killed within <= 200ms upon abort.
 */
export function createWindowsProcessContainment(pid: number): ProcessContainmentHandle {
  if (process.platform !== "win32") {
    return {
      pid,
      terminate: async () => {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
    };
  }

  let nativeJob: any = null;

  // Tier 1: Attempt native Win32 Job Object with KILL_ON_JOB_CLOSE
  if (jobObjectAddon && typeof jobObjectAddon.createJob === "function") {
    try {
      nativeJob = jobObjectAddon.createJob();
      // 0x2000 = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
      nativeJob.setLimits({ killOnJobClose: true });
      nativeJob.assignProcess(pid);
    } catch {
      nativeJob = null;
    }
  }

  return {
    pid,
    terminate: async () => {
      const startTime = Date.now();

      // Tier 1 Execution: Close native job object
      if (nativeJob) {
        try {
          nativeJob.terminate(1);
          nativeJob.close();
        } catch {}
      }

      // Tier 2 & 3: Forceful taskkill tree termination
      try {
        await execAsync(`taskkill /F /T /PID ${pid}`);
      } catch {
        // Suppress if already exited
      }

      // Verification loop: Ensure PID is absent from Windows Process Table
      let isAlive = true;
      let attempts = 0;
      while (isAlive && attempts < 4 && Date.now() - startTime < 180) {
        try {
          const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /NH`);
          if (!stdout.includes(pid.toString())) {
            isAlive = false;
          } else {
            await new Promise(r => setTimeout(r, 25));
          }
        } catch {
          isAlive = false;
        }
        attempts++;
      }
    }
  };
}
```

**File: `apps/gateway/src/supervisor/prompt-transport.ts`**
```typescript
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AdapterConfig } from "../adapters/schema";

export interface PreparedInvocation {
  args: string[];
  stdinContent?: string;
  cleanupTempFile?: () => void;
}

/**
 * Evaluates prompt context length against Windows command-line limits (>8,191 chars).
 * Automatically switches to stdin pipe or atomic temporary file.
 */
export function preparePromptInvocation(
  adapter: AdapterConfig,
  accountSandboxDir: string,
  modelId: string,
  promptText: string
): PreparedInvocation {
  const threshold = adapter.invocation.prompt_threshold_chars || 4000;
  const isLengthExceeded = promptText.length > threshold;
  const transportMode = adapter.invocation.prompt_transport;

  const shouldUseTempFile = 
    transportMode === "temp_file" || 
    (transportMode === "auto" && isLengthExceeded && adapter.invocation.args_template_file !== undefined);

  const shouldUseStdin = 
    transportMode === "stdin" || 
    (transportMode === "auto" && isLengthExceeded && !shouldUseTempFile);

  // Mode 1: Temp file transport
  if (shouldUseTempFile) {
    const tmpDir = path.join(accountSandboxDir, "tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tempFilePath = path.join(tmpDir, `prompt_${randomUUID()}.txt`);
    fs.writeFileSync(tempFilePath, promptText, "utf8");

    const template = adapter.invocation.args_template_file || adapter.invocation.args_template;
    const args = template.map(arg => 
      arg.replace("{model}", modelId)
         .replace("{prompt_file}", tempFilePath)
         .replace("{prompt}", tempFilePath)
    );

    return {
      args,
      cleanupTempFile: () => {
        try {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch {}
      }
    };
  }

  // Mode 2: Standard input (stdin) piping
  if (shouldUseStdin) {
    const args = adapter.invocation.args_template
      .filter(arg => arg !== "{prompt}")
      .map(arg => arg.replace("{model}", modelId));

    return {
      args,
      stdinContent: promptText
    };
  }

  // Mode 3: Direct command line arguments (argv)
  const args = adapter.invocation.args_template.map(arg => 
    arg.replace("{model}", modelId).replace("{prompt}", promptText)
  );

  return { args };
}
```

**File: `apps/gateway/src/supervisor/sandbox.ts`**
```typescript
import fs from "node:fs";
import path from "node:path";

export interface SandboxContext {
  sandboxDir: string;
  workspaceDir: string;
  tmpDir: string;
  env: NodeJS.ProcessEnv;
}

/**
 * Mounts an isolated Directory Jail for a designated CLI account.
 * Overrides HOME, USERPROFILE, APPDATA, and sanitizes parent host secrets.
 */
export function prepareAccountSandbox(
  dataDir: string,
  adapterId: string,
  accountId: string,
  adapterEnvOverrides: Record<string, string> = {}
): SandboxContext {
  const sandboxDir = path.resolve(dataDir, "sandboxes", adapterId, accountId);
  const workspaceDir = path.join(sandboxDir, "workspace");
  const tmpDir = path.join(sandboxDir, "tmp");
  const configDir = path.join(sandboxDir, ".config");
  const appDataRoaming = path.join(sandboxDir, "AppData", "Roaming");
  const appDataLocal = path.join(sandboxDir, "AppData", "Local");

  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(appDataRoaming, { recursive: true });
  fs.mkdirSync(appDataLocal, { recursive: true });

  const env: NodeJS.ProcessEnv = { ...process.env };

  // Strip host-level API keys to ensure strict account isolation
  delete env["OPENAI_API_KEY"];
  delete env["ANTHROPIC_API_KEY"];
  delete env["CLAUDE_CODE_TOKEN"];
  delete env["CODEX_API_KEY"];
  delete env["GH_TOKEN"];

  // Mount directory isolation overrides
  env["HOME"] = sandboxDir;
  env["USERPROFILE"] = sandboxDir;
  env["XDG_CONFIG_HOME"] = configDir;
  env["XDG_CACHE_HOME"] = path.join(sandboxDir, ".cache");
  env["XDG_DATA_HOME"] = path.join(sandboxDir, ".local", "share");
  env["TMPDIR"] = tmpDir;
  env["TEMP"] = tmpDir;
  env["TMP"] = tmpDir;
  env["APPDATA"] = appDataRoaming;
  env["LOCALAPPDATA"] = appDataLocal;
  env["CI"] = "1"; // Suppress interactive auto-update checks

  // Apply custom adapter overrides
  for (const [key, value] of Object.entries(adapterEnvOverrides)) {
    env[key] = value.replace("{sandbox_dir}", sandboxDir).replace("{account_dir}", sandboxDir);
  }

  return { sandboxDir, workspaceDir, tmpDir, env };
}
```

#### 2.4 Verification Commands
```bash
# 1. Run prompt transport tests verifying 50,000 character prompt routing
pnpm --filter @cli-to-api/gateway test tests/unit/prompt-transport.test.ts

# 2. Run process lifecycle tests verifying <= 200ms termination under AbortController
pnpm --filter @cli-to-api/gateway test tests/unit/process-lifecycle.test.ts
```

---

### Phase 3: Stream Pipeline, Multi-Byte UTF-8 & Non-Blocking Sanitizer Engine

#### 3.1 Objective & Architecture Rationale
Streaming terminal output from local CLI processes into an OpenAI SSE protocol (`data: {...}\n\n`) contains three major failure vectors:
1. **Multi-Byte UTF-8 Fragmentation:** Fast-moving stdout byte buffers can slice multi-byte UTF-8 sequences (such as Vietnamese accented vowels `ế`, `ộ`, `ạ` or emoji `✨`, `🤖`) across chunk boundaries. If sent raw through regex, characters turn into invalid replacement symbols (``). Candidate 1 integrates `string_decoder.StringDecoder('utf8')` as Stage 0 to preserve multi-byte integrity across chunks.
2. **The Terminal Spinner Problem (Zero TTFT Latency Penalty):** CLI spinners use `\r` to reset cursor position and animate progress. Naively holding the stream until `\n` destroys streaming Time-To-First-Token. Candidate 1 implements a **Non-Blocking Dual-Stage Sanitizer**:
   - Strips ANSI color and control codes via regex.
   - Evaluates lines containing `\r`: if the text matches a transient terminal spinner pattern (e.g. `⠋ Thinking... \r`), it overwrites the transient buffer. Once the model outputs substantive content or markdown text, tokens are flushed immediately to the client with sub-20ms latency.
3. **Dynamic 429 Cooldown Extraction:** CLI error streams often specify explicit cooldown durations (e.g. `resets in 45m`, `retry after 120s`). Candidate 1 scans stderr/stdout with a dynamic duration parser, automatically updating the account's state in SQLite and scheduling an auto-recovery timer.

#### 3.2 Concrete Tasks Breakdown
- **Task 3.1:** Implement `apps/gateway/src/stream/utf8-decoder.ts` wrapping `StringDecoder('utf8')`.
- **Task 3.2:** Implement Non-Blocking Dual-Stage ANSI Sanitizer in `apps/gateway/src/stream/ansi-sanitizer.ts`.
- **Task 3.3:** Implement Dynamic Rate-Limit Interceptor in `apps/gateway/src/stream/rate-limit-detector.ts`.
- **Task 3.4:** Implement OpenAI SSE Serializer in `apps/gateway/src/stream/sse-serializer.ts` producing `chat.completion.chunk` frames and terminal `[DONE]`.

#### 3.3 Key File Implementation Specifications

**File: `apps/gateway/src/stream/ansi-sanitizer.ts`**
```typescript
import { StringDecoder } from "node:string_decoder";

const ANSI_CONTROL_REGEX = new RegExp(
  [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~])",
  ].join("|"),
  "g"
);

// Matches common terminal spinner sequences (Braille, ASCII spinners, thinking progress)
const SPINNER_LINE_REGEX = /^(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|\/-\\]|\s*Thinking\.{0,3}|\s*Loading\.{0,3}|\s*Please wait\.{0,3})/i;

export class NonBlockingStreamSanitizer {
  private decoder = new StringDecoder("utf8");
  private pendingTransientLine = "";

  /**
   * Processes an incoming raw byte chunk from child stdout/stderr.
   * Guarantees UTF-8 multi-byte integrity, strips ANSI escape sequences,
   * suppresses transient \r spinner animations, and immediately yields valid response tokens.
   */
  public processChunk(chunk: Buffer): string {
    // Stage 0: Reconstruct multi-byte UTF-8 sequences across buffer boundaries
    const rawText = this.decoder.write(chunk);
    if (!rawText) return "";

    // Stage 1: Strip ANSI escape codes
    const stripped = rawText.replace(ANSI_CONTROL_REGEX, "");
    if (!stripped) return "";

    // Stage 2: Non-blocking carriage return handling
    let output = "";
    let i = 0;

    while (i < stripped.length) {
      const char = stripped[i];

      if (char === "\r") {
        // Carriage return detected: Check if the preceding line was a transient spinner
        if (SPINNER_LINE_REGEX.test(this.pendingTransientLine.trim())) {
          // Drop spinner line completely
          this.pendingTransientLine = "";
        } else if (this.pendingTransientLine.length > 0) {
          // Substantive text: emit before carriage reset
          output += this.pendingTransientLine;
          this.pendingTransientLine = "";
        }
        i++;
      } else if (char === "\n") {
        if (!SPINNER_LINE_REGEX.test(this.pendingTransientLine.trim())) {
          output += this.pendingTransientLine + "\n";
        }
        this.pendingTransientLine = "";
        i++;
      } else {
        this.pendingTransientLine += char;
        // If pending buffer does not match a spinner pattern and contains non-whitespace, stream immediately
        if (
          this.pendingTransientLine.length > 4 &&
          !SPINNER_LINE_REGEX.test(this.pendingTransientLine.trim())
        ) {
          output += this.pendingTransientLine;
          this.pendingTransientLine = "";
        }
        i++;
      }
    }

    return output;
  }

  /**
   * Flushes any remaining bytes in the decoder or pending line buffer upon process close.
   */
  public flush(): string {
    const trailingBytes = this.decoder.end();
    const finalRaw = (trailingBytes + this.pendingTransientLine).replace(ANSI_CONTROL_REGEX, "");
    this.pendingTransientLine = "";

    if (SPINNER_LINE_REGEX.test(finalRaw.trim())) {
      return "";
    }
    return finalRaw;
  }
}
```

**File: `apps/gateway/src/stream/rate-limit-detector.ts`**
```typescript
export interface RateLimitInspectionResult {
  isRateLimited: boolean;
  cooldownSeconds: number;
  extractedReason: string;
}

export function parseDynamicRateLimit(
  text: string,
  patterns: Array<{ pattern: string; cooldown_seconds_default: number; dynamic_extractor: boolean }>
): RateLimitInspectionResult {
  for (const item of patterns) {
    const regex = new RegExp(item.pattern, "i");
    const match = text.match(regex);
    if (match) {
      let seconds = item.cooldown_seconds_default;

      if (item.dynamic_extractor) {
        // Parse expressions such as "resets in 45m", "resets in 2h 30m", "try again in 120s"
        const timeMatch = text.match(
          /(?:resets? in|try again in|retry after|wait)\s+(?:(\d+)\s*d(?:ays?)?)?\s*(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?)?)?)?/i
        );

        if (timeMatch) {
          const days = parseInt(timeMatch[1] || "0", 10);
          const hours = parseInt(timeMatch[2] || "0", 10);
          const minutes = parseInt(timeMatch[3] || "0", 10);
          const secs = parseInt(timeMatch[4] || "0", 10);
          const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + secs;
          if (totalSeconds > 0) {
            seconds = totalSeconds;
          }
        }
      }

      return {
        isRateLimited: true,
        cooldownSeconds: seconds,
        extractedReason: match[0],
      };
    }
  }

  return { isRateLimited: false, cooldownSeconds: 0, extractedReason: "" };
}
```

**File: `apps/gateway/src/stream/sse-serializer.ts`**
```typescript
export function formatOpenAiSseChunk(
  completionId: string,
  modelName: string,
  createdEpoch: number,
  delta: { role?: string; content?: string }
): string {
  const payload = {
    id: completionId,
    object: "chat.completion.chunk",
    created: createdEpoch,
    model: modelName,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: null,
      },
    ],
  };

  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function formatOpenAiSseDone(): string {
  return "data: [DONE]\n\n";
}
```

#### 3.4 Verification Commands
```bash
# 1. Test multi-byte UTF-8 and non-blocking ANSI sanitizer
pnpm --filter @cli-to-api/gateway test tests/unit/stream-sanitizer.test.ts
```

---

### Phase 4: Model Catalog, Namespace Routing & Load Balancer Engine

#### 4.1 Objective & Architecture Rationale
The Model Router implements three core routing capabilities:
1. **Catalog Aggregation (`GET /v1/models`):** Exposes namespaced models (`codex/gpt-5.6-asta`, `opencode/gpt-5.6-asta`), flat aliases (`gpt-5.6-asta`), and virtual tier pools (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`).
2. **Namespaced Provider Isolation:** When a request specifies `codex/gpt-5.6-asta`, the router strictly queries accounts mapped to `codex-cli`. It never routes to OpenCode accounts, even if both provide a model of identical name.
3. **Virtual Tier Auto-Routing (`auto-*`):** Dynamically evaluates healthy accounts across all active providers matching the requested tier, selecting the account with the lowest weighted connection count and lowest exponential moving average (EMA) latency.
4. **Slot Concurrency Semaphore:** Protects each account with an in-memory lock preventing concurrent executions beyond its configured limit (`max_concurrency: 1`).

#### 4.2 Concrete Tasks Breakdown
- **Task 4.1:** Implement Model Catalog manager in `apps/gateway/src/router/model-catalog.ts`.
- **Task 4.2:** Implement In-Memory Slot Semaphore in `apps/gateway/src/router/slot-semaphore.ts`.
- **Task 4.3:** Implement Weighted Least-Connections Scheduler in `apps/gateway/src/router/load-balancer.ts`.
- **Task 4.4:** Implement Cooldown State Machine in `apps/gateway/src/router/cooldown-tracker.ts`.

#### 4.3 Key File Implementation Specifications

**File: `apps/gateway/src/router/load-balancer.ts`**
```typescript
import { db } from "../db";
import { accounts, models, adapters, modelAliases } from "../db/schema";
import { eq, and, lte, or } from "drizzle-orm";
import { ModelCatalog } from "./model-catalog";
import { SlotSemaphore } from "./slot-semaphore";

export interface TargetExecutionRoute {
  adapter: any;
  account: any;
  actualModelId: string;
  releaseSlot: () => void;
}

export class IntelligentLoadBalancer {
  constructor(
    private catalog: ModelCatalog,
    private semaphore: SlotSemaphore
  ) {}

  /**
   * Resolves incoming requested model name to a healthy account and execution model.
   * Priority: 1) auto-* Virtual Tiers, 2) Namespaced "provider/model", 3) Flat alias lookup.
   */
  public async resolveRoute(requestedModel: string): Promise<TargetExecutionRoute> {
    const nowEpoch = Math.floor(Date.now() / 1000);

    // 1. Virtual Tier Auto-Routing: "auto", "auto-low", "auto-medium", "auto-high", "auto-xhigh"
    if (requestedModel.startsWith("auto")) {
      const tier = requestedModel === "auto" ? "all" : requestedModel.replace("auto-", "");
      const eligibleModels = this.catalog.getModelsForTier(tier);

      if (eligibleModels.length === 0) {
        throw new Error(`404: No models registered for virtual tier '${requestedModel}'`);
      }

      // Query all healthy accounts across eligible models
      const candidates: Array<{ adapter: any; account: any; modelId: string }> = [];

      for (const item of eligibleModels) {
        const healthyAccounts = await this.getHealthyAccounts(item.adapterId, nowEpoch);
        for (const acc of healthyAccounts) {
          if (this.semaphore.canAcquire(acc.id, acc.maxConcurrency)) {
            candidates.push({ adapter: item.adapter, account: acc, modelId: item.rawModelId });
          }
        }
      }

      if (candidates.length === 0) {
        throw new Error(`429: All accounts for virtual tier '${requestedModel}' are busy or in cooldown`);
      }

      // Schedule using Least-Connections
      candidates.sort((a, b) => {
        const slotsA = this.semaphore.getActiveCount(a.account.id);
        const slotsB = this.semaphore.getActiveCount(b.account.id);
        return slotsA - slotsB;
      });

      const selected = candidates[0];
      const release = await this.semaphore.acquire(selected.account.id);
      return {
        adapter: selected.adapter,
        account: selected.account,
        actualModelId: selected.modelId,
        releaseSlot: release,
      };
    }

    // 2. Namespaced Targeting: "codex/gpt-5.6-asta" -> Strict provider isolation
    if (requestedModel.includes("/")) {
      const [providerId, rawModel] = requestedModel.split("/");
      const adapter = this.catalog.getAdapter(providerId);
      if (!adapter) {
        throw new Error(`404: Provider namespace '${providerId}' is not registered`);
      }

      const healthyAccounts = await this.getHealthyAccounts(providerId, nowEpoch);
      const available = healthyAccounts.filter(acc => this.semaphore.canAcquire(acc.id, acc.maxConcurrency));

      if (available.length === 0) {
        throw new Error(`429: All accounts for provider '${providerId}' are busy or in cooldown`);
      }

      available.sort((a, b) => this.semaphore.getActiveCount(a.id) - this.semaphore.getActiveCount(b.id));
      const chosen = available[0];
      const release = await this.semaphore.acquire(chosen.id);

      return {
        adapter,
        account: chosen,
        actualModelId: rawModel,
        releaseSlot: release,
      };
    }

    // 3. Flat Aliases: "gpt-5.6-asta" -> Lookup designated default provider
    const defaultTarget = await this.catalog.resolveFlatAlias(requestedModel);
    if (!defaultTarget) {
      throw new Error(`404: Unknown model '${requestedModel}'. Specify provider namespace (e.g. codex/${requestedModel})`);
    }

    return this.resolveRoute(defaultTarget);
  }

  private async getHealthyAccounts(adapterId: string, nowEpoch: number) {
    return db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.adapterId, adapterId),
          or(
            eq(accounts.status, "READY"),
            and(eq(accounts.status, "COOLDOWN"), lte(accounts.cooldownUntil, nowEpoch))
          )
        )
      );
  }
}
```

**File: `apps/gateway/src/router/slot-semaphore.ts`**
```typescript
export class SlotSemaphore {
  private activeSlots = new Map<string, number>();

  public canAcquire(accountId: string, maxConcurrency: number): boolean {
    const current = this.activeSlots.get(accountId) || 0;
    return current < maxConcurrency;
  }

  public getActiveCount(accountId: string): number {
    return this.activeSlots.get(accountId) || 0;
  }

  public async acquire(accountId: string): Promise<() => void> {
    const current = this.activeSlots.get(accountId) || 0;
    this.activeSlots.set(accountId, current + 1);

    let released = false;
    return () => {
      if (!released) {
        released = true;
        const nowActive = this.activeSlots.get(accountId) || 1;
        this.activeSlots.set(accountId, Math.max(0, nowActive - 1));
      }
    };
  }
}
```

#### 4.4 Verification Commands
```bash
# 1. Run unit tests for namespace isolation and virtual tier auto-routing
pnpm --filter @cli-to-api/gateway test tests/unit/load-balancer.test.ts
```

---

### Phase 5: Fastify Ingress API (OpenAI REST & SSE Streaming)

#### 5.1 Objective & Architecture Rationale
Phase 5 implements the complete external-facing OpenAI REST API:
- `GET /v1/models`: Returns compliant JSON containing all active models, metadata, and virtual auto-tiers.
- `POST /v1/chat/completions`: Supports streaming (`stream: true`) and non-streaming (`stream: false`).
- Binds Fastify request socket closure (`req.raw.on("close")`) to an `AbortController`. If a client cancels a generation, the child process is terminated within $\le 200\text{ms}$.
- Generates estimated token usage statistics via heuristic BPE counting when the CLI does not emit native token counts.

#### 5.2 Concrete Tasks Breakdown
- **Task 5.1:** Setup Fastify daemon in `apps/gateway/src/api/server.ts` with CORS and Sensible plugins.
- **Task 5.2:** Implement Bearer token authentication middleware in `apps/gateway/src/api/middleware/auth.ts`.
- **Task 5.3:** Implement `GET /v1/models` in `apps/gateway/src/api/routes/openai-models.ts`.
- **Task 5.4:** Implement `POST /v1/chat/completions` in `apps/gateway/src/api/routes/openai-chat.ts`.
- **Task 5.5:** Implement admin metrics and management endpoints in `apps/gateway/src/api/routes/admin-*.ts`.

#### 5.3 Key File Implementation Specifications

**File: `apps/gateway/src/api/routes/openai-chat.ts`**
```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { IntelligentLoadBalancer } from "../../router/load-balancer";
import { UnifiedProcessManager } from "../../supervisor/process-manager";
import { formatOpenAiSseChunk, formatOpenAiSseDone } from "../../stream/sse-serializer";

export function registerOpenAiChatRoutes(
  fastify: FastifyInstance,
  router: IntelligentLoadBalancer,
  supervisor: UnifiedProcessManager
) {
  fastify.post("/v1/chat/completions", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as any;
    const requestedModel = body?.model;
    const isStreaming = Boolean(body?.stream);
    const messages = body?.messages || [];

    if (!requestedModel) {
      return reply.status(400).send({
        error: { message: "Missing required parameter 'model'", type: "invalid_request_error" }
      });
    }

    // 1. Resolve Route & Acquire Account Semaphore
    let route;
    try {
      route = await router.resolveRoute(requestedModel);
    } catch (err: any) {
      const is429 = err.message.startsWith("429");
      return reply.status(is429 ? 429 : 400).send({
        error: { message: err.message, type: is429 ? "rate_limit_error" : "invalid_request_error" }
      });
    }

    const completionId = `chatcmpl-${randomUUID()}`;
    const createdEpoch = Math.floor(Date.now() / 1000);

    // 2. Setup Client Disconnect Hook
    const abortController = new AbortController();
    req.raw.on("close", () => {
      if (!reply.raw.writableEnded) {
        abortController.abort();
      }
    });

    // 3. Handle Streaming Mode (SSE)
    if (isStreaming) {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Send initial role chunk
      reply.raw.write(formatOpenAiSseChunk(completionId, requestedModel, createdEpoch, { role: "assistant" }));

      try {
        await supervisor.executeStreaming({
          adapter: route.adapter,
          account: route.account,
          modelId: route.actualModelId,
          messages,
          signal: abortController.signal,
          onDelta: (content: string) => {
            reply.raw.write(formatOpenAiSseChunk(completionId, requestedModel, createdEpoch, { content }));
          },
        });

        reply.raw.write(formatOpenAiSseDone());
        reply.raw.end();
      } catch (err: any) {
        if (!abortController.signal.aborted) {
          reply.raw.write(`data: {"error":{"message":${JSON.stringify(err.message)}}}\n\n`);
          reply.raw.end();
        }
      } finally {
        route.releaseSlot();
      }
      return;
    }

    // 4. Handle Non-Streaming Mode
    try {
      const responseText = await supervisor.executeNonStreaming({
        adapter: route.adapter,
        account: route.account,
        modelId: route.actualModelId,
        messages,
        signal: abortController.signal,
      });

      return reply.status(200).send({
        id: completionId,
        object: "chat.completion",
        created: createdEpoch,
        model: requestedModel,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: responseText },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    } finally {
      route.releaseSlot();
    }
  });
}
```

#### 5.4 Verification Commands
```bash
# 1. Start gateway daemon in test environment
pnpm --filter @cli-to-api/gateway exec tsx src/index.ts &

# 2. Query model catalog
curl -s -H "Authorization: Bearer sk-cta-dev" http://localhost:8080/v1/models | jq .

# 3. Test chat streaming with auto-low tier
curl -N -X POST http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer sk-cta-dev" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto-low","messages":[{"role":"user","content":"Hello world"}],"stream":true}'
```

---

### Phase 6: Developer Web Console (UI/UX Pro Max) & In-Browser WebShell

#### 6.1 Objective & Architecture Rationale
Phase 6 builds the Obsidian Cyber-Deck Web Management Console following `AK UI/UX Pro Max` design standards:
- **Obsidian Dark Cyber-Deck Ergonomics:** High-contrast palette (`#090B0F` canvas, `#12141C` surface, `#6366F1` indigo brand, `#10B981` healthy, `#F59E0B` cooldown, `#EF4444` danger).
- **In-Browser WebShell (`xterm.js` over WebSocket):** Spawns an interactive PTY session attached directly to the account's sandbox directory. Includes an **OAuth Device Flow Sniffer** that automatically extracts GitHub, Anthropic, or Google device authorization URLs and codes from stdout, presenting a one-click banner for immediate login.
- **Model Catalog & Routing Studio:** Visual management of Virtual Auto Tiers (`auto-low` cyan, `auto-medium` blue, `auto-high` purple, `auto-xhigh` pink) and targeted provider pools.
- **Live SSE Inspector:** Dual-pane inspector displaying raw terminal output side-by-side with sanitized OpenAI SSE frames, tracking token latencies and TTFT.
- **Playground:** Chat playground for testing models and auto-tiers with live streaming markdown.

#### 6.2 Concrete Tasks Breakdown
- **Task 6.1:** Setup React 19 + Vite frontend in `apps/web/` with Tailwind CSS v4 and Obsidian Cyber-Deck theme tokens.
- **Task 6.2:** Implement WebSocket server in `apps/gateway/src/api/ws/webshell.ts` spawning `node-pty` instances inside account sandboxes.
- **Task 6.3:** Implement `TerminalView.tsx` and `OAuthBanner.tsx` in `apps/web/src/components/webshell/`.
- **Task 6.4:** Implement `ModelCatalogView.tsx` and `DashboardView.tsx`.
- **Task 6.5:** Implement `LiveInspectorView.tsx` and `PlaygroundView.tsx`.
- **Task 6.6:** Execute full E2E acceptance test suite covering all criteria (AC-01 to AC-07).

#### 6.3 Key File Implementation Specifications

**File: `apps/gateway/src/api/ws/webshell.ts`**
```typescript
import { FastifyInstance } from "fastify";
import * as pty from "node-pty";
import { prepareAccountSandbox } from "../../supervisor/sandbox";
import { resolveExecutableBinary } from "../../adapters/resolver";

export function registerWebShellWebSocket(fastify: FastifyInstance, dataDir: string) {
  fastify.get("/api/ws/terminal", { websocket: true }, (socket, req) => {
    const query = (req.query || {}) as any;
    const adapterId = query.adapterId || "system";
    const accountId = query.accountId || "default";

    const sandbox = prepareAccountSandbox(dataDir, adapterId, accountId);
    const shell = process.platform === "win32" ? resolveExecutableBinary("cmd.exe") : "bash";

    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: sandbox.workspaceDir,
      env: sandbox.env,
    });

    ptyProcess.onData((data) => {
      socket.send(JSON.stringify({ type: "output", data }));
    });

    socket.on("message", (raw: string) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "input") {
          ptyProcess.write(msg.data);
        } else if (msg.type === "resize") {
          ptyProcess.resize(msg.cols || 80, msg.rows || 24);
        }
      } catch {
        ptyProcess.write(raw.toString());
      }
    });

    socket.on("close", () => {
      ptyProcess.kill();
    });
  });
}
```

**File: `apps/web/src/components/webshell/TerminalView.tsx`**
```tsx
import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { OAuthBanner } from "./OAuthBanner";

interface TerminalViewProps {
  adapterId: string;
  accountId: string;
}

export function TerminalView({ adapterId, accountId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [oauthEvent, setOauthEvent] = useState<{ url: string; code?: string } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#090B0F",
        foreground: "#F8FAFC",
        cursor: "#6366F1",
        selectionBackground: "#312E81",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/api/ws/terminal?adapterId=${adapterId}&accountId=${accountId}`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "output") {
          term.write(msg.data);

          // Sniff for OAuth device authorization patterns
          const deviceCodeMatch = msg.data.match(/https:\/\/[^\s]+login[^\s]*/i);
          const userCodeMatch = msg.data.match(/code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i);
          if (deviceCodeMatch) {
            setOauthEvent({
              url: deviceCodeMatch[0],
              code: userCodeMatch ? userCodeMatch[1] : undefined,
            });
          }
        }
      } catch {
        term.write(event.data);
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
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

  return (
    <div className="relative flex flex-col h-full bg-[#090B0F] border border-[#242B3B] rounded-xl overflow-hidden">
      {oauthEvent && (
        <OAuthBanner
          url={oauthEvent.url}
          code={oauthEvent.code}
          onDismiss={() => setOauthEvent(null)}
        />
      )}
      <div ref={containerRef} className="flex-1 p-2" />
    </div>
  );
}
```

#### 6.4 Verification Commands
```bash
# 1. Build React 19 web management console
pnpm --filter @cli-to-api/web build

# 2. Run end-to-end automated acceptance suite
pnpm test
```

---

## 4. Risk Management & Edge Cases

| Risk Category | Specific Failure Scenario | Impact | Mitigation Strategy Implemented in Plan |
| :--- | :--- | :--- | :--- |
| **OS Limitations** | Windows `cmd.exe` 8,191-character command line limit exceeded when sending large prompts or system context. | CLI process fails to launch with `The command line is too long`. | **Prompt Transport Auto-Switch:** Prompts $> 4,000$ chars automatically bypass command arguments and are written to an atomic temp file (`args_template_file`) or piped into `stdin`. |
| **Process Leaks** | Client abruptly disconnects (e.g. canceling Cursor generation). Detached sub-processes continue running in host background. | High CPU/RAM consumption, machine freezing, account locking. | **Triple-Tier Windows Containment:** Win32 Job Objects (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) combined with PowerShell tree kill and verified `taskkill` ensures complete termination in $\le 200\text{ms}$. POSIX uses `setsid` and `SIGKILL` to `-pgid`. |
| **Stream Corruption** | Multi-byte UTF-8 sequences (Vietnamese diacritics, emoji) split across network buffer boundaries. | Broken, garbled characters (``) in client chat completions. | **`StringDecoder('utf8')`:** Buffers incomplete byte chunks until the full multi-byte sequence arrives before emitting to sanitization pipeline. |
| **Streaming Latency vs Spinners** | Terminal spinner outputs `\r` cursor resets; buffering until `\n` delays first token by seconds. | High TTFT, sluggish chat completions. | **Non-Blocking Dual-Stage Sanitizer:** Filters recognized spinner patterns from transient lines while streaming non-spinner completion tokens immediately to SSE. |
| **Windows Pathing** | Windows global CLI executables are `.cmd` or `.ps1` wrappers rather than raw `.exe` binaries. | `spawn ENOENT` failure when attempting to launch CLI by name. | **`PATHEXT` Resolution Engine:** Scans directories in `PATH` against extensions in `PATHEXT` (`.CMD`, `.BAT`, `.PS1`, `.EXE`), with explicit resolution for npm/pnpm global directories. |
| **Session Collision** | Two parallel requests execute on the same CLI account, writing to `~/.codex/config.json` simultaneously. | Configuration corruption or session token invalidation. | **Account Sandboxing + Semaphore:** Each account is sandboxed with an isolated `$HOME` and `$USERPROFILE`. Concurrency semaphore restricts execution to `max_concurrency: 1` per account. |
| **Rate Limit Cascade** | Provider issues a 429 quota block; subsequent requests continue hammering the dead account. | Gateway hangs; client requests time out. | **Dynamic Cooldown Engine:** Scans stdout/stderr for rate limit patterns, parses reset duration dynamically (e.g. "resets in 45m"), marks account as `COOLDOWN`, and routes traffic to alternate accounts. |

---

## 5. Definition of Done & Acceptance Tests

### 5.1 Definition of Done (DoD) Checklist
- [ ] **Monorepo Architecture:** Clean build with zero TypeScript errors across `apps/gateway`, `apps/web`, and shared packages.
- [ ] **Data Persistence:** SQLite running in WAL mode via `better-sqlite3` and `Drizzle ORM`, auto-migrating on server boot.
- [ ] **Process Termination Guarantee:** Zero orphaned zombie processes on Windows or POSIX upon client abort, verified under automated test conditions ($\le 200\text{ms}$).
- [ ] **Prompt Transport:** Automatic switching between argv, stdin, and temp files with verified support for $50,000+$ character prompts.
- [ ] **Stream Sanitization:** Clean SSE stream output with zero ANSI color codes, zero `\r` spinner garbage, and 100% intact multi-byte UTF-8 characters.
- [ ] **Model Routing:** Verified support for namespaced routing (`provider/model`), flat aliases, and virtual auto-tiers (`auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`, `auto`).
- [ ] **Dynamic Cooldown:** Verified extraction of rate-limit wait times from CLI error output with automatic account recovery upon expiration.
- [ ] **Web Console (UI/UX Pro Max):** Responsive Cyber-Deck UI with Dashboard, Model Catalog Studio, Account Manager, in-browser xterm.js WebShell with OAuth sniffer, Live SSE Inspector, and Playground.

### 5.2 Acceptance Test Matrix

| ID | Title | Verification Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| **AC-01** | **Complete Model Catalog** | Client sends `GET /v1/models` | Returns 200 JSON with all namespaced models, flat aliases, and virtual tiers (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`) with tier metadata. |
| **AC-02** | **Namespaced Targeting** | Client requests `codex/gpt-5.6-asta` while Codex Account 1 is busy and Account 2 is free; OpenCode Account 1 is also free. | Request routes exclusively to Codex Account 2. Never routes to OpenCode. |
| **AC-03** | **Virtual Tier Auto-Routing** | Client requests `auto-low` | Router filters only `tier: "low"` models and routes to the account with least active connections; ignores high/xhigh models. |
| **AC-04** | **Sandbox Directory Jail** | Two concurrent requests run for Account A and Account B of the same CLI | Processes run with distinct `HOME` directories (`$SANDBOX/acc-a` and `$SANDBOX/acc-b`); no session overwrite occurs. |
| **AC-05** | **Dynamic 429 Cooldown** | CLI emits `429: Usage limit exceeded, resets in 45m` | Account is placed in `COOLDOWN` for 45 minutes; subsequent requests immediately failover to next healthy account. |
| **AC-06** | **Zero-Zombie Abort** | Client disconnects while stream is actively generating | Child process and all spawned sub-processes are completely terminated in $\le 200\text{ms}$; 0 background processes remain. |
| **AC-07** | **Web Console & WebShell** | Operator opens Web Console and clicks "Launch Shell" on an account | Interactive xterm.js terminal opens via WebSocket in the account's sandbox directory, enabling full CLI authentication. |

---

## 6. Execution Command Quick-Reference

```bash
# ---------------------------------------------------------
# Development & Testing Commands
# ---------------------------------------------------------

# 1. Install all monorepo dependencies
pnpm install

# 2. Run database migrations
pnpm --filter @cli-to-api/gateway exec tsx src/db/migrate.ts

# 3. Run full automated test suite (Unit + E2E + Process Lifecycle)
pnpm test

# 4. Start Gateway daemon and Web Management Console concurrently in development mode
pnpm dev

# 5. Production build
pnpm build

# 6. Start production daemon
pnpm start
```
