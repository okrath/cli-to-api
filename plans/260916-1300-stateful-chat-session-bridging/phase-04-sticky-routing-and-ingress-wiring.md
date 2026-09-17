---
phase: 4
title: "Sticky Routing & Ingress Wiring"
status: pending
priority: P1
effort: "0.5d"
dependencies: ["phase-02-merkle-prefix-thread-manager", "phase-03-native-cli-session-bridge"]
---

# Phase 4: Sticky Routing & Ingress Wiring

## Goal
Integrate `SessionThreadManager` into `/v1/chat/completions`, pin sessions to their initial account sandbox (Sticky Routing), emit diagnostic response headers, and update thread metrics upon completion.

---

## Detailed Technical Context & Requirements

1. **Ingress Hook in `openai-chat.ts`:**
   - Resolve thread via `globalSessionThreadManager.resolveThread(req, messages, requestedModel)`.
   - If thread is pinned to an account: pass `pinnedAccountId` to `LoadBalancer.resolveTarget`.
   - If thread is new: LoadBalancer picks healthy account, and `SessionThreadManager` binds that account to the thread.

2. **Diagnostic Headers:**
   - Emit `X-Debug-Session-Id: <thread_id>`
   - Emit `X-Debug-Session-Status: NEW | RESUMED`
   - Emit `X-Debug-CLI-Session: <cli_session_id>`

3. **Post-Execution State Sync:**
   - Update `conversation_threads`:
     - `total_turns = total_turns + 1`
     - `leaf_hash = newLeafHash`
     - `last_active_at = now()`
     - `expires_at = now() + 3600` (sliding 60m TTL)
     - `cli_session_id = result.cliSessionId || current`

---

## Tasks Breakdown

- **Task 4.1:** Update `apps/gateway/src/router/load-balancer.ts` to accept optional `pinnedAccountId`.
- **Task 4.2:** Update `apps/gateway/src/api/routes/openai-chat.ts` to wire thread resolution and headers.

---

## Verification Commands
```bash
pnpm --filter @cli-to-api/gateway test tests/e2e/chat-completions.test.ts
```
