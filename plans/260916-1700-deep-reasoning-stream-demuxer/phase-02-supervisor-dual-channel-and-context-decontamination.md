---
phase: 2
title: "Supervisor Dual-Channel & Context Decontamination"
status: completed
priority: P1
effort: "0.25d"
dependencies: [1]
---

# Phase 2: Supervisor Dual-Channel & Context Decontamination

## Goal
Integrate `ThinkingDemuxer` into the Process Supervisor (`pipe-executor.ts`, `pty-executor.ts`, and `process-manager.ts`) to stream clean content via `onContentDelta` and reasoning via `onThoughtDelta`, and add `stripThinkingTags` in `content-normalizer.ts` to decontaminate multi-turn conversation history.

---

## Detailed Technical Context & Requirements

1. Supervisor Interfaces (`apps/gateway/src/supervisor/types.ts`):
   - Add `onContentDelta?: (chunk: string) => void` and `onThoughtDelta?: (chunk: string) => void` to `ProcessSpawnOptions`.
   - Keep `onDelta` as a backward-compatible proxy.
   - Add `thoughtDurationMs`, `thoughtContent`, and `cleanContent` to `ProcessExecutionResult`.

2. Pipe & PTY Executors (`pipe-executor.ts`, `pty-executor.ts`):
   - Feed sanitized chunks from `DualStageAnsiSanitizer` into `ThinkingDemuxer`.
   - Demuxer routes cleanly to `onContentDelta` and `onThoughtDelta`.
   - On process exit, call `demuxer.flush()` to ensure all trailing tokens are emitted.
   - Return `thoughtContent`, `cleanContent`, and `thoughtDurationMs` in `ProcessExecutionResult`.

3. Context Decontamination (`apps/gateway/src/utils/content-normalizer.ts`):
   - When preparing multi-turn messages for the CLI (`normalizeMessagesForCli`), prior assistant turns may contain `<think>...</think>`.
   - Strip historical `<think>...</think>` blocks so that previous thoughts do not consume context window tokens or confuse agent prompt loops.
   - Export helper `stripThinkingTags(text: string): string`.

---

## Tasks Breakdown

- **Task 2.1:** Update `types.ts` with dual-channel callbacks and result metrics. [COMPLETED]
- **Task 2.2:** Wire `ThinkingDemuxer` into `pipe-executor.ts` and `pty-executor.ts`. [COMPLETED]
- **Task 2.3:** Update `process-manager.ts` to support dual-channel callbacks in `executeStreaming` and return clean text in `executeNonStreaming`. [COMPLETED]
- **Task 2.4:** Add `stripThinkingTags` in `content-normalizer.ts` and ensure `flattenMessages` strips historical thinking tags. [COMPLETED]
- **Task 2.5:** Write unit test in `tests/unit/context-decontamination.test.ts`. [COMPLETED]

---

## Verification Commands
```bash
pnpm --filter @cli-to-api/gateway test tests/unit/context-decontamination.test.ts
pnpm --filter @cli-to-api/gateway test tests/unit/process-lifecycle.test.ts
```
