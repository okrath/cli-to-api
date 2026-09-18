# cli-to-api

A local gateway that exposes installed AI coding CLIs (Claude Code, Codex, Cursor agent, Antigravity) as OpenAI- and Anthropic-compatible HTTP APIs. Route requests through load-balanced groups with failover, session reuse, optional response caching, and track token usage from a web admin console.

Each CLI account runs in an isolated sandbox directory. The gateway parses the CLI's JSONL output only — no regex over prose, no PTY on the API path.

Requires Node.js 22 or newer.

## Quick start

```bash
pnpm install
cp .env.example .env   # set ADMIN_PASSWORD (min 8 chars)
pnpm dev               # gateway on http://127.0.0.1:8080
```

Open http://127.0.0.1:8080/, log in with your admin password, then:

1. **Accounts** — create a CLI account (pick an installed adapter).
2. **Terminal** — open the account terminal and run the CLI's login command (e.g. `claude login`).
3. **Groups** — create a group (e.g. slug `default` → model `group:default`) with one or more account targets.
4. **API keys** — create a client key; copy the one-time plaintext value.

For frontend development with hot reload:

```bash
pnpm dev:web   # Vite on :5173, proxies /admin and /v1 to :8080
```

Production build and run:

```bash
pnpm build
pnpm start
```

## Connecting clients

Replace `YOUR_KEY` with a client API key from the admin console.

### curl — OpenAI

```bash
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"group:default","messages":[{"role":"user","content":"Hello"}]}'
```

### curl — Anthropic

```bash
curl -s http://127.0.0.1:8080/v1/messages \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"group:default","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'
```

### Python — OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8080/v1", api_key="YOUR_KEY")
stream = client.chat.completions.create(
    model="group:default",
    messages=[{"role": "user", "content": "Hello"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

### Python — Anthropic SDK

```python
import anthropic

client = anthropic.Anthropic(base_url="http://127.0.0.1:8080", api_key="YOUR_KEY")
message = client.messages.create(
    model="group:default",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
)
print(message.content[0].text)
```

### Cursor / Continue

In your provider config, set the OpenAI-compatible base URL to `http://127.0.0.1:8080/v1` and use a client API key. Pick a group model (`group:default`) or a direct model alias (`claude-sonnet-4-5`, `gpt-5`, etc.).

### Claude Desktop (custom base URL)

Point the Anthropic API base URL to `http://127.0.0.1:8080` and supply a client API key. Use model names exposed by `GET /v1/models`.

## Concepts

| Concept | Description |
|---|---|
| **Accounts & sandboxes** | One row per CLI login. Each account gets an isolated home/config/workspace under `DATA_DIR/sandboxes/`. |
| **Groups & failover** | A group (`group:<slug>`) holds ordered targets. On rate limit or crash before first token, the gateway tries the next account. |
| **Sessions & prompt cache** | Multi-turn chats reuse one CLI session; only the newest user message is sent on follow-up turns. |
| **Response cache** | Optional exact-match cache per group (`cacheTtlSec > 0`). Off by default. |
| **Usage & quota** | Every request records tokens and cost. Rate-limit windows from CLI events populate quota bars. **Tracked, never enforced** — the gateway does not block clients when quotas appear full. |

## Adapters

| CLI | Version tested | Flags / invocation | Streaming | Session resume |
|---|---|---|---|---|
| Claude Code | 2.1.276 | `-p --output-format stream-json --verbose --include-partial-messages`; tools disabled with `--tools ""` | Partial JSONL deltas | `--resume <session-id>` |
| Codex | 0.154.0 | `codex exec --json`; read-only sandbox when tools disabled | Item completion events | `codex exec resume <thread-id>` |
| Cursor agent | 2026.09.15 | `-p --trust --output-format stream-json --stream-partial-output`; tools disabled with `--mode ask` | Partial JSONL deltas (`timestamp_ms` lines only) | `--resume <session-id>` |
| agy | 1.2.6 | Antigravity CLI JSONL output | Event stream | `--conversation <id>` |
| fake (tests only) | — | `node tests/fake-cli/fake-cli.mjs`; enabled with `CTA_ENABLE_FAKE_ADAPTER=1` | Same shapes as Claude Code | `--resume` |

Run `GET /admin/adapters` to see detected versions on your machine.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ADMIN_PASSWORD` | *(required)* | Admin console login password (min 8 characters) |
| `PORT` | `8080` | HTTP listen port |
| `HOST` | `127.0.0.1` | HTTP listen address |
| `DATA_DIR` | `./data` | SQLite database, sandboxes, bootstrap key file |
| `LOG_LEVEL` | `info` | Pino log level |
| `CTA_ENABLE_FAKE_ADAPTER` | unset | Set to `1` in tests to register the fake CLI adapter |

## Response headers

The gateway adds these headers on chat responses:

| Header | Meaning |
|---|---|
| `x-cta-request-id` | Unique request id |
| `x-cta-model` | Model id executed on the CLI |
| `x-cta-account` | Account id used (absent on cache hits) |
| `x-cta-session-reused` | `1` when an existing CLI session was resumed |
| `x-cta-cache` | `off`, `miss`, or `hit` |
| `x-cta-failovers` | Number of failover attempts before success |

## Limits

- **Text only** — image and file inputs are not supported.
- **No tools passthrough** — client tool definitions are not forwarded; groups can allow tools on the CLI side via `allowTools`.
- **Local use** — bind to localhost unless you explicitly change `HOST`.

## Troubleshooting

**`better-sqlite3` or `node-pty` fails to load after Node upgrade**

```bash
pnpm rebuild better-sqlite3 node-pty
```

On Node 24+, native addons must be rebuilt for your current Node ABI.

**Terminal page shows a blank screen**

Ensure `node-pty` built successfully (`pnpm rebuild node-pty`). On Windows, use a supported terminal; the admin console uses xterm.js over WebSocket.

**Account stuck in cooldown**

Use **Reset cooldown** on the Accounts page, or wait until `cooldownUntil` passes.

**`cursor-agent` fails to spawn on Windows**

The npm shim is `cursor-agent.cmd` → `cursor-agent.ps1` → bundled `node.exe` + `index.js`. The gateway resolves this layout directly (including `versions/<latest>/`) so prompts can be passed via argv without `shell: true`. If detection still fails, confirm `where cursor-agent` points at the npm `.cmd` and that a `versions/` folder exists beside the `.ps1`.

**Real CLI smoke test**

With the gateway running and a logged-in account:

```bash
export CTA_API_KEY=sk-cta-...
node scripts/smoke-real-cli.mjs --adapter claude-code --account claude-code-myaccount --model claude-sonnet-4-5
```

## Development

```bash
pnpm lint    # TypeScript check (gateway + web)
pnpm test    # unit, integration, and e2e tests
pnpm build   # apps/gateway/dist + apps/web/dist
```

See [AGENTS.md](./AGENTS.md) for implementer conventions.
