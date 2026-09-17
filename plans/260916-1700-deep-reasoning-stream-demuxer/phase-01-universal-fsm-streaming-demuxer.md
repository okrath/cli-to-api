---
phase: 1
title: "Universal FSM Streaming Demuxer"
status: completed
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Universal FSM Streaming Demuxer

## Goal
Implement a high-performance, zero-delay finite state machine (`ThinkingDemuxer`) in `apps/gateway/src/stream/thinking-demuxer.ts` that demuxes reasoning tokens and content tokens in real time, handling cross-chunk split tags, nested tags, and unclosed tags at EOF with $O(1)$ memory and $\le 0.5\text{ms}$ latency overhead.

---

## Detailed Technical Context & Requirements

1. Finite State Machine States:
   - `IDLE` (outside thinking tags: characters emitted to `onContentDelta`)
   - `THINKING` (inside thinking tags: characters emitted to `onThoughtDelta`)
   - `CONTENT` (after thinking tags closed: characters emitted to `onContentDelta`)

2. Suffix-Prefix Matching (`findCandidatePrefixLength`):
   - When in `IDLE`, if the tail of the buffer matches the prefix of `<think>` (e.g. `<` or `<th` or `<thin`), the demuxer emits the safe content prefix immediately and retains only the candidate prefix in a small sliding buffer ($\le 16\text{ bytes}$).
   - If the next chunk completes `<think>`, the tag is dropped and the state transitions to `THINKING`.
   - If the next chunk does not match `<think>`, the retained buffer is flushed to `onContentDelta` without dropping any character (zero-token-loss).

3. Nested Tags Support (`nestingDepth`):
   - When in `THINKING`, if another `<think>` occurs, `nestingDepth` increments.
   - When `</think>` occurs, `nestingDepth` decrements.
   - State only transitions to `CONTENT` when `nestingDepth <= 0`.

4. EOF Auto-Recovery (`flush()`):
   - If stream ends while in `THINKING` (e.g. CLI crashed or unclosed tag), `flush()` drains all buffered characters to `onThoughtDelta`, transitions state safely to `CONTENT`, and calls `onPhaseChange?.("CONTENT")`.

---

## Tasks Breakdown

- **Task 1.1:** Create `apps/gateway/src/stream/thinking-demuxer.ts` implementing `ThinkingDemuxer`. [COMPLETED]
- **Task 1.2:** Add unit test suite in `tests/unit/thinking-demuxer.test.ts` covering split tags, nested tags, false positives, EOF recovery. [COMPLETED]

---

## Verification Commands
```bash
pnpm --filter @cli-to-api/gateway test tests/unit/thinking-demuxer.test.ts
```
