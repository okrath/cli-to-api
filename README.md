# cli-to-api

A local gateway that exposes the AI coding CLIs installed on your machine
(Claude Code, Codex, Cursor agent, Antigravity `agy`) as OpenAI- and
Anthropic-compatible HTTP APIs. Clients such as omp, Cursor, Continue, Claude
Desktop or the official SDKs talk to `http://127.0.0.1:8080` and the gateway
runs the CLI for them: load-balanced groups with failover, CLI session reuse,
client tool calling over an MCP bridge, usage tracking and a web admin console.

The gateway only reads each CLI's structured JSONL output — no scraping of
terminal text, no PTY on the API path. Requires Node.js 22 or newer.

**Contents:** [Quick start](#quick-start) · [Setup guide](#setup-guide) ·
[Recommended configurations](#recommended-configurations) ·
[How routing works](#how-routing-works) · [Connecting clients](#connecting-clients) ·
[Client tool calling](#client-tool-calling) · [Data retention](#data-retention) ·
[Reference](#reference) · [Troubleshooting](#troubleshooting) · [Development](#development)

## Quick start

```bash
pnpm install
cp .env.example .env   # set ADMIN_PASSWORD (min 8 chars)
pnpm build
pnpm start             # gateway on http://127.0.0.1:8080
```

Open http://127.0.0.1:8080/, log in with `ADMIN_PASSWORD`, then:

1. **Accounts** — add one account per CLI login (see [Accounts](#accounts)).
2. **Terminal** — for a sandboxed account, open its terminal and run the CLI's login (`claude login`, `codex login`, …).
3. **Groups** — create a group, e.g. slug `default` → model `group:default`, and add the account as a target.
4. **API keys** — create a client key and copy the one-time plaintext.
5. Point a client at the gateway ([Connecting clients](#connecting-clients)).

The first start also writes a bootstrap client key to `DATA_DIR/bootstrap-api-key.txt`.

For development: `pnpm dev` runs the gateway from source with reload,
`pnpm dev:web` runs the console on :5173 (proxies `/admin` and `/v1` to :8080).
**`pnpm start` runs the built `dist/` — rebuild after pulling changes.**

## Setup guide

### Accounts

An account is one CLI login. Two kinds:

| Kind | What it means | Use when |
|---|---|---|
| **Sandboxed** (default) | The CLI runs with `HOME`/config pointed into `DATA_DIR/sandboxes/<adapter>/<account>/`. Log in once through the account's **Terminal** page. Credentials, config and transcripts stay inside that folder. | You have extra logins to pool, or you want the CLI fully isolated from your own profile. |
| **Host profile** | The CLI runs with *your* user profile (the login you already have on this machine); only the working directory is the account's sandbox workspace. The console shows which CLIs are logged in on the host. | You just want to reuse the login you already use interactively. Rate limits are shared with your own use of that CLI. |

Fields:

- **Max concurrent** — how many CLI processes may run at once for this account. Default `1`. **Set 2–4 for agent clients** (omp, Cursor, Continue): they send several requests in parallel (main turn, title generation, reviewers) and a parked tool round also occupies a slot; with `1`, the extra requests wait `queue_timeout_sec` and then spill over to the next target as fresh sessions.
- **Cooldown** — set automatically when the CLI reports a rate limit (until the reported reset), or for `default_cooldown_sec` after an auth error/crash. **Reset cooldown** clears it. An account in cooldown is skipped by routing.
- One host-profile account per adapter; deleting an account deletes its sandbox folder.

### Groups

A group is a virtual model (`group:<slug>`) with an ordered list of **targets**
(adapter + model + optional pinned account, at a **tier**).

| Field | Meaning | Recommendation |
|---|---|---|
| **Tier** | Priority. All targets of the lowest available tier are tried first; higher tiers are failover. | Put accounts that should **share load at tier 1 together** — round-robin and least-active selection only happen *within* a tier. Five accounts at tiers 1…5 means one account takes all traffic until it is rate-limited. |
| **Account** | Pin the target to one account, or leave empty for "any enabled account of this adapter". | Pin when accounts differ in plan/limits. |
| **Effort override / Default effort** | Reasoning effort passed to the CLI (`none`…`xhigh`) when the client sends none. Claude/Codex honour it; agy clamps `xhigh`→`high`; Cursor encodes effort in the model id. | `high`/`xhigh` for Opus-class models, lower for flash-class. |
| **Allow tools** | Lets the CLI use **its own built-in tools** (shell, file edits) for requests that carry no client tools — with permission prompts bypassed (`--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`, `--force`). This is *not* needed for client tool calling (see [Client tool calling](#client-tool-calling)). | **Off** unless you deliberately want the CLI to act on the sandbox workspace. With a host-profile account, "on" lets the CLI act as your user. Exception: Codex client-tool bridging needs it on. |
| **Cache TTL (seconds)** | Exact-match response cache: identical `model + effort + messages` within the TTL returns the stored answer without running the CLI. Skipped for requests with tools. Stores the full answer text in SQLite. | `0` (off) for coding/agent use — requests never repeat and stale answers are confusing. Use a short TTL only for repeated identical prompts (demos, tests). |
| **Enabled** | Disabled groups return 404 `model_not_found`. | |

Deleting a target does not affect running requests; changes apply to the next request.

### API keys

- **Name** — label shown in usage.
- **Retention** — `standard` (default): sessions are reused and transcripts follow [Data retention](#data-retention). `ephemeral`: no session reuse, no response cache, the run's CLI transcript is deleted as soon as the response completes. Costs more tokens (the whole conversation is re-sent every turn and the CLI cannot use its prompt cache); use it for content that must not stay on disk.
- **Disable** stops a key immediately. A key that has usage history cannot be deleted (409) — disable it instead, so the usage records stay consistent.

### Settings

| Setting | Default | What it controls | Guidance |
|---|---|---|---|
| Default cooldown | 1800 s | Cooldown after an auth error or crash when the CLI did not report a reset time. | Lower (300–600) while setting accounts up, so a failed login does not block an account for 30 min. |
| Session TTL | 86400 s | How long a CLI session may be resumed, and how old sandbox transcripts must be before the hourly sweep deletes them. | Lower for shorter data retention; longer sessions cost nothing while idle. |
| Request timeout | 600 s | Kill a CLI run that produced no completion within this time. Paused while a run waits for a tool result. | Raise for very long generations. |
| Queue timeout | 30 s | How long a request waits for a free slot on the chosen account before moving to the next target. | Keep short; raise `Max concurrent` instead of this. |
| Tool result timeout | 300 s | How long a CLI process is kept parked waiting for the client to return a tool result. It holds an account slot meanwhile. | 60–120 s for automated clients; longer only if a human approves tool calls in the client. |
| Tool max turns | 25 | `--max-turns` for Claude Code runs with client tools (each tool round is a turn). | Raise for long agent loops. |

## Recommended configurations

**Coding agent (omp, Cursor, Continue) with tool calling**

- One group, tier 1 = your Claude Code account(s) (`opus`/`sonnet`), tier 2 = a Cursor or second Claude account as failover.
- Account **Max concurrent** = 3. Group **Allow tools** = off, **Cache TTL** = 0.
- Prefer Claude Code (or Cursor) targets for agent clients. Codex reports `prompt_tokens` **summed over its internal steps**, so a client that estimates its context window from usage (omp does) will think the conversation is far larger than it is and start compacting early. Keep Codex in a separate group for non-agent use.

**Plain chat / scripts, many accounts of the same CLI**

- All accounts at **tier 1** (round-robin + least-active spreads the load; a rate-limited account is skipped automatically).
- **Cache TTL** may be > 0 if the same prompts repeat.

**Privacy-sensitive**

- API key **Retention = ephemeral**, or a short **Session TTL**; **Cache TTL** = 0. See [Data retention](#data-retention).

## How routing works

1. **Resolve the model.** `group:<slug>` → the group's targets. `<adapter>/<model>` (e.g. `claude-code/sonnet`) → that adapter with any of its accounts. Aliases `claude-*`, `gpt-*`, `o*`, `codex*` map to Claude Code / Codex. Unknown → 404.
2. **Build candidates.** Each target expands to its enabled accounts whose adapter is installed and which are **not in cooldown**. Candidates are ordered by tier, then by fewest active runs; within the lowest tier the start position rotates (round-robin). If the conversation already has a CLI session, its account is moved to the front.
3. **Take a slot.** The request waits up to `queue_timeout_sec` for a free slot (`Max concurrent`) on the candidate; if none frees up it moves to the next candidate.
4. **Run and fail over.** The CLI is started in the account's sandbox workspace. If it reports an error **before producing any content**, the next candidate is tried (`x-cta-failovers` counts these). A rate limit, auth error, crash or timeout also puts the account in cooldown; any other CLI error (for example a model the account cannot use, or a prompt the CLI rejects) is logged and only skips that target for this request. Once content has started streaming there is no failover.
5. **Errors** when nothing is left: `429` all accounts rate-limited (with `Retry-After`), `503` all slots busy, `502` auth/crash or the last CLI error message, `504` timeout, `400 tools_unsupported` when no target can bridge client tools.

**Session reuse.** Every response is fingerprinted from the conversation (`x-conversation-id` header or the `user` field, plus every message except the last, including tool calls and results). A follow-up request whose history matches resumes the same CLI session and sends **only the newest user message** — the CLI keeps its own history and prompt cache (`x-cta-session-reused: 1`). The match breaks if the client edits earlier messages (compaction, summarisation) or changes the system prompt; the request then runs as a fresh session with the whole transcript rendered into the prompt. Sessions expire after `session_ttl_sec`.

**Usage.** Each request records the tokens the CLI reported (input, cached input, cache writes, output, reasoning), cost when the CLI reports it, time to first token and duration. Rate-limit windows reported by the CLI fill the quota bars in the console. Quotas are **tracked, never enforced**.

## Connecting clients

Replace `YOUR_KEY` with a client API key from the console.

### omp (Oh My Pi)

`~/.omp/agent/models.yml`:

```yaml
providers:
  cta:
    baseUrl: http://127.0.0.1:8080/v1
    api: openai-completions
    apiKey: CTA_API_KEY        # env var name (put CTA_API_KEY=sk-cta-... in ~/.omp/agent/.env) or the literal key
    models:
      - id: group:default
        name: Gateway default group
        contextWindow: 200000
        maxTokens: 8192
```

Do **not** set `supportsTools: false` — omp then falls back to a text "tool dialect" that inlines every tool description into the system prompt on each turn. With native tool calling the gateway bridges omp's tools to the CLI.

### Cursor / Continue

OpenAI-compatible provider, base URL `http://127.0.0.1:8080/v1`, API key = client key, model `group:<slug>` (or `claude-code/sonnet`, `claude-sonnet-4-5`, `gpt-5` …).

### Claude Desktop (custom base URL)

Anthropic base URL `http://127.0.0.1:8080`, API key = client key, model names from `GET /v1/models`.

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

Multi-turn clients should send an `x-conversation-id` header (or the OpenAI `user` field) so session reuse is not affected by identical conversations from different users.

## Client tool calling

Send OpenAI `tools` / Anthropic `tools` as with the real APIs. The gateway
exposes the tool definitions to the CLI as an MCP server at
`POST /mcp/:bridgeId` (localhost only, random 21-character id per request),
starts the CLI with its built-in tools disabled and that server allowed, and:

1. When the model calls a tool, the CLI blocks on the MCP call. The gateway returns the call to the client (`finish_reason: "tool_calls"` / `stop_reason: "tool_use"`), ends the HTTP response and **parks** the CLI process (its account slot stays taken).
2. The client executes the tool and posts the result (`role: "tool"` / `tool_result`). The gateway matches it to the parked process by tool-call id, answers the MCP call and streams the CLI's next message into the new response (`x-cta-session-reused: 1`).
3. If no result arrives within `tool_result_timeout_sec`, the parked process is killed and the slot released. A later request with the results still works: it runs a fresh session with the tool history rendered as text.

The gateway never executes a tool. `tool_choice` may be `auto` or `none`; forcing a specific tool is rejected (400). Adapter support:

| Adapter | Client tools |
|---|---|
| Claude Code | Yes |
| Codex | Yes, only in groups with **Allow tools** (Codex needs its approval bypass for MCP calls) |
| Cursor agent, agy | No — such targets are skipped for requests with tools |

The console's **In flight** panel shows parked runs as `waiting_tool_result`.

## Data retention

The gateway keeps no conversation text itself except the optional response
cache; the CLIs write transcripts, which the gateway deletes when it drops the
matching session.

| Store | Content? | Where | Lifetime |
|---|---|---|---|
| Claude Code transcript | yes | `<config>/projects/<workspace>/<sessionId>.jsonl` (`<config>/sessions/*.json` is metadata) | deleted when the gateway session expires or is replaced; sandboxed accounts also swept by age (`session_ttl_sec`) |
| Codex rollout | yes | `<CODEX_HOME>/sessions/**/rollout-*-<thread_id>.jsonl` | same |
| agy | yes | `~/.gemini/antigravity-cli/brain/<id>/`, `annotations/<id>.pbtxt`, global `history.jsonl`, `conversation_summaries.db` | per-session files on drop; sandbox sweep prunes old brain/annotation files and `history.jsonl` lines |
| Cursor agent | when the CLI writes chats | `<home>/.cursor/chats/<hash>/<chatId>/` | same; nothing is deleted if the sandboxed CLI writes no chat dirs |
| gateway `sessions` | no (hash → CLI session id) | SQLite | `session_ttl_sec`, purged hourly together with the transcript |
| gateway `response_cache` | yes (answer text) | SQLite | group `cache_ttl_sec`; purged hourly |
| gateway `requests` | no (tokens, ids, timings) | SQLite | kept |
| system-prompt temp files | yes | `os.tmpdir()/cli-to-api-system-prompt-*.txt` | 60 s; leftovers older than 1 h swept at startup and hourly |

Host-profile accounts are never bulk-swept: only the exact transcript of a
session the gateway is dropping is deleted from your profile. Ephemeral API keys
delete the run's transcript as soon as the response completes.

## Reference

### Adapters

| CLI | Version tested | Invocation | Client tools | Streaming | Session resume |
|---|---|---|---|---|---|
| Claude Code | 2.1.277 | `-p --output-format stream-json --verbose --include-partial-messages`; built-ins off with `--tools ""`; system prompt via `--system-prompt-file` | Yes (MCP bridge) | Partial deltas | `--resume <session-id>` |
| Codex | 0.155.0 | `codex exec --json`; read-only sandbox unless Allow tools | Yes, groups with Allow tools | Item completion events | `codex exec resume <thread-id>` |
| Cursor agent | 2026.09.15 | `-p --trust --output-format stream-json --stream-partial-output`; tools off with `--mode ask` | No | Partial deltas | `--resume <session-id>` |
| agy | 1.2.6 | `--output-format stream-json --print` | No | Event stream | `--conversation <id>` |
| fake (tests only) | — | `tests/fake-cli/fake-cli.mjs`, enabled with `CTA_ENABLE_FAKE_ADAPTER=1` | Yes | Claude-shaped | `--resume` |

`GET /admin/adapters` shows what is installed on this machine and which CLIs are logged in on the host.

Codex reports `input_tokens` summed over all model calls of a turn; the gateway forwards it as `prompt_tokens` unchanged.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `ADMIN_PASSWORD` | *(required)* | Console password (min 8 characters) |
| `PORT` | `8080` | Listen port |
| `HOST` | `127.0.0.1` | Listen address — keep it local; the API keys and the MCP bridge assume a trusted machine |
| `DATA_DIR` | `./data` | SQLite DB, sandboxes, bootstrap key |
| `LOG_LEVEL` | `info` | Pino log level |
| `CTA_ENABLE_FAKE_ADAPTER` | unset | `1` registers the fake CLI adapter (tests) |

### Response headers

| Header | Meaning |
|---|---|
| `x-cta-request-id` | Request id (also the `requests` row id) |
| `x-cta-model` | Model id executed on the CLI |
| `x-cta-account` | Account used (absent on cache hits) |
| `x-cta-session-reused` | `1` when the CLI session was resumed |
| `x-cta-cache` | `off`, `miss` or `hit` |
| `x-cta-failovers` | Failover attempts before success |

### Admin API

Everything the console does is available under `/admin/*` with a bearer token from `POST /admin/login {"password"}`:
`/accounts` (CRUD, `/:id/reset-cooldown`), `/groups` (create, `PUT /:id` replaces targets), `/api-keys`, `/settings` (`PATCH` with camelCase keys), `/usage/*`, `/live` (`POST /live/:requestId/abort`), `/adapters`.

### Limits

- Text only — no images or files.
- `tool_choice` cannot force a specific tool; `response_format` and legacy `functions` are rejected (400).
- No quota enforcement; no multi-user roles.

## Troubleshooting

**Requests are slow (~30 s) or land on a lower tier although tier 1 is healthy** — the tier-1 account's slots are taken. Check **In flight**: runs in `waiting_tool_result` hold a slot until the client answers or `tool_result_timeout_sec` passes. Raise the account's **Max concurrent** (agent clients need 2–4) and lower the tool result timeout.

**omp warns "compaction freed too little context… the most recent turn alone is too large"** — omp estimates its context from the `prompt_tokens` the gateway returns. Two known causes: the request was served by **Codex** (summed token counts, see above) or a tool result in the last turn is genuinely huge. Keep agent traffic on Claude/Cursor targets and start a new omp session.

**`x-cta-session-reused` is always `0`** — the client changes earlier messages between turns (compaction, dynamic system prompt), or the pinned account was busy/cooling and the request ran elsewhere. Raise **Max concurrent**; keep one account per conversation reachable.

**Account stuck in cooldown** — **Reset cooldown** on the Accounts page, or wait for the reset time. Lower **Default cooldown** while testing logins.

**`tools_unsupported`** — no target in the group can bridge client tools: only Claude Code (and Codex with Allow tools) can; add such a target or send the request without `tools`.

**A CLI process is still running after the gateway stopped** — the gateway kills parked runs on shutdown; if it was killed hard, look for `claude`/`codex` processes started from `DATA_DIR/sandboxes` and end them.

**`better-sqlite3` or `node-pty` fails to load after a Node upgrade** — `pnpm rebuild better-sqlite3 node-pty` (native addons must match the Node ABI).

**Terminal page is blank** — `node-pty` did not build; rebuild it. The console terminal is xterm.js over WebSocket.

**`cursor-agent` fails to spawn on Windows** — the npm shim is `cursor-agent.cmd` → `.ps1` → bundled `node.exe` + `index.js`; the gateway resolves this layout (including `versions/<latest>/`). Confirm `where cursor-agent` points at the npm `.cmd` and a `versions/` folder exists beside the `.ps1`.

**Real CLI smoke test** (gateway running, account logged in):

```bash
export CTA_API_KEY=sk-cta-...
node scripts/smoke-real-cli.mjs --adapter claude-code --account <account-id> --model sonnet
node scripts/smoke-real-cli.mjs --adapter claude-code --account <account-id> --model sonnet --tools
node scripts/smoke-real-cli.mjs --adapter claude-code --account <account-id> --model sonnet --tools --hold-ms 60000
node scripts/smoke-real-cli.mjs --adapter codex --account <account-id> --model group:<slug-with-allow-tools> --tools
```

`--model group:<slug>` is passed verbatim; other model ids are prefixed with the adapter id.

## Development

```bash
pnpm lint    # TypeScript check (gateway + web)
pnpm test    # unit, integration and e2e (fake CLI)
pnpm build   # apps/gateway/dist + apps/web/dist
```

Recording how a CLI talks to an MCP server (fixtures for the tool bridge):
`node scripts/record-mcp-fixture.mjs --cli claude|codex --out tests/fixtures/<name>`.

See [AGENTS.md](./AGENTS.md) for implementer conventions and `plans/` for the design history.
