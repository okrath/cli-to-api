# Architectural Brainstorm & Bounded Contract: Stateful Web Chat Conversation Threading, Native CLI Session Bridging, and Lifecycle Management

**Candidate:** Candidate 1  
**Mode:** `ak-brainstorm --ultra`  
**Target Subsystems:** Gateway Ingress (`/v1/chat/completions`), Conversation Router & Session Affinity Engine, Supervisor & Process Manager, Adapter Schema & CLI Translators, SQLite State Engine & GC Sweeper  
**Date:** 2026-09-16  

---

## Executive Summary

The current `cli-to-api` gateway operates in a strictly **stateless, prompt-flattening mode**. On every turn of a conversation, the gateway concatenates all prior messages (`messages[0..N]`) into a monolithic prompt string or temporary file, re-spawning an ephemeral CLI process (e.g. `codex exec --ephemeral` or `claude --print`). 

While simple, this architecture suffers from three structural flaws:
1. **Quadratic Token & Latency Blowup:** In a 20-turn conversation, turn 1 is processed 20 times. Processing times scale at $O(N^2)$, context limits are quickly exceeded, and token cost increases dramatically.
2. **Loss of Native CLI Agentic Capabilities:** Modern native AI CLIs—notably Anthropic Claude Code and OpenAI Codex CLI—are stateful coding engines with persistent workspace context, internal memory, tool execution state, and session resumption mechanics (`codex exec resume <id>`, `claude --session-id <id>` / `claude --resume <id>`). The current stateless replay discards these capabilities.
3. **Absence of Conversation Identification:** Standard OpenAI-compatible Web Chat UIs (Open WebUI, LibreChat, LobeChat, NextChat, Continue, Cline) communicate via standard `POST /v1/chat/completions`. Many do not provide custom session headers, while others do or support message branching (forking). The gateway has had no mechanism to detect conversation threads, handle edits/branches, or safely prune stale session state.

Candidate 1 presents a bounded architectural contract and system blueprint introducing:
- **Zero-Friction Ingress Thread Identification:** A 3-tier identification engine unifying explicit headers (`x-conversation-id`, `x-session-id`, `x-thread-id`), client-scoped cryptographic Merkle DAG Prefix-Tree analysis, and branch-divergence detection.
- **Native CLI Session Bridging:** Declarative session-engine configuration enabling incremental message dispatch (`messages[N]` only) to `codex exec resume` and `claude --session-id / --resume`, backed by sticky account-sandbox routing and self-healing Fast-Hydration fallback.
- **Memory Retention & Lifecycle Engine:** Dual-tier sliding/hard TTLs, on-disk session cloning for message tree forks, LRU quota-guarded disk reclamation, and Win32 Job Object / POSIX process containment.

---

## 1. Outcome

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           WEB CHAT UI INGRESS PLANE                                             │
│  (Open WebUI, LibreChat, LobeChat, NextChat, Chatbox, Cursor / Continue, or Standard OpenAI API Clients)       │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Incoming Request: POST /v1/chat/completions { model, messages: [m0, m1, ..., mN], stream: true }              │
│  Optional Headers: [x-conversation-id, x-session-id, x-thread-id] or Body: [conversation_id]                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                         │
                                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     TIERED THREAD IDENTIFICATION ENGINE                                         │
│                                                                                                                 │
│   ┌───────────────────────────┐     ┌───────────────────────────────────────────────────────────────────────┐   │
│   │ Tier 1: Explicit Headers  │ ──► │ Found? Bind Thread ID directly (x-conversation-id / conversation_id) │   │
│   └─────────────┬─────────────┘     └───────────────────────────────────────────────────────────────────────┘   │
│                 │ (Absent)                                                                                      │
│                 ▼                                                                                               │
│   ┌───────────────────────────┐     ┌───────────────────────────────────────────────────────────────────────┐   │
│   │ Tier 2: Merkle DAG Prefix │ ──► │ Compute Client-Scoped Hash Chain: H_i = SHA256(H_{i-1} || role || txt) │   │
│   │ Hash Tree Analysis        │     │ Query longest prefix match in SQLite `conversation_nodes`             │   │
│   └─────────────┬─────────────┘     └───────────────────────────────────────────────────────────────────────┘   │
│                 │                                                                                               │
│                 ▼                                                                                               │
│   ┌───────────────────────────┐     ┌───────────────────────────────────────────────────────────────────────┐   │
│   │ Tier 3: Topology Resolver │ ──► │ • Exact Tail Match (N+1) ──► Linear Continuation (Send delta mN only) │   │
│   │ (Linear vs Fork vs Root)  │     │ • Divergence (k < N)    ──► Branch/Fork Detected (Clone or Hydrate)   │   │
│   │                           │     │ • No Prefix Match       ──► Root Conversation (Init new CLI Session)  │   │
│   └───────────────────────────┘     └───────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                         │
                                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 STICKY ROUTER & NATIVE CLI SESSION BRIDGE                                       │
