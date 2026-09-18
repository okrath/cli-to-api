# Phase 01 review

Reviewer: Claude · Commit reviewed: 25e748d · Verdict: DONE_WITH_CONCERNS — fix the MUST items before phase 02 starts.

## Verified independently

- `pnpm lint` green for both packages.
- Schema matches `plan.md` §5 (nine tables, composite pk on `account_rate_limits`, `key_hash` unique).
- `core/types.ts` is identical to `plan.md` §4.1 apart from formatting.
- No `.env`, `data/` or key material in the commit.
- Admin token and API-key middleware behave as specified (constant-time compare, Bearer and `x-api-key`, bootstrap key file).

## Findings

### MUST-1 — `pnpm test` fails when a `.env` exists at the repo root

`apps/gateway/src/config.ts` calls `dotenv` at module import time. The test
"exits when ADMIN_PASSWORD is missing" deletes the env var, then imports the
module, which re-populates `ADMIN_PASSWORD` from the real `.env` that now exists
(created during the manual `pnpm start` check). Result on this host:

```
FAIL apps/gateway/tests/config.test.ts > loadConfig > exits when ADMIN_PASSWORD is missing
AssertionError: expected [Function] to throw an error
```

Fix: move the dotenv call inside `loadConfig(options?: { envFile?: string | false })`.
Default `envFile` is `<repoRoot>/.env` loaded with `override: false`; tests pass
`{ envFile: false }`. Tests must not depend on files outside the test's own temp dir.

### MUST-2 — background server left running

After the manual verification, `pnpm start` was still running (five node/pnpm
processes, `node dist/index.js` listening on 127.0.0.1:8080). The reviewer killed
them. Rule for every phase: any server or watcher you start for verification is
stopped before you write the report, and the report says so.

### SHOULD-1 — `createApiKey(_name)` has an unused parameter

Remove the parameter; the caller sets the row name. Keep the function tiny.

### Notes (no action now)

- `PRAGMA foreign_keys` is not enabled, so the `references()` clauses are
  documentation only. Phase 05 defines delete semantics explicitly; revisit then.
- `lastUsedAt` is updated on every authenticated request inside the auth hook.
  Acceptable; phase 04 must not do it a second time.

## Instructions for the fix-up

1. Apply MUST-1, MUST-2 (process hygiene going forward) and SHOULD-1.
2. Run `pnpm lint` and `pnpm test` **with a `.env` present at the repo root** and confirm green.
3. Append a `## Fix-up` section to `reports/phase-01-report.md` with what changed and the test output.
4. Commit as `fix(gateway): load .env inside loadConfig so tests are host-independent`.
