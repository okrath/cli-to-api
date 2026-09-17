---
title: "Stateful Web Chat Session Bridging, Merkle Prefix Threading & Native CLI Memory"
status: completed
priority: P1
effort: "3d"
branch: main
tags: [session, memory, merkle-dag, claude, codex, sqlite, fastify]
blockedBy: []
blocks: []
created: 2026-09-16
---

# Stateful Web Chat Session Bridging, Merkle Prefix Threading & Native CLI Memory

## Executive Summary

When developers connect Web Chat UIs (Open WebUI, LibreChat, Chatbox, Cursor, Continue.dev) to `http://localhost:8080/v1/chat/completions`, standard multi-turn interactions lose memory or fail:
1. **The Flattening & Amnesia Defect:** On every turn, the gateway concatenates the entire historical message array into a single monolithic string (`Human: ... Assistant: ...`) and spawns a fresh CLI process with flags like `--ephemeral`, destroying session memory upon exit.
2. **Context Blowup:** In multi-turn chats, earlier turns are re-sent and re-tokenized repeatedly ($O(N^2)$ token waste), confusing CLI agents and triggering Windows 8,191-character argument limits.
3. **Loss of Native CLI Agent State:** State-of-the-art tools (Anthropic Claude Code and OpenAI Codex CLI) possess native session resumption engines (`claude --session-id <uuid> --resume <uuid>` and `codex exec resume <session_id>`).

This plan implements a **Merkle-DAG Prefix Thread Identifier and Native CLI Session Bridge**:
- **Automatic Thread Identification:** When Web Chat UIs send `messages`, the gateway computes a deterministic, client-scoped Merkle prefix hash chain over the messages. If Turn 2's prefix matches Turn 1, it recognizes that Turn 2 is part of the existing thread.
- **Delta-Only Prompt Dispatch:** Turn 2 sends **only the newest user message** to the native CLI in resume mode, cutting token usage by up to 90%+ and keeping the prompt ultra-short.
- **Native CLI Memory Preservation:** Claude Code and Codex CLI maintain their native session files, working directory scratchpads, and context memory across turns.
- **Self-Healing Fast-Hydration:** If a session is lost or corrupted, the gateway seamlessly falls back to rehydrating full history into a new session without returning an error to the user.

---

## Phased Roadmap

| Phase | Title | Objective | Effort |
|:---:|---|---|:---:|
| **1** | [Schema & Thread Registry](./phase-01-schema-and-thread-registry.md) | Drizzle SQLite schema for `conversation_threads`, WAL migration | 0.5d |
| **2** | [Merkle Prefix Thread Manager](./phase-02-merkle-prefix-thread-manager.md) | Client-scoped Merkle hash chain, turn delta extraction, thread resolution | 1d |
| **3** | [Native CLI Session Bridge](./phase-03-native-cli-session-bridge.md) | Claude Code (`--session-id`/`--resume`) & Codex CLI (`exec resume`), removing `--ephemeral` | 0.5d |
| **4** | [Sticky Routing & Ingress Wiring](./phase-04-sticky-routing-and-ingress-wiring.md) | Connect thread manager to `/v1/chat/completions`, sticky account lock, debug headers | 0.5d |
| **5** | [E2E Verification & Multi-Turn Acceptance](./phase-05-e2e-verification-and-acceptance.md) | Automated multi-turn test suite verifying Turn 1 context is remembered in Turn 2 | 0.5d |

---

## File Ownership & Changes

```
apps/gateway/src/
├── db/
│   ├── schema.ts                     [MODIFY] Add conversationThreads table
│   └── migrate.ts                    [MODIFY] Additive SQLite DDL for conversation_threads
├── router/
│   └── session-thread-manager.ts     [CREATE] Merkle prefix hash chain, thread resolver, delta prompt extractor
├── supervisor/
│   ├── types.ts                      [MODIFY] Add session resume fields to ExecutionContext & ProcessExecutionResult
│   ├── prompt-transport.ts           [MODIFY] Add support for resume prompt templates
│   └── process-manager.ts            [MODIFY] Support session-id injection, resume mode, and session ID capture
├── api/routes/
│   └── openai-chat.ts                [MODIFY] Wire SessionThreadManager into ingress, emit X-Debug-Session headers
└── adapters/
    ├── claude-code.yaml              [MODIFY] Configure native session flags (--session-id, --resume)
    └── codex-cli.yaml                [MODIFY] Remove --ephemeral; configure exec resume template

tests/
└── e2e/
    └── stateful-session.test.ts      [CREATE] Multi-turn test: Turn 1 outline -> Turn 2 chapter generation
```
