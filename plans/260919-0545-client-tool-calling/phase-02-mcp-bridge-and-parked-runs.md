# Phase 02 — MCP bridge and parked runs (claude-code)

Status: pending · Depends on: 01 · Effort: 1.5d

## Context

This phase makes tool calling work end to end for `claude-code` (and the fake
adapter for tests). Read plan §2 (verified behaviour), §4 (flow diagram), §4.1
and §4.2 before starting. The wire behaviour of Claude Code is recorded in
`tests/fixtures/claude-code-2.1.277-mcp-tool.jsonl` and the MCP requests it
sent in `tests/fixtures/claude-code-2.1.277-mcp-tool.mcp.json` — build the
endpoint against that log.

Terminology: a **bridge** is one client request's tool set exposed at
`/mcp/<bridgeId>`; a **round** is one HTTP request/response against the same
CLI process; a **parked run** is a CLI process waiting for a tool result
between rounds.

## Requirements

### 1. Runner — `runner/run-cli.ts`

Return value gains `timeout: { pause(): void; reset(): void }`. `pause` clears
the run timer; `reset` clears and re-arms it with the original `timeoutMs`.
Nothing else changes; existing tests must pass untouched.

### 2. MCP endpoint — `api/mcp.ts`

`registerMcpRoutes(app, { version })`, registered in `server.ts` at the root
(outside the `/v1` API-key scope and outside `/admin`):

- `POST /mcp/:bridgeId` implements plan §4.2 exactly. Body is the parsed JSON-RPC message; batch arrays → 400.
- `tools/call`: `const result = await onMcpCall(bridge, { name: params.name, argumentsJson: JSON.stringify(params.arguments ?? {}), toolUseId: params._meta?.["claudecode/toolUseId"] })`; reply `{ content: [{ type: "text", text: result.content }], isError: result.isError }`. If the bridge expires first, reply JSON-RPC error `{ code: -32000, message: "tool result timed out" }`.
- `GET` → 405, `DELETE` → 200, unknown bridge → 404 `{ error: "unknown bridge" }`.
- Log every method at `debug` with the bridge id.

### 3. Bridge registry — `router/tool-bridge.ts` (in-memory, plain functions)

```ts
export interface ToolResult { content: string; isError: boolean }
export interface ParkedRun {
  source: AsyncIterator<CliEvent>;          // the run's remaining events
  toolCallIds: string[];                    // ids emitted in the round that parked
  accountId: string; adapterId: string; modelId: string;
  pid: number; requestId: string;
  timeout: { pause(): void; reset(): void };
  controller: AbortController;              // the run's controller (kill on abort)
  detachClientAbort(): void; attachClientAbort(signal: AbortSignal): void;
  release(): void;                          // releases the account slot; idempotent
  roundsUsage: Array<Extract<CliEvent, { type: "usage" }>>;   // last usage of each finished round
}
export interface Bridge {
  id: string; url: string; serverName: "cta"; tools: ToolDefinition[];
  createdAt: number; expiresAt: number;     // expiresAt refreshed on every round end
  parsedCalls: ToolCall[];                  // adapter-emitted calls not yet matched to an MCP call
  pending: Map<string, { name: string; resolve(r: ToolResult): void; reject(e: Error): void }>;  // toolCallId → waiter
  earlyResults: Map<string, ToolResult>;    // results delivered before the MCP call arrived
  parked?: ParkedRun;
  firstMcpCallAt?: number;
  onMcpCall?: () => void;                   // set by bridge-events while a round is open
}

export function createBridge(tools: ToolDefinition[], opts: { baseUrl: string; resultTimeoutMs: number }): Bridge   // id = nanoid(21), url = `${baseUrl}/mcp/${id}`
export function getBridge(id: string): Bridge | undefined
export function listBridgeTools(bridge: Bridge): Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>
export function noteParsedCall(bridge: Bridge, call: ToolCall): void
export function onMcpCall(bridge: Bridge, call: { name: string; argumentsJson: string; toolUseId?: string }): Promise<ToolResult>
export function deliverToolResults(bridge: Bridge, results: Array<{ toolCallId: string; content: string; isError: boolean }>): void
export function parkRun(bridge: Bridge, run: ParkedRun): void
export function takeParkedRun(toolCallIds: string[]): { bridge: Bridge; run: ParkedRun } | undefined
export function finishBridge(bridge: Bridge): void          // release slot, reject pending with "bridge finished", delete
export function sweepExpiredBridges(now: number, kill: typeof killTree, log): number
export function resetBridges(): void                        // tests
```

