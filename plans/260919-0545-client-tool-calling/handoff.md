# Handoff brief for the implementer (Cursor Composer 2.5 Fast)

You are invoked with a phase number, e.g. `PHASE=01`. Do exactly this:

1. Read `AGENTS.md` at the repo root in full.
2. Read `plans/260919-0545-client-tool-calling/plan.md` in full. Sections 2
   (verified CLI behaviour), 4.1 (contract extension) and 4.2 (MCP endpoint)
   are fixed; implement them verbatim.
3. Read `plans/260919-0545-client-tool-calling/phase-<PHASE>-*.md` in full. If
   a previous phase report exists in `plans/260919-0545-client-tool-calling/reports/`,
   read the latest one and its review for context.
4. The fixtures in `tests/fixtures/*mcp-tool*` are recorded from the real CLIs
   and are the truth for event shapes and MCP requests. Never edit them; when a
   shape you need is missing, record it with `scripts/record-mcp-fixture.mjs`,
   commit the new fixture, then write the parser.
5. Implement every requirement of that phase file. Nothing more: do not start
   later phases, do not add features the phase does not list, do not touch
   `agy` / `cursor-agent` bridging.
6. Use `pnpm`. Run `pnpm lint` and `pnpm test` and iterate until both are green.
   Do not weaken, skip or delete tests to get there. Requests without tools must
   behave exactly as before.
7. Write `plans/260919-0545-client-tool-calling/reports/phase-<PHASE>-report.md`
   in the report format from `AGENTS.md` (Status, Built, Verified with the
   actual command output summary, Deviations, Concerns). Include the real-CLI
   smoke output when the phase asks for it. Be honest: list what is not done.
8. Commit on `main` with a conventional commit message such as
   `feat(gateway): bridge client tools to the CLI over MCP`. No AI attribution
   lines. Do not push. Do not amend earlier commits. Do not modify plan or
   phase files other than your report.

Rules that matter most (from AGENTS.md): adapters read only the CLI's JSONL
output; no regex over prose; no invented event shapes; plain functions and
small modules (≤ 300 lines), no Manager/Engine/Orchestrator classes; no mocks
in production code (the fake CLI is a real MCP client, not a mock); never
commit `.env` or `data/`.

If something in the phase file is impossible or contradictory, do the rest,
then explain the blocker in the report under Concerns and finish with
`Status: DONE_WITH_CONCERNS` or `Status: BLOCKED`.
