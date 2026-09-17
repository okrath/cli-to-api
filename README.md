# `cli-to-api` ⚡
**Universal AI CLI to OpenAI API Gateway & Obsidian Cyberdeck Management Console**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-orange.svg)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-136%20passing%20(100%25)-success.svg)](https://vitest.dev)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`cli-to-api` is a high-performance, local-first API gateway daemon and developer control plane that transforms any user-installed command-line AI agent (`@anthropic-ai/claude-code`, `codex-cli`, `omp-cli`, `opencode`, `devin-cli`, `grok-cli`, `gemini-cli`, etc.) into a 100% compliant OpenAI REST & Server-Sent Events (SSE) streaming API (`/v1/chat/completions`, `/v1/models`).

Connect any OpenAI-compatible tool—such as **Cursor IDE, Continue.dev, LibreChat, Open WebUI, LangChain, or official OpenAI SDKs**—to your local CLI tools with multi-account sandboxing, dynamic failover, intelligent load balancing, and reasoning effort compilation.

---

## 🏛️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Client Applications (Cursor, Continue.dev, Open WebUI, LibreChat, Vanilla OpenAI SDKs)       │
│ POST /v1/chat/completions | GET /v1/models | X-Conversation-ID | reasoning_effort           │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Fastify API Gateway Ingress Guard (Port 8080)                                              │
│ • Bearer Token Authentication (sk-cta-...)  • Ingress Request Validation                    │
│ • Merkle Prefix Stateful Session Resolver    • Dynamic Model Catalog Merger                  │
└──────────────────────┬───────────────────────────────────────────────┬──────────────────────┘
                       │                                               │
                       ▼                                               ▼
┌──────────────────────────────────────────────┐   ┌──────────────────────────────────────────┐
│ Flow-Chain Load Balancer & SWRR Scheduler    │   │ 3-Tier Context-Aware Effort Transpiler   │
│ • User-Defined Routing Groups (group:*)      │   │ • Request Parameter Ingress Override     │
│ • Priority Failover (P0 -> P1 -> P2)         │   │ • Target Link Effort Override            │
│ • Smooth Weighted Round-Robin (SWRR)         │   │ • Routing Group Default Effort           │
│ • Least-Connections Slot Allocation          │   │ ├── Claude Code -> --effort <level>      │
│ • Dynamic 429 Cooldown State Machine         │   │ ├── Codex CLI   -> -c model_reasoning... │
│ • Cross-Adapter Target Isolation Guard       │   │ └── OMP CLI     -> --effort <level>      │
└──────────────────────┬───────────────────────┘   └───────────────────┬──────────────────────┘
                       │                                               │
                       └───────────────────────┬───────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Unified Process Supervisor & Execution Engine                                               │
│ • Multi-Account Directory Jail ($DATA_DIR/sandboxes/{adapter}/{account})                    │
│ • Zero-Zombie Containment: Win32 Job Objects / POSIX Process Groups (<= 200ms SIGKILL)      │
│ • Dual-Stage ANSI Sanitizer: Strips terminal noise (\r spinners) while preserving UTF-8     │
│ • Real-Time Thinking Demuxer: Splits delta.reasoning_content vs delta.content in SSE        │
│ • Prompt Transport: Direct argv (< 4,000 chars), Stdin Pipe, or Temp File Guard             │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Local CLI Subprocesses (Non-Interactive Streaming)                                          │
│ [claude-code (v2.1)]      [codex-cli (v0.154)]      [omp-cli]      [custom-adapters]        │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🌟 Key Features

### 1. User-Defined Routing Groups & Flow-Chain Target Pipelines
- **Virtual Models (`group:*`):** Group multiple heterogeneous CLIs, models, or specific accounts into a single virtual endpoint (e.g., `group:load-balancer`, `group:deep-code`, `group:production`).
- **Priority Tier Fallback:** Hierarchical failover chains ($P_0 \to P_1 \to P_2$). If your primary tool encounters a rate limit or process crash, traffic switches transparently to backup providers in $\le 1.5\text{ms}$.
- **NGINX Smooth Weighted Round-Robin (SWRR):** Smoothly distributes requests across candidate targets based on configured weights without burst clustering.
- **Defensive Target Isolation:** Prevents cross-adapter account pollution by strictly validating target kinds (`ACCOUNT`, `CLI`, `MODEL`) and verifying adapter credentials before execution.

### 2. 3-Tier Context-Aware Reasoning Effort Transpiler
Seamlessly bridges OpenAI SDK's `reasoning_effort` (`none`, `low`, `medium`, `high`, `xhigh`) or header `x-reasoning-effort` into the exact CLI flags expected by local binaries:
- **Claude Code CLI (v2.1+):** Transpiled to `--effort <low|medium|high|xhigh>`.
- **OpenAI Codex CLI (v0.154+):** Transpiled to `-c model_reasoning_effort="<low|medium|high>"`.
- **OMP CLI / Devin / OpenCode:** Transpiled to native `--effort` or `--reasoning` flags.
- **Precedence Order:** `Request Body / Header > Target Link Override > Group Default`.

### 3. Deep Reasoning Stream Demuxer
- Parses reasoning tokens from `<thought>`, `<thinking>`, or native CLI output chunks in real time.
- Emits standard OpenAI SSE packets:
  ```json
  data: {"choices":[{"delta":{"reasoning_content":"Step 1: Analyzing..."}}]}
  data: {"choices":[{"delta":{"content":"Here is the solution..."}}]}
  ```

### 4. Multi-Account Directory Sandboxing
- Run multiple concurrent accounts on the same machine for the same CLI.
- Each account receives an isolated filesystem jail (`data/sandboxes/{adapter}/{account}`) with separate `$HOME`, `$USERPROFILE`, and `%APPDATA%`, preventing session clobbering and rate-limit interference.

### 5. Stateful Session Bridging (Merkle Prefix Memory)
- Tracks conversation trees using cryptographic Merkle prefix hashing (`rootHash`, `leafHash`).
- Automatically pins conversational turns to the same physical account via sticky session affinity (`x-conversation-id`, `x-session-id`, or `conversation_id`).
- Supports native CLI session resumption (e.g., `codex exec resume {session_id}`).

### 6. Zero-Zombie Containment ($\le 200\text{ms}$)
- Uses **Win32 Job Objects** (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) on Windows and **POSIX Process Groups** (`setsid` + `SIGKILL`) on Linux/macOS.
- When an HTTP client aborts or disconnects, all spawned child processes are killed within $\le 200\text{ms}$, guaranteeing 0 zombie processes.

### 7. Obsidian Cyberdeck Management Console
- Modern, responsive developer cyberdeck built with React, Vite, Tailwind CSS, and Lucide icons.
- **Dashboard & Live Telemetry Station:** In-flight request radar, TTFT, token velocity, error tracking, and failover trail inspection.
- **Model Catalog & Routing Studio:** Visual node editor to create and configure routing groups, tier weights, and reasoning effort levels.
- **In-Browser WebShell:** `xterm.js` terminal over WebSockets to run interactive logins (`codex login`, `claude login`) directly inside sandboxes.
- **Interactive Playground:** Chat completion interface with live route trace inspector and thinking blocks.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js:** $\ge 22.0.0$ (LTS recommended)
- **pnpm:** $\ge 9.0.0$
- At least one supported AI CLI installed on host PATH (e.g., `claude`, `codex`, `omp`, `agy`, etc.)

### 1. Clone & Install
```bash
git clone https://github.com/okrath/cli-to-api.git
cd cli-to-api

# Install monorepo dependencies
pnpm install

# Build production bundles for gateway and web UI
pnpm build
```

### 2. Start the Gateway Daemon
```bash
# Start in production mode
pnpm start

# Or start with live hot-reloading in development mode
pnpm dev
```

The gateway daemon will start at **`http://localhost:8080`**:
- **Obsidian Cyberdeck Console:** `http://localhost:8080/`
- **OpenAI API Base URL:** `http://localhost:8080/v1`
- **Default API Key:** `Bearer sk-cta-dev`
- **Admin Secret:** `Bearer admin-secret`

---

## 💡 Connecting Clients

You can route any standard OpenAI client to `cli-to-api`:

### 1. cURL Example (User-Defined Routing Group)
```bash
curl -N -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-cta-dev" \
  -d '{
    "model": "group:load-balancer",
    "messages": [
      {"role": "user", "content": "Explain Smooth Weighted Round-Robin load balancing."}
    ],
    "stream": true,
    "reasoning_effort": "high"
  }'
```

### 2. Python OpenAI SDK
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="sk-cta-dev"
)