Rules:

- `onMcpCall` matching order: (1) `toolUseId` equal to a parsed call id; (2) first parsed call with the same `name` and JSON-equal arguments (compare parsed objects); (3) none → synthesise `ToolCall { id: "call_" + nanoid(21), name, argumentsJson }`, push it to `parsedCalls` so bridge-events emits it. The matched call moves from `parsedCalls` to `pending`. If `earlyResults` already has the id, resolve immediately. Set `firstMcpCallAt` and invoke `onMcpCall?.()`.
- `deliverToolResults`: for each result, resolve the pending waiter, else store in `earlyResults`.
- `takeParkedRun(ids)`: every id must belong to one bridge's `pending` or `earlyResults` keys or `parked.toolCallIds`; otherwise `undefined`. Returns and clears `bridge.parked`.
- `sweepExpiredBridges`: for every bridge with `expiresAt <= now` that is parked (or has pending calls and no open round): `kill(pid)`, `run.release()`, reject pending waiters with `Error("tool result timed out")`, delete the bridge. Return the count. `server.ts` runs it every 5 s (`setInterval(...).unref()`), cleared in an `onClose` hook.
- A bridge whose run ends with `end_turn` / `max_tokens` / `error` is finished (`finishBridge`) by bridge-events after the last event is yielded.

Keep this file under 300 lines; move helpers (JSON-equal, prefix strip) to `router/tool-bridge-util.ts` if needed.

### 4. Round control — `router/bridge-events.ts`

```ts
export function bridgeEvents(bridge: Bridge, run: ParkedRun): AsyncIterable<CliEvent>
```

Consumes `run.source` and yields events for **one round**:

1. Forward every event. On `tool_call` → `noteParsedCall` and remember the id.
2. Round ends with tool use when either
   - the adapter yields `done { stopReason: "tool_use" }`, or
   - `bridge.onMcpCall` fired and no `done` arrived within **250 ms** after the first MCP call (`firstMcpCallAt`): then yield a synthesised `tool_call` for every entry in `bridge.parsedCalls` not yet yielded, and yield `done { stopReason: "tool_use" }` yourself.
   Before yielding that final `done`: `run.detachClientAbort()`, `run.timeout.pause()`, push the round's last `usage` event to `run.roundsUsage`, set `bridge.expiresAt = now + resultTimeoutMs`, `parkRun(bridge, { ...run, toolCallIds })`. Then return (the generator ends; the HTTP response ends).
3. Round ends finally on `done { stopReason: end_turn | max_tokens | error }`: if `run.roundsUsage.length > 0`, replace the round's last `usage` event before yielding it with the per-field difference `last − Σ roundsUsage` for `input`, `cachedInput`, `cacheWrite`, `output`, `reasoning` (never below 0), keeping `costUsd`. Yield the `done`, then `finishBridge(bridge)` (which calls `run.release()`).
4. If the round's source ends without a `done`, yield `done { stopReason: "error" }` and finish the bridge.
5. Must be re-entrant: round 2 calls `bridgeEvents(bridge, run)` again with the same `run.source`.

### 5. Execute candidate — `router/execute-candidate.ts`

- New input `bridge?: Bridge` and `mcpBaseUrl: string` (from deps). When `req.tools?.length && req.toolChoice !== "none"`:
  `const bridge = createBridge(req.tools, { baseUrl: mcpBaseUrl, resultTimeoutMs: settings.toolResultTimeoutSec * 1000 })`;
  `buildArgs({ ..., allowTools: false, tools: { mcpUrl: bridge.url, serverName: "cta", maxTurns: settings.toolMaxTurns, resultTimeoutMs } })`;
  env = `{ ...baseEnv/hostEnv, ...adapter.buildEnv(sandbox), ...built.env }`.
- Wrap: `const run: ParkedRun = { source: events[Symbol.asyncIterator](), pid, timeout, controller, accountId, adapterId, modelId, requestId, release, detachClientAbort, attachClientAbort, roundsUsage: [], toolCallIds: [] }` and iterate `bridgeEvents(bridge, run)` instead of `events`.
- `isContent` treats `tool_call` as content (streaming starts, no failover after a tool call).
- The `release` passed in must be the route's `release()` (idempotent, also removes the live entry only on the final round — see 7).

