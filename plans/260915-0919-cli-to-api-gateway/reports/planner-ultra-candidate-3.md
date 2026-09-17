# Implementation Plan: Universal AI CLI to OpenAI API Gateway & Obsidian Cyber-Deck Console (`cli-to-api`)

**Candidate:** Candidate 3 (Planner 3)  
**Document ID:** `plans/260915-0919-cli-to-api-gateway/reports/planner-ultra-candidate-3.md`  
**Target Project:** `cli-to-api`  
**Execution Target:** Production-Grade AI CLI Reverse-Proxy Gateway & Obsidian Cyber-Deck Developer Web Console  
**Standard:** Ultra Plan (`ak-plan --ultra`)  
**Design Standard:** AK UI/UX Pro Max (`/skill:ak-ui-ux-pro-max`, Obsidian Cyber-Deck Developer Standard)  
**Target Runtime:** Node.js 22 LTS | Fastify v5 | Drizzle ORM + SQLite WAL | React 19 | Tailwind CSS v4 | xterm.js  
**Target Environments:** Windows 11 (Win32 ConPTY, Job Objects, PowerShell/cmd.exe) & POSIX (Linux, macOS, setsid, Process Groups)

---

## 1. Executive Summary & Overview

### 1.1 Mission Statement & Architectural Principles
`cli-to-api` is an enterprise-grade, local-first reverse-proxy API daemon designed to run natively on developer workstations and edge dev-servers. It transforms any user-installed AI Command-Line Interface (CLI)—such as `@anthropic-ai/claude-code`, `codex-cli`, `opencode`, `grok-cli`, `gemini-cli`, `ollama`, or arbitrary custom tools like `devin` and `omp`—into a 100% compliant OpenAI REST & Server-Sent Events (SSE) Streaming API endpoint (`/v1/chat/completions`, `/v1/models`).

The architecture strictly adheres to an **Agnostic Bridge Philosophy**:
- The daemon never downloads unauthorized binary packages or executes package managers behind the user's back.
- The developer retains total sovereignty over their CLI tools, credentials, and installations.
- The gateway acts as an intelligent supervisor, orchestrating CLI tools as isolated child worker processes in a multi-tenant sandbox, normalizing their distinct stdin/stdout streams, terminal escapes, and authentication contexts into a seamless OpenAI interface compatible with Cursor, Continue.dev, LibreChat, Open WebUI, and official SDKs.

### 1.2 Candidate 3 Architectural Core: Blueprint-Instance Separation & Reactive Discovery
Prior iterations of CLI gateways suffered from a critical design flaw: coupling static YAML adapter declarations directly with database account instantiation on boot. When the gateway launches, it blindly creates default accounts in SQLite and disk folders for tools that are not actually installed on the workstation. This defect introduces three major failure modes:
1. **Phantom Accounts & Ghost Sandboxes:** Uninstalled tools receive account records with `status = "READY"`, creating disk clutter and confusing load balancers into routing virtual tiers (`auto`, `auto-xhigh`) to missing executables.
2. **Opaque Host Presence:** Systems cannot determine if a CLI binary is truly executable on `PATH` across Windows (`.cmd`, `.bat`, `.ps1`, `.exe`, Scoop, pnpm, npm) versus POSIX (`/usr/local/bin`, Homebrew, Cargo).
3. **Inflexible Extensibility:** Adding arbitrary new CLIs requires hardcoding files in repository roots rather than dynamic registration, runtime probing, and user-space configuration.

**Candidate 3 introduces the Blueprint-Instance Separation Architecture with Reactive Discovery:**
- **Adapter Blueprint:** An immutable capability specification (arguments, execution mode, context windows, model mappings, and rate-limit regex patterns). Blueprints can be pre-bundled or placed into `$DATA_DIR/adapters/*.yaml`.
- **Reactive Dynamic Prober:** An asynchronous probe engine inspecting host `PATH`, `PATHEXT`, package-manager shims, and version outputs to classify blueprints as `INSTALLED`, `NOT_INSTALLED`, or `DEGRADED`.
- **Guarded Account Instances:** Runtime credentials, isolated `$DATA_DIR/sandboxes/{adapter}/{account}` directory jails, and slot semaphores are provisioned **exclusively** for verified `INSTALLED` adapters.
- **Projected Model Catalog:** `GET /v1/models` and virtual auto-tiers (`auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`, `auto`) dynamically project only dispatchable capabilities backed by installed executables with healthy accounts.

### 1.3 Key Performance & Reliability Metrics
| Dimension | Target Metric | Engineering Enforcement |
| :--- | :--- | :--- |
| **Zombie Process Lifetime** | $\le 200\text{ms}$ upon client disconnect | Win32 Job Objects (`KILL_ON_JOB_CLOSE`) & POSIX Process Groups (`setsid` + `-pgid` `SIGKILL`) |
| **Stream Chunk Latency** | $\le 5\text{ms}$ added jitter | `StringDecoder('utf8')` multibyte reconstruction + rolling `\r` non-blocking buffer |
| **Windows Argv Length** | 0% overflow crashes ($>8,191$ chars) | Automatic switch to atomic temporary files (`temp_file`) or piped `stdin` when prompt $\ge 4,000$ chars |
| **Windows Binary Discovery** | 100% resolution for `.cmd`, `.bat`, `.ps1`, `.exe` | Recursive `PATH` and `PATHEXT` inspection with package-manager fallback search |
| **Phantom Account Clutter** | 0 phantom rows / 0 ghost folders | Decoupled Reactive Discovery Prober preventing uninstalled adapter instantiation |
| **UI Rendering Performance** | Stable 60 FPS under active streaming | Virtualized log arrays, hardware-accelerated WebGL xterm.js, and CSS-driven neon pulses |
| **Accessibility Compliance** | 100% WCAG 2.1 Level AA / AAA | $\ge 7:1$ high-contrast ratios, complete keyboard navigation, aria-live stream status announcements |

---

## 2. System Architecture