│                                                                                                                 │
│   ┌─────────────────────────────────────────────────┐ ┌─────────────────────────────────────────────────────┐   │
│   │           STICKY SANDBOX AFFINITY               │ │             INCREMENTAL TRANSPORT DISPATCH          │   │
│   │ • Resolve Account pinned to Thread ID           │ │ • Turn 1 (Root): Pass initial prompt & init session │   │
│   │ • Account Sandbox: $DATA_DIR/sandboxes/{adp}/{acc}│ • Turn N (Resume): Send ONLY incremental delta mN   │   │
│   │ • Acquire Account Slot via Semaphore            │ │ • Tokens Saved: Up to 95% per request               │   │
│   └─────────────────────────────────────────────────┘ └─────────────────────────────────────────────────────┘   │
│                                              │                                                                  │
│                        ┌─────────────────────┴─────────────────────┐                                            │
│                        ▼                                           ▼                                            │
│        ┌───────────────────────────────┐           ┌───────────────────────────────┐                            │
│        │     ANTHROPIC CLAUDE CODE     │           │       OPENAI CODEX CLI        │                            │
│        ├───────────────────────────────┤           ├───────────────────────────────┤                            │
│        │ args: --session-id <uuid>     │           │ args: exec resume <uuid> -    │                            │
│        │ resume: --resume <uuid>       │           │ transport: stdin delta stream │                            │
│        │ storage: {acc}/.claude/       │           │ storage: {acc}/.codex/        │                            │
│        └───────────────────────────────┘           └───────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                         │
                                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                MEMORY RETENTION & LIFECYCLE MANAGEMENT ENGINE                                   │
│                                                                                                                 │
│   ┌───────────────────────────┐     ┌───────────────────────────┐     ┌─────────────────────────────────────┐   │
│   │   DUAL-TIER TTL POLICIES  │     │   BRANCH / FORK MANAGER   │     │      LRU DISK QUOTA & GC SWEEPER    │   │
│   │ • Sliding Idle TTL (60m)  │     │ • File-Based: Copy JSON   │     │ • Sweeper cron (60s tick)           │   │
│   │ • Hard Maximum TTL (24h)  │     │   state + rewrite UUID    │     │ • Max quota: 500MB / account        │   │
│   │ • SQLite WAL Persistence  │     │ • Fast-Hydration fallback │     │ • Safe atomic file & record prune   │   │
│   └───────────────────────────┘     └───────────────────────────┘     └─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Deliverables & System Capabilities

1. **Zero-Configuration Thread Identification from Any Web Chat UI**:
   - Accepts requests from any standard OpenAI client without requiring modifications or browser plugins.
   - Computes deterministic, client-scoped Merkle prefix chains over message payloads when explicit headers are absent, eliminating the risk of cross-user greeting collisions (e.g. two users opening a chat with "Hello").
   - Automatically detects linear continuations, conversation forks (when a user edits an earlier message or hits "Regenerate"), and brand-new conversation roots.

2. **Native CLI Session Bridging with Incremental Delta Dispatch**:
   - Bridges OpenAI completions directly into stateful CLI session runtimes:
     - **Claude Code:** Manages deterministic session UUIDs via `--session-id <uuid>` and `--resume <uuid>`.
     - **OpenAI Codex CLI:** Manages sessions via `codex exec resume <session_id> -`.
   - Dispatches **only the newest incremental message** ($m_N$) to the native CLI on resumed turns, cutting prompt payload size and Time-to-First-Token (TTFT) by up to 90%+.
   - Enforces **Sticky Sandbox Affinity**: routes follow-up turns to the exact account sandbox where the native CLI session files reside.
   - Built-in **Self-Healing Fast-Hydration Fallback**: if a native CLI reports a session as lost, corrupted, or expired, the gateway catches the error and immediately replays the conversation message history into a fresh session without returning a 500 error to the client.

3. **Production Session Lifecycle, Branching, and Quota Management**:
   - **Dual-Tier TTL Engine**: Sliding idle expiration (default: 60 minutes) combined with a hard ceiling lifespan (default: 24 hours).
   - **Branching / Forking Engine**: Supports non-linear chat trees. For file-based CLI session stores, it clones state files and updates internal UUIDs; for opaque stores, it executes divergence-point Fast-Hydration.
   - **Proactive Garbage Collection (GC)**: A background sweeper running every 60 seconds prunes expired sessions, terminates hanging processes via Win32 Job Objects / POSIX process groups, and enforces an LRU disk storage quota (e.g. 500MB per account).

---

## 2. Constraints

1. **Strict OpenAI Wire Protocol Ingress Compatibility**:
   - The `/v1/chat/completions` endpoint must remain 100% compliant with the official OpenAI API specification.
   - Standard unmodified tools (Open WebUI, LibreChat, LobeChat, Cursor, Continue, official OpenAI Node/Python SDKs) must operate out-of-the-box without requiring custom request payloads.

2. **Cross-User Anti-Collision Cryptography**:
   - Merkle root hashes and prefix chains must incorporate a client identity scope derived from `Authorization: Bearer <token>`, API key hash, or loopback/client IP.
   - Two distinct clients submitting identical message histories (e.g. `[{"role": "user", "content": "Hello"}]`) must resolve to distinct, strictly isolated conversation threads and CLI sessions.

3. **Sticky Account Sandbox Isolation**:
   - Because native CLIs maintain state on the local filesystem inside the account's sandbox directory (`$DATA_DIR/sandboxes/{adapter}/{account}/.claude` or `.codex`), all conversational turns for a thread must route strictly to that specific account.
   - A thread assigned to `claude-code-acc-01` must never be dispatched to `claude-code-acc-02` unless an explicit migration or state replication is executed.

4. **Thread-Level Concurrency Serialization (Per-Thread Mutex)**:
   - Modern Web Chat UIs occasionally fire rapid duplicate requests or streaming retries.
   - Access to an active conversation thread must be guarded by a per-thread semaphore/mutex to prevent simultaneous write access to the same on-disk native CLI session file, avoiding session corruption.

5. **Cross-Platform Operating System Agnosticism**:
   - File path manipulation, session cloning, process execution, and signals must function identically across Windows 11 (NTFS, Win32 Job Objects, `.cmd`/PowerShell) and Linux/macOS (ext4/APFS, POSIX process groups, `SIGTERM`/`SIGKILL`).

6. **Durable Persistence Across Gateway Restarts**:
   - Thread state, Merkle node trees, account affinity bindings, and TTL markers must be stored in SQLite with Write-Ahead Logging (WAL) enabled. Restarting the gateway daemon must not lose active session pointers or corrupt on-disk CLI state.

