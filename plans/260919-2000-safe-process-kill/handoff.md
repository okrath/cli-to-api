# Handoff brief for the implementer (Cursor Composer 2.5 Fast)

Single phase, gateway only, P0. Do exactly this:

1. Read `AGENTS.md` at the repo root in full, then `plans/260919-2000-safe-process-kill/plan.md` and `phase-01-safe-kill.md` in full.
2. Implement R1–R6 in that order. Keep the previous phase's held-usage logic in `run-cli.ts` intact.
3. Run `pnpm lint`, `pnpm test`, `pnpm build` until green, plus `git grep -n "killTree(" apps/gateway/src` (one hit, inside run-cli's `kill()`).
4. Write `plans/260919-2000-safe-process-kill/reports/phase-01-report.md` (Status, Built, Verified, Deviations, Concerns).
5. Commit on `main` with a conventional message such as `fix(gateway): kill CLI processes only through their child handle`. No AI attribution lines. Do not push. Leave no scratch files in the repo.

Environment rules (Windows 11, PowerShell):

- You are running inside a `node.exe` process yourself. **Never** stop processes by name or image (`Stop-Process -Name node`, `taskkill /IM node.exe`, `pkill node`, …). Stop only PIDs you started, by PID.
- Do not start a gateway for this phase; the unit, integration and e2e tests cover it. Port 8080 belongs to the user's gateway — it is currently stopped on purpose, leave it that way.
- Never commit anything under `data/`.
- If a test is flaky, say so in the report with the failing test name rather than retrying silently. Note: the bug you are fixing makes test processes die when a gateway with the old code is running — check `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` first if runs die without output.
