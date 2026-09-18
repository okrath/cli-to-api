---
title: "cli-to-api v2 — clean rewrite of the CLI-to-API gateway"
status: draft
priority: P0
effort: "5-7d"
branch: main
implementer: Cursor Composer 2.5
reviewer: Claude (Fable 5.1)
created: 2026-09-18
tags: [gateway, openai-compat, anthropic-compat, load-balancer, sessions, cache, admin-ui]
---

# cli-to-api v2 — clean rewrite

## 1. Outcome

A local daemon on `http://localhost:8080` that exposes locally installed AI
coding CLIs (Claude Code, Codex, Antigravity `agy`, OMP) as:

- **OpenAI-compatible API**: `POST /v1/chat/completions`, `GET /v1/models`
- **Anthropic-compatible API**: `POST /v1/messages`, `GET /v1/models`

plus a **web admin console** at `/` to manage CLI accounts, routing groups
(load balancer + failover), client API keys, token usage, and to open a
terminal into the host or into any account sandbox for interactive login.

Cost optimisation is done two ways: **CLI session reuse** (only the newest
message is sent on follow-up turns so the provider's prompt cache hits) and an
optional **exact-match response cache**.

## 2. Why a rewrite (lessons from v1, archived as git tag `v1`)

v1 (tag `v1`, commit `ed457ea`) was judged over-engineered, unstable in real use, and
hard to operate. Root causes found by reading v1:

| v1 problem | v2 decision |
|---|---|
| Adapters defined in YAML, output scraped by regex (`chunk_regex: "(?s)(.*)"`, `regex_stream` for Codex). Token counts estimated. Rate limits detected by text regex. | Adapters are **small TypeScript modules**. They only consume each CLI's **structured JSONL** output. Token usage and rate-limit state come from the CLI itself. No PTY, no ANSI stripping on the API path. |
| Merkle prefix hashing for session affinity, SWRR scheduler, Win32 Job Objects, 5 "planes" of telemetry. | One fingerprint hash per conversation. Priority tiers + least-active pick. Kill the process tree with `taskkill /T` (Windows) or a process-group signal (POSIX). One usage table + one aggregation endpoint. |
| One static API key (`sk-cta-dev`), one admin secret. | Managed client API keys (create/revoke, per-key usage). Admin login with one password from env. |
| "Obsidian Cyberdeck" UI. | Plain, dense admin UI. Tables, forms, one chart type. |
| Cooldown only; no visibility of remaining quota. | Store the CLI-reported rate-limit windows per account (Claude reports 5h / 7d utilization and reset time). **Track only, never block.** |

## 3. Constraints and non-goals

Constraints
- Node >= 22, TypeScript strict, pnpm monorepo: `apps/gateway` (Fastify 5) and `apps/web` (Vite + React 18 + Tailwind). SQLite via `better-sqlite3` >= 13 (Node 24 safe) + Drizzle ORM. Tests with Vitest.
- Windows 11 is the primary dev/runtime host; Linux/macOS must also work. No native add-ons beyond `better-sqlite3` and `node-pty` (terminal only).
- Every API request path goes: normalise → route → run CLI → serialise. No path may parse free-form terminal text.
- KISS. A file over ~300 lines or a module with more than one responsibility is a smell. No abstraction with a single implementation. No "manager"/"engine"/"orchestrator" classes; plain functions and small modules.
- Real behaviour only. No mocks in production code. Tests use **recorded JSONL fixtures** (phase 02) and a fake CLI script, never regex over prose.
- Follow `AGENTS.md` at the repo root.

Non-goals (v2.0)
- User-defined YAML/custom adapters. New CLI = new TS file.
- Enforcing quotas or billing. Usage is tracked and displayed only.
- OpenAI `tools`/function-calling passthrough, image inputs, embeddings, audio.
- Multi-user RBAC, cloud deployment, TLS termination.
- Chat playground in the admin UI.

## 4. Architecture

```
Client (Cursor, Claude Desktop, SDKs) ──HTTP/SSE──▶ apps/gateway (Fastify, :8080)
                                                     │
   /v1/chat/completions ─┐                            │  api/openai.ts, api/anthropic.ts
   /v1/messages ─────────┼─▶ protocol/normalize-*.ts ──▶ ChatRequest (internal, dialect-free)
   /v1/models ───────────┘                            │
                                                      ▼
                                       router/route-request.ts
                                       ├─ cache/response-cache.ts   (exact hit → serve, done)
                                       ├─ sessions/session-store.ts (fingerprint → account + cli session id)
                                       ├─ router/select-target.ts   (group → tier → least-active account, skip cooldown)
                                       └─ failover loop            (spawn error / rate-limit before first token → next target)
                                                      │
                                                      ▼
                                       runner/run-cli.ts  (spawn, JSONL line reader, kill tree, timeout)
                                       adapters/{claude-code,codex,agy,omp}.ts  (buildArgs + parseLine → CliEvent)
                                                      │
                                                      ▼  AsyncIterable<CliEvent> (dialect-free)
                                       protocol/serialize-openai.ts | protocol/serialize-anthropic.ts
                                                      │
                                       usage/record-usage.ts  (tokens, cache read, cost, rate-limit snapshot)

Admin console (apps/web) ──▶ /admin/* REST (accounts, groups, keys, usage, requests, adapters)
                          ──▶ /admin/ws/terminal?target=host|account:<id>  (node-pty ⇄ xterm.js)
```

### 4.1 Internal contracts (authoritative, shared by all phases)

```ts
// apps/gateway/src/core/types.ts
export type Role = "system" | "user" | "assistant";
export interface ChatMessage { role: Role; content: string }          // text only in v2.0
export type Effort = "none" | "low" | "medium" | "high" | "xhigh";

export interface ChatRequest {
  requestId: string;                 // "req_" + nanoid
  apiKeyId: string;
  dialect: "openai" | "anthropic";
  model: string;                     // as sent by client: "group:default" | "claude-code/sonnet" | "claude-sonnet-4-5" ...
  messages: ChatMessage[];           // at most one system message, always at index 0 if present
  stream: boolean;
  effort?: Effort;                   // from reasoning_effort or thinking.budget_tokens (mapping in phase 03)
  maxTokens?: number;
  conversationHint?: string;         // x-conversation-id header if present (improves session reuse)
  clientAbort: AbortSignal;
}

export type CliEvent =
  | { type: "session";        cliSessionId: string }
  | { type: "thinking_delta"; text: string }
  | { type: "text_delta";     text: string }
  | { type: "usage";          input: number; cachedInput: number; cacheWrite: number; output: number; reasoning: number; costUsd?: number }
  | { type: "rate_limit";     windows: Array<{ name: string; utilization: number; resetsAt: number }>; limited: boolean }
  | { type: "error";          kind: "rate_limit" | "auth" | "crash" | "timeout" | "unknown"; message: string; retryAfterSec?: number }
  | { type: "done";           stopReason: "end_turn" | "max_tokens" | "error" };

export interface Adapter {
  id: "claude-code" | "codex" | "agy" | "omp";
  executable: string;                                         // "claude" | "codex" | "agy" | "omp"
  models: Array<{ id: string; label: string }>;               // static list, editable in the adapter file
  buildArgs(input: {
    model: string; effort?: Effort; systemPrompt?: string;
    resume?: { cliSessionId: string };                        // when set, the prompt is ONLY the newest user message
    allowTools: boolean;
  }): { args: string[]; promptVia: "argv" | "stdin" };
  // The adapter never sees the prompt text. The runner delivers it: "stdin" → written to the
  // child's stdin then closed; "argv" → appended as the FINAL argv entry after `args`.
  // Sandbox paths are only available in buildEnv; args must not depend on them.
  buildEnv(sandbox: { accountDir: string; homeDir: string; configDir: string; workspaceDir: string }): NodeJS.ProcessEnv;
  parseLine(line: string): CliEvent[];                        // one JSONL line → zero or more events; must never throw
  parseStderr?(text: string): CliEvent[];                     // only for auth/rate-limit hints; optional
}
```

Every adapter must be testable with `parseLine` alone, using the fixtures in
phase 02. Prompt rendering for a **new** session (no `resume`) is shared code in
`runner/render-transcript.ts`: the system prompt goes to the adapter's system
flag when it has one; the remaining messages are rendered as

```
<conversation>
[user]
...
[assistant]
...
</conversation>
Continue the conversation. Reply as the assistant to the last user message only.
```

For a single-turn request (one user message, no prior assistant turn) the
prompt is the raw user text without the wrapper.

## 5. Data model (SQLite, Drizzle)

| table | key columns | notes |
|---|---|---|
| `accounts` | id, adapter_id, name, sandbox_dir, max_concurrent (default 1), cooldown_until, cooldown_reason, enabled, created_at | one row per CLI login. Active count is kept in memory, not in the DB. |
| `account_rate_limits` | account_id, window_name, utilization (0..1), resets_at, observed_at; pk (account_id, window_name) | upsert on every `rate_limit` event; drives quota bars |
| `groups` | id (`group:<slug>`), name, description, default_effort, allow_tools (bool, default false), cache_ttl_sec (0 = off), enabled | virtual model |
| `group_targets` | id, group_id, tier (1 = first), account_id (nullable = any account of adapter), adapter_id, model_id, effort_override, enabled | ordered failover chain |
| `api_keys` | id, key_hash (sha256), key_prefix (first 12 chars for display), name, enabled, last_used_at, created_at | plaintext shown once at creation; format `sk-cta-` + 32 url-safe chars |
| `requests` | id, api_key_id, dialect, model_requested, group_id, account_id, adapter_id, model_executed, status (`ok`/`error`/`cache_hit`), error_kind, input_tokens, cached_input_tokens, cache_write_tokens, output_tokens, reasoning_tokens, cost_usd, ttft_ms, duration_ms, session_reused (bool), failover_count, created_at | one row per client request |
| `sessions` | fingerprint (pk), account_id, adapter_id, model_id, cli_session_id, turns, last_used_at, expires_at | conversation → CLI session |
| `response_cache` | key (pk), group_id, body_json (final text + thinking + usage), created_at, expires_at | exact-match cache |
| `settings` | key (pk), value | admin-editable defaults: default_cooldown_sec (1800), session_ttl_sec (86400), request_timeout_sec (600) |

## 6. Phases

| # | Phase | Deliverable | Depends on | Effort |
|:-:|---|---|:-:|:-:|
| 1 | [Foundation](./phase-01-foundation.md) | Monorepo, Fastify server, SQLite schema + migrations, config, admin auth, API-key auth, `/healthz` | — | 0.5d |
| 2 | [CLI runner and adapters](./phase-02-runner-and-adapters.md) | `run-cli.ts`, sandbox env, kill tree, 4 adapters with `parseLine` fixtures | 1 | 1.5d |
| 3 | [Protocol layer](./phase-03-protocol-layer.md) | OpenAI + Anthropic normalisers and serialisers (stream + non-stream), `/v1/models`, error mapping | 1 | 1d |
| 4 | [Routing, sessions, cache, usage](./phase-04-routing-sessions-cache-usage.md) | Group resolution, target selection, cooldown, failover, session reuse, response cache, usage + rate-limit recording | 2, 3 | 1.5d |
| 5 | [Admin API and terminals](./phase-05-admin-api-and-terminals.md) | `/admin/*` REST, WebSocket PTY for host and account sandboxes | 1, 4 | 0.5d |
| 6 | [Admin web console](./phase-06-admin-web-console.md) | React app: Overview, Accounts, Groups, API keys, Usage, Terminal | 5 | 1.5d |
| 7 | [E2E and docs](./phase-07-e2e-and-docs.md) | Fake-CLI end-to-end tests, real-CLI smoke script, README | 1–6 | 0.5d |

Phases 2 and 3 touch disjoint files and can be built in parallel. Everything else is sequential.

## 7. Acceptance criteria (whole project)

- AC-1 The `openai` Python SDK with `base_url=http://localhost:8080/v1` streams a reply from `model="group:default"`; the `anthropic` SDK with `base_url=http://localhost:8080` streams from `model="claude-sonnet-4-5"`. Both non-stream variants return correct `usage`.
- AC-2 Two accounts of the same adapter in one group: when account A reports a rate limit before its first token, the same client request completes on account B, A gets `cooldown_until` = the reported reset time, and the `requests` row shows `failover_count = 1`.
- AC-3 A three-turn conversation from the same client reuses one CLI session: turns 2 and 3 have `session_reused = 1` and the CLI is invoked with its resume flag and only the newest user message.
- AC-4 With `cache_ttl_sec > 0` on a group, an identical second request returns in under 50 ms with `status = cache_hit`, no CLI is spawned, and a streaming client still receives a well-formed SSE stream.
- AC-5 Aborting the HTTP request kills the CLI process tree within 500 ms (no orphaned `claude`/`codex` processes).
- AC-6 Admin console: create account → open its terminal → run the CLI's login → account shows as ready; create a group with two targets; create an API key; the usage page shows tokens per day per key/account/model and per-account quota bars.
- AC-7 `pnpm test` is green; `pnpm build` produces `apps/gateway/dist` and `apps/web/dist`, and the gateway serves the web build at `/`.

## 8. Review protocol

Cursor implements phase by phase and writes a short report to
`plans/260918-2240-v2-clean-rewrite/reports/phase-0N-report.md` (what was built,
how it was verified, deviations from the phase file). Claude reviews each report
plus the diff against the phase's acceptance criteria before the next phase
starts. Any deviation from the section 4.1 contracts must be called out in the
report.

## 9. Risks

| Risk | Mitigation |
|---|---|
| CLI JSONL formats change between versions | Adapters pin the flags used and carry fixtures named with the CLI version. `GET /admin/adapters` shows the detected version. |
| Codex has no "disable tools" flag | Run `codex exec --sandbox read-only` inside the account workspace; document that Codex may still read files there. |
| Windows process kill leaves children | Always `taskkill /PID <pid> /T /F`; the AC-5 test asserts no leftover processes. |
| Session resume fails (CLI session expired or corrupted) | On a resume error, delete the `sessions` row and retry once as a new session on the same account. |
| Response cache returns stale answers | Off by default (`cache_ttl_sec = 0`); the key includes model, effort, and the full message list. |
