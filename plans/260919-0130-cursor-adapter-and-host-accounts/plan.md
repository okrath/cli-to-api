---
title: "Cursor agent adapter, popular-CLI set, and host-profile accounts"
status: completed
priority: P1
effort: "1d"
branch: main
implementer: Cursor Composer 2.5
reviewer: Claude (Fable 5.1)
created: 2026-09-19
depends_on: plans/260918-2240-v2-clean-rewrite (completed)
---

# Cursor agent adapter, popular-CLI set, and host-profile accounts

## 1. Outcome

- The gateway ships adapters for the popular coding CLIs only: **Claude Code**,
  **Codex**, **Cursor agent** (`cursor-agent`), **Antigravity** (`agy`). `omp`
  is removed.
- An admin can create an account that **uses the login already present on this
  machine** (the user's real profile) instead of logging in again inside an
  isolated sandbox. The console shows, per adapter, whether such a login exists
  and for which user.

## 2. Context and decisions

- User request: "làm A đi, bỏ omp, chỉ cung cấp những CLI phổ biến" and "đã có
  sẵn tài khoản trên máy, quét được không?".
- v1 data (`data/sandboxes`, `data/sqlite.db`) no longer exists anywhere on the
  host and v1 never had an account import feature, so there is nothing to
  migrate. The useful feature is detecting the **host profile logins**.
- Detected on the dev host (2026-09-19): Claude Code (`claude auth status` →
  `{"loggedIn": true, "authMethod": "claude.ai", …}`), Codex (`codex login status`
  → "Logged in using ChatGPT", printed on stderr, exit 0), Cursor agent
  (`cursor-agent status` → "✓ Logged in as <email>"), agy (config under
  `~/.gemini/antigravity-cli`, no status command known → report `unknown`).
- Host-profile accounts run the CLI with the **user's own environment**
  (no `HOME`/config-dir override), only the working directory is set to the
  account's workspace. Consequences to document: one host-profile account per
  adapter; its rate limits are shared with the user's interactive use of the same
  CLI; credentials are never copied, so nothing can go stale.
- Cursor agent facts (recorded, `tests/fixtures/cursor-agent-2026.09.15-pong.jsonl`):
  `-p --output-format stream-json --stream-partial-output` prints one JSON per
  line: `system/init` (session_id), `user`, `thinking/delta` (text),
  `thinking/completed`, `assistant` **with** `timestamp_ms` = a text delta,
  `assistant` **without** `timestamp_ms` = the aggregated final message (ignore),
  `result` with `usage.{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}`
  and `is_error`. Resume: `--resume <chatId>`. Tools off: `--mode ask`; tools
  on: `--force`. Needs `--trust`. Effort is encoded in the model id
  (`composer-2.5-fast`, `claude-opus-5-thinking-high`), so `effort` is ignored.
  On Windows `cursor-agent.cmd` → `cursor-agent.ps1` →
  `versions/<latest>/node.exe versions/<latest>/index.js`; the current resolver
  falls back to `shell: true` for this shim, which is unsafe for argv prompts, so
  the resolver learns this shim shape (phase 01).

## 3. Non-goals

- Copying credential files between profiles.
- Runtime-defined adapters (declarative JSON mapping) — separate plan if wanted.
- Gemini CLI, Aider, OpenCode: not installed here, no fixture → not in this plan.

## 4. Phases

| # | Phase | Deliverable | Effort |
|:-:|---|---|:-:|
| 1 | [Popular CLI set](./phase-01-popular-cli-set.md) | `cursor-agent` adapter with fixture tests, `omp` removed everywhere, resolver handles the Cursor shim, README adapter table | 0.5d |
| 2 | [Host-profile accounts](./phase-02-host-profile-accounts.md) | `use_host_profile` accounts end to end (schema, runner, terminal, admin API, console), per-adapter host-login detection | 0.5d |

Sequential: phase 02 touches `adapters/index.ts` and the console after phase 01 lands.

## 5. Acceptance criteria

- AC-1 `GET /v1/models` lists `cursor-agent/*` models and no `omp/*`; `pnpm test` has no omp references; the omp fixture is deleted.
- AC-2 With the reviewer's real host login, a host-profile `cursor-agent` account answers `POST /v1/chat/completions {model: "cursor-agent/composer-2.5-fast"}` with text "pong" and non-zero usage; the same for `claude-code/haiku` through a host-profile Claude account.
- AC-3 `GET /admin/adapters` returns `hostLogin: { status: "logged_in", label: "<email or method>" }` for claude-code, codex and cursor-agent on the dev host, and `status: "unknown"` for agy.
- AC-4 Creating a second host-profile account for the same adapter returns 409. Deleting a host-profile account never touches anything outside `data/`.
- AC-5 The account terminal for a host-profile account opens the user's normal shell environment (`echo $env:USERPROFILE` shows the real profile) in the account workspace.
- AC-6 `pnpm lint`, `pnpm build`, `pnpm test` green; existing e2e suite unchanged.

## 6. Review protocol

Same as the v2 plan: Cursor writes `reports/phase-0N-report.md`, Claude reviews and re-runs the real-CLI smoke (`scripts/smoke-real-cli.mjs` or the reviewer's script) before the next phase.