---

## 3. Non-goals

1. **Upstream Web Chat UI Modification**:
   - We will not patch, fork, or mandate proprietary client-side plugins for Open WebUI, LibreChat, or Continue. The gateway must perform identification and session management entirely on the server side.
2. **Reverse-Engineering Closed Proprietary Binary Formats**:
   - We do not disassemble or byte-patch proprietary CLI executable binaries. Session bridging relies strictly on documented CLI flags, supported environment variables, standard session directory layouts, and standard stdin/stdout streams.
3. **Cross-Host Distributed Multi-Node Clustering**:
   - The gateway manages sessions local to the single host server instance. We do not implement distributed network consensus (e.g. Raft) or shared network storage (NFS/Ceph) for CLI session files.
4. **Infinite History / Permanent Archival Storage**:
   - The gateway is an active execution bridge, not an enterprise compliance database. Stale sessions are intentionally purged in accordance with configured TTL and disk quota limits.

---

## 4. Acceptance Criteria (Concrete, Verifiable)

### AC-1: Headerless Conversation Identification via Merkle Prefix Tree
- **Given** an incoming `POST /v1/chat/completions` request lacking any `x-conversation-id` or `conversation_id` metadata.
- **When** Client A sends `messages: [{ role: "user", content: "Plan a 3-day trip to Tokyo" }]`:
  - **Then** the gateway calculates the Merkle prefix hash $H_0 = \text{SHA256}(\text{clientScope} \parallel \text{role} \parallel \text{content})$, records a new root thread record in SQLite `conversation_threads`, provisions a unique `cliSessionId`, and executes Turn 1.
- **When** Client B (different API token or IP) simultaneously sends the identical payload `[{ role: "user", content: "Plan a 3-day trip to Tokyo" }]`:
  - **Then** the gateway generates a distinct client-scope hash, resulting in a distinct thread ID and an isolated CLI session; neither client sees or interferes with the other's state.
- **When** Client A follows up with Turn 2 containing `[m0, { role: "assistant", content: "..." }, { role: "user", content: "What should I eat on day 1?" }]`:
  - **Then** the gateway computes the prefix hash chain, matches $H_0$ and $H_1$ to the existing thread in $\le 5\text{ms}$, identifies this as an exact linear continuation ($N+1$), and marks the thread active.

### AC-2: Explicit Header Passthrough & Precedence
- **Given** an incoming request containing header `x-conversation-id: webchat-sess-9941a` (or body field `conversation_id: webchat-sess-9941a`).
- **When** the gateway processes the request:
  - **Then** the explicit identifier takes immediate precedence over Merkle tree calculation.
  - **And** the gateway binds internal thread mapping directly to `webchat-sess-9941a`.
  - **And** the gateway updates the Merkle prefix tree index for that thread to support subsequent requests from clients that omit the header on subsequent turns.

### AC-3: Claude Code Session Resumption & Incremental Delta Transport
- **Given** an adapter configured for `claude-code` with native session support enabled.
- **When** Turn 1 of a new conversation arrives:
  - **Then** the gateway generates a UUIDv4 session ID (e.g. `d3b07384d113edec49eaa6238ad5ff00`).
  - **And** spawns `claude --session-id d3b07384d113edec49eaa6238ad5ff00 --print --model sonnet "<m0 content>"`.
- **When** Turn 2 arrives with messages `[m0, m1, m2]`:
  - **Then** the gateway recognizes the resumed session.
  - **And** spawns `claude --resume d3b07384d113edec49eaa6238ad5ff00 --print --model sonnet "<m2 content>"`.
  - **And** verifies that $m_0$ and $m_1$ are **not** present in the process invocation arguments or stdin, verifying incremental delta transport.

### AC-4: Codex CLI Session Resumption & Stdin Transport
- **Given** an adapter configured for `codex-cli` with native session support enabled.
- **When** Turn 1 executes, establishing native session `codex-sess-551`.
- **When** Turn 2 arrives for the same thread:
  - **Then** the supervisor invokes `codex exec resume codex-sess-551 -` (or equivalent configured template).
  - **And** streams only the delta message content ($m_2$) via stdin.
  - **And** the response streams back via SSE chunk format without repetition of Turn 1 context.

### AC-5: Conversation Branching / Forking on Message Edit
- **Given** an active 4-turn conversation thread ($T_1$) with node chain $H_0 \to H_1 \to H_2 \to H_3$ pinned to `acc-01`.
- **When** the user edits message 2 in the Web Chat UI and sends a new request with nodes $H_0 \to H_1 \to H_2^*$:
  - **Then** the gateway detects a branch divergence at depth 2 (longest prefix matches $H_1$, but $H_2^*$ differs from $H_2$).
  - **And** the gateway creates a new thread record ($T_2$) branching from node $H_1$.
  - **And** if the adapter supports filesystem session cloning (e.g. Claude JSON session files), the gateway duplicates the session file on disk to a new UUID; if file cloning is not supported, it invokes Fast-Hydration from root to $H_2^*$.
  - **And** the original thread $T_1$ remains intact and fully resumable.

### AC-6: Sticky Account Routing & Mutex Serialization
- **Given** an adapter with multiple accounts: `acc-01` (busy) and `acc-02` (idle).
- **Given** Thread `T_alpha` is pinned to `acc-01`.
- **When** Turn 3 of Thread `T_alpha` arrives:
  - **Then** the load balancer strictly routes to `acc-01` and does **not** route to `acc-02`.
  - **And** if `acc-01` has its concurrency slot occupied by an in-flight request, Turn 3 queues on the per-thread semaphore until the slot is released.
