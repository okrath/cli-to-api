# `cli-to-api` ⚡
**Universal AI CLI to OpenAI API Gateway & Web Management Console**

`cli-to-api` is a lightweight, local-first API gateway daemon that transforms any user-installed command-line AI interface (`@anthropic-ai/claude-code`, `codex-cli`, `opencode`, `grok-cli`, `gemini-cli`, `ollama`, etc.) into a 100% compliant OpenAI REST & Server-Sent Events (SSE) streaming API (`/v1/chat/completions`, `/v1/models`).

---

## 🌟 Core Features

- 🔌 **Agnostic Bridge (User-Managed CLIs):** The daemon never forces or bundles third-party packages. You install whichever CLIs you want; `cli-to-api` acts as the translation and orchestration bridge.
- 🏢 **Multi-Account Directory Sandboxing:** Run multiple accounts for the exact same CLI concurrently. Each account gets its own discrete directory jail (`$DATA_DIR/sandboxes/{adapter}/{account}`) with isolated `$HOME`, `$USERPROFILE`, and `%APPDATA%`, eliminating token collisions.
- 🎯 **Namespaced Model Targeting:** Target specific account pools using `provider/model` syntax:
  - `codex/gpt-5.6-asta` balances strictly across Codex accounts.
  - `opencode/gpt-5.6-asta` balances strictly across OpenCode accounts.
- 🧠 **Virtual Auto-Tiers (`auto-*`):** Intelligently routes requests across all healthy providers based on cost and reasoning requirements:
  - `auto`: Global load balancing across all available models.
  - `auto-low`: Fast, low-cost models (Haiku, Flash, GPT-4o Mini, Grok Fast).
  - `auto-medium`: Balanced models (Sonnet, GPT-4o).
  - `auto-high`: Deep reasoning models (Opus, GPT-5.6, DeepSeek R1).
  - `auto-xhigh`: Extreme reasoning models (GPT-5.6 Asta, o3-high).
- ⚖️ **Adaptive Load Balancing & Dynamic Cooldown:** Automatically routes traffic via Least-Connections and extracts 429 rate limit reset times (e.g. `"resets in 45m"`) from error output to place accounts in temporary cooldown with automatic failover.
- 🛡️ **Zero-Zombie Containment ($\le 200\text{ms}$):** Uses Win32 Job Objects (`KILL_ON_JOB_CLOSE`) on Windows and POSIX Process Groups (`setsid` + `SIGKILL`) on Linux/macOS to ensure aborted streams terminate all child processes immediately.
- 📝 **Byte-Level Stream Sanitizer:** Eliminates terminal spinner noise (`\r` carriage returns) without delaying real-time token emission, while `StringDecoder('utf8')` preserves multi-byte Unicode (Vietnamese, emojis) across chunk boundaries.
- 💻 **Obsidian Cyber-Deck Console (UI/UX Pro Max):** Sleek developer dashboard with an in-browser WebShell (`xterm.js` over WebSockets) for interactive OAuth login (`codex login`, `claude login`), real-time SSE stream inspection, and a Chat Playground.

---

## 🚀 Quick Start

### Prerequisites
- Node.js $\ge 22.0.0$ (LTS)
- pnpm $\ge 9.0.0$

### 1. Install & Build
```bash
# Clone the repository
git clone https://github.com/your-org/cli-to-api.git
cd cli-to-api

# Install dependencies across monorepo workspaces
pnpm install

# Build production bundles
pnpm build
```

### 2. Start the Gateway Daemon
```bash
# Start in production mode
pnpm start

# Or start with live reload in development mode
pnpm dev
```
The gateway will start at **`http://localhost:8080`**.
- Web Console: `http://localhost:8080/`
- API Base URL: `http://localhost:8080/v1`
- Default API Key: `Bearer sk-cta-dev`

---

## 💡 Connecting Clients

You can point any OpenAI-compatible tool (Cursor IDE, Continue.dev, LibreChat, Open WebUI, LangChain, or official SDKs) to `cli-to-api`:

### cURL Example (Streaming SSE)
```bash
curl -N -X POST http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer sk-cta-dev" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto-low",
    "messages": [{"role": "user", "content": "Explain load balancing in 2 sentences."}],
    "stream": true
  }'
```

### Python SDK Example
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="sk-cta-dev"
)

# Call via namespaced model
response = client.chat.completions.create(
    model="codex/gpt-5.6-asta",
    messages=[{"role": "user", "content": "Write a quicksort algorithm in TypeScript."}],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

---

## 🧩 Declarative CLI Adapters

Adapters are defined as declarative YAML files in `./adapters/`:

```yaml
id: "codex-cli"
name: "OpenAI Codex CLI"
version: "1.0.0"
executable: "codex"
execution_mode: "pipe" # "pipe" or "pty"

models:
  - id: "gpt-5.6-asta"
    name: "GPT-5.6 Asta (Extreme Reasoning)"
    tier: "xhigh" # "low" | "medium" | "high" | "xhigh"
    context_window: 128000
    cost_weight: 10
    is_default: true
  - id: "gpt-4o-mini"
    name: "GPT-4o Mini (Fast & Cheap)"
    tier: "low"
    context_window: 128000
    cost_weight: 1
    is_default: true

invocation:
  args_template:
    - "exec"
    - "--model"
    - "{model}"
    - "{prompt}"
  prompt_transport: "auto" # Auto-switches to temp_file if prompt > 4000 chars

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

## 🧪 Testing & Verification

The repository includes comprehensive unit and end-to-end acceptance tests covering AC-01 through AC-07:

```bash
# Run all unit and e2e acceptance tests
pnpm test
```

---

## 📜 License
MIT License
