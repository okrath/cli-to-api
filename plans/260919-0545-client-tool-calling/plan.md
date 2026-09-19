---
title: "Client tool calling through an MCP bridge"
status: completed
priority: P1
effort: "3.5d"
branch: main
implementer: Cursor Composer 2.5 Fast
reviewer: Claude (Fable 5.1)
created: 2026-09-19
depends_on: plans/260918-2240-v2-clean-rewrite (completed), plans/260919-0130-cursor-adapter-and-host-accounts (completed)
tags: [gateway, tools, function-calling, mcp, openai-compat, anthropic-compat]
---

# Client tool calling through an MCP bridge

## 1. Outcome

A client that sends OpenAI `tools` / Anthropic `tools` gets real tool calling
back — `finish_reason: "tool_calls"` / `stop_reason: "tool_use"` with the
model's calls, then continues the same CLI process when it posts the tool
results — instead of today's `400 not supported by this gateway`.

The gateway never executes a tool. It only ferries the model's call to the
client and the client's result back to the CLI. Coding agents (omp, Cursor,
Continue, Claude Desktop) keep executing tools on their own machine, exactly as
they do against the real APIs.

## 2. Context and decisions

**Problem.** Coding agents are useless through the gateway without tools. The
workaround (omp's text "owned dialect", `supportsTools: false`) re-sends the
whole tool catalog as text every turn, blew the Windows argv limit in the
`claude-code` adapter (fixed in `0b3fdfe`), and fills the client's context
window so omp's compaction gives up.

**How a CLI can call a client's tool.** Every supported CLI has its own tools
but also speaks MCP. The gateway exposes the client's tool definitions as an
MCP server over HTTP; the CLI is started with that server configured and its
built-in tools disabled. When the model calls a tool, the CLI sends
`tools/call` to the gateway and **blocks waiting for the result**. The gateway
turns that into the API-shaped tool call, ends the HTTP response, keeps the
CLI process alive ("parked"), and when the client posts the tool result it
answers the pending `tools/call` and streams the CLI's next message into the
new HTTP response.

**Verified on this host (2026-09-19), fixtures committed:**

- `tests/fixtures/claude-code-2.1.277-mcp-tool.jsonl` + `.mcp.json` — Claude
  Code 2.1.277, `-p --output-format stream-json --verbose
  --include-partial-messages --max-turns 3 --tools "" --mcp-config <json>
  --strict-mcp-config --allowedTools mcp__cta`. Result: `init.tools ==
  ["mcp__cta__get_weather"]`, `init.mcp_servers == [{name:"cta",
  status:"connected"}]`; `--tools ""` disables built-ins but **keeps MCP
  tools**; `--allowedTools mcp__cta` allows every tool of that server with no
  permission prompt. Stream: `content_block_start {type:"tool_use", id:
  "toolu_…", name:"mcp__cta__get_weather"}` → `input_json_delta` deltas (first
  one may be `""`) → `content_block_stop` → `message_delta {stop_reason:
  "tool_use"}`. The MCP `tools/call` carries
  `params._meta["claudecode/toolUseId"] == "toolu_…"` — exact matching, no
  heuristics. While the MCP call was held for 3 s the CLI waited; after the
  result it emitted a `user`/`tool_result` line, a new assistant message
  (thinking + text), `message_delta {stop_reason:"end_turn"}` and one `result`
  whose `usage` is the **run total** (round 1 + round 2).
- `tests/fixtures/codex-0.155.0-mcp-tool-approval-blocked.jsonl` + `.mcp.json`
  — Codex 0.155.0 with `-c mcp_servers.cta.url="http://…"`: connects over HTTP
  (`initialize`, `tools/list`) and emits `item.started {type:"mcp_tool_call",
  server:"cta", tool:"get_weather", arguments:{…}, status:"in_progress"}`
  **before** calling the server, but the call failed with `"MCP tool call
  requires approval, but approval policy is never"`. Codex also used its
  built-in `web_search` under `--sandbox read-only`. Both must be solved in
  phase 03 (see its research list).
- MCP wire (both CLIs): JSON-RPC over `POST`, methods `initialize`
  (echo the client's `protocolVersion`), `notifications/initialized`,
  `tools/list`, `tools/call`; Claude additionally sends a non-standard
  `server/discover` probe first (answer with an empty result), one `GET`
  (answer `405`) and Codex a `DELETE` (answer `200`). A 60-line hand-rolled
  handler satisfied both; no MCP SDK dependency is needed.
- `agy` has `agy mcp add <name> <url>` but writes to the user profile (its
  adapter does not isolate config) and `cursor-agent` shows no MCP flag →
  **both are out of scope**; requests with tools are routed only to targets
  whose adapter can bridge.

**Decisions.**

| Topic | Decision |
|---|---|
| Transport | Gateway hosts MCP over streamable HTTP at `POST /mcp/:bridgeId` on the existing Fastify server; `bridgeId` is a 21-char nanoid secret; unknown id → 404; no API-key auth on this path (the CLI cannot send one). |
| Source of truth for a tool call | The adapter's JSONL (`tool_call` event with the CLI's own id). The MCP `tools/call` is matched to it by `_meta["claudecode/toolUseId"]`, else by name + JSON-equal arguments (FIFO), else a call is synthesised with id `call_<nanoid>`. |
| End of a round | The adapter emits `done { stopReason: "tool_use" }` (Claude). If an MCP call arrives before any such event (Codex), the round ends 250 ms after the first call. |
| Parked process | Holds its account slot. Expires after `tool_result_timeout_sec` (default 300): kill tree, release slot, forget. Client abort is detached from the process while parked and re-attached on resume. The run timeout is paused while parked and reset on resume. |
| Late / unknown tool results | No parked run for the ids → normal fresh run; `render-transcript` renders tool calls and results as text. Degraded but never an error. |
| Built-in CLI tools | When a request carries tools, built-in tools stay disabled regardless of the group's `allowTools` (the model has exactly the client's tools, like the real API). |
| `tool_choice` | `auto` / omitted / `none` (`none` = drop tools). Anything else → 400. `parallel_tool_calls` ignored. |
| Response cache | Never used when the request has tools. |
| Usage | Recorded per HTTP round. Claude's final `result.usage` is a run total: the last round records `result − Σ(previous rounds)`; `costUsd` is attributed to the last round. Codex reports usage once per turn, so round 1 records no tokens. |
| Sessions | Fingerprints include tool calls/results. A run that ends in `end_turn` upserts the session exactly as today, with the round's request messages. |