- **When** `acc-01` enters a 429 rate-limit cooldown:
  - **Then** the gateway responds with HTTP 429 and `Retry-After` header indicating the remaining cooldown seconds, preserving session affinity rather than corrupting state by sending to an un-hydrated account.

### AC-7: Session TTL Expiration & LRU Quota Garbage Collection
- **Given** an active session with idle TTL configured to 3,600 seconds (60 minutes).
- **When** no requests are received for that thread for 3,601 seconds:
  - **Then** the background GC worker (running every 60s) updates status to `EXPIRED`.
  - **And** deletes the on-disk session files from `$DATA_DIR/sandboxes/{adapter}/{account}/.claude/sessions/{id}.json`.
  - **And** deletes corresponding rows in SQLite `conversation_nodes` and `conversation_threads`.
- **When** total session disk usage for an account exceeds `max_storage_mb` (e.g. 500MB):
  - **Then** the GC worker evicts sessions in strict Least-Recently-Used (LRU) order until disk usage drops below 80% of the threshold.

### AC-8: Fast-Hydration Self-Healing Fallback
- **Given** an existing thread mapped to native session `sess-corrupt`.
- **When** the native CLI execution fails with exit code indicating session invalidity (e.g. `session not found`, `corrupt state`, or missing file):
  - **Then** the gateway intercepts the error before closing the HTTP response.
  - **And** flags the old session as corrupted in SQLite.
  - **And** provisions a fresh native session ID.
  - **And** executes Fast-Hydration by flattening messages $m_0 \dots m_N$ into the fresh session.
  - **And** streams the valid completion output to the client transparently without returning an HTTP 500 error.

---

## 5. Compared Approaches

| Evaluation Dimension | Approach 1: Stateless Blind Replay (Current Baseline) | Approach 2: Header-Only Naive Session Mapping | Approach 3: Merkle Prefix-Tree Session Bridging with Sticky Affinity & Fast-Hydration (Recommended) |
| :--- | :--- | :--- | :--- |
| **Ingress Thread Identification** | **None**: Ignores conversation continuity. Replays flattened history on every turn. | **Brittle**: Strictly relies on client sending `x-conversation-id` or `conversation_id`. Fails on generic OpenAI clients. | **Comprehensive**: 3-tier hierarchy (Explicit Header $\to$ Client-Salted Merkle Tree $\to$ Divergence Analysis). Supports 100% of clients. |
| **Token Efficiency & Latency** | **Worst**: $O(N^2)$ quadratic token waste. 50-turn chat re-sends early turns 50 times. High latency & context exhaustion. | **Good (When headers present)**: Passes session ID and sends deltas. Collapses to 100% token waste if headers missing. | **Optimal**: Sends only incremental delta ($m_N$) on every valid resumed turn. Reduces prompt tokens by up to 90%+. |
| **Branching & Edit Handling** | **Passive**: Replays whatever array is passed. Inefficient, but doesn't produce state file conflicts. | **Dangerous / Corrupting**: If user edits turn 2, the client reuses the same conversation ID; native CLI state is corrupted with contradictory prompts. | **Safe & Resilient**: Detects divergence depth $k < N$. Clones on-disk session files or triggers branch Fast-Hydration without corrupting parent thread. |
| **Native CLI Capabilities** | **Completely Lost**: Native CLI memory, agent tool state, and file cache are discarded on every process exit. | **Partial**: Supported only for linear chats where upstream client provides headers. | **Full Native Integration**: Leverages Claude `--session-id / --resume` and Codex `exec resume`. Preserves tool call history and scratchpads. |
| **Multi-Account Sandbox Routing** | Random or round-robin on every turn. No sandbox affinity. | In-memory map; lost on gateway restart. Breaks if account is busy. | **Durable Sticky Affinity**: SQLite-backed account binding with thread mutex and cooldown tracking. |
| **Lifecycle & Storage Management** | No gateway storage needed, but native CLIs leak orphaned temp files in sandbox. | No automated TTL or disk quota. CLI session directories grow unbounded until disk fills. | **Automated Dual-Tier TTL + GC**: 60m sliding / 24h hard TTL, 60s sweeper cron, LRU quota guard (500MB cap). |
| **Primary Assumption** | Upstream clients and users tolerate high token costs and latency; CLI tools are purely stateless functions. | All upstream clients will be configured to send explicit conversation ID headers, and users never edit prior messages. | Upstream clients preserve previous message turn history in sequential order, allowing deterministic Merkle prefix resolution. |
| **First Failure Condition** | Long conversations hit model context window limit or Windows 8,191-char command line buffer limit (`E2BIG`). | An unmodified Web Chat UI (e.g. NextChat) omits headers, causing all requests to run statelessly or collide into a single unmapped session. | An upstream client dynamically mutates or rewrites historical assistant messages midway through a chat, triggering branch hydration. |

---

## 6. Recommended Direction & Rationale

Candidate 1 recommends **Approach 3: Merkle Prefix-Tree Session Bridging with Sticky Affinity, Declarative CLI Adapters, and Branching Hydration**.

### Core Architecture & Component Flow