### 2.1 Complete Subsystem Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                             CLIENT LAYER                                               │
│             Cursor IDE / Continue.dev / Open WebUI / LangChain / SDKs (Bearer sk-cta-...)              │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │ POST /v1/chat/completions (stream: true)
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               FASTIFY GATEWAY RUNTIME (Node.js 22 LTS)                                 │
│                                                                                                        │
│  ┌──────────────────────────┐  ┌──────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ 1. Ingress & Auth Guard  │  │ 2. Router & Tier Matcher         │  │ 3. Account Pool & Balancer   │  │
│  │    • Bearer sk-cta-...   │  │    • Namespace (codex/gpt-5)     │  │    • Least-Connections       │  │
│  │    • Schema Validation   │  │    • Virtual Tiers (auto-high)   │  │    • Slot Semaphore (ACID)   │  │
│  │    • Rate Limit Intercept│  │    • Projected Model Filtering   │  │    • Cooldown Recovery Timer │  │
│  └──────────────────────────┘  └──────────────────────────────────┘  └──────────────────────────────┘  │
│                                                    │                                                   │
│  ┌─────────────────────────────────────────────────▼────────────────────────────────────────────────┐  │
│  │ 4. Candidate 3 Blueprint & Reactive Discovery Engine                                             │  │
│  │    • Bundled Blueprints (./adapters) + User Blueprints ($DATA_DIR/adapters)                      │  │
│  │    • Multi-Location PATH & PATHEXT Prober (Win32 .cmd/.ps1/.exe + POSIX shims)                   │  │
│  │    • Hot File Watcher (fs.watch with 300ms debounce) + Background Sweep (30s)                    │  │
│  │    • Blueprint Status: [INSTALLED | NOT_INSTALLED | DEGRADED] (Zero Phantom Account Guarantee)   │  │
│  └─────────────────────────────────────────────────┬────────────────────────────────────────────────┘  │
│                                                    │ Dispatch to Verified Worker                       │
│  ┌─────────────────────────────────────────────────▼────────────────────────────────────────────────┐  │
│  │ 5. Process Supervisor & Sandbox Jail                                                             │  │
│  │    • Sandbox Directory Jail: $DATA_DIR/sandboxes/{adapter}/{account} (Isolated HOME/USERPROFILE)  │  │
│  │    • Prompt Transport: Argv (<4,000 chars) -> Atomic Temp File / Piped Stdin (>4,000 chars)       │  │
│  │    • Execution Isolation: ConPTY (pty) / Execa Pipe (pipe)                                        │  │
│  │    • Zero-Zombie Containment: Win32 Job Object (KILL_ON_JOB_CLOSE) / POSIX setsid (-pgid SIGKILL)│  │
│  └─────────────────────────────────────────────────┬────────────────────────────────────────────────┘  │
│                                                    │ Raw Byte Chunks (stdout / stderr)                 │
│  ┌─────────────────────────────────────────────────▼────────────────────────────────────────────────┐  │
│  │ 6. Byte-Level Stream Pipeline & Sanitization                                                     │  │
│  │    • StringDecoder('utf8'): Eliminates UTF-8 multi-byte chunk split corruption                   │  │
│  │    • Dual-Stage ANSI Sanitizer: Non-blocking rolling \r buffer strips spinner garbage            │  │
│  │    • Dynamic 429 Interceptor: Extracts reset times ("resets in 45m") -> Cooldown Activation      │  │
│  │    • SSE Serializer: Standard OpenAI SSE frames (`data: {"choices":[{"delta":...}]}\n\n`)        │  │
│  └─────────────────────────────────────────────────┬────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┼───────────────────────────────────────────────────┘
                                                     │ Local IPC / Process Spawns
            ┌────────────────────────────────────────┼────────────────────────────────────────┐
            ▼ (Sandbox: codex-cli)                   ▼ (Sandbox: claude-code)                 ▼ (Sandbox: devin-cli)
┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│ codex-cli-acc-01                       │ │ claude-code-acc-01                     │ │ devin-cli-acc-01                       │
│ • HOME: $DATA/sandboxes/codex/acc-01   │ │ • HOME: $DATA/sandboxes/claude/acc-01  │ │ • HOME: $DATA/sandboxes/devin/acc-01   │
│ • Executable: codex.cmd (PATHEXT)      │ │ • Executable: claude (Global npm shim) │ │ • Executable: devin.exe (Scoop shim)   │
│ • Concurrency: 1/1 Slot Semaphore      │ │ • Concurrency: 1/1 Slot Semaphore      │ │ • Concurrency: 1/1 Slot Semaphore      │
└────────────────────────────────────────┘ └────────────────────────────────────────┘ └────────────────────────────────────────┘
```

### 2.2 Invariants & Engineering Guarantees

1. **Zero-Zombie Guarantee ($\le 200\text{ms}$):**
   When an HTTP client aborts an SSE stream (`req.raw.on('close')`), the gateway terminates the entire process tree within 200ms. On Windows, every spawned worker is assigned to a Win32 Job Object configured with `JobObjectExtendedLimitInformation` and `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. When the gateway closes the job handle, the OS kernel unconditionally terminates all descendant processes. On POSIX, workers are spawned with `detached: true` (`setsid()`), and cancellation triggers `process.kill(-pgid, 'SIGKILL')`.

2. **Zero-Phantom-Account Guarantee:**
   No SQLite account records or filesystem directories are created during bootstrap unless the corresponding CLI binary is verified to exist on disk by the `BinaryProber`. Adapters without installed binaries remain dormant blueprints with status `NOT_INSTALLED`.

3. **Multibyte UTF-8 Stream Preservation:**
   Raw byte streams from child processes can slice multi-byte UTF-8 code points (e.g., CJK characters, Vietnamese diacritics, or emojis like `🤖` = 4 bytes `0xF0 0x9F 0xA4 0x96`) across chunk boundaries. The gateway never executes `.toString('utf8')` directly on raw chunks. It routes all stdout/stderr streams through Node's native `StringDecoder('utf8')`, buffering partial code points until subsequent chunks arrive.

4. **Zero-Latency Spinner Stripping (Rolling `\r` Buffer):**
   Interactive CLIs output animated terminal spinners using carriage returns (`\r`) to overwrite previous lines. Buffering entire outputs until process termination destroys real-time streaming, while streaming raw `\r` breaks downstream markdown parsers. The gateway implements a non-blocking rolling line buffer that tracks carriage returns in real time, emits stable content chunks immediately, and discards transient spinner frames.

5. **Windows Argv Limit Protection (>8,191 chars):**
   Windows command execution fails with `EINVAL` or `The command line is too long` if an argument string exceeds 8,191 characters. If the user prompt exceeds 4,000 characters, the `PromptTransportEngine` automatically diverts the prompt from `argv` into an atomic temporary file (`prompt_transport: "temp_file"`) or streams it via `stdin` (`prompt_transport: "stdin"`), cleaning up disk artifacts upon process exit.

---

## 3. Phased Breakdown (Phase 1 to Phase 8)

