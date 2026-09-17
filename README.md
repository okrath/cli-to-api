# `cli-to-api` ⚡
**Universal AI CLI to OpenAI & Anthropic API Gateway & Obsidian Cyberdeck Console**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-orange.svg)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-152%20passing%20(100%25)-success.svg)](https://vitest.dev)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`cli-to-api` is a high-performance, local-first API gateway daemon and developer control plane that transforms any user-installed command-line AI agent (`@anthropic-ai/claude-code`, `codex-cli`, `omp-cli`, `opencode`, `devin-cli`, `grok-cli`, `gemini-cli`, etc.) into 100% compliant **OpenAI REST & SSE API** (`/v1/chat/completions`, `/v1/models`) and **Anthropic Messages API** (`POST /v1/messages`).

Connect any developer tool—such as **Claude Desktop, Cursor IDE, Continue.dev, LibreChat, Open WebUI, LangChain, or official OpenAI & Anthropic SDKs**—to your local CLI tools with multi-account sandboxing, dynamic failover, intelligent load balancing, and reasoning effort compilation.

---

## 🏛️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Client Applications (Claude Desktop, Cursor, Continue.dev, Open WebUI, OpenAI & Anthropic SDKs)│
│ POST /v1/chat/completions | POST /v1/messages | GET /v1/models | x-api-key | reasoning_effort│
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Fastify Dual-Dialect API Ingress Guard (Port 8080)                                          │
│ • Dual-Auth: Bearer Token (sk-cta-...) & Anthropic x-api-key (sk-ant-...)                   │
│ • OpenAI Endpoint: POST /v1/chat/completions (SSE chunk serializer)                         │
│ • Anthropic Endpoint: POST /v1/messages (Anthropic event frames & thinking blocks)          │
│ • Merkle Prefix Stateful Session Resolver    • Dynamic Model Catalog Merger                  │
└──────────────────────┬───────────────────────────────────────────────┬──────────────────────┘
                       │                                               │
                       ▼                                               ▼
┌──────────────────────────────────────────────┐   ┌──────────────────────────────────────────┐
│ Flow-Chain Load Balancer & SWRR Scheduler    │   │ 3-Tier Context-Aware Effort Transpiler   │
│ • User-Defined Routing Groups (group:*)      │   │ • Request Parameter Ingress Override     │
│ • Official Model Aliases (claude-3-7-sonnet) │   │ • Target Link Effort Override            │
│ • Priority Failover (P0 -> P1 -> P2)         │   │ • Routing Group Default Effort           │
│ • Smooth Weighted Round-Robin (SWRR)         │   │ ├── Claude Code -> --effort <level>      │
│ • Least-Connections Slot Allocation          │   │ ├── Codex CLI   -> -c model_reasoning... │
│ • Dynamic 429 Cooldown State Machine         │   │ └── OMP CLI     -> --effort <level>      │
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
│ • Real-Time Thinking Demuxer: Emits delta.reasoning_content or Anthropic thinking blocks     │
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

### 1. Dual-Dialect Protocol Gateway (OpenAI + Anthropic Messages)
- **OpenAI Compatible:** Full support for `POST /v1/chat/completions` and `GET /v1/models`.
- **Anthropic Messages API Compatible:** Full support for `POST /v1/messages` with `x-api-key` header, `anthropic-version`, `system` prompts, and `thinking: { type: "enabled", budget_tokens: N }`.
- **Anthropic SSE Streaming:** Generates compliant event frames: `message_start` $\to$ `content_block_start` (`type: "thinking" | "text"`) $\to$ `content_block_delta` $\to$ `content_block_stop` $\to$ `message_delta` $\to$ `message_stop`.
- **Official Claude Model Aliases:** Automatically maps official Claude model IDs (e.g. `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet`, `claude-3-opus`, `claude-3-5-haiku`) to the local `claude-code` provider.

### 2. User-Defined Routing Groups & Flow-Chain Target Pipelines
- **Virtual Models (`group:*`):** Group multiple heterogeneous CLIs, models, or specific accounts into a single virtual endpoint (e.g., `group:load-balancer`, `group:deep-code`, `group:production`).
- **Priority Tier Fallback:** Hierarchical failover chains ($P_0 \to P_1 \to P_2$). If your primary tool encounters a rate limit or process crash, traffic switches transparently to backup providers in $\le 1.5\text{ms}$.
- **NGINX Smooth Weighted Round-Robin (SWRR):** Smoothly distributes requests across candidate targets based on configured weights without burst clustering.
- **Defensive Target Isolation:** Prevents cross-adapter account pollution by strictly validating target kinds (`ACCOUNT`, `CLI`, `MODEL`) and verifying adapter credentials before execution.

### 3. 3-Tier Context-Aware Reasoning Effort Transpiler
Seamlessly bridges OpenAI SDK's `reasoning_effort` (`none`, `low`, `medium`, `high`, `xhigh`) or Anthropic's `thinking.budget_tokens` into the exact CLI flags expected by local binaries:
- **Claude Code CLI (v2.1+):** Transpiled to `--effort <low|medium|high|xhigh>`.
- **OpenAI Codex CLI (v0.154+):** Transpiled to `-c model_reasoning_effort="<low|medium|high>"`.
- **OMP CLI / Devin / OpenCode:** Transpiled to native `--effort` or `--reasoning` flags.
- **Precedence Order:** `Request Ingress Override > Target Link Override > Group Default`.

### 4. Deep Reasoning Stream Demuxer
- Parses reasoning tokens from `<thought>`, `<thinking>`, or native CLI output chunks in real time.
- Emits standard OpenAI reasoning delta `reasoning_content` or Anthropic `thinking_delta` content blocks.

### 5. Multi-Account Directory Sandboxing
- Run multiple concurrent accounts on the same machine for the same CLI.
- Each account receives an isolated filesystem jail (`data/sandboxes/{adapter}/{account}`) with separate `$HOME`, `$USERPROFILE`, and `%APPDATA%`, preventing session clobbering and rate-limit interference.

### 6. Stateful Session Bridging (Merkle Prefix Memory)
- Tracks conversation trees using cryptographic Merkle prefix hashing (`rootHash`, `leafHash`).
- Automatically pins conversational turns to the same physical account via sticky session affinity (`x-conversation-id`, `x-session-id`, or `conversation_id`).
- Supports native CLI session resumption (e.g., `codex exec resume {session_id}`).

### 7. Zero-Zombie Containment ($\le 200\text{ms}$)
- Uses **Win32 Job Objects** (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) on Windows and **POSIX Process Groups** (`setsid` + `SIGKILL`) on Linux/macOS.
- When an HTTP client aborts or disconnects, all spawned child processes are killed within $\le 200\text{ms}$, guaranteeing 0 zombie processes.

### 8. Obsidian Cyberdeck Management Console
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
- **Anthropic API Base URL:** `http://localhost:8080/v1`
- **Default API Key:** `Bearer sk-cta-dev` or `x-api-key: sk-cta-dev`
- **Admin Secret:** `Bearer admin-secret`

---

## 💡 Connecting Clients

### 1. Anthropic Messages API (cURL)
```bash
curl -N -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-cta-dev" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-7-sonnet-20250219",
    "messages": [
      {"role": "user", "content": "Explain Anthropic Messages streaming."}
    ],
    "max_tokens": 1024,
    "stream": true,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 4096
    }
  }'
```

### 2. Python Anthropic SDK (`anthropic`)
```python
import anthropic

client = anthropic.Anthropic(
    base_url="http://localhost:8080",
    api_key="sk-cta-dev"
)

response = client.messages.create(
    model="claude-3-7-sonnet-20250219",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello Claude via local gateway!"}]
)

for block in response.content:
    if block.type == "thinking":
        print(f"[Thinking]: {block.thinking}")
    elif block.type == "text":
        print(block.text)
```

### 3. OpenAI Chat Completions (cURL)
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

### 4. Python OpenAI SDK (`openai`)
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="sk-cta-dev"
)