```
                      ┌────────────────────────────────────────────────────────┐
                      │              FASTIFY INGRESS CONTROLLER                │
                      │               POST /v1/chat/completions                │
                      └───────────────────────────┬────────────────────────────┘
                                                  │
                                                  ▼
                      ┌────────────────────────────────────────────────────────┐
                      │            THREAD RESOLVER & MERKLE ENGINE             │
                      │    (Explicit Header -> Merkle Tree -> Branch Check)    │
                      └───────────────────────────┬────────────────────────────┘
                                                  │
                                                  ▼
                      ┌────────────────────────────────────────────────────────┐
                      │             SESSION AFFINITY LOAD BALANCER             │
                      │   (Resolve Sticky Account Sandbox & Acquire Slot)      │
                      └───────────────────────────┬────────────────────────────┘
                                                  │
                                                  ▼
                      ┌────────────────────────────────────────────────────────┐
                      │             PROCESS SUPERVISOR & BRIDGE                │
                      │   (Incremental Delta Transport: Codex / Claude Code)   │
                      └───────────────────────────┬────────────────────────────┘
                                                  │
                                                  ▼
                      ┌────────────────────────────────────────────────────────┐
                      │            LIFECYCLE GC & QUOTA SWEEPER                │
                      │     (Dual TTL, LRU Disk Quota, Job Object Purge)       │
                      └────────────────────────────────────────────────────────┘
```

---

### 6.1 Subsystem 1: Conversation Thread Identification & Merkle Prefix Tree

To support any client without protocol modification, thread identification uses a deterministic 3-tier resolution pipeline:

```
Step 1: Check Explicit Ingress Identifiers
        Headers: x-conversation-id, x-session-id, x-thread-id
        Body:    conversation_id, session_id
        └── If present ──► Use as explicit Thread ID.

Step 2: Client-Scoped Merkle Prefix-Tree Hashing (if headers absent)
        ClientScope = SHA256(AuthorizationToken || ClientIP)
        For i = 0 to N:
          NodeHash[i] = SHA256(ParentHash || Role[i] || Content[i])
        
Step 3: Topology Match in SQLite Database
        Query longest matching prefix chain [NodeHash_0 ... NodeHash_k]
        ├── Match length == N + 1 ──► Exact Tail Continuation (Send delta mN only)
        ├── Match length == k < N ──► Branch / Fork at depth k (Clone state / Hydrate)
        └── Match length == 0     ──► Root Conversation (Initialize fresh session)
```

#### Cryptographic Specification
- **Client Scope Salt:**
  $$\text{ClientScope} = \text{SHA256}(\text{BearerToken} \parallel \text{ClientIP})$$
- **Root Node ($i = 0$):**
  $$H_0 = \text{SHA256}(\text{ClientScope} \parallel \text{messages}[0].\text{role} \parallel \text{messages}[0].\text{content})$$
- **Subsequent Nodes ($i > 0$):**
  $$H_i = \text{SHA256}(H_{i-1} \parallel \text{messages}[i].\text{role} \parallel \text{messages}[i].\text{content})$$

This formulation ensures:
1. Two different users sending "Hello" produce distinct root hashes ($H_{0,A} \ne H_{0,B}$).
2. An identical user continuing the conversation produces an exact prefix match up to $H_{N-1}$.
3. If a user edits message 2 in a 5-turn chat, $H_0$ and $H_1$ match, but $H_2^*$ diverges, precisely pinpointing the branch point.

#### SQLite Database Schema Migration (`apps/gateway/src/db/schema.ts`)
```ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { adapters, accounts } from "./schema.js";

export const conversationThreads = sqliteTable("conversation_threads", {
  id: text("id").primaryKey(), // UUIDv4 or explicit x-conversation-id
  clientScopeHash: text("client_scope_hash").notNull(),
  adapterId: text("adapter_id").notNull().references(() => adapters.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  cliSessionId: text("cli_session_id").notNull(), // Native CLI session ID
  headNodeHash: text("head_node_hash").notNull(),
  turnCount: integer("turn_count").notNull().default(1),
  status: text("status", { enum: ["ACTIVE", "IDLE", "EXPIRED", "CORRUPTED"] }).notNull().default("ACTIVE"),
  lastActiveAt: integer("last_active_at").notNull(),
  expiresAt: integer("expires_at").notNull(), // Sliding TTL deadline
  hardExpiresAt: integer("hard_expires_at").notNull(), // Max lifetime ceiling
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  clientScopeIdx: index("idx_threads_client_scope").on(table.clientScopeHash),
  accountIdx: index("idx_threads_account").on(table.accountId),
  expiresIdx: index("idx_threads_expires").on(table.expiresAt),
}));

export const conversationNodes = sqliteTable("conversation_nodes", {
  nodeHash: text("node_hash").primaryKey(), // SHA-256 Merkle hash
  parentNodeHash: text("parent_node_hash"), // Nullable for root
  threadId: text("thread_id").notNull().references(() => conversationThreads.id, { onDelete: "cascade" }),
  depth: integer("depth").notNull(), // 0 for root, 1, 2, ...
  role: text("role").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  threadIdx: index("idx_nodes_thread").on(table.threadId),
  parentIdx: index("idx_nodes_parent").on(table.parentNodeHash),
}));
```

