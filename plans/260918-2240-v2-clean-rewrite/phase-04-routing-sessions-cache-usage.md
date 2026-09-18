# Phase 04 — Routing, sessions, response cache, usage

Status: pending · Depends on: 02, 03 · Effort: 1.5d

## Context

The gateway's value is here: turn one client request into the right CLI
process on the right account, survive rate limits, reuse CLI sessions, and
record exactly what it cost. Keep the whole thing to a handful of pure
functions plus one orchestrating async generator.

## Requirements

### Entry point `router/route-request.ts`

```ts
export async function routeRequest(req: ChatRequest, deps): Promise<{ events: AsyncIterable<CliEvent>; meta: RouteMeta }>
// RouteMeta: { groupId?, adapterId, accountId, modelExecuted, sessionReused: boolean, cacheHit: boolean, failoverCount: number }
```

Order of operations:
1. `resolveModel` (phase 03). `null` → 404.
2. Build the target list: group → its enabled `group_targets`; direct → one synthetic target `{ tier: 1, adapterId, modelId, accountId: null }`. Effort = request effort ?? target effort_override ?? group default_effort. `allowTools` = group.allow_tools (false for direct).
3. **Response cache** (group with `cache_ttl_sec > 0` only): key = `sha256(groupId | modelExecutedHint=group | effort | maxTokens | JSON(messages))`. Hit → replay stored `{ thinking, text, usage }` as `thinking_delta`, `text_delta`, `usage`, `done` events; `meta.cacheHit = true`; record request with `status = cache_hit` and zero tokens; return.
4. **Session lookup** (`sessions/session-store.ts`): if `messages` has ≥ 2 non-system messages, `fingerprint = sha256(conversationHint ?? "" | JSON(messages.slice(0, -1) mapped to {role, content: content.trim()}))`. A row whose `account` is eligible and whose `(adapterId, modelId)` matches a target → put that account first and set `resume = { cliSessionId }`, prompt = newest user message only.
5. **Candidate order** (`router/select-target.ts`, pure): expand `accountId: null` to all enabled accounts of that adapter; drop accounts in cooldown (`cooldown_until > now`), disabled, or of uninstalled adapters; sort by `tier`, then in-memory `active` count, then a per-group round-robin cursor. Pinned session account (step 4) is forced first.
6. **Slots** (`router/slots.ts`, in-memory): `acquire(accountId)` succeeds when `active < max_concurrent`; otherwise wait up to `settings.queue_timeout_sec` (default 30) on a per-account FIFO; on timeout try the next candidate; if none → 503.
7. **Failover loop**: for each candidate → `runCli`. Watch events until the first `text_delta`/`thinking_delta` ("committed"). Before commit, an `error` of kind `rate_limit | crash | auth | timeout` → release slot, apply cooldown (below), `failoverCount++`, delete the `sessions` row if this was a resume attempt and retry **once** on the same account as a new session (not counted as failover), then continue to the next candidate. After commit, errors are passed through to the client; no failover.
   Rate-limited candidates are skipped, but if **all** are exhausted → 429 with `Retry-After` = seconds until the earliest `cooldown_until`.
8. **Cooldown** (`router/cooldown.ts`): `rate_limit` → `retryAfterSec` if present, else the `resetsAt` of the most utilised window with `utilization ≥ 1` from the latest `rate_limit` event, else `settings.default_cooldown_sec` (1800). `auth` → 3600 with reason `"not authenticated"`. `crash`/`timeout` → 60. Persist `cooldown_until`, `cooldown_reason`.
9. On completion (any outcome): release slot; **session upsert** — when a `session` event was seen and the run ended `end_turn|max_tokens`, delete the old fingerprint row and insert `fingerprint(full transcript incl. assistant text)` → `{ accountId, adapterId, modelId, cliSessionId, turns+1, expires_at = now + session_ttl_sec }`; **cache store** if enabled; **usage record**.

### Usage `usage/record-usage.ts`

