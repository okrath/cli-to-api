# Phase 04 report

Status: DONE

## Built

- `router/route-request.ts` — main routing orchestrator: model resolution, cache lookup, session reuse, candidate failover loop, slot acquire/release.
- `router/execute-candidate.ts`, `router/finalize-run.ts`, `router/cache-hit.ts` — extracted run/finalize helpers to keep orchestrator readable.
- `router/select-target.ts` — pure candidate expansion, cooldown filtering, tier/active/round-robin ordering, session account pinning.
- `router/slots.ts` — per-account concurrency slots with FIFO queue and timeout.
- `router/cooldown.ts` — cooldown duration from error/rate-limit events; persists `cooldown_until` / `cooldown_reason`.
- `router/live.ts` — in-memory in-flight request registry and `abort(requestId)` kill switch hook.
- `sessions/session-store.ts` — fingerprint, find, replace, purgeExpired.
- `cache/response-cache.ts` — exact-match cache key/get/set/replay/purge.
- `usage/record-usage.ts` — `requests` row, rate-limit window upserts, API key `last_used_at`, response header builder.
- `db/repos.ts` — typed queries for settings, groups, targets, accounts, requests, cooldown helpers.
- `protocol/model-catalog.ts` — catalog built from `adapters/index.ts` + `detectAdapters()` (removed static model table/stub).
- `protocol/serialize-openai.ts`, `protocol/serialize-anthropic.ts` — first stream frame deferred until first content or `done`.
- `api/chat-handler.ts` — delegates model resolution to router; sets `x-cta-*` response headers from route meta.
- `index.ts` — hourly purge of expired sessions/cache + adapter detection refresh.
- `tests/fake-cli/fake-cli.mjs` — optional argv echo for session-resume assertions; fake adapter passes `--resume`.
- Tests: `router/select-target.test.ts`, `sessions/fingerprint.test.ts`, `router/route-request.test.ts` (failover, 429, session reuse, cache hit, abort, queue timeout).

## Verified

```
pnpm lint             # exit 0
pnpm test             # 74 passed (17 files)
```

Integration scenarios (fake adapter, in-memory SQLite):

- Account A `rate_limit` → account B completes, A cooldown set, `failoverCount = 1`
- All candidates rate-limited → `429` + `Retry-After`
- Three-turn conversation → turns 2/3 invoke CLI with `--resume`, `sessionReused = 1`
- Identical cached group request → `cacheHit`, spawn count unchanged
- Client abort during hang → process gone within 500 ms, slot released
- Queue timeout with saturated account → `503`

## Deviations

- `route-request.ts` is 252 lines (phase target ≤ 250); run/finalize/cache-hit logic extracted to sibling router modules instead of bloating the orchestrator.
- `queue_timeout_sec` is read from `settings` with default 30 when absent (not seeded in migrations).
- Manual verification with two real Claude accounts was not performed in this environment; covered by fake-adapter integration tests.

## Concerns / questions for review

- Round-robin cursor and slot state are process-local; multi-process deployments would need an external store (out of v2 scope).
- Cache hit records a `requests` row with empty events (zero tokens); confirm admin usage views handle `cache_hit` status as intended.
