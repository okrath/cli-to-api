# Phase 03 — Codex bridging, acceptance tests, docs

Status: pending · Depends on: 02 · Effort: 1d

## Context

Codex 0.155.0 already connects to the bridge over HTTP and emits the tool call
(`tests/fixtures/codex-0.155.0-mcp-tool-approval-blocked.jsonl`), but denied
it: `"MCP tool call requires approval, but approval policy is never"`, and it
used its built-in `web_search` under `--sandbox read-only`. This phase finds
the flags, records a passing fixture, enables Codex, and closes the plan with
SDK acceptance tests and documentation.

## Requirements

### 1. Codex research (record everything in the report)

Use `scripts/record-mcp-fixture.mjs --cli codex` (see §4) with `--extra` flags.
Try in this order and stop at the first that produces a successful
`tools/call` (result delivered, `item.completed … status: "completed"`):

1. `-c 'mcp_servers.cta.tool_approval="never"'` and `-c 'mcp_servers.cta.trust=true'` (config keys seen as `trust`/`trust_level` strings in the binary; names unverified).
2. `--approve-for-me` (exec flag: "route approval requests through automatic review").
3. `-c approval_policy="on-request"` combined with `-c 'sandbox_mode="read-only"'`.
4. `--dangerously-bypass-approvals-and-sandbox` (known to work for the `allowTools: true` path).

Also find the switch that disables the built-in web search (candidates:
`-c 'web_search="disabled"'`, `-c 'tools.web_search=false'`,
`--disable web_search_request`; the binary contains `web_search_mode`).

Decision rule:

- If 1–3 works: `codexAdapter.clientTools = true`; `buildArgs` with `tools` adds `-c mcp_servers.cta.url="<mcpUrl>"`, the approval flag found, the web-search switch, keeps `--sandbox read-only`, and passes `maxTurns` only if Codex has an equivalent (else ignore).
- If only 4 works: Codex bridging is enabled **only when the group has `allowTools: true`** (the dangerous flag is already in use there). Codex targets in groups without `allowTools` are filtered out like `agy`; document this in README.
- If nothing works: leave `clientTools` unset, mark AC-6 (codex) not done, and file the findings under Concerns.

Commit the passing run as `tests/fixtures/codex-<version>-mcp-tool.jsonl` +
`.mcp.json`. Extend `codexAdapter.parseLine` only if the passing fixture shows
a shape phase 01 did not cover. Codex reports usage once per turn, so a round
that ends on a tool call records no tokens — acceptable, document it.

### 2. Acceptance tests — `tests/e2e/acceptance.test.ts` (+ `harness.ts`)

Fake adapter, one server per describe block, scenarios from phase 02:

- **AC-1 OpenAI tool loop** (`openai` SDK): non-stream round 1 with one tool → `finish_reason === "tool_calls"`, `tool_calls[0].id === "toolu_fake_1"`, `function.name === "get_weather"`, `JSON.parse(arguments).city === "Hanoi"`; round 2 with the `tool` message → content contains the result text; response header `x-cta-session-reused: 1`; `/admin/live` showed one entry with `state: "waiting_tool_result"` between rounds; the fake CLI's pid (from `/admin/live` in round 1) equals the pid seen in round 2. Repeat with `stream: true` collecting `delta.tool_calls`.
- **AC-2 Anthropic tool loop** (`@anthropic-ai/sdk`): `messages.stream` round 1 → `finalMessage().stop_reason === "tool_use"` with a `tool_use` block; round 2 with a `tool_result` block → text. Also non-stream `messages.create`.
- **AC-3** scenario `tool_call_twice`: round 1 returns two `tool_calls`; one round-2 request with both `tool` messages returns `Result: r1 | r2`.
- **AC-4** `tool_result_timeout_sec = 1` (set via `/admin/settings`), scenario `tool_call_hang`: after round 1, within 3 s the pid is dead and `/admin/live` is empty; a round-2 request with the tool result still returns 200 with text (fallback run; the fake CLI echo shows no `--resume`).
- **AC-5** group whose targets are `agy` / `cursor-agent` only (accounts can be created without the CLI installed? if not, use a target row for an adapter id with no installed binary and assert the 400 code `tools_unsupported`); mixed group with a fake target succeeds.
- Third plain turn after AC-1's loop (user message only) → `x-cta-session-reused: 1` and the fake CLI echo shows `--resume fake-session-001`.

### 3. Documentation

- `README.md`: remove "No tools passthrough" from Limits; add a **Tools** section: how the bridge works (3 sentences), which adapters support client tools (table column), `tool_result_timeout_sec` / `tool_max_turns`, the `/mcp/:bridgeId` endpoint (localhost, per-request secret), behaviour on timeout (fallback run), Codex caveat from §1, and a note for omp users: remove `supportsTools: false` from `~/.omp/agent/models.yml` so omp uses native tool calling.
- `README.md` smoke section: `--tools` and `--hold-ms`.
- `plans/260918-2240-v2-clean-rewrite/plan.md` §3: annotate the tools non-goal with "superseded by `plans/260919-0545-client-tool-calling`".
- Admin console: if `apps/web` has a settings form, add the two settings; otherwise skip and say so.

### 4. Recording script — `scripts/record-mcp-fixture.mjs`

Committed with this plan (moved from the probe used on 2026-09-19). Keep it
working: `node scripts/record-mcp-fixture.mjs --cli claude|codex --out
tests/fixtures/<name> [--extra "<flags>"]` hosts the one-tool MCP server on
`127.0.0.1:8765`, runs the CLI, writes `<name>.jsonl` and `<name>.mcp.json`.

## Files

```
apps/gateway/src/adapters/codex.ts
tests/fixtures/codex-<ver>-mcp-tool.jsonl, .mcp.json
tests/e2e/acceptance.test.ts, tests/e2e/harness.ts
README.md
plans/260918-2240-v2-clean-rewrite/plan.md   (one-line annotation)
apps/web/src/...                              (settings form, if present)
scripts/record-mcp-fixture.mjs
```

## Validation

- `pnpm lint`, `pnpm test`, `pnpm build` green.
- Real CLI: `node scripts/smoke-real-cli.mjs --adapter codex --account <id> --model gpt-5.5 --tools` (if enabled) and the claude-code run again after the merge; paste both header sets in the report.
- omp: with `supportsTools` removed from `models.yml`, `omp -p "read package.json and tell me the name" --model cta/group:cta-max` completes using its `read` tool through the bridge (manual, in the report).

## Risks / rollback

Codex may have no safe approval switch; the decision rule above keeps the
product consistent either way. Docs and tests are additive.

## Report

`reports/phase-03-report.md`, including the research table (flag → observed
behaviour) and the final acceptance-criteria checklist for plan §7.
