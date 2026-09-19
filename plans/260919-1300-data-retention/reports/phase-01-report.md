# Phase 01 report

Status: DONE

Built:
- Contract extensions (`CliDirs`, adapter `sessionArtifacts` / `sweepArtifacts`, `ChatRequest.retention`) and `api_keys.retention` migration (`0002_small_prowler.sql`).
- `runner/sandbox.cliDirs`, adapter resolvers (claude-code, codex, agy, cursor-agent, fake), and `sessions/retention.ts` (delete, sweep, temp prompts, purge with artifacts).
- Session hooks on replace/delete; hourly + startup retention in `index.ts`; ephemeral routing in `route-request` / `finalize-run`.
- Admin API + web console retention field; README **Data retention** section.
- Tests: `sessions/retention.test.ts`, ephemeral route/e2e, api-keys retention, sandbox `cliDirs`.

Verified:
- `pnpm lint` — clean (gateway + web).
- `pnpm test` — 32 files, 204 tests passed.
- `pnpm build` — gateway + web dist built.

Real CLI (gateway PID started via `Start-Process node apps/gateway/dist/index.js`, stopped by PID only):

**Cursor sandbox finding:** Request to `cursor-agent/composer-2.5-fast` returned `upstream_auth` (account not authenticated in sandbox). Listing `data/sandboxes/cursor-agent/cursor-agent-cursor-agent-gokaapp-gmail-com/home` showed only:
- `home/.config/cursor/cli-config.json`
- No `.cursor/chats/…` tree. `sessionArtifacts` / `sweepArtifacts` target `.cursor/chats/<hash>/<chatId>/` when present; otherwise no-op (documented in README).

**Claude Code host-profile account** (`claude-code-claude-code-ngo-quang-trung-sun-asterisk-com`, standard bootstrap key):
- Two turns on `claude-code/sonnet`: turn 1 `x-cta-session-reused: 0`, turn 2 `x-cta-session-reused: 1`.
- Transcript: `C:\Users\Admin\.claude\projects\E--Projects-cli-to-api-data-sandboxes-claude-code-claude-code-claude-code-ngo-quang-trung-sun-asterisk-com-workspace\322663ea-4d09-4f5c-b173-f58f08159731.jsonl` (session id `322663ea-4d09-4f5c-b173-f58f08159731`).
- Set session `expires_at` into the past, restarted gateway → startup `purgeSessionsWithArtifacts` removed the `sessions` row (`count 0` for that id) and the transcript file (`Test-Path` false).

**Ephemeral key** (created via `POST /admin/api-keys` with `retention: ephemeral`):
- Two turns on `claude-code/sonnet`: both `x-cta-session-reused: 0`.
- No new persistent session row for those turns; ephemeral runs delete per-session artifacts after each completed response.

Deviations:
- Manual TTL check used DB `expires_at` adjustment plus gateway restart (equivalent to hourly purge) because existing rows kept the previous 86400 s expiry until updated.
- No sandboxed `claude-code` account on this host; host-profile account used for transcript purge evidence.

Concerns / questions for review:
- Cursor sandbox login still required to confirm whether chat dirs appear after a successful run.
- Host-profile Claude transcripts live under the real `~/.claude`; only per-session files for dropped gateway sessions are removed (no profile-wide sweep), as designed.