# Route to a custom Group with high reasoning effort
response = client.chat.completions.create(
    model="group:load-balancer",
    messages=[{"role": "user", "content": "Write a lock-free ring buffer in Rust."}],
    stream=True,
    extra_body={"reasoning_effort": "high"}
)

for chunk in response:
    # Print streaming reasoning thought delta if present
    if hasattr(chunk.choices[0].delta, "reasoning_content") and chunk.choices[0].delta.reasoning_content:
        print(f"\033[90m{chunk.choices[0].delta.reasoning_content}\033[0m", end="", flush=True)
    # Print content delta
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### 3. Cursor IDE / Continue.dev Configuration
In your Cursor or Continue configuration (`~/.continue/config.json`):
```json
{
  "models": [
    {
      "title": "Universal CLI Load Balancer",
      "provider": "openai",
      "model": "group:load-balancer",
      "apiBase": "http://localhost:8080/v1",
      "apiKey": "sk-cta-dev"
    },
    {
      "title": "Codex CLI (Direct)",
      "provider": "openai",
      "model": "codex-cli/gpt-5.6-sol",
      "apiBase": "http://localhost:8080/v1",
      "apiKey": "sk-cta-dev"
    },
    {
      "title": "Claude Code (Direct)",
      "provider": "openai",
      "model": "claude-code/sonnet",
      "apiBase": "http://localhost:8080/v1",
      "apiKey": "sk-cta-dev"
    }
  ]
}
```