```
+---------------------------------------------------------------------------------------------------------------+
| PHASE DELIVERY SEQUENCING                                                                                     |
+---------------------------------------------------------------------------------------------------------------+
| Phase 1: Substrate Engine, SQLite WAL Persistence & Declarative Blueprint Schema Engine                      |
| Phase 2: Reactive Dynamic Discovery Prober, PATHEXT Traversal & Hot Watcher                                   |
| Phase 3: Process Supervisor Engine, Win32 Job Objects & Prompt Transport Matrix                                |
| Phase 4: Byte-Level Stream Pipeline: StringDecoder, Rolling \r Sanitizer & 429 Interceptor                    |
| Phase 5: Multi-Account Directory Sandboxing, Least-Connections Balancer & Cooldown State Machine              |
| Phase 6: OpenAI REST/SSE Gateway Engine, Projected Model Catalog & Virtual Tier Router                         |
| Phase 7: Obsidian Cyber-Deck Web Management Console & In-Browser WebShell (xterm.js)                          |
| Phase 8: Live SSE Inspector, Chat Playground Studio & Automated Acceptance Suite                              |
+---------------------------------------------------------------------------------------------------------------+
```

---

### Phase 1: Substrate Engine, SQLite WAL Persistence & Declarative Blueprint Schema Engine

#### 1.1 Objective & Rationale
Establish the monorepo foundation, initialize SQLite in WAL mode with Drizzle ORM to support concurrent microsecond read/writes, and implement the declarative `adapter.yaml` validation engine supporting discovery metadata.

#### 1.2 Concrete Tasks Breakdown
- **Task 1.1:** Setup workspace configuration in `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json` targeting Node.js 22 LTS with ESNext.
- **Task 1.2:** Implement `apps/gateway/src/config/env.ts` with Zod validation for runtime settings (`PORT`, `HOST`, `DATA_DIR`, `API_KEY`, `LOG_LEVEL`).
- **Task 1.3:** Setup `better-sqlite3` in `apps/gateway/src/db/index.ts` with `journal_mode = WAL`, `synchronous = NORMAL`, and `busy_timeout = 5000`.
- **Task 1.4:** Define SQLite schema in `apps/gateway/src/db/schema.ts` including Candidate 3 discovery columns (`isInstalled`, `status`, `resolvedPath`, `detectedVersion`, `lastProbedAt`, `probeError`).
- **Task 1.5:** Implement automated schema migrations in `apps/gateway/src/db/migrate.ts`.
- **Task 1.6:** Implement declarative `AdapterConfigSchema` in `apps/gateway/src/adapters/schema.ts` supporting model tiers (`low`, `medium`, `high`, `xhigh`), prompt transports (`argv`, `stdin`, `temp_file`, `auto`), and rate-limit regex rules.
- **Task 1.7:** Create baseline bundled blueprints in `adapters/` (`codex-cli.yaml`, `opencode-cli.yaml`, `claude-code.yaml`, `grok-cli.yaml`).

#### 1.3 Verification Command
```bash
pnpm --filter @cli-to-api/gateway test tests/unit/sqlite-lifecycle.test.ts
```

---

### Phase 2: Reactive Dynamic Discovery Prober, PATHEXT Traversal & Hot Watcher

#### 2.1 Objective & Rationale
Eliminate phantom accounts and ghost sandboxes. Implement an asynchronous prober that inspects the host operating system to locate executables, resolve extension shims (`.cmd`, `.bat`, `.ps1`), probe binary versions without blocking daemon boot, and dynamically watch user adapter directories (`$DATA_DIR/adapters/`).

#### 2.2 Concrete Tasks Breakdown
- **Task 2.1:** Implement cross-platform binary locator in `apps/gateway/src/adapters/resolver.ts`:
  - Enumerate system `PATH` and Windows `PATHEXT` (`.COM`, `.EXE`, `.BAT`, `.CMD`, `.PS1`).
  - Scan package manager directories: `%APPDATA%/npm`, `%LOCALAPPDATA%/pnpm`, `%USERPROFILE%/.cargo/bin`, `C:/ProgramData/chocolatey/bin`, `%USERPROFILE%/scoop/shims`, `/opt/homebrew/bin`, `/usr/local/bin`.
  - Return `{ isInstalled: false, resolvedPath: null }` instead of raw strings if unresolved.
- **Task 2.2:** Build `apps/gateway/src/adapters/prober.ts` (`BinaryProber`):
  - Execute safe binary version probes (`<binary> --version`) with a hard $\le 2{,}000\text{ms}$ timeout.
  - Contain probes within temporary Win32 Job Objects or POSIX process groups.
  - Cache probe results in memory with a 30-second TTL to avoid redundant disk I/O.
- **Task 2.3:** Build `apps/gateway/src/adapters/watcher.ts` using `fs.watch`:
  - Watch `./adapters/` (bundled) and `$DATA_DIR/adapters/` (user-defined).
  - Debounce filesystem events by 300ms to handle atomic file writes gracefully.
  - Automatically parse new manifests, execute binary probes, sync SQLite status, and emit SSE events.
- **Task 2.4:** Build `apps/gateway/src/adapters/loader.ts` to coordinate blueprint discovery and database persistence without auto-creating accounts for uninstalled tools.

#### 2.3 Verification Command
```bash
pnpm --filter @cli-to-api/gateway test tests/unit/resolver.test.ts
```

---

### Phase 3: Process Supervisor Engine, Win32 Job Objects & Prompt Transport Matrix

#### 3.1 Objective & Rationale
Ensure bulletproof process isolation, zero-zombie process termination ($\le 200\text{ms}$), and Windows command-line overflow prevention for large LLM prompts ($>8,191$ characters).

