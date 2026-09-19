# Handoff brief for the implementer (Cursor Composer 2.5 Fast)

Single phase. Do exactly this:

1. Read `AGENTS.md` at the repo root in full.
2. Read `plans/260919-1300-data-retention/plan.md` in full; §2 (where content lives) and §4 (contract extension) are fixed.
3. Read `plans/260919-1300-data-retention/phase-01-retention.md` in full and implement every requirement. Nothing more.
4. Deletion code must only ever remove paths returned by an adapter's `sessionArtifacts` / `sweepArtifacts`, and the sweep must skip host-profile accounts. Never delete anything under the user's real profile except the exact session file of a session the gateway is dropping.
5. Use `pnpm`. Run `pnpm lint` and `pnpm test` and iterate until green. Do not weaken, skip or delete tests. Requests on standard keys must behave exactly as before.
6. Environment rules: never kill any process by name or image (you run on node). For real-CLI checks: `pnpm build`, start `node apps/gateway/dist/index.js` with Start-Process from the repo root, remember its PID, wait for `http://127.0.0.1:8080/healthz`, stop only that PID at the end. Admin password is in `.env`, client key in `data/bootstrap-api-key.txt`, accounts: `claude-code-claude-code-ngo-quang-trung-sun-asterisk-com` (host profile), `cursor-agent-cursor-agent-gokaapp-gmail-com` (sandboxed). Reset an account's cooldown with `POST /admin/accounts/<id>/reset-cooldown` and JSON body `{}`. Leave no scratch files in the repo.
7. Write `plans/260919-1300-data-retention/reports/phase-01-report.md` (Status, Built, Verified with command output summary, Deviations, Concerns), including the Cursor sandbox finding and the real-CLI evidence.
8. Commit on `main` with a conventional message such as `feat(gateway): delete CLI transcripts with expired sessions and add ephemeral keys`. No AI attribution lines. Do not push. Do not modify plan files other than your report.

If something is impossible or contradictory, do the rest, explain under Concerns, and finish with `Status: DONE_WITH_CONCERNS` or `Status: BLOCKED`.