---

## 🧩 Declarative Adapters

Adapters are declared in YAML. Builtin adapters live in `./adapters/`, and custom adapters live in `./data/adapters/`:

```yaml
id: "codex-cli"
name: "OpenAI Codex CLI"
version: "1.0.0"
executable: "codex"
execution_mode: "pipe" # "pipe" or "pty"

models:
  - id: "gpt-5.6-sol"
    name: "GPT-5.6 Sol (Extreme Reasoning)"
    tier: "xhigh"
    context_window: 128000
    cost_weight: 10
    is_default: true
  - id: "gpt-5.5"
    name: "GPT-5.5 (Deep Reasoning)"
    tier: "high"
    context_window: 128000
    cost_weight: 5
    is_default: false

invocation:
  args_template:
    - "exec"
    - "--model"
    - "{model}"
    - "--skip-git-repo-check"
    - "--color"
    - "never"
    - "-"
  args_template_resume:
    - "exec"
    - "resume"
    - "{session_id}"
    - "--skip-git-repo-check"
    - "-"
  prompt_transport: "stdin" # "auto" | "stdin" | "temp_file"
  working_dir_template: "{account_dir}/workspace"
  timeout_seconds: 300

environment_isolation:
  home_dir_override: true
  xdg_override: true
  env_overrides:
    CODEX_TELEMETRY: "0"

output_parser:
  type: "regex_stream"
  strip_ansi: true
  resolve_carriage_return: true
  chunk_regex: "(?s)(.*)"

error_handling:
  rate_limit_patterns:
    - pattern: "rate limit reached|usage limit exceeded|resets in (\\d+m|\\d+h)"
      cooldown_seconds_default: 1800
      dynamic_extractor: true

concurrency:
  max_concurrent_per_account: 1
```

---

## 🗄️ Database & Directory Layout

```
cli-to-api/
├── adapters/                  # Built-in declarative adapter YAMLs
│   ├── claude-code.yaml
│   ├── codex-cli.yaml
│   ├── devin-cli.yaml
│   ├── grok-cli.yaml
│   ├── omp-cli.yaml
│   └── opencode-cli.yaml
├── apps/
│   ├── gateway/               # Node.js Fastify API Gateway & Process Supervisor
│   │   └── src/
│   │       ├── adapters/      # Dynamic discovery, prober, reconciler
│   │       ├── api/           # OpenAI routes (/v1/*) & Admin REST API
│   │       ├── db/            # SQLite WAL schema & Drizzle ORM migrations
│   │       ├── router/        # Load balancer, SWRR, pipeline executor, sessions
│   │       ├── stream/        # SSE serializer, ANSI sanitizer, thinking demuxer
│   │       └── supervisor/    # Job Objects, pipe/pty execution, sandboxes
│   └── web/                   # Vite + React + Tailwind Obsidian Cyberdeck Console
├── data/                      # Local data (git-ignored)
│   ├── sqlite.db              # High-concurrency SQLite database in WAL mode
│   ├── adapters/              # User-created custom adapters (hot-reloaded)
│   └── sandboxes/             # Isolated accounts jail filesystems
└── tests/                     # Comprehensive Vitest test suite
    ├── unit/                  # Unit tests (SWRR, effort transpiler, demuxer, etc.)
    ├── integration/           # Admin routes, telemetry audit ledgers
    └── e2e/                   # Chat completions, acceptance AC-01 to AC-07
```

---

## 🧪 Testing & Verification

The test suite runs with [Vitest](https://vitest.dev) and covers 100% of architectural acceptance criteria:

```bash
# Run all unit, integration, and E2E acceptance test suites
pnpm test

# Run a specific test file
pnpm test tests/unit/swrr-load-balancer.test.ts
pnpm test tests/unit/effort-transpiler.test.ts
```

All 34 test suites with 136 tests pass deterministically.

---

## 📜 License

MIT License © 2026 cli-to-api contributors.
