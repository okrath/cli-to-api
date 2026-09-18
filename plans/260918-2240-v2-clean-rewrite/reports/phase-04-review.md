# Phase 04 review

Reviewer: Claude · Commit reviewed: 25abd82 · Verdict: DONE_WITH_CONCERNS — fix the MUST items before phase 05 starts.

## Verified independently

- `pnpm lint` green; `pnpm test` 74/74 green (17 files), including the six routing integration scenarios.
- No servers or fake-CLI processes left running.
- Integration notes 1–5 from the phase file were all applied (catalog from the adapter registry, lazy first frame, resolution inside the router, lead-in replay).
- Working tree was clean; `main` has been fast-forwarded to this commit and is now the working branch.

## Findings

### MUST-1 — round-robin rotation breaks tier priority and un-pins the session account

`expandCandidates` sorts by tier, moves the pinned account to the front, then
rotates the **whole** list by the group cursor. Two consequences:

- With tier 1 = [A, B] and tier 2 = [C], the third request starts on C although A
  and B are free. Tier 2 must only be reached after tier 1 is exhausted.
- The pinned (session) account is moved to the front and then rotated away, so a
  resumed conversation lands on another account and the CLI session is lost.

Fix: sort by tier then active count; rotate **only within the lowest tier
present**; apply the pinned-account move **after** rotation. Add two tests:
tier 2 is never first while a tier 1 candidate exists; pinned account is first
across three consecutive calls.

### MUST-2 — a run that ends without content is treated as a failover

`executeCandidate` returns `outcome: "failover"` whenever the event stream ends
before any `thinking_delta`/`text_delta`. That includes a **successful but
empty** completion (`usage` + `done end_turn`) and an `error` of kind `unknown`.
The router then spawns the next account for nothing and, when the list is
exhausted, answers 429 "All accounts are rate limited", which is false.

Fix: only `error` events whose kind is in `FAILOVER_KINDS` cause a failover.
Any other termination (a `done`, or an `error` of kind `unknown`) is a
`success` with `leadIn = consumed` and an empty remaining stream; the
serialiser and error mapper handle it. In `routeRequest`, remember the kind of
the last failover error: when every candidate failed, throw
`RouteError("all_rate_limited", …, retryAfterSec)` only if the last kind was
`rate_limit`; otherwise throw `upstream_auth` / `upstream_timeout` /
`upstream_crash` so the client gets 502/504 with the real reason.
Tests: empty completion returns 200 with empty text and usage, spawn count 1;
two accounts both `crash` → 502, not 429.

### MUST-3 — TTFT is recorded as the total duration

`firstContentMs` in `record-usage.ts` computes `Date.now() - startedAt` when
the row is written, which is the end of the request. Capture the timestamp of
the first `thinking_delta`/`text_delta` inside `trackCompletion` and pass it to
`recordUsage` as `firstContentAt`; `ttft_ms = firstContentAt - startedAt`,
`null` when no content was produced. Test: with the fake CLI `slow` scenario,
`ttft_ms` is well below `duration_ms`.

### SHOULD-1 — live `tokensOut` is not cumulative

`updateLive(..., { tokensOut: event.text.length })` overwrites with the length
of the latest delta. Accumulate characters (or count deltas) so the admin
in-flight table shows progress.

### SHOULD-2 — cache-hit rows store an empty string as account id

`tryCacheHit` builds `meta.accountId = ""`, which `recordUsage` writes into
`requests.account_id`. Store `null` (`accountId || null`) and omit the
`x-cta-account` header when empty.

### SHOULD-3 — abort listener accumulates across failovers

`req.clientAbort.addEventListener("abort", …)` is added once per candidate and
never removed. Use a single controller for the whole request, or remove the
listener when a candidate is released.

### Notes (no action now)

- `queue_timeout` is reused for "no accounts configured" (503). Acceptable; the
  message is clear enough for v2.0.
- Process-local round-robin and slot state are fine for a single-process daemon.

## Instructions for the fix-up

1. Apply MUST-1 to MUST-3 and the SHOULD items, with the tests named above.
2. `pnpm lint` and `pnpm test` green.
3. Append a `## Fix-up` section to `reports/phase-04-report.md`.
4. Commit on the current branch (`main`) as `fix(gateway): respect tiers and session pins in selection, failover only on failover errors, real ttft`.
5. Start no server; stop any process you start.
