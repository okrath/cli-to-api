# Handoff brief for the implementer (Cursor Composer)

You are invoked with a phase number, e.g. `PHASE=01`. Do exactly this:

1. Read `AGENTS.md` at the repo root in full.
2. Read `plans/260918-2240-v2-clean-rewrite/plan.md` in full. Sections 4.1
   (contracts) and 5 (data model) are fixed; implement them verbatim.
3. Read `plans/260918-2240-v2-clean-rewrite/phase-<PHASE>-*.md` in full. If a
   previous phase report exists in `plans/260918-2240-v2-clean-rewrite/reports/`,
   read the latest one for context.
4. Implement every requirement of that phase file. Nothing more: do not start
   later phases, do not add features the phase does not list.
5. Use `pnpm`. Node >= 22 is installed. Run `pnpm lint` and `pnpm test` and
   iterate until both are green. Do not weaken or delete tests to get there.
6. Write `plans/260918-2240-v2-clean-rewrite/reports/phase-<PHASE>-report.md`
   in the report format from `AGENTS.md` (Status, Built, Verified with the
   actual command output summary, Deviations, Concerns). Be honest: list what
   is not done.
7. Commit on the current branch with a conventional commit message such as
   `feat(gateway): add server foundation, sqlite schema and auth`. No AI
   attribution lines. Do not push. Do not amend earlier commits. Do not modify
   plan or phase files other than your report.

Rules that matter most (repeated from AGENTS.md): adapters read only the CLI's
JSONL output; no regex over prose; no invented CLI event shapes (fixtures in
`tests/fixtures/` are the truth); small plain modules, no Manager/Engine/
Orchestrator classes; no mocks in production code; never commit `.env` or
`data/`.

If something in the phase file is impossible or contradictory, do the rest,
then explain the blocker in the report under Concerns and finish with
`Status: DONE_WITH_CONCERNS` or `Status: BLOCKED`.
