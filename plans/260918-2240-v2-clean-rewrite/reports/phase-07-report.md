# Phase 07 report

Status: DONE_WITH_CONCERNS

## Built

- E2E harness (`tests/e2e/harness.ts`) starting a real HTTP gateway on a random port with `CTA_ENABLE_FAKE_ADAPTER=1` and temp `DATA_DIR`.
- Acceptance tests (`tests/e2e/acceptance.test.ts`) mapped to AC-1, AC-2, AC-3, AC-4, AC-5, and AC-7 using the official `openai` and `@anthropic-ai/sdk` npm clients where required.
- Fake adapter reads per-account `fake-scenario` / `fake-text` files from the sandbox so HTTP e2e can drive `rate_limit`, `hang`, etc. without overriding `runCli`.
- Fake CLI `hang` scenario emits one stream frame before blocking (needed for AC-5 “abort after first frame”).
- Client-disconnect abort wiring in `chat-handler.ts` listens for socket/raw `close` and `aborted` so mid-stream fetch abort kills the CLI on Windows.
- `queue_timeout_sec` seeded (default 30) and exposed via admin settings API + Settings page.
- SHOULD-1: `adminFetch` redirects to `/login` on 401 after clearing the token.
- Lazy-loaded Terminal and Usage pages (`React.lazy` + `Suspense`); main JS chunk ~200 kB (was ~880 kB).
- `.gitattributes` with LF normalization for snapshots/fixtures.
- `.github/workflows/ci.yml` matrix (ubuntu-latest, windows-latest): install, lint, build, test.
- `README.md` (quick start, client examples, concepts, adapter table, env vars, headers, limits, troubleshooting).
- `scripts/smoke-real-cli.mjs` manual real-CLI smoke script.
- `plan.md` status set to `completed` with AC checklist.

## Verified

```
pnpm lint             # exit 0 (gateway + web)
pnpm build            # web dist with split chunks; gateway dist
pnpm test             # 92 passed (23 files)
```

E2E highlights:

- AC-1: OpenAI + Anthropic SDK stream and non-stream against `group:default`; usage fields present.
- AC-2: rate-limit failover, account A cooling, `failoverCount === 1` in request log.
- AC-3: three-turn session reuse, `--resume` in argv echo, `x-cta-session-reused: 1` on turns 2–3.
- AC-4: cache hit under 50 ms, `x-cta-cache: hit`, no extra CLI spawn, streaming SSE valid.
- AC-5: abort after first stream frame; live PID gone within 500 ms.
- AC-7: `GET /` returns built `apps/web/dist/index.html`.

No gateway, vite, or stray CLI processes left running after the test run.

## Deviations

- AC-1 plan text references Python SDKs; phase file specifies npm SDKs for e2e — implemented npm clients; Python examples documented in README.
- Anthropic SDK `baseURL` is the gateway origin without a `/v1` suffix (the SDK appends `/v1/messages`).

## Concerns / questions for review

- AC-6 (human browser walk-through with real CLI login in the xterm UI) remains unchecked in `plan.md`; implementation was completed in phase 06.
- Real-CLI smoke script is manual only (`scripts/smoke-real-cli.mjs`); not part of `pnpm test`.
- CI workflow added but not executed in this run (no push to GitHub Actions).
