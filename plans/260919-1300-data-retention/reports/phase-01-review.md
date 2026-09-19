# Phase 01 review

Final verdict after the fix round (`9a37ac8`): APPROVED — plan complete. The 409 on deleting a used key,
the dead `purgeExpiredSessions` removal and the ephemeral parked-run cleanup are in; independently
re-ran `pnpm lint` (clean), `pnpm test` (32 files, 206 tests, green) and `pnpm build` (green).

---

Original verdict (`f06673a`): CHANGES REQUESTED — one small required fix, then approve.

Reviewed commit `f06673a` against `phase-01-retention.md` and plan §2/§4.
Independently re-ran `pnpm lint` (clean), `pnpm test` (32 files, 204 tests, green), `pnpm build`
(green) and a live check on the real host-profile `claude-code` account:

- ephemeral key (created via `POST /admin/api-keys`, `retention: ephemeral`): one turn →
  `x-cta-session-reused: 0`, the transcript count under
  `~/.claude/projects/<workspace>/` stayed at 29 (the run's file was deleted right after the response);
- standard key: same turn → count 29 → 30 (kept), session row upserted;
- no orphaned CLI processes after stopping the gateway.

## Confirmed good

- Deletion is confined to adapter resolvers; `sweepSandboxes` selects `use_host_profile = 0` only; host profiles get exact per-session deletions (Claude `projects/*/<id>.jsonl` + matching `sessions/*.json`, Codex `rollout-*-<thread_id>.jsonl`).
- `cliDirs` host resolution (`CLAUDE_CONFIG_DIR`/`~/.claude`, `CODEX_HOME`/`~/.codex`, agy/Cursor home).
- agy: `brain/<id>`, `annotations/<id>.pbtxt`, `history.jsonl` pruned by `timestamp` (verified the file uses milliseconds, so the cutoff comparison is right), `conversation_summaries.db` by age.
- Hooks: `replaceSession` drops artifacts when the CLI session id changes (both old and colliding new fingerprint), `deleteSession` on resume failure, `purgeSessionsWithArtifacts` at startup and hourly, temp prompt sweep.
- Ephemeral routing: no lookup/upsert, no cache read/write, artifacts deleted after the final round only; tool runs unaffected until the final `done`.
- Migration `0002_small_prowler.sql` generated with drizzle-kit; README "Data retention" matches the shipped behaviour; Cursor sandbox finding documented honestly.

## Required fix

1. **`DELETE /admin/api-keys/:id` returns 500 for any key that has been used.** Reproduced while cleaning up
   the review's ephemeral key: `requests.api_key_id` is `NOT NULL REFERENCES api_keys(id)`, so the delete
   violates the foreign key and Fastify answers a raw 500; the console's Delete button hits the same
   path. Pre-existing, but this phase makes short-lived keys a normal workflow, so fix it here: when
   `requests` rows reference the key, respond `409` with
   `{ error: "API key has usage history; disable it instead" }` (the console already shows the
   message and offers Disable); otherwise delete as today. Add a test in `tests/admin/api-keys.test.ts`.

## Nits (fold into the same commit)

- `session-store.ts` `purgeExpiredSessions` has no callers left (and a dead `_log` parameter); delete it.
- Ephemeral runs whose parked tool round expires (client never answers) leave the transcript on
  host-profile accounts until the session is otherwise dropped. Cheapest fix: `ParkedRun.ephemeral`
  and, in `sweepExpiredBridges`, call `deleteRunArtifacts` for such runs (the run already carries
  `accountId`, `adapterId`, `cliSessionId`). If you skip it, add one sentence to README.