response = client.chat.completions.create(
    model="group:load-balancer",
    messages=[{"role": "user", "content": "Write a lock-free ring buffer in Rust."}],
    stream=True,
    extra_body={"reasoning_effort": "high"}
)

for chunk in response:
    if hasattr(chunk.choices[0].delta, "reasoning_content") and chunk.choices[0].delta.reasoning_content:
        print(f"\033[90m{chunk.choices[0].delta.reasoning_content}\033[0m", end="", flush=True)
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### 5. Cursor IDE / Continue.dev Configuration
In your Cursor or Continue configuration (`~/.continue/config.json`):
```json
{
  "models": [
    {
      "title": "Claude 3.7 Sonnet (Local Anthropic)",
      "provider": "anthropic",
      "model": "claude-3-7-sonnet-20250219",
      "apiBase": "http://localhost:8080",
      "apiKey": "sk-cta-dev"
    },
    {
      "title": "Universal CLI Load Balancer (OpenAI)",
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
    }
  ]
}
```

---

## 🧩 Declarative Adapters

Adapters are declared in YAML. Builtin adapters live in `./adapters/`, and custom adapters live in `./data/adapters/`:

```yaml
id: "claude-code"
name: "Anthropic Claude Code CLI"
version: "1.0.0"
executable: "claude"
execution_mode: "pipe"

models:
  - id: "sonnet"
    name: "Claude 3.7 Sonnet (Hybrid Reasoning)"
    tier: "medium"
    context_window: 200000
    cost_weight: 3
    is_default: true
  - id: "opus"
    name: "Claude 3 Opus (Max Intelligence)"
    tier: "high"
    context_window: 200000
    cost_weight: 8
    is_default: false
  - id: "haiku"
    name: "Claude 3.5 Haiku (Lightning)"
    tier: "low"
    context_window: 200000
    cost_weight: 1
    is_default: false

invocation:
  args_template:
    - "--print"
    - "--dangerously-skip-permissions"
    - "--model"
    - "{model}"
    - "{prompt}"
  args_template_resume:
    - "--print"
    - "--dangerously-skip-permissions"
    - "--model"
    - "{model}"
    - "--resume"
    - "{session_id}"
    - "{prompt}"
  prompt_transport: "auto"
  working_dir_template: "{account_dir}/workspace"
  timeout_seconds: 360

environment_isolation:
  home_dir_override: true
  xdg_override: true
  env_overrides:
    CLAUDE_CONFIG_DIR: "{account_dir}/.claude"
    CI: "1"
    FORCE_COLOR: "0"

output_parser:
  type: "json_lines"
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
│   │       ├── api/           # OpenAI (/v1/*) & Anthropic (/v1/messages) routes
│   │       ├── db/            # SQLite WAL schema & Drizzle ORM migrations
│   │       ├── router/        # Load balancer, SWRR, pipeline executor, sessions
│   │       ├── stream/        # OpenAI SSE & Anthropic SSE serializers, demuxer
│   │       └── supervisor/    # Job Objects, pipe/pty execution, sandboxes
│   └── web/                   # Vite + React + Tailwind Obsidian Cyberdeck Console
├── data/                      # Local data (git-ignored)
│   ├── sqlite.db              # High-concurrency SQLite database in WAL mode
│   ├── adapters/              # User-created custom adapters (hot-reloaded)
│   └── sandboxes/             # Isolated accounts jail filesystems
└── tests/                     # Comprehensive Vitest test suite
    ├── unit/                  # Anthropic normalizer/serializer, SWRR, demuxer
    ├── integration/           # Anthropic Messages API, admin telemetry routes
    └── e2e/                   # Chat completions, acceptance AC-01 to AC-07
```

---

## 🧪 Testing & Verification

The test suite runs with [Vitest](https://vitest.dev) and covers 100% of architectural acceptance criteria:

```bash
# Run all unit, integration, and E2E acceptance test suites
pnpm test

# Run Anthropic Messages API test suite specifically
pnpm test tests/integration/anthropic-messages.test.ts
pnpm test tests/unit/anthropic-serializer.test.ts
```

All 37 test suites with 152 tests pass deterministically.

---

## 📜 License

MIT License © 2026 cli-to-api contributors.