#### Merkle Tree Resolver Implementation (`apps/gateway/src/session/merkle-resolver.ts`)
```ts
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { conversationThreads, conversationNodes } from "../db/schema.js";
import { eq, inArray, and } from "drizzle-orm";

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ThreadResolution {
  threadId: string;
  cliSessionId: string;
  accountId?: string;
  adapterId?: string;
  resolutionType: "ROOT_NEW" | "LINEAR_CONTINUATION" | "BRANCH_FORK";
  divergenceDepth?: number;
  incrementalMessages: ChatMessage[];
  nodeChain: string[];
}

export class MerkleResolver {
  public static computeClientScope(authHeader?: string, clientIp: string = "127.0.0.1"): string {
    const raw = `${authHeader || "anonymous"}:${clientIp}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  public static computeNodeChain(messages: ChatMessage[], clientScope: string): string[] {
    const chain: string[] = [];
    let parentHash = clientScope;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const h = crypto.createHash("sha256")
        .update(parentHash)
        .update(":")
        .update(msg.role)
        .update(":")
        .update(msg.content)
        .digest("hex");
      chain.push(h);
      parentHash = h;
    }
    return chain;
  }

  public async resolve(
    messages: ChatMessage[],
    clientScope: string,
    explicitThreadId?: string
  ): Promise<ThreadResolution> {
    if (messages.length === 0) {
      throw new Error("Cannot resolve thread for empty messages array");
    }

    // 1. Explicit Header Fast-Path
    if (explicitThreadId) {
      const existing = await db.query.conversationThreads.findFirst({
        where: eq(conversationThreads.id, explicitThreadId),
      });
      if (existing && existing.status !== "EXPIRED") {
        const chain = MerkleResolver.computeNodeChain(messages, clientScope);
        return {
          threadId: existing.id,
          cliSessionId: existing.cliSessionId,
          accountId: existing.accountId,
          adapterId: existing.adapterId,
          resolutionType: "LINEAR_CONTINUATION",
          incrementalMessages: [messages[messages.length - 1]],
          nodeChain: chain,
        };
      }
    }

    // 2. Merkle Prefix Tree Analysis
    const chain = MerkleResolver.computeNodeChain(messages, clientScope);
    const existingNodes = await db.query.conversationNodes.findMany({
      where: inArray(conversationNodes.nodeHash, chain),
    });

    const nodeMap = new Map(existingNodes.map(n => [n.nodeHash, n]));

    // Find longest contiguous prefix match
    let matchDepth = -1;
    let matchedThreadId: string | null = null;

    for (let i = 0; i < chain.length; i++) {
      const node = nodeMap.get(chain[i]);
      if (node && (matchedThreadId === null || node.threadId === matchedThreadId)) {
        matchDepth = i;
        matchedThreadId = node.threadId;
      } else {
        break;
      }
    }

    // Case A: Fresh Root Conversation
    if (matchDepth === -1 || !matchedThreadId) {
      const newThreadId = explicitThreadId || `th_${crypto.randomUUID()}`;
      const newCliSessionId = crypto.randomUUID();
      return {
        threadId: newThreadId,
        cliSessionId: newCliSessionId,
        resolutionType: "ROOT_NEW",
        incrementalMessages: messages,
        nodeChain: chain,
      };
    }

    const thread = await db.query.conversationThreads.findFirst({
      where: eq(conversationThreads.id, matchedThreadId),
    });

    if (!thread || thread.status === "EXPIRED") {
      return {
        threadId: `th_${crypto.randomUUID()}`,
        cliSessionId: crypto.randomUUID(),
        resolutionType: "ROOT_NEW",
        incrementalMessages: messages,
        nodeChain: chain,
      };
    }

    // Case B: Linear Continuation
    if (matchDepth === chain.length - 2 && chain.length >= 2) {
      return {
        threadId: thread.id,
        cliSessionId: thread.cliSessionId,
        accountId: thread.accountId,
        adapterId: thread.adapterId,
        resolutionType: "LINEAR_CONTINUATION",
        incrementalMessages: [messages[messages.length - 1]],
        nodeChain: chain,
      };
    }

    // Case C: Branch / Fork
    const forkedThreadId = `th_fork_${crypto.randomUUID()}`;
    const forkedCliSessionId = crypto.randomUUID();

    return {
      threadId: forkedThreadId,
      cliSessionId: forkedCliSessionId,
      accountId: thread.accountId,
      adapterId: thread.adapterId,
      resolutionType: "BRANCH_FORK",
      divergenceDepth: matchDepth,
      incrementalMessages: messages.slice(matchDepth + 1),
      nodeChain: chain,
    };
  }
}
```

---

### 6.2 Subsystem 2: Declarative CLI Session Bridging (Codex & Claude)

To bridge to native CLI session engines without hardcoding CLI-specific logic inside the core router, the adapter YAML schema is extended with a declarative `session_engine` specification.

#### Extended Adapter Schema (`apps/gateway/src/adapters/schema.ts`)
```ts
export const SessionEngineSchema = z.object({
  type: z.enum(["native", "stateless_replay"]).default("stateless_replay"),
  session_id_style: z.enum(["uuid_v4", "alphanumeric", "integer"]).default("uuid_v4"),
  root_args_template: z.array(z.string()).describe("Args used when starting a new session"),
  resume_args_template: z.array(z.string()).describe("Args used when resuming existing session"),
  session_id_placeholder: z.string().default("{session_id}"),
  prompt_transport_resume: z.enum(["argv", "stdin", "temp_file"]).default("stdin"),
  supports_file_forking: z.boolean().default(false),
  session_file_pattern: z.string().optional().describe("e.g. '{account_dir}/.claude/sessions/{session_id}.json'"),
  session_invalid_patterns: z.array(z.string()).default([
    "session not found",
    "invalid session",
    "session expired",
    "failed to resume",
  ]),
});
```

#### Declarative Blueprint: Claude Code (`adapters/claude-code.yaml`)
```yaml
id: "claude-code"
name: "Anthropic Claude Code CLI"
version: "1.1.0"
executable: "claude"
execution_mode: "pipe"

session_engine:
  type: "native"
  session_id_style: "uuid_v4"
  root_args_template:
    - "--session-id"
    - "{session_id}"
    - "--print"
    - "--dangerously-skip-permissions"
    - "--model"
    - "{model}"
    - "{prompt}"
  resume_args_template:
    - "--resume"
    - "{session_id}"
    - "--print"
    - "--dangerously-skip-permissions"
    - "--model"
    - "{model}"
    - "{prompt}"
  prompt_transport_resume: "argv"
  supports_file_forking: true
  session_file_pattern: "{account_dir}/.claude/sessions/{session_id}.json"
  session_invalid_patterns:
    - "No session found with ID"
    - "Session file corrupted"
    - "Cannot resume session"