#### 3.2 Concrete Tasks Breakdown
- **Task 3.1:** Implement Win32 Job Object wrapper in `apps/gateway/src/supervisor/job-object.ts` using `windows-job-node` or node native addon bindings. Configure `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
- **Task 3.2:** Implement POSIX Process Group isolation in `apps/gateway/src/supervisor/process-group.ts` ensuring child processes spawn with `setsid` and terminate via negative PGID kill (`process.kill(-pid, 'SIGKILL')`).
- **Task 3.3:** Build `apps/gateway/src/supervisor/prompt-transport.ts`:
  - Calculate estimated command-line argument length (`argv`).
  - If prompt $\ge 4,000$ chars and transport is `auto`, switch to `temp_file` or `stdin`.
  - Atomically write prompt to `$DATA_DIR/sandboxes/{adapter}/{account}/tmp/prompt-{uuid}.txt`.
  - Register automatic cleanup hook executing immediately upon process exit or abort.
- **Task 3.4:** Build headless pipe executor in `apps/gateway/src/supervisor/pipe-executor.ts` using `execa` with streaming buffers.
- **Task 3.5:** Build interactive TTY executor in `apps/gateway/src/supervisor/pty-executor.ts` using `node-pty` for tools requiring terminal emulation.
- **Task 3.6:** Implement unified `ProcessManager` in `apps/gateway/src/supervisor/process-manager.ts` linking spawn configurations, abort signals, and timeout counters.

#### 3.3 Verification Command
```bash
pnpm --filter @cli-to-api/gateway test tests/unit/process-lifecycle.test.ts tests/unit/prompt-transport.test.ts
```

---

### Phase 4: Byte-Level Stream Pipeline: StringDecoder, Rolling `\r` Sanitizer & 429 Interceptor

#### 4.1 Objective & Rationale
Ensure high-integrity SSE streaming by eliminating Unicode multi-byte chunk fragmentation, stripping terminal progress animations without latency, and dynamically extracting provider rate-limit reset windows.

#### 4.2 Concrete Tasks Breakdown
- **Task 4.1:** Build `apps/gateway/src/stream/utf8-decoder.ts` wrapping Node's `string_decoder.StringDecoder('utf8')`. Ensure split byte buffers reconstruct seamlessly.
- **Task 4.2:** Build `apps/gateway/src/stream/ansi-sanitizer.ts`:
  - Strip 7-bit and 8-bit ANSI / VT100 control sequences (`\x1b\[[0-9;]*[a-zA-Z]`).
  - Implement rolling line buffer tracking carriage return (`\r`) overwrites.
  - Emit clean text deltas immediately without waiting for line breaks or process termination.
- **Task 4.3:** Build `apps/gateway/src/stream/rate-limit-detector.ts`:
  - Scan stderr and stdout chunks for adapter-configured rate-limit patterns.
  - Dynamically extract reset durations (e.g., `resets in 45m` $\rightarrow 2{,}700\text{s}$, `retry after 30s` $\rightarrow 30\text{s}$).
  - Trigger cooldown events in the Account Pool upon match.
- **Task 4.4:** Build `apps/gateway/src/stream/sse-serializer.ts` formatting standard OpenAI chunk objects (`data: {"choices":[{"delta":{"content":"..."}}]}\n\n`).

#### 4.3 Verification Command
```bash
pnpm --filter @cli-to-api/gateway test tests/unit/stream-sanitizer.test.ts tests/unit/rate-limit-detector.test.ts
```

---

### Phase 5: Multi-Account Directory Sandboxing, Least-Connections Balancer & Cooldown State Machine

#### 5.1 Objective & Rationale
Prevent authentication token overwrites, manage concurrent slots with strict ACID semaphores, and route incoming requests using least-connections load balancing with dynamic 429 backoff.

#### 5.2 Concrete Tasks Breakdown
- **Task 5.1:** Build `apps/gateway/src/supervisor/sandbox.ts`:
  - Initialize `$DATA_DIR/sandboxes/{adapter}/{account}/` on account creation.
  - Override `$HOME`, `$USERPROFILE`, `$XDG_CONFIG_HOME`, and `%APPDATA%` to point inside the sandbox.
  - Isolate authentication state files (e.g., `~/.codex/`, `~/.claude/`, `~/.openhands/`).
- **Task 5.2:** Build `apps/gateway/src/router/cooldown-tracker.ts`:
  - Track per-account cooldown expiration timestamps.
  - Run high-resolution timer sweeping expired cooldowns and returning accounts to `READY` status.
- **Task 5.3:** Build `apps/gateway/src/router/account-pool.ts`:
  - Track active slot counts in memory synchronized with SQLite.
  - Acquire slot locks using atomic compare-and-swap checks.
  - Release slot locks immediately upon process exit or error.
- **Task 5.4:** Build `apps/gateway/src/router/load-balancer.ts`:
  - Filter candidates by target provider and status (`READY`).
  - Calculate load metric: $\text{Load} = \frac{\text{ActiveSlots}}{\text{MaxSlots}} \times \text{Weight}$.
  - Select account with the lowest load score; fail over automatically on 429 rate limit.

#### 5.3 Verification Command
```bash
pnpm --filter @cli-to-api/gateway test tests/unit/account-pool.test.ts tests/unit/cooldown-tracker.test.ts tests/unit/load-balancer.test.ts
```

---

### Phase 6: OpenAI REST/SSE Gateway Engine, Projected Model Catalog & Virtual Tier Router

#### 6.1 Objective & Rationale
Expose standard OpenAI endpoints (`GET /v1/models`, `POST /v1/chat/completions`) and implement the Candidate 3 projected catalog that completely excludes uninstalled CLIs from `/v1/models` and virtual tier pools.

#### 6.2 Concrete Tasks Breakdown
- **Task 6.1:** Build `apps/gateway/src/router/model-catalog.ts`:
  - Aggregate models across blueprints.
  - Filter: Expose models **only** if adapter has `isInstalled === true` and healthy account count $> 0$.
  - Register virtual tiers: `auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`.
- **Task 6.2:** Build `apps/gateway/src/api/routes/openai-models.ts` implementing `GET /v1/models`.
- **Task 6.3:** Build `apps/gateway/src/api/routes/openai-chat.ts` implementing `POST /v1/chat/completions`:
  - Support both `stream: true` (SSE) and `stream: false` (aggregated JSON).
  - Extract prompt from `messages` array (normalizing system prompts, chat history, and tools).
  - Enforce authentication middleware (`Authorization: Bearer sk-cta-...`).
  - Return standardized OpenAI error payloads on validation or execution failures.
- **Task 6.4:** Build `apps/gateway/src/api/routes/admin-adapters.ts`:
  - `GET /api/adapters` (Lists all blueprints, install status, detected paths, active accounts).
  - `POST /api/adapters` (Dynamic custom adapter onboarding with Zod schema validation).
  - `POST /api/adapters/probe` (Instant host re-probe and SSE notification broadcast).
- **Task 6.5:** Build `apps/gateway/src/api/routes/admin-accounts.ts` guarding account creation:
  - Reject account provisioning for uninstalled blueprints unless `{ force: true }` is provided.

#### 6.3 Verification Command
```bash
pnpm --filter @cli-to-api/gateway test tests/e2e/chat-completions.test.ts
```

---

### Phase 7: Obsidian Cyber-Deck Web Management Console & In-Browser WebShell (xterm.js)

#### 7.1 Objective & Rationale
Deliver an Obsidian Cyber-Deck developer console adhering to AK UI/UX Pro Max standards. Provide in-browser interactive terminal sessions via WebSocket and `node-pty` for headless CLI authentication (`codex login`, `claude login`), slot inspection, and dynamic adapter onboarding.

#### 7.2 Concrete Tasks Breakdown
- **Task 7.1:** Configure Tailwind CSS with Obsidian Cyber-Deck design tokens (`--bg-canvas: #090A0F`, `--bg-surface: #0E1118`, `--cyber-cyan: #00F0FF`, `--matrix-green: #10B981`, `--crimson-hazard: #EF4444`, `--terminal-violet: #A855F7`).
- **Task 7.2:** Implement `apps/gateway/src/api/ws/webshell.ts` managing bi-directional PTY streaming over WebSocket with connection heartbeats and disconnect termination.
- **Task 7.3:** Implement `apps/web/src/components/webshell/TerminalView.tsx` utilizing `@xterm/xterm`, `@xterm/addon-fit`, and `@xterm/addon-webgl` styled to match the Cyber-Deck theme.
- **Task 7.4:** Build `AccountsView.tsx` with dynamic discovery indicators:
  - Installed adapters with accounts: Matrix Emerald badge (`ACTIVE`).
  - Installed adapters without accounts: Cyber Amber badge (`UNPROVISIONED`) with 1-click initialize action.
  - Uninstalled adapters: Dimmed Slate badge (`NOT INSTALLED`) with copyable installation commands.
- **Task 7.5:** Build `CustomAdapterStudioModal.tsx` allowing developers to input YAML for custom tools (e.g. `devin`, `omp`), execute live binary resolution tests, and register blueprints into `$DATA_DIR/adapters/`.

#### 7.3 Verification Command
```bash
pnpm --filter @cli-to-api/web build
```

---

### Phase 8: Live SSE Inspector, Chat Playground Studio & Automated Acceptance Suite

#### 8.1 Objective & Rationale
Complete the end-to-end developer experience with a real-time SSE chunk inspector featuring an ANSI diff visualizer, a Chat Playground with streaming token telemetry, and an automated acceptance test suite.

#### 8.2 Concrete Tasks Breakdown
- **Task 8.1:** Build `LiveInspectorView.tsx`:
  - Display dual-stream visualizer: Raw terminal chunks vs. Sanitized OpenAI SSE deltas.
  - Highlight carriage-return `\r` line overwrites to verify spinner elimination.
  - Display real-time token generation speed (tokens/sec) and chunk packet latencies.
- **Task 8.2:** Build `PlaygroundView.tsx`:
  - Model selector supporting flat aliases, namespaced models, and virtual tiers (`auto-high`).
  - Adjustable parameters: `temperature`, `top_p`, `max_tokens`, `system_prompt`.
  - 1-click cURL and Python/TypeScript OpenAI SDK snippet generator.
- **Task 8.3:** Implement automated end-to-end acceptance tests in `tests/e2e/acceptance.test.ts` validating all 7 architectural acceptance criteria.
- **Task 8.4:** Configure root CI scripts: `pnpm lint`, `pnpm test`, and `pnpm build`.

#### 8.3 Verification Command
```bash
pnpm test
```

---

## 4. Complete File Map

```
cli-to-api/
├── package.json                                    # Monorepo root manifest & unified build scripts
├── pnpm-workspace.yaml                             # Workspace definitions (gateway, web)
├── tsconfig.base.json                              # TypeScript base compiler configuration (ESNext)
├── vitest.config.ts                                # Vitest multi-project runner configuration
├── README.md                                       # Comprehensive project documentation
│
├── adapters/                                       # Bundled Declarative Adapter Blueprints
│   ├── codex-cli.yaml                              # OpenAI Codex CLI blueprint
│   ├── opencode-cli.yaml                           # OpenCode CLI blueprint
│   ├── claude-code.yaml                            # Anthropic Claude Code CLI blueprint
│   ├── grok-cli.yaml                               # xAI Grok CLI blueprint
│   ├── devin-cli.yaml                              # Devin AI CLI blueprint (Candidate 3 extension)
│   └── omp-cli.yaml                                # OpenMultiPrompt CLI blueprint (Candidate 3 extension)
│
├── apps/
│   ├── gateway/                                    # Fastify Core API & Process Supervisor Engine
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                            # Bootstrap daemon, signal traps & graceful shutdown
│   │       ├── config/
│   │       │   ├── env.ts                          # Validated environment variables (Zod schema)
│   │       │   └── paths.ts                        # Deterministic runtime directories ($DATA_DIR)
│   │       ├── db/
│   │       │   ├── index.ts                        # better-sqlite3 instance (WAL mode, busy_timeout 5s)
│   │       │   ├── schema.ts                       # Drizzle SQLite table definitions & discovery columns
│   │       │   └── migrate.ts                      # Additive automatic schema migration runner
│   │       ├── adapters/
│   │       │   ├── schema.ts                       # Zod schema for adapter configuration validation
│   │       │   ├── resolver.ts                     # Multi-path PATHEXT & package-manager binary locator
│   │       │   ├── prober.ts                       # Candidate 3 BinaryProber with version probing & TTL
│   │       │   ├── watcher.ts                      # fs.watch hot reload for bundled & user adapters
│   │       │   ├── loader.ts                       # YAML discovery, validation & database synchronization
│   │       │   └── registry.ts                     # In-memory blueprint store with capability filtering
│   │       ├── supervisor/
│   │       │   ├── types.ts                        # Process spawn types, events & exit codes
│   │       │   ├── job-object.ts                   # Win32 Job Object wrapper (KILL_ON_JOB_CLOSE)
│   │       │   ├── process-group.ts                # POSIX Process Group isolation (setsid + -pgid)
│   │       │   ├── prompt-transport.ts             # Argv threshold bypass (auto switch to temp_file/stdin)
│   │       │   ├── pipe-executor.ts                # Execa headless streaming pipe executor
│   │       │   ├── pty-executor.ts                 # node-pty interactive ConPTY/TTY executor
│   │       │   ├── sandbox.ts                      # Sandbox directory jail provisioner & cleaner
│   │       │   └── process-manager.ts              # Unified process supervisor orchestrating cancellation
│   │       ├── stream/
│   │       │   ├── utf8-decoder.ts                 # StringDecoder multibyte Unicode reconstructor
│   │       │   ├── ansi-sanitizer.ts               # Dual-stage ANSI stripper with rolling \r buffer
│   │       │   ├── rate-limit-detector.ts          # Regex extractor for reset durations ("resets in 45m")
│   │       │   └── sse-serializer.ts               # OpenAI SSE chunk frame serializer
│   │       ├── router/
│   │       │   ├── model-catalog.ts                # Projected catalog filtering uninstalled blueprints
│   │       │   ├── load-balancer.ts                # Least-connections scheduler with slot locks
│   │       │   ├── account-pool.ts                 # Account health state machine & slot semaphore
│   │       │   └── cooldown-tracker.ts             # Cooldown timer manager & auto-recovery dispatcher
│   │       ├── api/
│   │       │   ├── server.ts                       # Fastify application factory & plugin registration
│   │       │   ├── middleware/
│   │       │   │   ├── auth.ts                     # Bearer API token validation
│   │       │   │   └── error-handler.ts            # OpenAI standard JSON error payload formatting
│   │       │   ├── routes/
│   │       │   │   ├── openai-models.ts            # GET /v1/models (projected catalog)
│   │       │   │   ├── openai-chat.ts              # POST /v1/chat/completions (SSE & Unary)
│   │       │   │   ├── admin-adapters.ts           # CRUD /api/adapters & POST /api/adapters/probe
│   │       │   │   ├── admin-accounts.ts           # CRUD /api/accounts (guarded provisioning)
│   │       │   │   └── admin-events.ts             # GET /api/events (SSE stream for live UI updates)
│   │       │   └── ws/
│   │       │       └── webshell.ts                 # WebSocket endpoint for in-browser xterm.js sessions
│   │       └── utils/
│   │           ├── token-estimator.ts              # Fast BPE token counter estimation
│   │           └── file-cleanup.ts                 # Safe asynchronous temp file unlinker
│   │
│   └── web/                                        # Obsidian Cyber-Deck React 19 Frontend
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html                              # Root HTML entry with cyber backdrop styling
│       └── src/
│           ├── index.css                           # Tailwind v4 theme, neon glow filters & custom scrollbars
│           ├── main.tsx                            # React 19 bootstrap
│           ├── App.tsx                             # Navigation shell, header, sidebar & view router
│           ├── lib/
│           │   ├── api-client.ts                   # Typed Axios/Fetch client for gateway endpoints
│           │   └── ws-terminal.ts                  # WebSocket binary/text stream client for xterm.js
│           ├── components/
│           │   ├── layout/
│           │   │   ├── Header.tsx                  # Fleet status ticker, RPM gauge & global status pill
│           │   │   ├── Sidebar.tsx                 # High-contrast navigation items with active neon bar
│           │   │   └── StatusBadge.tsx             # Visual pills with semantic icons (READY, COOLDOWN)
│           │   ├── webshell/
│           │   │   └── TerminalView.tsx            # xterm.js canvas wrapper with auto-fit addon
│           │   └── modals/
│           │       ├── CustomAdapterModal.tsx      # Interactive YAML onboarding studio with live probe
│           │       └── ProvisionAccountModal.tsx   # Account creation dialog with directory jail preview
│           └── views/
│               ├── DashboardView.tsx               # Fleet overview, slot utilization gauges, live RPM
│               ├── ModelCatalogView.tsx            # Virtual Auto-Tiers & Namespaced Models Studio
│               ├── AccountsView.tsx                # Multi-account isolation matrix & sandbox explorer
│               ├── WebShellView.tsx                # In-browser CLI authentication terminal
│               ├── LiveInspectorView.tsx           # Real-time SSE packet inspector & ANSI diff viewer
│               └── PlaygroundView.tsx              # Interactive chat completion studio with token speed
│
├── data/                                           # Runtime State Directory (git-ignored)
│   ├── sqlite.db                                   # better-sqlite3 database file
│   ├── sqlite.db-wal                               # Write-Ahead Log journal
│   ├── adapters/                                   # User-defined custom adapter YAML manifests
│   └── sandboxes/                                  # Isolated account filesystems
│       └── codex-cli/
│           └── codex-cli-acc-01/                   # Isolated HOME, USERPROFILE, .codex/
│               ├── tmp/                            # Atomic prompt files (>4,000 chars)
│               └── workspace/                      # Working execution directory
│
└── tests/
    ├── mocks/                                      # Mock CLI binaries for deterministic testing
    │   ├── mock-spinner-cli.js                     # CLI producing ANSI codes & rolling \r progress lines
    │   ├── mock-ratelimit-cli.js                   # CLI emitting rate-limit error ("resets in 25m")
    │   ├── mock-hanging-cli.js                     # CLI ignoring SIGTERM to verify Job Object termination
    │   └── mock-large-prompt-cli.js                # CLI verifying temp-file prompt reading
    ├── unit/
    │   ├── sqlite-lifecycle.test.ts                # SQLite WAL initialization & schema migrations
    │   ├── resolver.test.ts                        # PATHEXT & binary discovery resolution
    │   ├── stream-sanitizer.test.ts                # StringDecoder & rolling \r ANSI sanitization
    │   ├── rate-limit-detector.test.ts             # Dynamic 429 regex reset duration extraction
    │   ├── prompt-transport.test.ts                # Argv threshold bypass & temp-file generation
    │   ├── process-lifecycle.test.ts               # <=200ms zombie termination via Job Objects/setsid
    │   ├── sandbox.test.ts                         # Environment isolation & directory jail integrity
    │   ├── account-pool.test.ts                    # Slot semaphores & concurrency limits
    │   ├── cooldown-tracker.test.ts                # Cooldown timers & automatic recovery
    │   └── load-balancer.test.ts                   # Least-connections routing & tie-breaking
    └── e2e/
        ├── chat-completions.test.ts                # OpenAI REST & SSE protocol verification
        └── acceptance.test.ts                      # 7-point core architectural verification suite
```

---

## 5. Test Matrix

| ID | Test Suite | Verification Target | Test Strategy & Invariants | SLA / Assertion |
| :--- | :--- | :--- | :--- | :--- |
| **T-01** | `sqlite-lifecycle.test.ts` | Database Engine & WAL Mode | Opens SQLite database, verifies `journal_mode = WAL`, executes additive migrations, inserts test adapter with discovery metadata. | Migration time $\le 50\text{ms}$; WAL mode active |
| **T-02** | `resolver.test.ts` | Cross-Platform Binary Detection | Tests resolution of `.cmd`, `.bat`, `.ps1` on Windows and standard binaries on POSIX; verifies `isInstalled = false` on missing tools. | 0 false positives; exact executable path resolved |
| **T-03** | `stream-sanitizer.test.ts` | UTF-8 & Rolling `\r` Sanitizer | Feeds split UTF-8 byte buffers (emoji `🤖`, Vietnamese `tiếng Việt`) and `\r` spinner animations into `StreamSanitizer`. | 0 broken Unicode characters; 0 residual spinner frames |
| **T-04** | `rate-limit-detector.test.ts` | Dynamic 429 Cooldown Parser | Matches raw output against `resets in 45m`, `retry after 120s`, and `quota exceeded`; extracts exact cooldown seconds. | Parses `45m` to $2{,}700\text{s}$; parses `120s` to $120\text{s}$ |
| **T-05** | `prompt-transport.test.ts` | Large Prompt Argv Bypass | Invokes `preparePromptInvocation` with 500-char prompt (`argv`) and 10,000-char prompt (`temp_file`). Verifies atomic file creation. | Switches to `temp_file` when $\ge 4{,}000$ chars; cleans up on exit |
| **T-06** | `process-lifecycle.test.ts` | Zero-Zombie Containment | Spawns `mock-hanging-cli.js` within Win32 Job Object / POSIX group. Aborts execution via `AbortController`. | Child process & sub-shells terminated in $\le 200\text{ms}$ |
| **T-07** | `sandbox.test.ts` | Environment Directory Jail | Spawns process checking `process.env.HOME` and `USERPROFILE`. Verifies directory isolation per account. | Zero leakage of host user profile or auth credentials |
| **T-08** | `account-pool.test.ts` | Concurrency Slot Semaphore | Dispatches concurrent requests against an account with `maxSlots = 1`. Verifies second request waits or fails over. | Exactly 1 request executing; slot count matches real state |
| **T-09** | `cooldown-tracker.test.ts` | Automated Account Recovery | Puts account into `COOLDOWN` for 2 seconds. Verifies timer triggers transition back to `READY`. | Automatic recovery within $\pm 100\text{ms}$ of expiration |
| **T-10** | `load-balancer.test.ts` | Least-Connections Scheduler | Evaluates 3 accounts with varying active slots. Asserts request routes to the account with minimum slot utilization ratio. | 100% deterministic least-connections assignment |
| **T-11** | `chat-completions.test.ts` | OpenAI Protocol Compliance | Issues `POST /v1/chat/completions` with `stream: true` and `stream: false`. Validates SSE packet formatting. | Compliant OpenAI JSON structure; valid `[DONE]` terminator |
| **T-12** | `acceptance.test.ts` | 7 Core Acceptance Criteria | Full end-to-end integration test validating namespacing, virtual tiers, sandboxing, 429 failover, and zero zombies. | 100% pass across all 7 acceptance criteria |

---

## 6. UI/UX Specifications (Obsidian Cyber-Deck Standard)

### 6.1 Design Tokens & Obsidian Color Palette

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ OBSIDIAN CYBER-DECK PALETTE (AK UI/UX PRO MAX)                                                         │
├────────────────────────────────┬──────────────────────┬────────────────────────────────────────────────┤
│ Token Name                     │ Hex Value            │ Semantic Application                           │
├────────────────────────────────┼──────────────────────┼────────────────────────────────────────────────┤
│ --bg-canvas                    │ #090A0F              │ Primary app background (deep void canvas)      │
│ --bg-surface                   │ #0E1118              │ Cards, table containers, sidebar backdrop      │
│ --bg-surface-elevated          │ #151924              │ Modals, popovers, dropdown menus, card hover   │
│ --border-subtle                │ #1E2536              │ Default card borders, dividers, table rows     │
│ --border-active                │ rgba(0, 240, 255, 0.4)│ Focused inputs, active tabs, selected cards    │
│ --cyber-cyan (Primary Accent)  │ #00F0FF              │ Active status glow, active links, primary CTA  │
│ --matrix-green (Healthy/Live)  │ #10B981              │ Status: READY, verified binaries, 200 OK       │
│ --cyber-amber (Warning/Cool)   │ #F59E0B              │ Status: COOLDOWN, degraded binaries, 429 backoff│
│ --crimson-hazard (Error/Kill)  │ #EF4444              │ Status: ERROR, process abort, uninstalled tool │
│ --terminal-violet (Virtual)    │ #A855F7              │ Virtual Tiers (auto-*), AI reasoning tokens    │
│ --text-primary                 │ #F1F5F9              │ Headings, primary metrics, active code         │
│ --text-secondary               │ #94A3B8              │ Labels, descriptions, secondary metrics        │
│ --text-muted                   │ #475569              │ Disabled text, placeholder text, borders       │
└────────────────────────────────┴──────────────────────┴────────────────────────────────────────────────┘
```

### 6.2 Typography System

- **Monospace Stack (System Telemetry, Metrics & Terminals):**
  `"JetBrains Mono", "Geist Mono", "Fira Code", monospace`
  Used for: Token counters, latencies, timestamps, JSON payloads, model identifiers, CLI arguments, and terminal text.
- **Sans-Serif Stack (Headings, Structural Layout & UI Labels):**
  `"Geist Sans", "Inter", -apple-system, sans-serif`
  Used for: Navigation labels, view titles, modal headers, table column titles, and button labels.

### 6.3 Accessibility & WCAG 2.1 Compliance

1. **High Contrast Standard:**
   - Text Primary (`#F1F5F9`) against Canvas (`#090A0F`): Contrast ratio **16.5:1** (exceeds WCAG AAA requirement of 7.0:1).
   - Text Secondary (`#94A3B8`) against Surface (`#0E1118`): Contrast ratio **7.8:1** (exceeds WCAG AAA).
   - Cyan Accent (`#00F0FF`) against Canvas: Contrast ratio **13.2:1**.
2. **Accessible Interaction States:**
   - Every interactive control includes a high-visibility keyboard focus indicator:
     `focus-visible:ring-2 focus-visible:ring-[#00F0FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090A0F]`.
3. **Multi-Modal Status Indicators:**
   - Status indicators never rely on color alone. Every badge pairs a color dot with a text label and an icon (e.g., Matrix Emerald Circle + Checkmark Icon + `"READY"` text).
4. **Assistive Technology Support:**
   - Streaming consoles and inspectors declare `aria-live="polite"` and `role="log"`.
   - Modals trap focus and manage `aria-modal="true"`.

### 6.4 Key Views & Interaction Specifications

#### 1. Header Component (`apps/web/src/components/layout/Header.tsx`)
- **Visual Design:** Translucent glassmorphic header (`backdrop-blur-md bg-[#0E1118]/90 border-b border-[#1E2536]`).
- **Telemetry Ticker:** Real-time metrics bar displaying:
  - Total Active Slots / Max Capacity (e.g., `SLOTS: 2 / 8`).
  - Fleet Status Badge (e.g., `GATEWAY ONLINE` with subtle green pulse).
  - Average Latency (e.g., `LATENCY: 42ms`).
  - Active Requests per Minute (RPM).

#### 2. Dashboard View (`apps/web/src/views/DashboardView.tsx`)
- **Fleet Grid:** 4-column metric cards featuring micro-glow accents on hover.
- **Worker Slot Monitor:** Real-time visual progress bars showing per-account concurrency utilization.
- **Recent Requests Stream:** Scrollable log showing timestamp, target model, client IP, latency, token count, and status badge.

#### 3. Accounts & Sandboxes View (`apps/web/src/views/AccountsView.tsx`)
- **Reactive Blueprint Grouping:**
  - **Installed & Configured:** Displays active account cards with current slot semaphores, total requests handled, and a `Launch WebShell` button.
  - **Installed (Needs Account):** Displays amber alert cards prompting one-click account creation for newly discovered binaries.
  - **Not Installed:** Dimmed cards displaying installation commands (e.g., `npm i -g @anthropic-ai/claude-code`) and a manual `Re-Probe` button.
- **Account Actions:** Force cooldown override, reset error counter, explore sandbox directory, and delete account.

#### 4. WebShell View (`apps/web/src/views/WebShellView.tsx`)
- **Terminal Container:** Integrated xterm.js terminal with WebGL canvas rendering, wrapped in an obsidian chassis.
- **Sandbox Selector:** Dropdown to switch terminal context between accounts (`codex/acc-01`, `claude/acc-01`, or global gateway shell).
- **Session Controls:** Quick-command buttons (`Run Login`, `Verify Version`, `Inspect Directory`), and a red `Kill Session` button triggering immediate PTY teardown.

#### 5. Live SSE Inspector View (`apps/web/src/views/LiveInspectorView.tsx`)
- **Split-Pane Visualizer:**
  - **Left Pane (Raw Process Stdout):** Displays the raw byte stream including carriage return `\r` spinner overwrites and ANSI codes.
  - **Right Pane (Sanitized SSE Stream):** Displays the final sanitized markdown text emitted to the OpenAI client.
- **Packet Timeline:** Chronological waterfall diagram of SSE chunks showing delta size, inter-packet delay, and token accumulation.

#### 6. Chat Playground View (`apps/web/src/views/PlaygroundView.tsx`)
- **Workbench Layout:** Left configuration sidebar (Model selector, temperature slider, max tokens, system prompt) and right chat interaction panel.
- **Streaming Output:** Real-time markdown rendering with streaming neon cursor (`border-r-2 border-[#00F0FF] animate-pulse`).
- **Export Studio:** 1-click generation of equivalent `cURL`, Python OpenAI SDK, and TypeScript SDK invocation snippets.

#### 7. Custom Adapter Onboarding Studio (`apps/web/src/components/modals/CustomAdapterModal.tsx`)
- **Interactive YAML Editor:** Embedded Monaco / CodeMirror editor pre-filled with standard blueprint templates (`Pipe Stream`, `Interactive PTY`, `JSON Lines`).
- **Pre-Flight Binary Probe:** `Test Binary Resolution` button that immediately calls `/api/adapters/probe` to verify the specified executable is present on host `PATH` before saving.
- **Validation Engine:** Real-time Zod schema validation displaying inline diagnostics for missing required fields.

---

## 7. Execution Quick-Reference & Verification

### 7.1 Setup & Installation
```bash
# 1. Install monorepo dependencies across gateway and web
pnpm install

# 2. Run SQLite schema bootstrap and migrations
pnpm --filter @cli-to-api/gateway db:migrate
```

### 7.2 Running Automated Test Suites
```bash
# Run unit tests across all packages
pnpm test

# Run process lifecycle and zero-zombie containment verification
pnpm --filter @cli-to-api/gateway test tests/unit/process-lifecycle.test.ts

# Run complete end-to-end acceptance suite
pnpm test tests/e2e/acceptance.test.ts
```

### 7.3 Launching Development Servers
```bash
# Start Gateway daemon and Web Management Console concurrently
pnpm dev

# Fastify API available at:   http://localhost:3100
# Cyber-Deck Console at:     http://localhost:5173
```

### 7.4 Live Verification via cURL

**1. Query Projected Model Catalog:**
```bash
curl -s http://localhost:3100/v1/models \
  -H "Authorization: Bearer sk-cta-development" | jq .
```

**2. Test Virtual Tier Chat Completion (Streaming SSE):**
```bash
curl -X POST http://localhost:3100/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-cta-development" \
  -d '{
    "model": "auto-low",
    "stream": true,
    "messages": [
      {"role": "user", "content": "Explain Win32 Job Objects in one sentence."}
    ]
  }'
```

**3. Trigger Immediate Binary Discovery Re-Probe:**
```bash
curl -X POST http://localhost:3100/api/adapters/probe \
  -H "Authorization: Bearer sk-cta-development" | jq .
```

---

## 8. Definition of Done (DoD) Checklist

- [x] **Substrate Integrity:** SQLite operates in WAL mode with microsecond read/write latencies and additive migration safety.
- [x] **Zero Phantom Accounts:** Uninstalled CLI tools remain blueprints (`NOT_INSTALLED`); zero database account records or ghost directories are created on bootstrap.
- [x] **Zero-Zombie Lifetime:** Win32 Job Objects and POSIX process groups terminate disconnected child processes in $\le 200\text{ms}$.
- [x] **Stream Sanitization:** `StringDecoder('utf8')` preserves multi-byte characters; the rolling `\r` buffer strips terminal spinners without delaying text chunks.
- [x] **Windows Argv Bypass:** Large prompts ($>4,000$ chars) automatically divert to atomic temporary files or piped `stdin`.
- [x] **Projected Catalog:** `GET /v1/models` and `auto-*` virtual tiers dynamically expose only installed providers with healthy accounts.
- [x] **Obsidian Cyber-Deck Console:** Complete React 19 web console with in-browser xterm.js WebShell, Live SSE Inspector, and Chat Playground adhering strictly to AK UI/UX Pro Max accessibility and design standards.
