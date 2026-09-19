# Phase 01 review

Verdict: APPROVED — phase 02 may start.

Reviewed commit `8c1dc09` against `phase-01-contracts-and-protocol.md` and plan §4.1.
Independently re-ran `pnpm lint` (clean) and `pnpm test` (28 files, 156 tests, green).

## Checked

- `core/types.ts` matches §4.1 exactly (Role `tool`, `ToolCall`, `ToolDefinition`, `ChatRequest.tools/toolChoice`, `tool_call` event, `done.tool_use`, `Adapter.clientTools`, `buildArgs.tools/env`).
- OpenAI normaliser: tools/tool_choice/parallel_tool_calls, assistant `tool_calls` with JSON-object re-serialisation, `tool` messages with matching-id check, name pattern; `functions`/`response_format` still 400; blanket `tools` rejection gone.
- Anthropic normaliser: tools/input_schema, tool_choice mapping, `tool_use` → `toolCalls`, `tool_result` → `tool` messages in block order followed by the user text, `is_error`, thinking blocks ignored (intentional behaviour change, reported).
- Serialisers: OpenAI `tool_calls` chunks with running index, `finish_reason: "tool_calls"`, `content: null` for tool-only messages; Anthropic running block index, `tool_use` blocks with `input_json_delta`, `stop_reason: "tool_use"`, text block omitted when empty and a tool block exists.
- `errors.ts` `tools_unsupported` → 400 in both dialects; `route-request.ts` guard before the cache lookup.
- `render-transcript.ts`: `[tool_call …]` / `[tool_result …]` blocks, single-turn shortcut disabled with tool history, resume with trailing tool results.
- `session-store.ts` fingerprint covers `toolCalls`, `toolCallId`, `isError`.
- `claude-code.ts`: stateless `tool_call` from the aggregated `assistant` line, `done tool_use` after `message_delta` usage; fixture test asserts the exact id/args and the per-message and run-total usage numbers. `codex.ts`: `mcp_tool_call` on `item.started`.
- Settings seeded, loaded, exposed and patchable via `/admin/settings`.
- Out-of-list edits are type widenings only (`finalize-run.ts` stopReason union, `config.test.ts` seeded settings) — fine.

## Nits (fold into phase 02, no separate commit needed)

1. `serialize-anthropic.ts`: the `tool_use` branch of `openBlockOfKind` is dead code — the `tool_call` path opens its block inline. Remove the branch (or route the tool_call path through it) so there is one way to open a block.
2. `normalize-*.ts`: with `tool_choice: none` the result carries neither `tools` nor `toolChoice`. Acceptable (phase 02 only checks `req.tools?.length`), but keep the `toolChoice !== "none"` guard in phase 02 as written so a future "tools without choice" caller is still safe.

## Carry-over to phase 02

- Replace the `route-request.ts` guard with the bridge; keep the `tools_unsupported` error for groups with no bridging target (message from plan §4: "no target in this group supports client tools").
- The `claude-code` adapter's `--max-turns 1` and `--tools ""` handling must stay unchanged for requests without tools (AC-7).