## 3. Non-goals

- Executing tools in the gateway, MCP `resources`/`prompts`, MCP auth/OAuth.
- Streaming partial tool arguments (each call is emitted whole).
- `tool_choice` forcing a specific tool; `parallel_tool_calls: false` enforcement.
- Tool bridging for `agy` and `cursor-agent` (no isolated MCP config; separate plan if wanted).
- Surviving a gateway restart with a parked process (parked runs are in memory; the fallback path covers it).
- Images / non-text tool results.

## 4. Architecture

```
round 1  client ──POST /v1/chat/completions {tools}──▶ normalize ──▶ route ──▶ execute-candidate
                                                                          │ createBridge(tools) → /mcp/<id>
                                                                          ▼
                                    claude -p … --tools "" --mcp-config {cta:/mcp/<id>} --allowedTools mcp__cta
                                                                          │ stdout JSONL
             ◀── SSE: tool_calls, finish_reason=tool_calls ── bridge-events ◀┘   (tool_call, done{tool_use})
                                                              parkRun(id, iterator, slot, pending MCP call)
                                    claude ──POST /mcp/<id> tools/call──▶ api/mcp.ts ──▶ awaitToolResult(bridge, call)  (pending)

round 2  client ──POST {…, assistant(tool_calls), tool(result)}──▶ normalize ──▶ route: takeParkedRun(ids)
                                                                          │ deliverToolResults → resolves pending tools/call
                                                                          ▼
             ◀── SSE: text, finish_reason=stop ── bridge-events ◀── same claude process continues
                                                              release slot, record usage, upsert session
```

New/changed modules (all plain functions, files ≤ 300 lines):

