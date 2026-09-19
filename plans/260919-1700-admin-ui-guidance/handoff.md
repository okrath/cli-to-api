# Handoff brief for the implementer (Cursor Composer 2.5 Fast)

Single phase, web console only. Do exactly this:

1. Read `AGENTS.md` at the repo root in full, then `plans/260919-1700-admin-ui-guidance/plan.md` and `phase-01-hints.md` in full.
2. Implement every hint, warning, badge and docs link in the phase file with the copy **verbatim**. Do not touch `apps/gateway`.
3. Run `pnpm lint` and `pnpm build` until green.
4. Check the pages in a browser (the phase file says how) and save one screenshot per page under `plans/260919-1700-admin-ui-guidance/reports/`. Environment rules: never kill any process by name or image (you run on node); if you start a gateway (`node apps/gateway/dist/index.js` from the repo root, `ADMIN_PASSWORD` in `.env`), remember its PID and stop only that PID. Port 8080 may already be in use by the user's own gateway — then use `PORT=8090` for yours.
5. Write `plans/260919-1700-admin-ui-guidance/reports/phase-01-report.md` (Status, Built, Verified, Deviations, Concerns).
6. Commit on `main` with a conventional message such as `feat(web): explain settings inline in the admin console`. No AI attribution lines. Do not push. Leave no scratch files in the repo.
