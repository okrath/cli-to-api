# Handoff brief for the implementer (Cursor Composer 2.5 Fast)

Single phase, gateway only. Do exactly this:

1. Read `AGENTS.md` at the repo root in full, then `plans/260919-1840-codex-context-usage/plan.md` and `phase-01-last-call-usage.md` in full.
2. Start with R1 (the fixture recorded from the real `codex` CLI). Everything else builds on it. Do not invent rollout lines.
3. Implement R2–R4, then run `pnpm lint` and `pnpm test` until green. Do not change files outside the list in the phase file.
4. Do the live check R5 and write the numbers down.
5. Write `plans/260919-1840-codex-context-usage/reports/phase-01-report.md` (Status, Built, Verified, Deviations, Concerns), with the before/after token numbers from R1 and R5.
6. Commit on `main` with a conventional message such as `feat(gateway): report Codex usage from the last model call`. No AI attribution lines. Do not push. Leave no scratch files in the repo (the stdout file from R1 lives in `%TEMP%`, only the two fixtures go under `tests/fixtures/`).

Environment rules (Windows 11, PowerShell):

- You are running inside a `node.exe` process yourself. **Never** stop processes by name or image (`Stop-Process -Name node`, `taskkill /IM node.exe`, `pkill node`, …). Stop only PIDs you started, by PID.
- Port 8080 is the user's own gateway — do not start anything on it and do not stop it. For the live check start yours with `$env:PORT = "8090"; node apps/gateway/dist/index.js` (after `pnpm build`), from the repo root, with `ADMIN_PASSWORD` already in `.env`. Remember its PID and stop that PID when done.
- The gateway database is `data/cli-to-api.db`; the existing `codex` account uses the host profile (`~/.codex`). Do not create or delete accounts, groups or API keys; the bootstrap API key is in `data/bootstrap-api-key.txt`. Never commit anything under `data/`.
- Run the real `codex` CLI from `%TEMP%` (not from the repo) so its rollout `cwd` holds nothing interesting.
- If `pnpm test` needs more than one run to pass because of a flaky test, say so in the report rather than retrying silently.