```

#### Declarative Blueprint: OpenAI Codex CLI (`adapters/codex-cli.yaml`)
```yaml
id: "codex-cli"
name: "OpenAI Codex CLI"
version: "1.1.0"
executable: "codex"
execution_mode: "pipe"

session_engine:
  type: "native"
  session_id_style: "uuid_v4"
  root_args_template:
    - "exec"
    - "--model"
    - "{model}"
    - "--session-id"
    - "{session_id}"
    - "--skip-git-repo-check"
    - "--color"
    - "never"
    - "-"
  resume_args_template:
    - "exec"
    - "resume"
    - "{session_id}"
    - "--color"
    - "never"
    - "-"
  prompt_transport_resume: "stdin"
  supports_file_forking: false
  session_invalid_patterns:
    - "unknown session"
    - "session has ended"
    - "could not find session"
```

#### Incremental Supervisor Execution (`apps/gateway/src/supervisor/process-manager.ts`)
When `executeStreaming` is called, the supervisor evaluates whether this is a `ROOT_NEW` or `LINEAR_CONTINUATION` turn:
1. **On `ROOT_NEW`:** Substitutes `{session_id}` into `root_args_template`. Passes the initial user prompt.
2. **On `LINEAR_CONTINUATION`:** Substitutes `{session_id}` into `resume_args_template`. Dispatches **only the newest user message** ($m_N$).
3. **Prompt Transport:** For stdin transport (Codex), pipes $m_N$ into `child.stdin`. For argv transport (Claude), injects $m_N$ into the command arguments or temp file.

---

### 6.3 Subsystem 3: Session Affinity Router & Sticky Load Balancing

Native CLI state is physically stored inside the account's sandbox directory:
- Claude: `$DATA_DIR/sandboxes/{adapter}/{account}/.claude/sessions/{uuid}.json`
- Codex: `$DATA_DIR/sandboxes/{adapter}/{account}/.codex/sessions/{uuid}.db`

Therefore, a conversation thread is **affine to the account** that spawned it.

```
Incoming Request (Thread ID: th_4892)
                 │
                 ▼
     Query SQLite `conversation_threads`
                 │
        ┌────────┴────────┐
        ▼                 ▼
   Thread Found?     Thread Not Found? (Root)
        │                 │
        │                 ▼
        │        Standard Load Balancer
        │        Selects healthy account with lowest active slots
        │                 │
        ▼                 ▼
   Target Account:    Bind Thread ──► Account ID in SQLite
   `claude-acc-01`
        │
        ▼
   Check Account Status:
   ├── In Cooldown (429)? ──► Return HTTP 429 + Retry-After (Preserve affinity)
   ├── Slot Busy?         ──► Queue on Per-Thread Mutex (Max wait: 60s)
   └── Ready?             ──► Acquire Slot ──► Execute CLI Turn
```

#### Integration in `LoadBalancer` (`apps/gateway/src/router/load-balancer.ts`)
```ts
public async resolveTargetWithSession(
  requestedModel: string,
  resolution: ThreadResolution
): Promise<ResolvedTarget> {
  // If continuation or fork with existing account affinity:
  if (resolution.accountId && resolution.adapterId) {
    const account = await globalAccountPool.getAccount(resolution.accountId);
    const adapter = globalAdapterRegistry.getAdapter(resolution.adapterId);

    if (account && adapter) {
      // Affinity check: Ensure account is not in 429 cooldown
      const now = Math.floor(Date.now() / 1000);
      if (account.cooldownUntil && account.cooldownUntil > now) {
        const retryAfter = account.cooldownUntil - now;
        throw new Error(`429: Pinned session account is on cooldown. Resets in ${retryAfter}s`);
      }

      return {
        adapter,
        account: {
          id: account.id,
          sandboxDir: account.sandboxDir,
          customEnv: account.customEnv,
        },
        actualModelId: requestedModel.includes("/") ? requestedModel.split("/")[1] : requestedModel,
        debugProvider: adapter.id,
        debugModelTier: "sticky-session",
      };
    }
  }

  // Otherwise, fall back to standard load-balancer distribution for new roots
  return this.resolveTarget(requestedModel);
}
```

---

### 6.4 Subsystem 4: Session Lifecycle, Branching, and Quota Management

#### 1. Dual-Tier TTL Policy
- **Sliding Idle TTL:** Default 3,600 seconds (1 hour). Every incoming message resets `expiresAt = now + 3600`.
- **Hard Maximum Ceiling:** Default 86,400 seconds (24 hours). Under no circumstance can a session exceed `hardExpiresAt`, preventing indefinitely lingering memory leaks.

#### 2. Branching & Forking Logic
When `resolutionType === "BRANCH_FORK"`:
- **File-Based Forking (`supports_file_forking: true`):**
  Claude stores session JSON at `{accountDir}/.claude/sessions/{parentCliSessionId}.json`.
  1. The gateway makes an atomic file copy to `{accountDir}/.claude/sessions/{forkedCliSessionId}.json`.
  2. Parses the cloned JSON and updates its internal `"sessionId"` header field to `forkedCliSessionId`.
  3. Executes incremental resumption from the divergence point.
- **Fast-Hydration Forking (`supports_file_forking: false`):**
  For CLIs using SQLite or opaque internal storage (Codex), the gateway creates a fresh CLI session ID and dispatches all messages from root up to the branch point in a single synthetic initialization turn.

#### 3. Proactive Garbage Collection Worker (`apps/gateway/src/session/session-gc.ts`)
```ts
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../db/index.js";
import { conversationThreads, conversationNodes, accounts } from "../db/schema.js";
import { lte, or, eq } from "drizzle-orm";
import { globalAdapterRegistry } from "../adapters/registry.js";