- One `requests` row per client request (also for 4xx/5xx after routing started; skip only for auth/validation failures). Tokens from the **last** `usage` event. `ttft_ms` = first content event − request start. `cost_usd` from the CLI when given, else null.
- `account_rate_limits` upsert on every `rate_limit` event (window name, utilization, resets_at, observed_at).
- `api_keys.last_used_at` update.
- Response headers on every `/v1` response: `x-cta-request-id`, `x-cta-account`, `x-cta-model`, `x-cta-session-reused: 0|1`, `x-cta-cache: hit|miss|off`, `x-cta-failovers`.

### Live view `router/live.ts`

In-memory `Map<requestId, { startedAt, apiKeyId, model, accountId, pid, tokensOut }>` for the admin "in flight" table; entries removed on completion. Provide `abort(requestId)` that aborts the run (kill tree) for a kill switch.

### Cleanup

Hourly timer: delete expired `sessions` and `response_cache` rows; refresh `detectAdapters()`.

## Integration notes (phases 02 and 03 are merged; do these first)

1. `protocol/model-catalog.ts` still carries a `STATIC_ADAPTER_MODELS` table and a
   `detectInstalledAdapters()` stub. Delete both and build the catalog from
   `adapters/index.ts`: installed set from `detectAdapters()` (cached), model list
   from each adapter's `models`. Keep `resolveModel` pure; only `buildCatalog` changes.
2. `router/route-request.ts` is a stub throwing `RouteError("not_implemented")`.
   Replace it with the real implementation described below; keep the exported
   signature (`routeRequest(req, deps)` may take a `deps` object, update `chat-handler.ts` accordingly).
3. The serialisers (`openAiStreamFrames`, `anthropicStreamFrames`) emit their first
   frame (`role` chunk / `message_start`) on the first non-session event, which can be a
   `rate_limit` or `usage` event. Change both to emit the first frame only on the first
   `thinking_delta`, `text_delta` or `done`, so an `error` that arrives before any content
   still maps to a plain JSON error response. Adjust the snapshot tests.
4. The router consumes events itself until the first content event (the failover
   window). Only after that does it hand the remaining stream to the serialiser, so the
   serialiser must also accept a stream that starts mid-way (it already does: it keeps
   `lastUsage` and emits `message_start` lazily). Replay the already-consumed
   `usage`/`rate_limit`/`session` events in front of the remaining stream so nothing is lost.
5. `chat-handler.ts` currently does `buildCatalog` + `resolveModel` before calling
   `routeRequest`. Move model resolution into `routeRequest` (it needs the group and
   targets anyway) and let the handler only map `RouteError("model_not_found")`.

## Files

```
apps/gateway/src/router/route-request.ts      (≤ 250 lines; the only place with control flow across modules)
apps/gateway/src/router/select-target.ts      pure
apps/gateway/src/router/slots.ts
apps/gateway/src/router/cooldown.ts           pure + persist
apps/gateway/src/router/live.ts
apps/gateway/src/sessions/session-store.ts    fingerprint(), find(), replace(), purgeExpired()
apps/gateway/src/cache/response-cache.ts      key(), get(), set(), purgeExpired()
apps/gateway/src/usage/record-usage.ts
apps/gateway/src/db/repos.ts                  thin typed queries used above (accounts, groups+targets, settings) — no ORM "service" layer
apps/gateway/tests/router/select-target.test.ts
apps/gateway/tests/sessions/fingerprint.test.ts
apps/gateway/tests/router/route-request.test.ts   integration with the fake adapter (CTA_ENABLE_FAKE_ADAPTER=1) and an in-memory SQLite:
   - failover: account A scenario rate_limit, B ok → text from B, A cooldown set, failoverCount 1
   - all rate-limited → 429 + Retry-After
   - three-turn session reuse → second/third run receive resume args (assert via fake CLI echoing its argv into an event)
   - cache: second identical request → cacheHit, no spawn (assert spawn counter)
   - abort mid-stream → process gone ≤ 500 ms, slot released
   - queue timeout → 503
```

## Validation

- `pnpm test` green.
- Manual with two real Claude accounts if available, else one account and the fake adapter.

## Risks / rollback

Fingerprint misses when clients rewrite history (Cursor sometimes trims) → falls back to a new session; cost only. Slot leak on an unexpected throw → every acquire is paired in `try/finally`, test asserts `active === 0` after each scenario.

## Report

`reports/phase-04-report.md`.
