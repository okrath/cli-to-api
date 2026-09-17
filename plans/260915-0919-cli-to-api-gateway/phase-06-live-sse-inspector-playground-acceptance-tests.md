---
phase: 6
title: "Live SSE Inspector, Playground Studio & Automated Acceptance Verification"
status: pending
priority: P1
effort: "2d"
dependencies: ["phase-01-substrate-engine-sqlite-wal-adapter-schema", "phase-02-process-supervisor-job-objects-stream-sanitizer", "phase-03-multi-account-sandboxing-concurrency-cooldown", "phase-04-openai-api-gateway-intelligent-tier-router", "phase-05-obsidian-cyber-deck-console-in-browser-webshell"]
---

# Phase 6: Live SSE Inspector, Playground Studio & Automated Acceptance Verification

## Goal
Implement the real-time Live SSE Inspector and Chat Playground studio in the web console, build the automated mock CLI driver test suites, and execute end-to-end verification proving all 7 Acceptance Criteria (AC-01 through AC-07) pass cleanly.

## Files to Create / Modify
- Create: `apps/gateway/src/api/routes/admin-events.ts`
- Create: `apps/web/src/views/LiveInspectorView.tsx`
- Create: `apps/web/src/views/PlaygroundView.tsx`
- Create: `tests/helpers/test-server.ts`
- Create: `tests/mocks/mock-spinner-cli.js`
- Create: `tests/mocks/mock-ratelimit-cli.js`
- Create: `tests/mocks/mock-hanging-cli.js`
- Create: `tests/mocks/mock-large-prompt-cli.js`
- Create: `tests/e2e/acceptance.test.ts`

## Tasks & Steps

### Task 6.1: Real-Time SSE Admin Event Stream (`/api/admin/events`)
1. Implement `apps/gateway/src/api/routes/admin-events.ts`:
   - Expose Server-Sent Events stream for connected Web Consoles.
   - Broadcast live events: `request:start`, `chunk:raw`, `chunk:sanitized`, `request:complete`, `cooldown:trigger`, `cooldown:expire`.
   - Calculate real-time Time-To-First-Token (TTFT) and throughput tokens/sec.

### Task 6.2: Live SSE Inspector Component (`LiveInspectorView.tsx`)
1. Implement `apps/web/src/views/LiveInspectorView.tsx`:
   - Connect to `/api/admin/events`.
   - Provide split-view comparing:
     - Left: Raw process terminal chunks with ANSI escape codes.
     - Right: Transformed, sanitized OpenAI delta text.
   - Include "ANSI Diff View" toggle highlighting stripped cursor resets (`\r`) and spinner animations.

### Task 6.3: Chat Playground Studio (`PlaygroundView.tsx`)
1. Implement `apps/web/src/views/PlaygroundView.tsx`:
   - Model dropdown populated dynamically from `GET /v1/models` (including `codex/gpt-5.6-asta`, `opencode/gpt-5.6-asta`, `auto-low`, `auto-xhigh`).
   - Temperature slider, max tokens input, and streaming toggle.
   - Multi-turn message history editor (User / Assistant / System).
   - Real-time token streaming with syntax-highlighted code blocks and generation telemetry (TTFT, tokens/sec).

### Task 6.4: Mock CLI Testing Drivers (`tests/mocks/`)
1. Create mock CLI scripts to verify edge cases without requiring live third-party accounts:
   - `mock-spinner-cli.js`: Emits `\rThinking... ⠋` followed by Vietnamese UTF-8 text (`"Xin chào thế giới 🚀"`).
   - `mock-ratelimit-cli.js`: Emits `Error: rate limit exceeded, resets in 45m` and exits with code 1.
   - `mock-hanging-cli.js`: Catches and ignores `SIGTERM` to verify forced Win32 Job Object / POSIX `-pgid` termination.
   - `mock-large-prompt-cli.js`: Reads and verifies 10,000+ character prompt passed via temporary file.

### Task 6.5: Automated Acceptance Test Suite (`tests/e2e/acceptance.test.ts`)
1. Implement end-to-end Vitest suite covering all 7 Acceptance Criteria:
   - **AC-01:** `GET /v1/models` returns full catalog with namespaced models and virtual auto tiers.
   - **AC-02:** `POST /v1/chat/completions` with `model: "codex/gpt-5.6-asta"` routes strictly to Codex accounts.
   - **AC-03:** `POST /v1/chat/completions` with `model: "auto-low"` routes by tier with least-connections.
   - **AC-04:** Two parallel requests for Account A and Account B run in discrete sandbox directory jails without session collision.
   - **AC-05:** 429 error dynamically extracts "resets in 45m" (2,700s cooldown) and fails over to healthy accounts.
   - **AC-06:** Client disconnect during generation terminates child process tree in $\le 200\text{ms}$ (0 zombie processes).
   - **AC-07:** Web Console and WebShell WebSocket connect and execute commands inside sandbox jail.

## Todo
- [x] Implement `apps/gateway/src/api/routes/admin-events.ts` SSE broadcast
- [x] Implement `LiveInspectorView.tsx` with ANSI Diff View
- [x] Implement `PlaygroundView.tsx` with multi-turn chat and streaming
- [x] Implement mock CLI scripts in `tests/mocks/`
- [x] Implement `tests/e2e/acceptance.test.ts` covering AC-01 through AC-07
- [x] Run full test suite and verify 100% pass rate
- [x] Verify production build compiles cleanly

## Verification
- Run `pnpm test` and verify all unit and e2e acceptance tests pass cleanly.
- Open `http://localhost:8080/` in browser, navigate to Playground, select `auto-low`, send a prompt, and verify live streaming output renders in real time.
- Open Live Inspector and verify raw vs sanitized SSE chunks are displayed side-by-side.
