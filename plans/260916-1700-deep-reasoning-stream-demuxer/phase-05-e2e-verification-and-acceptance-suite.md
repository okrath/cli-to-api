---
phase: 5
title: "E2E Verification & Acceptance Suite"
status: completed
priority: P1
effort: "0.25d"
dependencies: [1, 2, 3, 4]
---

# Phase 5: E2E Verification & Acceptance Suite

## Goal
Construct a dedicated mock reasoning CLI (`tests/mocks/mock-reasoning-cli.js`) and comprehensive E2E test suite in `tests/e2e/reasoning-streaming.test.ts` to rigorously prove acceptance criteria across chunk splits, streaming deltas, non-streaming responses, and context decontamination without any database persistence.

---

## Detailed Technical Context & Requirements

1. Mock Reasoning CLI (`tests/mocks/mock-reasoning-cli.js`):
   - Simulates realistic deep reasoning models:
     - Emits micro-chunks simulating chunk boundary splits: `"<thi"`, `"nk>\nPhân tích bài toán...\n</thi"`, `"nk>\nKết quả là 42."`.
     - Supports unclosed tags to verify EOF auto-recovery.
     - Supports nested tags.

2. E2E Test Suite (`tests/e2e/reasoning-streaming.test.ts`):
   - Register test adapter pointing to `mock-reasoning-cli.js`.
   - Test 1: Standard SSE streaming receives `delta.reasoning_content` chunks first, followed by clean `delta.content`.
   - Test 2: Chunk split boundary handling verifies no partial tag leak.
   - Test 3: Unary non-streaming returns both `message.content` and `message.reasoning_content`.
   - Test 4: Multi-turn context decontamination verifies previous thinking blocks are stripped from prompt before CLI spawn.
   - Test 5: Verify zero database changes / no `thinking_history` table exists.

---

## Tasks Breakdown

- **Task 5.1:** Create `tests/mocks/mock-reasoning-cli.js`. [COMPLETED]
- **Task 5.2:** Create `tests/e2e/reasoning-streaming.test.ts`. [COMPLETED]
- **Task 5.3:** Run complete project test suite with `pnpm test`. [COMPLETED]
- **Task 5.4:** Verify full monorepo build with `pnpm build`. [COMPLETED]

---

## Verification Commands
```bash
pnpm test
pnpm build
```
