# Phase 03 report

Status: DONE_WITH_CONCERNS

Built:

- **Codex research (0.155.0):** tried four flag combinations via `scripts/record-mcp-fixture.mjs --cli codex --extra '…'`. Only `--dangerously-bypass-approvals-and-sandbox` with `-c web_search="disabled"` produced a successful `tools/call` and `item.completed` with `status: "completed"`. Committed passing fixture `tests/fixtures/codex-0.155.0-mcp-tool.jsonl` + `.mcp.json`.
- **`apps/gateway/src/adapters/codex.ts`:** `clientTools: true`; with tools adds MCP URL, disables built-in web search, uses `--dangerously-bypass-approvals-and-sandbox` (no `--sandbox read-only` on that path).
- **`apps/gateway/src/router/route-request.ts`:** when bridging, Codex targets in groups without `allowTools: true` are filtered (same pattern as non-`clientTools` adapters → `tools_unsupported`).
- **`router/tool-bridge.ts`**, **`bridge-events.ts`**, **`finalize-run.ts`:** live-entry cleanup on sweep expiry; capture `cliSessionId` on parked runs for session upsert after multi-round tool loops.
- **`tests/e2e/acceptance.test.ts`** + **`harness.ts`:** client-tools AC-1 (non-stream + isolated stream describe), AC-2–AC-5; harness fixes (`mcpBaseUrl`, group/settings/live helpers, `resetBridges`/`resetSlots`).
- **`apps/gateway/tests/router/route-request.test.ts`:** third turn after tool loop reuses session (`x-cta-session-reused: 1`, `--resume` in echo).
- **`apps/web`:** settings form fields for `toolResultTimeoutSec` and `toolMaxTurns`.
- **`README.md`:** Tools section, adapter table column, smoke `--tools`/`--hold-ms`, Codex `allowTools` caveat, omp note; removed “No tools passthrough”.
- **`plans/260918-2240-v2-clean-rewrite/plan.md`:** tools non-goal annotated as superseded.
- **`scripts/record-mcp-fixture.mjs`:** `--extra` parsing; Codex spawn without shell on Windows.

## Codex research table

| Attempt | Flags | Observed behaviour |
|---------|-------|-------------------|
| 1 | `-c mcp_servers.cta.tool_approval="never"` + `-c mcp_servers.cta.trust=true` | MCP connects; no successful `tools/call`; model used built-in web search |
| 2 | `--approve-for-me` | Incompatible with `--sandbox read-only` |
| 3 | `-c approval_policy="on-request"` + `-c sandbox_mode="read-only"` | Same as attempt 1 |
| 4 | `--dangerously-bypass-approvals-and-sandbox` + `-c web_search="disabled"` | **Pass** — `tools/call` succeeds, tool result delivered, `item.completed` status `completed` |

**Decision:** option 4 only → Codex bridging runs **only when the group has `allowTools: true`**. Direct `codex/*` models with tools return `400 tools_unsupported` (no group → `allowTools` false). Documented in README.

Verified:

```
pnpm lint
# exit 0

pnpm test
# 31 files, 191 tests passed

pnpm build
# exit 0
```

Real-CLI smoke (gateway `node apps/gateway/dist/index.js`, PID 26608; stopped by that PID only; cooldowns reset via `POST /admin/accounts/<id>/reset-cooldown`):

**Claude-code** (`node scripts/smoke-real-cli.mjs --adapter claude-code --account claude-code-claude-code-ngo-quang-trung-sun-asterisk-com --model sonnet --tools`):

```
OpenAI round 1: 200 tool_calls
  x-cta-session-reused: 0
OpenAI round 2: 200 stop
OpenAI round 2 text: It's 31°C and sunny in Hanoi right now.
  x-cta-session-reused: 1
Anthropic round 1: 200 tool_use
  x-cta-session-reused: 0
Anthropic round 2: 200 end_turn
Anthropic round 2 text: It's currently 31°C and sunny in Hanoi.
  x-cta-session-reused: 1
```

**Codex direct** (`codex/gpt-5.5`, expected by design):

```
OpenAI round 1: 400 tools_unsupported (no target in this group supports client tools)
```

**Codex via `group:codex-tools`** (`allowTools: true`, single codex target, explicit tool-use prompt):

```
OpenAI round 1: 200 tool_calls
  x-cta-account: codex-codex-do-thi-minh-hoa-sun-asterisk-com
  x-cta-session-reused: 0
OpenAI round 2: 200 stop
OpenAI round 2 text: (empty)
  x-cta-session-reused: 1
```

**omp manual check (AC-8):** skipped per implementer instruction; reviewer will run with `supportsTools` removed from `~/.omp/agent/models.yml`.

## Plan §7 acceptance criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC-1 OpenAI tool loop (stream + non-stream) | Done | E2e `client tools AC-1`; stream in isolated describe |
| AC-2 Anthropic tool loop | Done | E2e `client tools AC-2` |
| AC-3 Two tool calls | Done | E2e `client tools AC-3` |
| AC-4 Expiry fallback | Done | E2e `client tools AC-4` |
| AC-5 Unsupported / mixed groups | Done | E2e `client tools AC-5` |
| AC-6 Real CLI claude + codex | Done (codex via group) | Smoke output above; direct `codex/*` intentionally `tools_unsupported` |
| AC-7 No-tools unchanged | Done | Full suite green (191 tests) |
| AC-8 omp native tools | Skipped | Reviewer manual |

Deviations:

- Codex requires `group:…` with `allowTools: true`; the phase smoke command `--adapter codex --model gpt-5.5 --tools` on a bare account cannot succeed under the decision rule (documented, not a bug).
- Third turn after AC-1 tool loop is covered by `route-request.test.ts` integration test rather than e2e (shared-server timeouts in a combined describe).
- Codex round ending on a tool call records no tokens (Codex emits usage on `turn.completed` only); acceptable per phase file.

Concerns / questions for review:

- Codex round 2 returned `stop` with **empty assistant text** despite `x-cta-session-reused: 1` — verify whether Codex omitted a final `agent_message` or the serialiser should surface tool-result context differently.
- Stream tool-loop e2e needs its own describe block to avoid 30 s queue timeouts from shared fake-CLI state.
- `--dangerously-bypass-approvals-and-sandbox` is already used for `allowTools` groups without client tools; Codex tool bridging adds the same flag plus disabled web search — confirm product acceptance for non-tool Codex runs in those groups.
