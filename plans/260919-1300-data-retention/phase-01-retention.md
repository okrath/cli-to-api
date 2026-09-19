# Phase 01 — Retention

Status: pending · Depends on: — · Effort: 1d

## Context

Read `plan.md` §2 (what holds content, where the CLI dirs are) and §4 (contract
extension) first. All deletion goes through one module, `sessions/retention.ts`;
adapters only *resolve* paths. Existing purge timer: `apps/gateway/src/index.ts`
(`purgeExpiredSessions` + `purgeExpiredCache` hourly). Existing account deletion:
`api/admin/accounts.ts` (`rmSync(row.sandboxDir)`).

## Requirements

### 1. Contracts and DB

- `core/types.ts` per plan §4 (`CliDirs`, `Adapter.sessionArtifacts?`, `Adapter.sweepArtifacts?`, `ChatRequest.retention`).
- `db/schema.ts` `apiKeys.retention: text("retention").notNull().default("standard")`; generate the Drizzle migration under `apps/gateway/drizzle/` (do not hand-edit `meta/`; use the project's drizzle-kit command). Existing rows default to `standard`.
- `auth/api-key-auth.ts`: `request.apiKeyRetention = row.retention` (declare on `FastifyRequest`); `api/chat-handler.ts` `wrapNormalize` passes `retention` into the normalisers' input and both normalisers copy it onto the `ChatRequest` (default `"standard"`).

### 2. CLI dirs — `runner/sandbox.ts`

`cliDirs(adapterId, account, sandbox): CliDirs`:
- sandboxed account → `{ configDir: sandbox.configDir, homeDir: sandbox.homeDir, workspaceDir: sandbox.workspaceDir }`;
- host profile → `configDir` = `claude-code`: `process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude")`; `codex`: `process.env.CODEX_HOME ?? join(homedir(), ".codex")`; `agy` / `cursor-agent`: `homeDir` = `homedir()`; `workspaceDir` = `sandbox.workspaceDir`.

### 3. Adapters — resolvers (each ≤ 40 lines, sync, never throw, return only existing paths)

- `claude-code.ts` `sessionArtifacts(dirs, id)`: scan `join(dirs.configDir, "projects")` one level deep for `<id>.jsonl`; also `join(dirs.configDir, "sessions", "*.json")` whose JSON `sessionId === id`. `sweepArtifacts(dirs, olderThanMs)`: every `projects/*/*.jsonl` and `sessions/*.json` with `mtimeMs < now − olderThanMs`.
- `codex.ts` `sessionArtifacts`: `join(dirs.configDir, "sessions")` recursively for files matching `rollout-*-<id>.jsonl`. `sweepArtifacts`: `sessions/**/rollout-*.jsonl` older than the limit.
- `agy.ts` (base `join(dirs.homeDir, ".gemini", "antigravity-cli")`): `sessionArtifacts` = `brain/<id>` (dir) + `annotations/<id>.pbtxt`. `sweepArtifacts`: `brain/*` dirs and `annotations/*.pbtxt` older than the limit; rewrite `history.jsonl` keeping only lines whose `timestamp` is within the limit (parse each line as JSON; keep unparsable lines); delete `conversation_summaries.db` when older than the limit.
- `cursor-agent.ts`: run the sandboxed Cursor account once through the gateway, record in the report which files appear under `dirs.homeDir` (expected `.cursor/chats/<hash>/<chatId>/…`), and implement `sessionArtifacts` = that `<chatId>` directory and `sweepArtifacts` = chat dirs older than the limit. If nothing is written in the sandbox, implement both as `[]` and say so in the report and README.
- fake adapter (`adapters/index.ts`): `sessionArtifacts` = `join(dirs.configDir, "fake-sessions", `${id}.jsonl`)`; `sweepArtifacts` = files in that dir older than the limit. Fake CLI: when `FAKE_WRITE_SESSION=1`, scenario `ok` writes `$FAKE_CONFIG_DIR/fake-sessions/fake-session-001.jsonl` with one JSON line (the fake adapter's `buildEnv` sets `FAKE_CONFIG_DIR` to `sandbox.configDir`).

### 4. Retention module — `sessions/retention.ts` (plain functions)

```ts
export function deleteSessionArtifacts(deps, row: { accountId; adapterId; cliSessionId }): string[]
export function deleteRunArtifacts(deps, accountId: string, adapterId: string, cliSessionId: string): string[]   // ephemeral
export function sweepSandboxes(deps, olderThanMs: number): { deleted: string[]; failed: string[] }        // sandboxed accounts only
export function sweepTempPromptFiles(olderThanMs: number): string[]                                        // os.tmpdir()/cli-to-api-system-prompt-*.txt
export function purgeSessionsWithArtifacts(deps, now: number): number   // select expired rows → delete artifacts → delete rows
```
`deps = { db, dataDir, log }`. Deletion uses `rmSync(path, { recursive: true, force: true })`; `EBUSY`/`EPERM`/`ENOENT` are logged at `warn` (path, code) and skipped; other errors are logged at `error` and skipped. Never throw.

Hooks:
- `sessions/session-store.ts`: `replaceSession` when the old row's `cliSessionId` differs from the new one → `deleteSessionArtifacts(old)`; `deleteSession` → resolve the row first, delete artifacts, then the row. Both need `deps` — pass `{ dataDir, log }` through from callers (`route-request.ts`, `execute-candidate.ts`, `finalize-run.ts`); keep signatures explicit, no globals.
- `index.ts`: at startup and hourly: `purgeSessionsWithArtifacts`, `purgeExpiredCache`, `sweepSandboxes(settings.sessionTtlSec * 1000)`, `sweepTempPromptFiles(3_600_000)`.
- `api/admin/accounts.ts`: account deletion already removes the sandbox; additionally delete the account's `sessions` rows (they reference the account) before `rmSync`.

### 5. Ephemeral keys — routing

- `route-request.ts`: when `req.retention === "ephemeral"`: skip the session lookup (`pinnedAccount`/`resume` stay undefined), pass `cacheEnabled = false`, and pass `ephemeral: true` to `trackCompletion`.
- `finalize-run.ts`: with `ephemeral`, do not upsert the session and do not write the cache; after the final `done` (not `tool_use`), call `deleteRunArtifacts(deps, accountId, adapterId, cliSessionId)` when a `session` event was seen (or `fallbackCliSessionId` from a parked run). For a run that ends with `tool_use`, nothing is deleted until the final round.
- Response header `x-cta-session-reused: 0` as today; add nothing else.

### 6. Admin API and web

- `api/admin/api-keys.ts`: `createKeySchema` / `patchKeySchema` accept `retention: z.enum(["standard", "ephemeral"])`; `serializeKey` returns it.
- `apps/web/src/pages/api-keys.tsx`: a select "Retention" (`standard` / `ephemeral — no history kept`) on create and a column in the table; `apps/web/src/api.ts` type update.

### 7. Docs — `README.md`

New section **Data retention** with the table from plan §2 updated to the shipped behaviour (what is stored, where, lifetime, host-profile caveat), the ephemeral-key trade-off (no session reuse / prompt cache; more tokens per turn), the `session_ttl_sec` knob, and the Cursor finding from §3.

## Files

```
apps/gateway/src/core/types.ts
apps/gateway/src/db/schema.ts, apps/gateway/drizzle/000N_*.sql (+ meta via drizzle-kit)
apps/gateway/src/auth/api-key-auth.ts, apps/gateway/src/api/chat-handler.ts
apps/gateway/src/protocol/normalize-openai.ts, normalize-anthropic.ts        (retention on ChatRequest)
apps/gateway/src/runner/sandbox.ts                                            (cliDirs)
apps/gateway/src/adapters/{claude-code,codex,agy,cursor-agent,index}.ts
apps/gateway/src/sessions/retention.ts, session-store.ts
apps/gateway/src/router/{route-request,finalize-run,execute-candidate}.ts
apps/gateway/src/index.ts, apps/gateway/src/api/admin/{api-keys,accounts}.ts
apps/web/src/pages/api-keys.tsx, apps/web/src/api.ts
tests/fake-cli/fake-cli.mjs
README.md
apps/gateway/tests/adapters/*.test.ts        resolvers with temp dirs and forced mtimes (fs.utimesSync); host-profile resolver never returns paths outside the session dir
apps/gateway/tests/sessions/retention.test.ts sweeps, purge with artifacts, temp prompt files, error tolerance (locked/missing file)
apps/gateway/tests/router/route-request.test.ts ephemeral key: no session row, no cache row, fake session file deleted after the run; standard key unchanged
apps/gateway/tests/admin/api-keys.test.ts     retention create/patch/list
tests/e2e/acceptance.test.ts                  AC-2 with an ephemeral key created through /admin/api-keys
```

## Validation

- `pnpm lint`, `pnpm test`, `pnpm build` green.
- Real CLI (record in the report): on the sandboxed Cursor account, one run → list new files under its `home/` (for §3). On the `claude-code` account: two-turn conversation on a standard key → note the transcript path; set `session_ttl_sec` to 1 via `/admin/settings`, wait, trigger the sweep (restart the gateway or call the hourly function through a tiny script) → the `sessions` row and the transcript are gone. Then an ephemeral key: two turns, `x-cta-session-reused: 0` both, no transcript left after the second response.
- Gateway start/stop rules from the previous plan's handoff apply (never kill processes by name; stop only the PID you started).

## Risks / rollback

Deletions are limited to paths returned by adapter resolvers; the sweep only
touches sandboxed accounts. Rollback: revert; the migration only adds a
defaulted column.

## Report

`reports/phase-01-report.md` in the AGENTS.md format, with the Cursor finding
and the real-CLI evidence.