export class SessionGarbageCollector {
  private timer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  public start(intervalMs: number = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweep(), intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async sweep(): Promise<void> {
    if (this.isSweeping) return;
    this.isSweeping = true;

    try {
      const now = Math.floor(Date.now() / 1000);

      // 1. Query Expired Threads
      const expiredThreads = await db.query.conversationThreads.findMany({
        where: or(
          lte(conversationThreads.expiresAt, now),
          lte(conversationThreads.hardExpiresAt, now)
        ),
      });

      for (const thread of expiredThreads) {
        await this.purgeThread(thread);
      }

      // 2. Enforce Account Disk Quotas (e.g. 500MB per account)
      await this.enforceDiskQuotas(500 * 1024 * 1024);
    } catch (err) {
      console.error("[SessionGC] Sweep error:", err);
    } finally {
      this.isSweeping = false;
    }
  }

  private async purgeThread(thread: typeof conversationThreads.$inferSelect): Promise<void> {
    const adapter = globalAdapterRegistry.getAdapter(thread.adapterId);
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, thread.accountId),
    });

    // Remove on-disk session files if file pattern declared
    if (adapter?.session_engine?.session_file_pattern && account) {
      const sessionPath = adapter.session_engine.session_file_pattern
        .replace("{account_dir}", account.sandboxDir)
        .replace("{session_id}", thread.cliSessionId);

      try {
        await fs.unlink(sessionPath);
      } catch {
        // File may already be cleaned up
      }
    }

    // Cascade delete SQLite records
    await db.delete(conversationNodes).where(eq(conversationNodes.threadId, thread.id));
    await db.delete(conversationThreads).where(eq(conversationThreads.id, thread.id));
  }

  private async enforceDiskQuotas(maxBytesPerAccount: number): Promise<void> {
    const allAccounts = await db.query.accounts.findMany();
    for (const acc of allAccounts) {
      const sessionsDir = path.join(acc.sandboxDir, ".claude", "sessions");
      try {
        const files = await fs.readdir(sessionsDir, { withFileTypes: true });
        let totalBytes = 0;
        const fileStats: Array<{ file: string; size: number; mtime: number }> = [];

        for (const f of files) {
          if (!f.isFile()) continue;
          const fullPath = path.join(sessionsDir, f.name);
          const stat = await fs.stat(fullPath);
          totalBytes += stat.size;
          fileStats.push({ file: fullPath, size: stat.size, mtime: stat.mtimeMs });
        }

        if (totalBytes > maxBytesPerAccount) {
          // LRU Eviction: Sort oldest modified first
          fileStats.sort((a, b) => a.mtime - b.mtime);
          while (totalBytes > maxBytesPerAccount * 0.8 && fileStats.length > 0) {
            const victim = fileStats.shift()!;
            await fs.unlink(victim.file);
            totalBytes -= victim.size;
          }
        }
      } catch {
        // Directory does not exist or inaccessible
      }
    }
  }
}

export const globalSessionGC = new SessionGarbageCollector();
```

---

### 6.5 Failure Recovery Matrix & Self-Healing Guarantees

| Failure Mode | Impact | Automated Gateway Recovery Action |
| :--- | :--- | :--- |
| **CLI Process Crashes or Returns "Session Not Found"** | Standard completion would fail with HTTP 500. | Supervisor checks `session_invalid_patterns`. Matches error signature $\to$ marks thread `CORRUPTED` in SQLite $\to$ generates new CLI Session ID $\to$ replays message tree via **Fast-Hydration** $\to$ completes streaming response without client error. |
| **User Submits Rapid Duplicate Prompts on Same Thread** | Simultaneous writes corrupt on-disk CLI JSON/DB session file. | **Per-Thread Mutex**: Subsequent request queues on thread lock with a 30s timeout. Second request executes incrementally after first finishes. |
| **Pinned Account Reaches 429 Rate Limit Cooldown** | Incremental session cannot proceed on alternate account without state. | Gateway intercepts target resolution $\to$ returns HTTP 429 with accurate `Retry-After: <seconds>` matching account cooldown $\to$ preserves session affinity without state corruption. |
| **User Edits Turn 1 in a 30-Turn Conversation** | Prefix diverges at depth 1. | **Branching Engine**: Creates child thread record $\to$ invokes file-clone or Fast-Hydration to depth 1 $\to$ dispatches new branch turn. Original 30-turn thread remains intact. |
| **Gateway Unexpectedly Restarts During Active Generation** | In-flight process is orphaned; thread left in active state. | SQLite WAL recovers clean state. On boot, Process Supervisor invokes Win32 Job Object / POSIX process cleanup $\to$ resets active slots to 0 $\to$ subsequent turn safely resumes CLI session from disk. |
| **Account Sandbox Disk Space Exhaustion** | Native CLI crashes with `ENOSPC` when writing session log. | GC Sweeper's LRU disk quota guard proactively prevents this by maintaining storage below 80% of configured cap (`max_storage_mb`). |

---

## Conclusion & Architectural Recommendation Summary

Candidate 1 recommends adopting **Approach 3: Merkle Prefix-Tree Session Bridging with Sticky Affinity, Declarative CLI Adapters, and Branching Hydration**. 

This bounded contract satisfies all operational requirements:
1. **Zero Client Configuration:** Works universally with unmodified OpenAI clients via client-salted Merkle DAG prefix analysis, with explicit header override support.
2. **True Native CLI Statefulness:** Maximizes the power of Anthropic Claude Code and OpenAI Codex CLI, slashing input token consumption and latency by up to 90%+ through incremental message delivery.
3. **Enterprise Lifecycle Safety:** Features self-healing Fast-Hydration fallback, safe on-disk session forking, dual-tier TTL enforcement, and automated LRU disk reclamation.