### 6. Route request — `router/route-request.ts`

- Remove the phase-01 guard. With tools: skip `tryCacheHit` and cache writes; filter `candidates` to adapters with `clientTools === true` (`adapters[c.adapterId]?.clientTools`); if the unfiltered list was non-empty and the filtered one is empty → `RouteError("tools_unsupported", …)`.
- **Resume path**, before slot acquisition: `const trailing = trailingToolMessages(req.messages)` (tool messages after the last user/assistant message). If non-empty, `takeParkedRun(trailing.map(m => m.toolCallId))`; when found:
  `deliverToolResults(bridge, trailing.map(m => ({ toolCallId: m.toolCallId, content: m.content, isError: m.isError === true })))`,
  `run.attachClientAbort(req.clientAbort)`, `run.timeout.reset()`, `updateLive` for the new `requestId` with `state: "running"` (register a new live entry, remove the old one),
  meta `{ groupId, adapterId, accountId, modelExecuted, sessionReused: true, cacheHit: false, cacheEnabled, failoverCount: 0 }`,
  return `trackCompletion(bridgeEvents(bridge, run), { …, release: run.release })`. No new slot is acquired (the parked run still holds it).
- Client abort wiring: keep one named listener per run so `detachClientAbort` can remove it and `attachClientAbort` can add it to the next request's signal. When a request is aborted **while parked** nothing happens (the client is gone; expiry cleans up).

### 7. Completion tracking and live view

- `finalize-run.ts` `trackCompletion`: on `done { stopReason: "tool_use" }` record usage (status `ok`) but do **not** call `ctx.release()`, do not upsert the session, do not write the cache. On any other `done`, behaviour is unchanged (cache write additionally requires `!ctx.req.tools`).
- `live.ts` `LiveEntry.state?: "running" | "waiting_tool_result"`; bridge-events sets `waiting_tool_result` when parking (via `updateLive`). `/admin/live` passes the field through unchanged.

### 8. claude-code adapter — `adapters/claude-code.ts`

`buildArgs` when `input.tools` is set:

- `--max-turns String(tools.maxTurns)` instead of `"1"`.
- `--tools ""` always (client tools replace built-ins even when `allowTools` was true).
- `--mcp-config JSON.stringify({ mcpServers: { [tools.serverName]: { type: "http", url: tools.mcpUrl } } })` as **one** argv entry, then `--strict-mcp-config`, then `--allowedTools mcp__${tools.serverName}`.
- Return `env: { MCP_TOOL_TIMEOUT: String(tools.resultTimeoutMs + 30_000) }`.
- Everything else (system prompt file, effort, resume/session-id, stdin prompt) unchanged. Resume with tools is allowed: a fresh process resumes the CLI session with MCP configured again.

### 9. Fake CLI and fake adapter

`tests/fake-cli/fake-cli.mjs` — new scenarios, all Claude-shaped so `claudeCodeAdapter.parseLine` parses them:

- `tool_call`: emit `system/init`; an `assistant` line with `content: [{ type: "tool_use", id: "toolu_fake_1", name: "mcp__cta__" + (FAKE_TOOL_NAME ?? "get_weather"), input: { city: "Hanoi" } }]`; `stream_event/message_delta { stop_reason: "tool_use", usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 } }`. Then act as an MCP client against `--mcp-url <url>` (taken from argv): `initialize` → `notifications/initialized` → `tools/list` → `tools/call { name, arguments, _meta: { "claudecode/toolUseId": "toolu_fake_1" } }` with a 10-minute fetch timeout. When the result arrives emit a `user` tool_result line (ignored), `stream_event/content_block_delta text_delta "Result: <text>"`, `message_delta { stop_reason: "end_turn", usage: { input_tokens: 7, …, output_tokens: 3 } }`, and `result` with the **run total** `usage { input_tokens: 17, output_tokens: 8, … }` and `total_cost_usd: 0.01`.
- `tool_call_twice`: two `tool_use` blocks (`toolu_fake_1` city Hanoi, `toolu_fake_2` city Hue) in one `assistant` line, one `message_delta tool_use`; then the two MCP calls **sequentially** (await the first result before sending the second); final text `Result: <r1> | <r2>`.
- `tool_call_hang`: like `tool_call` but never emits anything after the MCP call is sent (the gateway must expire and kill it).

Fake adapter (`adapters/index.ts`): `clientTools: true`; `buildArgs` appends `["--mcp-url", tools.mcpUrl]` when `tools` is set.

