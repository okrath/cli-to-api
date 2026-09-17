---
title: "Stateless Deep Reasoning Stream Demuxing & Cyberdeck Playground"
status: completed
priority: P1
effort: "1.5d"
branch: main
tags: [reasoning, think, stream-demuxer, sse, cyberdeck-ui, stateless]
blockedBy: []
blocks: []
created: 2026-09-16
---

# Stateless Deep Reasoning Stream Demuxing & Cyberdeck Playground

## Executive Summary

Frontier reasoning models (DeepSeek-R1, Claude 3.7 Sonnet Extended Thinking, OpenAI o1/o3/GPT-5.6) generate internal reasoning / Chain-of-Thought (CoT) tokens wrapped in `<think>...</think>` tags before emitting the final answer.

The `cli-to-api` gateway previously outputted everything as a flat monolithic string into `delta.content`, causing:
1. **Content Pollution:** Tags like `<think>...</think>` were dumped into user chat or code generators, breaking UI accordions in Open WebUI/LibreChat and breaking AST parsers in coding agents (Cursor/Continue).
2. **Missing `reasoning_content`:** Client interfaces never received the standard `delta.reasoning_content` field used by modern Web Chat UIs.
3. **Context Waste in Multi-Turn Chats:** Replaying prior turns that contain `<think>` tags unnecessarily inflated prompt tokens sent to CLI processes.
4. **Playground Blindness:** The built-in `/playground` dropped reasoning and lacked a thought accordion or timer.

**Scope Policy (KISS / YAGNI):**
- **Strictly Stateless:** Zero database persistence for thinking. No database tables, no storing thinking texts to disk. RAM is freed immediately upon request completion.
- **Pure In-Memory Stream Demuxing:** The gateway acts as a high-speed, zero-latency streaming bridge that parses `<think>` tags in-flight, routes thought chunks to `delta.reasoning_content`, routes final answer chunks to `delta.content`, and strips historical thinking from prior turns before forwarding prompts to CLIs.

---

## Phased Roadmap

| Phase | Title | Objective | Effort | Status |
|:---:|---|---|:---:|:---:|
| **1** | [Universal FSM Streaming Demuxer](./phase-01-universal-fsm-streaming-demuxer.md) | Zero-delay in-memory FSM with lookahead buffer ($\le 16\text{B}$), suffix matching, nesting depth, and EOF auto-recovery | 0.5d | completed |
| **2** | [Supervisor Dual-Channel & Context Decontamination](./phase-02-supervisor-dual-channel-and-context-decontamination.md) | Wire dual channels into `ProcessManager` & `PipeExecutor`; strip `<think>` in `content-normalizer.ts` | 0.25d | completed |
| **3** | [OpenAI Ingress & SSE Wire Serializer](./phase-03-openai-ingress-and-sse-serializer.md) | Add `reasoning_content` to `ChatDelta`, stream `delta.reasoning_content` then `delta.content`, handle non-streaming | 0.25d | completed |
| **4** | [Obsidian Cyberdeck Playground UI](./phase-04-obsidian-cyberdeck-playground-ui.md) | React Cyberdeck Thought Accordion, live milliseconds timer, copy button, metrics bar | 0.25d | completed |
| **5** | [E2E Verification & Acceptance Suite](./phase-05-e2e-verification-and-acceptance-suite.md) | Mock reasoning CLI with chunked tag splits, E2E tests, full regression suite | 0.25d | completed |

---

## File Ownership & Changes

```
apps/gateway/src/
├── stream/
│   ├── thinking-demuxer.ts                            [CREATED] In-memory FSM streaming demuxer with lookahead buffer
│   └── sse-serializer.ts                              [MODIFIED] Added reasoning_content to ChatDelta
├── supervisor/
│   ├── types.ts                                       [MODIFIED] Added onThoughtDelta, onContentDelta to ProcessSpawnOptions
│   ├── pipe-executor.ts                               [MODIFIED] Wired demuxer on stdout stream
│   ├── pty-executor.ts                                [MODIFIED] Wired demuxer on PTY stream
│   └── process-manager.ts                             [MODIFIED] Wired dual-channel callbacks in executeStreaming / executeNonStreaming
├── utils/
│   └── content-normalizer.ts                          [MODIFIED] Added stripThinkingTags for multi-turn history
└── api/routes/
    ├── openai-chat.ts                                 [MODIFIED] Stream reasoning_content, clean content, and non-streaming
    └── admin-events.ts                                [MODIFIED] Broadcast chunk:thought telemetry

apps/web/src/
└── views/
    └── PlaygroundView.tsx                             [MODIFIED] Obsidian Cyberdeck Thought Accordion & Live Timer

tests/
├── mocks/
│   └── mock-reasoning-cli.js                          [CREATED] Mock CLI simulating split tags and thinking streams
├── unit/
│   ├── thinking-demuxer.test.ts                       [CREATED] Comprehensive FSM unit tests
│   └── context-decontamination.test.ts                [CREATED] Test stripping historical thinking blocks
└── e2e/
    └── reasoning-streaming.test.ts                    [CREATED] Full E2E streaming & wire verification
```
