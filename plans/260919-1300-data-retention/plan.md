---
title: "Data retention: conversation content leaves the machine when the session ends"
status: pending
priority: P1
effort: "1d"
branch: main
implementer: Cursor Composer 2.5 Fast
reviewer: Claude (Fable 5.1)
created: 2026-09-19
depends_on: plans/260919-0545-client-tool-calling (completed)
tags: [gateway, privacy, retention, sessions, sandbox]
---

# Data retention

## 1. Outcome

Conversation content handled by the gateway does not linger on the host: the
CLI's own transcript files are deleted when the gateway session they belong to
expires or is replaced, an admin can mark an API key **ephemeral** so nothing
about its conversations is kept after each request, and the README states
exactly what is stored where and for how long.

## 2. Context and decisions

The user's concern (2026-09-19): "tôi lo dữ liệu nằm lại trên máy". Disabling
session reuse was considered and rejected: the CLIs write a transcript for
**every** run (also without `--resume`), so turning reuse off only spreads the
same content over more files while costing tokens and prompt-cache hits. The
right lever is deleting the artifacts on a schedule tied to the gateway's own
session lifetime, plus an opt-in per-key mode that deletes immediately.

What holds content today (verified on this host, 2026-09-19):

| Store | Content? | Where | Lifetime today |
|---|---|---|---|
| Claude Code transcript | yes | `<claude config dir>/projects/<encoded workspace>/<sessionId>.jsonl` (`<claude config dir>/sessions/<pid>.json` is metadata only) | forever |
| Codex rollout | yes | `<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread_id>.jsonl` | forever |
| agy | yes | `<home>/.gemini/antigravity-cli/brain/<conversation_id>/`, `…/annotations/<conversation_id>.pbtxt`, global `…/history.jsonl` (one line per prompt: `display`, `timestamp`, `workspace`, `type`) and `…/conversation_summaries.db` | forever |
| Cursor agent | yes (to verify) | `<home>/.cursor/chats/…` on the host profile; the sandbox seen so far only has `.config/cursor/cli-config.json` | forever |
| gateway `sessions` table | no (fingerprint hash → CLI session id) | SQLite | `session_ttl_sec` (86400), purged hourly |
| gateway `response_cache.body_json` | yes (final text) | SQLite | group `cache_ttl_sec` (default 0 = off), purged hourly |
| gateway `requests` table | no (tokens, ids, timings) | SQLite | forever (usage history) |
| system-prompt temp file | yes | `os.tmpdir()/cli-to-api-system-prompt-<uuid>.txt` | 60 s, unless the gateway exits first |
| MCP bridge (tool definitions, pending results) | yes | memory | until the run ends / expires |
| logs | no by design (pino to stdout; `parseLine threw` logs 500 chars of a bad line) | stdout | — |

Where the CLI dirs are for an account: sandboxed accounts (`use_host_profile = 0`)
use `sandbox.configDir` (Claude `CLAUDE_CONFIG_DIR`, Codex `CODEX_HOME`) and
`sandbox.homeDir` (agy, Cursor). Host-profile accounts run with the user's real
profile: Claude `~/.claude` (or `$CLAUDE_CONFIG_DIR`), Codex `~/.codex` (or
`$CODEX_HOME`), agy `~/.gemini/antigravity-cli`, Cursor `~/.cursor`.

Decisions:

| Topic | Decision |
|---|---|
| Unit of deletion | The artifacts of **one CLI session id** (Claude `sessionId`, Codex `thread_id`, agy `conversation_id`, Cursor `chatId`), resolved by the adapter. |
| When | (a) whenever the gateway drops a `sessions` row: TTL purge, replacement by a fresh session, resume failure, account deletion; (b) immediately after the final round of a run on an **ephemeral** key; (c) an age sweep of sandboxed accounts' content dirs so runs that never produced a session row (errors, parked-run expiry, pre-existing files) are cleaned too. |
| Host-profile accounts | Only exact per-session deletions (a)/(b). Never an age sweep of the user's real profile. |
| Ephemeral key | No session lookup or upsert, no cache read or write, artifacts deleted after the run. Trade-off documented: every turn re-sends the transcript, no CLI prompt cache. |
| Global files that cannot be split per session (agy `history.jsonl`, `conversation_summaries.db`) | Age-pruned in the sandbox sweep (`history.jsonl` lines older than TTL removed; `conversation_summaries.db` deleted when older than TTL); left alone for host profiles. |
| Temp system-prompt files | Sweep deletes files older than 1 h at startup and hourly. |
| `requests` table | Kept (no content). |
| Default TTL | Unchanged (`session_ttl_sec` = 86400). Admins who want shorter retention lower it. |

