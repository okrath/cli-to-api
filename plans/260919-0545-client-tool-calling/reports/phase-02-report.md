# Phase 02 report

Status: DONE

Built:

- `runner/run-cli.ts`: run handle exposes `timeout.pause()` / `timeout.reset()` without changing existing behaviour.
- `api/mcp.ts`: `POST /mcp/:bridgeId` JSON-RPC handler per plan §4.2 (`initialize`, `tools/list`, `tools/call`, notifications → 202, unknown method → -32601, batch → 400, GET → 405, DELETE → 200, unknown bridge → 404).
- `router/tool-bridge.ts` + `tool-bridge-util.ts`: in-memory bridge registry (`createBridge`, `onMcpCall`, `deliverToolResults`, `parkRun`, `takeParkedRun`, `finishBridge`, `sweepExpiredBridges`, `resetBridges`).
- `router/bridge-events.ts`: one-round async generator with adapter `tool_use` stop, 250 ms MCP-first synthesis, usage deltas across rounds, parking, and re-entrancy.
- `router/execute-candidate.ts`: creates bridge + MCP args for tool requests; wraps CLI stream with `bridgeEvents`; `tool_call` counts as content.
- `router/route-request.ts`: removed phase-01 guard; tools filter to `clientTools` adapters; resume path via `takeParkedRun` + `deliverToolResults`; cache skipped when bridging.
- `router/finalize-run.ts` + `live.ts`: `tool_use` done records usage but does not release slot / session / cache; live `state: "waiting_tool_result"` while parked.
- `adapters/claude-code.ts`: MCP `--mcp-config`, `--strict-mcp-config`, `--allowedTools mcp__cta`, `--max-turns` from settings, `MCP_TOOL_TIMEOUT` env.
- `adapters/index.ts` fake adapter: `clientTools: true`, `--mcp-url` passthrough.
- `tests/fake-cli/fake-cli.mjs`: `tool_call`, `tool_call_twice`, `tool_call_hang` scenarios (real MCP client).
- `server.ts`: `registerMcpRoutes`, bridge sweep interval, `mcpBaseUrl` wired through chat handlers.
- `scripts/smoke-real-cli.mjs`: `--tools` and `--hold-ms` flags.
- Bug fixes found during smoke: (1) `release()` now removes the live entry for the current request id on resumed rounds; (2) `onMcpCall` no longer arms the 250 ms MCP-first round-end timer when resolving an early tool result (fixes round-2 empty `tool_use` when the client answers before the MCP HTTP call arrives).

Verified:

```
pnpm lint
# exit 0

pnpm test
# 31 files, 178 tests passed
# tool-bridge, bridge-events, mcp endpoint, route-request tool scenarios, claude-code buildArgs, run-cli timeout.pause/reset

pnpm build
# exit 0

# Real CLI smoke (account claude-code-claude-code-ngo-quang-trung-sun-asterisk-com, model sonnet)
# Gateway started via Start-Process node apps/gateway/dist/index.js (PID recorded); stopped by that PID only.
node scripts/smoke-real-cli.mjs --adapter claude-code --account … --model sonnet --tools
node scripts/smoke-real-cli.mjs --adapter claude-code --account … --model sonnet --tools --hold-ms 60000
```

Real-CLI smoke output:

```
=== SMOKE --tools ===
OpenAI round 1: 200 tool_calls
  x-cta-account: claude-code-claude-code-ngo-quang-trung-sun-asterisk-com
  x-cta-cache: off
  x-cta-failovers: 0
  x-cta-model: sonnet
  x-cta-request-id: req_fe29aa46595a4578a5c63
  x-cta-session-reused: 0
OpenAI round 2: 200 stop
OpenAI round 2 text: The weather in Hanoi is currently **31°C and sunny**.
  x-cta-account: claude-code-claude-code-ngo-quang-trung-sun-asterisk-com
  x-cta-cache: off
  x-cta-failovers: 0
  x-cta-model: sonnet
  x-cta-request-id: req_3a7c17fd3df84d78a9ff1
  x-cta-session-reused: 1
Anthropic round 1: 200 tool_use
  x-cta-account: claude-code-claude-code-ngo-quang-trung-sun-asterisk-com
  x-cta-cache: off
  x-cta-failovers: 0
  x-cta-model: sonnet
  x-cta-request-id: req_650d461c2dfb4b89ad776
  x-cta-session-reused: 0
Anthropic round 2: 200 end_turn
Anthropic round 2 text: It's currently 31°C and sunny in Hanoi.
  x-cta-account: claude-code-claude-code-ngo-quang-trung-sun-asterisk-com
  x-cta-cache: off
  x-cta-failovers: 0
  x-cta-model: sonnet
  x-cta-request-id: req_b92bee5fe8d74f26a5d2b
  x-cta-session-reused: 1

=== SMOKE --tools --hold-ms 60000 ===
OpenAI round 1: 200 tool_calls
  x-cta-session-reused: 0
Holding 60000ms before round 2…
OpenAI round 2: 200 stop
OpenAI round 2 text: The weather in Hanoi is currently 31°C and sunny.
  x-cta-session-reused: 1
Anthropic round 1: 200 tool_use
  x-cta-session-reused: 0
Holding 60000ms before round 2…
Anthropic round 2: 200 end_turn
Anthropic round 2 text: The weather in Hanoi is currently 31°C and sunny.
  x-cta-session-reused: 1
LIVE_DURING_HOLD: state "waiting_tool_result" on the parked OpenAI round-1 request (pid 23092)
```

Deviations:

- Phase-01 review nit 1 (`serialize-anthropic.ts` dead `tool_use` branch in `openBlockOfKind`) was already resolved in the working tree (`BlockKind` is `"thinking" | "text"` only; tool blocks open inline).
- Phase-01 review nit 2 (`toolChoice !== "none"` guard) kept in `route-request.ts` as specified.

Concerns / questions for review:

- None. Inline `--mcp-config` JSON worked on Windows without a temp file. The 60 s hold completed with the CLI process still alive and `GET /admin/live` showing `waiting_tool_result`.
