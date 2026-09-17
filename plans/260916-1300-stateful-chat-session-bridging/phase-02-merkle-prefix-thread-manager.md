---
phase: 2
title: "Merkle Prefix Thread Manager"
status: pending
priority: P1
effort: "1d"
dependencies: ["phase-01-schema-and-thread-registry"]
---

# Phase 2: Merkle Prefix Thread Manager

## Goal
Implement `SessionThreadManager` to deterministically track conversation threads, compute client-scoped Merkle prefix hash chains, match incoming messages to active sessions, and extract delta-only prompts for follow-up turns.

---

## Detailed Technical Context & Requirements

1. **Client-Scoped Merkle Prefix Hashing:**
   - $\text{ClientScope} = \text{SHA256}(\text{BearerToken} \parallel \text{ClientIP})$
   - Node 0 (Initial turn):
     $$H_0 = \text{SHA256}(\text{ClientScope} \parallel m_0.\text{role} \parallel \text{normalize}(m_0.\text{content}))$$
   - Node $k$ ($k \ge 1$):
     $$H_k = \text{SHA256}(H_{k-1} \parallel m_k.\text{role} \parallel \text{normalize}(m_k.\text{content}))$$
   - The root hash $H_0$ uniquely identifies the conversation thread.

2. **Thread Resolution Logic (`resolveThread`):**
   - Step 1: Check explicit headers (`x-conversation-id`, `x-session-id`, `body.conversation_id`, `body.user`). If present, use as thread ID.
   - Step 2: If absent, compute $H_0$. Look up active thread in SQLite with `clientScope` and `rootHash == H_0`.
   - Step 3: If thread exists:
     - Check linear continuation: incoming messages count $> 1$.
     - Extract **only the latest user message** ($m_N$) as `deltaPrompt`!
     - Return `{ isResume: true, thread, deltaPrompt: m_N.content, cliSessionId: thread.cliSessionId }`.
   - Step 4: If thread does not exist:
     - Generate new thread ID and new CLI session ID (UUIDv4 for Claude Code).
     - Full messages flattened or root prompt as initial input.
     - Return `{ isResume: false, thread, deltaPrompt: initialPrompt, cliSessionId }`.

---

## Tasks Breakdown

- **Task 2.1:** Implement `SessionThreadManager` in `apps/gateway/src/router/session-thread-manager.ts`.
- **Task 2.2:** Add unit tests verifying Merkle prefix hashing, linear continuation detection, and delta prompt extraction.

---

## Verification Commands
```bash
pnpm --filter @cli-to-api/gateway test tests/unit/session-thread-manager.test.ts
```
