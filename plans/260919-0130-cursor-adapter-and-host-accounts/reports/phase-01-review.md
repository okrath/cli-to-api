# Phase 01 review — popular CLI set

Reviewer: Claude · Commit reviewed: 7026595 · Verdict: DONE.

## Verified independently

- `pnpm lint`, `pnpm build`, `pnpm test` 105/105 green (25 files). omp adapter, test and fixture removed; no omp references left in sources or README (only stale `dist/adapters/omp.*` from an earlier build, which `tsc` does not clean — harmless, see note).
- `cursor-agent.ts` matches the recorded fixture rules: init → session, thinking deltas, `assistant` with `timestamp_ms` → text delta, aggregate `assistant` ignored, `result` → usage + done, `is_error` classified.
- Resolver: `.cmd` → `-File "%SCRIPT_DIR%\…ps1"` → `versions/<latest>/node.exe index.js` handled without `shell: true`; unit-tested with a temp layout.
- Real-CLI smoke (isolated sandbox, not logged in): `cursor-agent=2026.09.15-d2fe57e` detected with version; request spawned the real agent (901 ms) and its not-logged-in result was mapped to `502 upstream_auth`, account cooled with "not authenticated", request row recorded with `failovers=1`.

## Notes (no action)

- `pnpm build` does not remove stale files in `apps/gateway/dist`; add `rimraf dist` (or `tsc --build --clean`) to the gateway `build` script during phase 02 cleanup so removed adapters do not linger in `dist`.