### 10. Wiring and config

- `server.ts`: `registerMcpRoutes`, sweep interval, `mcpBaseUrl = http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${config.port}` passed through `handleChatRequest` options → `routeRequest` deps → `executeCandidate`.
- `scripts/smoke-real-cli.mjs`: `--tools` flag runs a `get_weather` loop in both dialects: round 1 with the tool definition, assert a tool call, round 2 with `"31C, sunny"` as the result, print `x-cta-*` headers of both rounds and the final text. `--hold-ms <n>` delays the round-2 request to prove the CLI waits.

## Files

```
apps/gateway/src/runner/run-cli.ts
apps/gateway/src/api/mcp.ts
apps/gateway/src/router/tool-bridge.ts
apps/gateway/src/router/bridge-events.ts
apps/gateway/src/router/execute-candidate.ts
apps/gateway/src/router/route-request.ts
apps/gateway/src/router/finalize-run.ts
apps/gateway/src/router/live.ts
apps/gateway/src/api/chat-handler.ts, api/openai.ts, api/anthropic.ts   (pass mcpBaseUrl)
apps/gateway/src/server.ts
apps/gateway/src/adapters/claude-code.ts
apps/gateway/src/adapters/index.ts                 (fake adapter)
tests/fake-cli/fake-cli.mjs
scripts/smoke-real-cli.mjs
apps/gateway/tests/router/tool-bridge.test.ts      match by toolUseId; by name+args FIFO; synthesis; early result; takeParkedRun rejects partial/foreign ids; sweep kills + releases + rejects
apps/gateway/tests/router/bridge-events.test.ts    scripted sources: (a) adapter done tool_use ends the round and parks; (b) MCP-first ends after 250 ms with a synthesised call; (c) replay of the committed Claude fixture over two rounds records round-2 usage {input 2, cacheWrite 141, cachedInput 15038, output 156, costUsd 0.06604159999999999}
apps/gateway/tests/api/mcp.test.ts                 app.inject: initialize echoes protocolVersion; tools/list shape; tools/call resolves when deliverToolResults is called; notification → 202; unknown method → -32601; unknown bridge → 404; GET → 405
apps/gateway/tests/router/route-request.test.ts    fake adapter, scenario tool_call: round 1 → tool_call + done tool_use, live state waiting_tool_result, process alive after the response ends (client abort detached), slot still held (second request on the same account queues); round 2 with the tool message → text "Result: …", sessionReused true, slot released, bridge gone. Scenario tool_call_twice: two tool_calls in round 1, one round 2 answers both. Scenario tool_call_hang with tool_result_timeout_sec = 1: process killed within 2 s, slot released, a later request with the tool results runs fresh (argv echo shows no --resume) and succeeds. Tools + toolChoice none → no bridge, no --mcp-url in argv.
apps/gateway/tests/adapters/claude-code.test.ts    buildArgs with tools: --max-turns 25, --tools "", --mcp-config JSON with the url, --strict-mcp-config, --allowedTools mcp__cta, env MCP_TOOL_TIMEOUT; without tools unchanged
apps/gateway/tests/runner/run-cli.test.ts          timeout.pause() prevents the kill; reset() re-arms
```

## Validation

- `pnpm lint`, `pnpm test` green.
- Real CLI (record the output in the report): start the gateway, create/choose a `claude-code` account, run
  `CTA_API_KEY=… node scripts/smoke-real-cli.mjs --adapter claude-code --account <id> --model sonnet --tools`
  and once with `--hold-ms 60000`. Expected: round 1 `finish_reason tool_calls` with `get_weather`, round 2 text mentioning `31C`, `x-cta-session-reused: 1` on round 2, no leftover `claude` process (`tasklist`), and the 60 s hold completes.
- `GET /admin/live` during the hold shows the run with `state: "waiting_tool_result"`.

## Risks / rollback

- If `--mcp-config` inline JSON is mangled by the executable resolver on Windows, write it to a temp file like the system prompt and pass the path; note it in the report.
- If Claude Code drops the held MCP call before `MCP_TOOL_TIMEOUT`, record the observed limit and lower the default `tool_result_timeout_sec` accordingly.
- Rollback: revert; phase 01 code keeps the gateway answering `tools_unsupported`.

## Report

`reports/phase-02-report.md` with the smoke output and both `x-cta-*` header sets.