```
apps/gateway/src/core/types.ts               contract extension (§4.1 below)
apps/gateway/src/protocol/normalize-*.ts     accept tools, tool_choice, tool messages / tool_use / tool_result
apps/gateway/src/protocol/serialize-*.ts     emit tool_calls / tool_use, finish_reason tool_calls / stop_reason tool_use
apps/gateway/src/protocol/errors.ts          RouteError code "tools_unsupported" → 400
apps/gateway/src/runner/render-transcript.ts render tool history as text (fallback path)
apps/gateway/src/sessions/session-store.ts   fingerprint covers tool fields
apps/gateway/src/router/tool-bridge.ts       bridge registry: tools, pending MCP calls, parked runs, expiry sweep
apps/gateway/src/router/bridge-events.ts     wraps a run's CliEvent stream: round end, synthesised calls, usage delta
apps/gateway/src/api/mcp.ts                  POST/GET/DELETE /mcp/:bridgeId (hand-rolled JSON-RPC)
apps/gateway/src/runner/run-cli.ts           returns timeout.pause()/reset()
apps/gateway/src/router/execute-candidate.ts create bridge, pass mcpUrl to buildArgs, wrap events
apps/gateway/src/router/route-request.ts     parked-run resume, skip cache with tools, candidate filter
apps/gateway/src/adapters/claude-code.ts     clientTools: true; buildArgs tools → --mcp-config/--allowedTools/--max-turns; parse tool_use
apps/gateway/src/adapters/codex.ts           clientTools: true (phase 03); parse mcp_tool_call
apps/gateway/src/db/migrate.ts + repos.ts    settings tool_result_timeout_sec, tool_max_turns
tests/fake-cli/fake-cli.mjs                  scenarios tool_call, tool_call_twice, tool_call_hang (a real MCP client)
```

### 4.1 Contract extension (additive to v2 plan §4.1; report any other deviation)

```ts
// apps/gateway/src/core/types.ts
export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall { id: string; name: string; argumentsJson: string }   // argumentsJson is a JSON object literal, "{}" when empty

export interface ChatMessage {
  role: Role;
  content: string;              // role "tool": the result text
  toolCalls?: ToolCall[];       // role "assistant" only
  toolCallId?: string;          // role "tool" only
  isError?: boolean;            // role "tool" only (Anthropic tool_result.is_error)
}

export interface ToolDefinition { name: string; description?: string; parameters: Record<string, unknown> }  // JSON Schema object

export interface ChatRequest {
  /* unchanged fields */
  tools?: ToolDefinition[];     // present and non-empty ⇒ bridged run
  toolChoice?: "auto" | "none";
}

export type CliEvent =
  /* unchanged variants */
  | { type: "tool_call"; id: string; name: string; argumentsJson: string }
  | { type: "done"; stopReason: "end_turn" | "max_tokens" | "tool_use" | "error" };

export interface Adapter {
  /* unchanged fields */
  clientTools?: boolean;        // true ⇒ buildArgs accepts `tools` and parseLine emits tool_call / done tool_use
  buildArgs(input: {
    model: string; effort?: Effort; systemPrompt?: string;
    resume?: { cliSessionId: string };
    allowTools: boolean;
    tools?: { mcpUrl: string; serverName: string; maxTurns: number; resultTimeoutMs: number };
  }): { args: string[]; promptVia: "argv" | "stdin"; env?: NodeJS.ProcessEnv };   // env is merged over buildEnv()
}
```

`serverName` is always `"cta"`; the CLI exposes the tools as `mcp__cta__<name>`
and adapters strip that prefix in `tool_call.name`.

### 4.2 MCP endpoint contract (`api/mcp.ts`)

- `POST /mcp/:bridgeId` — body is one JSON-RPC 2.0 message. Reply `200
  application/json` with `{ jsonrpc, id, result }`:
  - `initialize` → `{ protocolVersion: <params.protocolVersion>, capabilities: { tools: {} }, serverInfo: { name: "cta", version: <gateway version> } }`
  - `tools/list` → `{ tools: [{ name, description, inputSchema }] }` from the bridge's `ToolDefinition[]` (`inputSchema = parameters`, default `{ type: "object", properties: {} }`)
  - `tools/call` → held until the client's result arrives, then `{ content: [{ type: "text", text }], isError }`; on bridge expiry reply JSON-RPC error `-32000 "tool result timed out"`
  - `ping` → `{}`; any request with no `id` (notification) → `202` empty body; unknown method with an id → error `-32601`
- `GET /mcp/:bridgeId` → `405`. `DELETE /mcp/:bridgeId` → `200` empty.
- Unknown `bridgeId` → `404`. The fixtures' `.mcp.json` files are the reference request log.

## 5. Data model

No new tables. `settings` gains two keys seeded in `db/migrate.ts` and read in
`loadSettings`: `tool_result_timeout_sec` (default `300`), `tool_max_turns`
(default `25`). Parked runs live in memory only.

## 6. Phases

