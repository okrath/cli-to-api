# Phase 02 review

Verdict: CHANGES REQUESTED — three fixes below, then re-review. Phase 03 waits.

Reviewed commit `08e2c66` against `phase-02-mcp-bridge-and-parked-runs.md`, plan §4.1/§4.2.
Independently re-ran `pnpm lint` (clean), `pnpm test` (31 files, 178 tests, green) and the
real-CLI smoke (`pnpm build`, gateway from `dist/`, account
`claude-code-claude-code-ngo-quang-trung-sun-asterisk-com`, `--tools`): both dialects
completed the `get_weather` loop with `x-cta-session-reused: 1` on round 2 — the bridge works.

## Confirmed good

- `api/mcp.ts` matches §4.2 (plus `server/discover`), `tools/call` is held on the bridge promise.
- `tool-bridge.ts` matching order (toolUseId → name+args → synthesised `call_…`), early results, `takeParkedRun` requires every id to belong to one bridge.
- `bridge-events.ts` round end on adapter `done tool_use`, MCP-first 250 ms end with synthesised calls, client-abort detached and run timeout paused before parking, re-entrant for round 2.
- `route-request.ts`: resume path delivers results and reuses the held slot, cache skipped while bridging, non-bridging adapters filtered with `tools_unsupported`.
- `claude-code.ts` args/env for tools; non-tool args unchanged (AC-7 safe). Phase-01 nits applied.

## Required fixes

1. **Live entries leak on resumed rounds (observed).** After my smoke, `GET /admin/live` still listed both round-2 requests (`state: "running"`, pids of exited CLIs). Cause: `parkRun(bridge, { ...run, toolCallIds })` stores a *copy*; `route-request.ts` then sets `run.requestId = req.requestId` on that copy, but `run.release` is the closure `() => input.release(run.requestId)` created in `execute-candidate.ts` over the *original* object, so it removes the old request id. The same happens on a second park (multi-round) and in `sweepExpiredBridges`. Fix: park the same object (`run.toolCallIds = ids; parkRun(bridge, run)`) so mutations are visible to the closure, or make `release` read the id from the parked run. Add an assertion to the route-request tool tests: after round 2 completes, `getLiveEntries()` is empty and the account slot is free.
2. **Active bridges are deleted mid-run.** `sweepExpiredBridges` deletes any bridge older than `resultTimeoutMs` that has no parked run and no pending call — i.e. a round-1 generation longer than 300 s loses its bridge and the CLI's next `tools/call` gets 404. `createBridge` sets `expiresAt` at creation, so this is the normal path for long runs. Fix: the sweep only touches bridges that are parked or have pending calls; bridges are otherwise removed by `finishBridge`. Also call `finishBridge` in `execute-candidate.ts` on the two failover returns (spawn failure / failover before content) so an abandoned bridge does not stay in the map.
3. **Usage delta applied to every usage event of a later round.** `bridgeEvents` subtracts previous rounds from *each* `usage` event, so round 2's per-message `message_delta` usage (already per-round) becomes `{0, 0, 15038, 81}` before the correct `result` delta arrives. Serialisers and `recordUsage` take the last usage, so the output is right today, but the stream carries a wrong intermediate value. Fix: buffer the round's latest `usage` and emit it (subtracted) immediately before the final `done`; the fixture replay test should assert exactly one usage event in round 2 with `{input 2, cacheWrite 141, cachedInput 15038, output 156}`.

## Nits (optional)

- `DELETE /mcp/:bridgeId` answers 404 once the bridge is finished; Codex sends its DELETE after the run. Plan §4.2 says 200 — either is harmless, but 200 avoids a client-side warning.
- `route-request.ts` resume path: `accounts.find(...)!` — if the account was disabled while parked this throws; return `tools_unsupported`/fresh-run fallback instead.
- The report claims the live-entry fix for resumed rounds; please re-verify claims against `/admin/live` after the fix.
