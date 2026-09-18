# Phase 07 — End-to-end tests and docs

Status: pending · Depends on: 01–06 · Effort: 0.5d

## Requirements

### E2E (`tests/e2e/*.test.ts`, Vitest, real HTTP against a server started in `beforeAll` on a random port, `CTA_ENABLE_FAKE_ADAPTER=1`, temp `DATA_DIR`)

Map one test to each acceptance criterion in `plan.md` §7:

- AC-1: use the official `openai` and `@anthropic-ai/sdk` npm packages as clients (dev deps). Stream and non-stream against a `group:default` made of two fake accounts. Assert text, usage fields, and that `for await` over the SDK stream completes.
- AC-2: fake account A `FAKE_SCENARIO=rate_limit`, B `ok` → response from B; `GET /admin/accounts` shows A cooling; `GET /admin/requests` shows `failoverCount 1`.
- AC-3: three turns with growing `messages`; fake CLI echoes its argv into a `system/init`-like line the fake adapter maps to a `session` event plus a test-only header; assert resume flag present on turns 2–3 and `x-cta-session-reused: 1`.
- AC-4: group with `cacheTtlSec: 60`; second identical request → `x-cta-cache: hit`, `< 50 ms`, spawn counter unchanged; streaming client still gets valid frames.
- AC-5: `FAKE_SCENARIO=hang`; abort the fetch after the first frame; assert the PID (from `/admin/live` captured before abort) is gone within 500 ms.
- AC-7: `pnpm build` in CI script and a test that `GET /` returns the built `index.html`.

### Real-CLI smoke script `scripts/smoke-real-cli.mjs` (manual)

Args: `--adapter claude-code|codex --account <id> --model <id>`. Sends one OpenAI and one Anthropic request through the running gateway and prints usage + headers. Documented in README; not part of `pnpm test`.

### Docs

`README.md` (replace the placeholder): what it is (5 lines), quick start (install, `.env`, `pnpm dev`, open `/`, create account → terminal → login, create group, create key), connecting clients (curl OpenAI, curl Anthropic, Python `openai`, Python `anthropic`, Cursor/Continue config, Claude Desktop custom base URL), concepts (accounts & sandboxes, groups & failover, sessions & prompt cache, response cache, usage & quota tracking — "tracked, never enforced"), adapter table (CLI, version tested, flags used, streaming granularity, resume), environment variables, headers the gateway returns, limits (text-only, no tools passthrough), troubleshooting (`pnpm rebuild node-pty`, Node 24 + better-sqlite3).

Keep `AGENTS.md` accurate (commands, layout).

## Validation

`pnpm test` runs unit + integration + e2e green on Windows and on at least one POSIX runner (GitHub Actions matrix `windows-latest`, `ubuntu-latest`; add `.github/workflows/ci.yml` with `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`, `pnpm test`).

## Report

`reports/phase-07-report.md` and update `plan.md` status to `completed` with the final AC checklist.