| # | Phase | Deliverable | Depends on | Effort |
|:-:|---|---|:-:|:-:|
| 1 | [Contracts, protocol, adapters' parsers](./phase-01-contracts-and-protocol.md) | Types, normalisers/serialisers for both dialects, transcript rendering and fingerprints with tool history, `claude-code`/`codex` `parseLine` for tool calls from the committed fixtures, settings keys. Gateway still answers 400 for tools (no bridge yet). | — | 1d |
| 2 | [MCP bridge and parked runs (claude-code)](./phase-02-mcp-bridge-and-parked-runs.md) | `/mcp/:bridgeId`, bridge registry, round ending, parking/resume/expiry, `run-cli` timeout controls, `claude-code` args, fake-CLI MCP client scenarios, integration tests, real-CLI smoke. | 1 | 1.5d |
| 3 | [Codex, acceptance tests, docs](./phase-03-codex-e2e-docs.md) | Codex approval/built-in-tool research + fixture + bridging, SDK acceptance tests (OpenAI + Anthropic tool loops, expiry, unsupported group), README/plan docs, admin settings fields. | 2 | 1d |

## 7. Acceptance criteria (whole plan)

- [x] AC-1 OpenAI SDK against `group:default` (fake adapter): a request with one tool returns `finish_reason: "tool_calls"` and one `tool_calls[]` entry with the CLI's id and JSON arguments; posting the `tool` message returns the final text containing the result; **one** CLI process served both rounds (same pid via `/admin/live` or the fake CLI's echo) and round 2 has `x-cta-session-reused: 1`. Streaming and non-streaming. *(`tests/e2e/acceptance.test.ts`)*
- [x] AC-2 Same loop via `@anthropic-ai/sdk` (`tool_use` block → `tool_result` block); the SDK's stream parser accepts the frames.
- [x] AC-3 Two tool calls in one assistant message (fake `tool_call_twice`) are both emitted in round 1; the CLI's sequential MCP calls are both answered from the single round-2 request.
- [x] AC-4 A parked run whose client never answers is killed after `tool_result_timeout_sec`, its slot is released, and a later request carrying those tool results still succeeds through the fallback (fresh process, tool history rendered as text).
- [x] AC-5 A group whose only healthy targets are `agy`/`cursor-agent` answers `400 invalid_request_error` `tools_unsupported`; a mixed group skips them silently.
- [x] AC-6 Real CLI: `node scripts/smoke-real-cli.mjs --adapter claude-code --account <id> --model sonnet --tools` completes a `get_weather` loop in both dialects; Codex via `--model group:codex-tools` (a group with Allow tools). *(Recorded in the phase 02/03 reports and reviews.)*
- [x] AC-7 Requests without tools behave exactly as before: full `pnpm test` stays green and no non-tool code path changes its output.
- [x] AC-8 omp with the `cta` provider and `supportsTools` unset (native tool calling) completes a file-reading task without the "owned dialect" system prompt. *(Reviewer, 2026-09-19: `read package.json` → `cli-to-api` through the bridge.)*

## 8. Review protocol

Cursor implements phase by phase and writes
`reports/phase-0N-report.md` (Status, Built, Verified with command output
summary, Deviations, Concerns). Claude reviews the report and the diff against
the phase's acceptance list before the next phase starts. Any deviation from
§4.1 / §4.2 must be called out in the report. Cursor commits on `main` with
conventional messages, no AI attribution lines, and does not push.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Claude's `--mcp-config` inline JSON fails to parse on some shim/shell | Pass the JSON as one argv entry (resolver runs without a shell). Phase 02 verifies with the real CLI; if it fails, write the config to a temp file like `--system-prompt-file` does. |
| Claude aborts a held MCP call before the client answers | `MCP_TOOL_TIMEOUT` (ms) is set in the child env to `tool_result_timeout_sec + 30 s`; the fixture run held a call for 3 s without issue. Phase 02 smoke holds one for 60 s. |
| Codex denies MCP calls under `approval_policy = never` | Phase 03 research list with concrete candidates; if none works, Codex ships with `clientTools: false` and the plan's Codex criteria are marked not done. |
| A parked process outlives its client (client crashed) | Expiry sweep every 5 s; kill tree; slot release; live view shows `waiting_tool_result`. |
| `IncomingMessage` `close` fires after a normal response and would kill the parked process | The bridge detaches the client-abort forwarding before it ends the round; tests assert the process is alive after round 1. |
| Double-counted usage on tool runs | Usage delta rule in §2; a unit test replays the committed Claude fixture and asserts round 2 records `{input 2, cacheWrite 141, cachedInput 15038, output 156}`. |
| Fingerprint drift breaks session reuse after a tool round | Fingerprint includes tool fields; AC-1 asserts `x-cta-session-reused: 1` on round 2 and a third plain turn resumes via `--resume`. |