## 3. Non-goals

- Encrypting sandboxes, secure-delete/shredding, or deleting the CLIs' credential files.
- Redacting content from logs beyond what exists (no content is logged by design).
- Deleting files under `workspace/` that the CLI wrote on the user's behalf (`allowTools` runs).
- Retention for the admin console's usage history.

## 4. Contract extension (additive to v2 plan §4.1; report any other deviation)

```ts
// core/types.ts
export interface CliDirs { configDir: string; homeDir: string; workspaceDir: string }

export interface Adapter {
  /* unchanged */
  // Absolute paths (files or directories) that hold the content of one CLI session.
  // Must only return paths that exist; never throws.
  sessionArtifacts?(dirs: CliDirs, cliSessionId: string): string[];
  // Content files/dirs older than `olderThanMs` under this adapter's content locations
  // (sandboxed accounts only). May also rewrite global files that cannot be split per
  // session (agy history.jsonl). Returns the deleted paths.
  sweepArtifacts?(dirs: CliDirs, olderThanMs: number): string[];
}

export interface ChatRequest {
  /* unchanged */
  retention: "standard" | "ephemeral";     // from the API key
}
```

`api_keys` gains `retention TEXT NOT NULL DEFAULT 'standard'` (Drizzle migration).

## 5. Phases

| # | Phase | Deliverable | Effort |
|:-:|---|---|:-:|
| 1 | [Retention](./phase-01-retention.md) | Adapter artifact resolvers and sweeps, `sessions/retention.ts`, hooks on session drop, ephemeral keys end to end (DB, auth, routing, admin API, web), startup/hourly sweep, README section, tests | 1d |

## 6. Acceptance criteria

- [ ] AC-1 After a two-turn conversation on a sandboxed `claude-code` account, lowering `session_ttl_sec` and triggering the sweep removes the gateway session row **and** `projects/**/<sessionId>.jsonl` from that sandbox. (Real CLI, manual, recorded in the report.)
- [ ] AC-2 An **ephemeral** key: two turns give `x-cta-session-reused: 0` twice, no `sessions` row, no `response_cache` row even with `cache_ttl_sec > 0`, and the run's artifact file is gone right after the response ends (fake adapter e2e; real claude-code manual).
- [ ] AC-3 The sandbox sweep deletes a Claude transcript, a Codex rollout, an agy `brain/<id>` dir + `annotations/<id>.pbtxt`, and prunes agy `history.jsonl` lines older than the TTL, while leaving newer files untouched (unit tests with temp dirs and forced mtimes).
- [ ] AC-4 A host-profile account never has anything deleted by the sweep; a per-session deletion on it removes exactly the one transcript file (unit test with a fake home dir).
- [ ] AC-5 `cli-to-api-system-prompt-*.txt` files older than 1 h in `os.tmpdir()` are removed at startup.
- [ ] AC-6 `pnpm test` green; requests on standard keys behave exactly as before (session reuse, cache).
- [ ] AC-7 README "Data retention" section matches the table above and the shipped behaviour.

## 7. Review protocol and risks

Same as the previous plan: Cursor implements, writes `reports/phase-01-report.md`,
commits on `main` without pushing; Claude reviews the diff and report.

| Risk | Mitigation |
|---|---|
| Deleting the wrong file on a host profile | Host profiles: only paths returned by `sessionArtifacts` for the exact session id; unit test asserts the resolver never returns paths outside the CLI's session directory. |
| A CLI still has the file open (parked run, concurrent run) | Only sessions the gateway has dropped are deleted; parked runs hold no `sessions` row until they finish. Deletion errors are logged at `warn` and retried on the next sweep. |
| Cursor chat location unknown in sandboxes | Phase verifies with a real run on the sandboxed Cursor account; if nothing is written there, `sessionArtifacts` returns `[]` and the README says so. |
| Windows path length / locked files | Use `rm` with `force: true`; ignore `EBUSY`/`EPERM` and retry next sweep. |
