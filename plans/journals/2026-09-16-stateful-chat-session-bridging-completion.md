# Technical Journal: Stateful Web Chat Session Bridging & Multi-Turn Memory Implementation

- **Date:** 2026-09-16
- **Status:** Complete & Verified
- **Monorepo Build:** 2/2 packages built cleanly (`@cli-to-api/gateway`, `@cli-to-api/web`)
- **Automated Test Suite:** 17 test files passed (62/62 tests passing, 100%)

## Core Problems Solved
1. **Multi-Turn Memory Amnesia:**
   - In previous iterations, requests were treated as stateless, concatenating all turns into a single prompt string and calling CLIs with `--ephemeral`. This caused context loss and made follow-up instructions ("Dựa vào đó để viết chương 1") fail.
2. **Deterministic Conversation Identification:**
   - Designed and deployed `SessionThreadManager` with a client-scoped Merkle prefix hash chain:
     $$H_0 = \text{SHA256}(\text{clientScope} \parallel m_0.\text{role} \parallel m_0.\text{content})$$
     $$H_k = \text{SHA256}(H_{k-1} \parallel m_k.\text{role} \parallel m_k.\text{content})$$
   - Seamlessly binds incoming requests from any OpenAI-compatible Web Chat UI (Open WebUI, LibreChat, Chatbox, Cursor) to an active persistent thread.
3. **Delta-Only Prompt Dispatch & Native CLI Session Resumption:**
   - Turn 1: Bootstraps session (generates UUID for Claude, captures session ID for Codex).
   - Turn 2+: Dispatches **ONLY the newest incremental user message** ($m_N$) to the native CLI session engine (`claude --resume <uuid>` and `codex exec resume <sid> -`).
   - Slashes token re-serialization overhead by up to 90%+ and avoids Windows command-line character limits.
4. **Sticky Sandbox Affinity:**
   - Pinned conversation threads strictly to the account sandbox holding the native CLI session state, with a sliding 60m TTL.
