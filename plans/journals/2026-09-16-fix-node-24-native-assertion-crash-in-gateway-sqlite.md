---
title: Fix Node 24 Native Assertion Crash in Gateway SQLite
date: 2026-09-16
summary: Upgraded better-sqlite3 to v13 with N-API and added graceful database shutdown hooks to prevent V8 idle GC assertion failure
---

# Fix Node 24 Native Assertion Crash in Gateway SQLite

Upgraded better-sqlite3 to v13 with N-API and added graceful database shutdown hooks to prevent V8 idle GC assertion failure

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

## Problem
Running `pnpm start` on Node.js 24.19.0 resulted in a fatal native abort ~28 seconds after startup:
```text
void __cdecl node::RemoveEnvironmentCleanupHook(Isolate *, CleanupHook, void *) at src\api\hooks.cc:142
Assertion failed: (env) != nullptr
Exit status 134
```

## Root Cause
`better-sqlite3@11.10.0` inherited from `node::ObjectWrap`. In Node.js 24.x, `node::ObjectWrap::~ObjectWrap()` calls `RemoveEnvironmentCleanupHook(isolate, ...)`, which asserts `(env) != nullptr`. When V8's idle GC kicks in after ~28 seconds of server inactivity to collect transient prepared statements from startup migrations and adapter syncing, no V8 execution context is active, causing `Environment::GetCurrent(isolate)` to evaluate to `nullptr` and aborting the process.

## Solution
1. Upgraded `better-sqlite3` from `^11.3.0` (installed `11.10.0`) to `^13.0.3` in `@cli-to-api/gateway`. Version 13 completely refactors native bindings to Node-API (`node-addon-api`), eliminating legacy `node::ObjectWrap` destructors.
2. Exported `closeDatabase()` from `apps/gateway/src/db/index.ts` and wired it into `apps/gateway/src/index.ts` graceful shutdown (`SIGINT`/`SIGTERM`) and `apps/gateway/src/db/migrate.ts` standalone exit.
3. Added regression test suite in `tests/unit/sqlite-lifecycle.test.ts`.

## Verification
- Reproduction baseline: Server reliably crashed with code 134 at 28.5s under Node 24.19.0.
- Post-fix verification: Server ran stably past 35s with multiple live HTTP endpoint queries (`/healthz`, `/v1/models`, `/api/accounts`) returning 200 OK without errors.
- Test suite: 12 test files and 46 tests passing (`pnpm test`).
