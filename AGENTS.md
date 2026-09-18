# AGENTS.md — working agreement for AI implementers (Cursor Composer, Claude Code)

## What this repo is

`cli-to-api` v2: a local gateway that exposes installed AI coding CLIs
(Claude Code, Codex, agy, OMP) as OpenAI- and Anthropic-compatible HTTP APIs,
with an admin web console. The authoritative design is
`plans/260918-2240-v2-clean-rewrite/plan.md`; implement it phase by phase
(`phase-0N-*.md`) and write a report per phase into that plan's `reports/`.

The abandoned v1 is archived as git tag `v1` (e.g. `git show v1:README.md`).
Read it for reference if a phase file says so; never copy files from it.

## Non-negotiables

- Contracts in `plan.md` §4.1 (`ChatRequest`, `CliEvent`, `Adapter`) and the
  data model in §5 are fixed. If you must deviate, say so in the phase report.
- Adapters consume the CLI's JSONL output only. No regex over prose, no PTY on
  the API path, no ANSI stripping.
- No invented CLI event shapes. Record a fixture from the real CLI first
  (`tests/fixtures/<cli>-<version>-<case>.jsonl`), then write the parser.
- KISS: plain functions and small modules. No `*Manager`, `*Engine`,
  `*Orchestrator`, no base classes with one subclass, no config-driven
  behaviour where a function argument does. Files stay under ~300 lines.
- Real behaviour only: no mocks or fake data in production code. Tests use
  the recorded fixtures and `tests/fake-cli/fake-cli.mjs`.
- Do not put plan ids, phase numbers, or ticket codes in code comments, test
  names, or commit messages. Explain the behaviour instead.
- Never commit `.env`, `data/`, keys, or sandbox contents.

## Layout

```
apps/gateway/src/
  config.ts  server.ts  index.ts
  core/types.ts              shared contracts
  db/                        schema, open, migrate, repos
  auth/                      admin token, client API keys
  adapters/                  one file per CLI + index (registry, detection)
  runner/                    run-cli, kill-tree, sandbox, render-transcript
  protocol/                  normalize-*, serialize-*, model-catalog, errors, sse
  router/                    route-request, select-target, slots, cooldown, live
  sessions/  cache/  usage/
  api/                       openai, anthropic, models, health, static-web, admin/*
apps/web/src/                React admin console (pages/, components/, api.ts)
tests/fixtures/              recorded CLI output (source of truth for parsers)
tests/fake-cli/              scripted CLI for tests
tests/e2e/
plans/                       plans and per-phase reports
```

## Commands

```
pnpm install
pnpm dev          # gateway with reload (needs ADMIN_PASSWORD in .env)
pnpm dev:web      # vite dev server for the console, proxies /admin and /v1
pnpm lint         # tsc --noEmit for both apps
pnpm test         # vitest: unit + integration + e2e
pnpm build        # apps/gateway/dist + apps/web/dist
pnpm start        # run the built gateway
```

## Definition of done for a phase

1. Every requirement in the phase file is implemented or explicitly reported as not done and why.
2. The phase's tests exist and `pnpm test` and `pnpm lint` are green.
3. `reports/phase-0N-report.md` lists: what was built, how it was verified (commands + summary output), deviations, open questions.
4. Commits are focused, conventional-commit style (`feat(gateway): ...`), without AI attribution lines.

## Report format

```
# Phase 0N report
Status: DONE | DONE_WITH_CONCERNS | BLOCKED
Built: ...
Verified: ...
Deviations: ...
Concerns / questions for review: ...
```
