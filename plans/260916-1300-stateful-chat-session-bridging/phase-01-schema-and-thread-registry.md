---
phase: 1
title: "Schema & Thread Registry"
status: in-progress
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Schema & Thread Registry

## Goal
Add the `conversation_threads` table to Drizzle ORM schema and `migrate.ts` to persist conversation sessions, their cryptographic Merkle root/leaf hashes, bound accounts, and native CLI session identifiers.

---

## Detailed Technical Context & Requirements

1. Table `conversation_threads`:
   - `id`: `text("id").primaryKey()` (Unique thread ID: client-specified or `th_{clientScope}_{rootHash}`)
   - `clientScope`: `text("client_scope").notNull()` (SHA256 of Bearer Token + Client IP)
   - `rootHash`: `text("root_hash").notNull()` (Hash of the initial message turn)
   - `leafHash`: `text("leaf_hash").notNull()` (Hash of the latest message turn)
   - `adapterId`: `text("adapter_id").notNull()` (e.g. `claude-code`, `codex-cli`)
   - `accountId`: `text("account_id").notNull()` (e.g. `claude`, `codex`)
   - `cliSessionId`: `text("cli_session_id")` (Native session ID: Claude UUID or Codex session ID)
   - `totalTurns`: `integer("total_turns").notNull().default(1)`
   - `lastActiveAt`: `integer("last_active_at").notNull()`
   - `expiresAt`: `integer("expires_at").notNull()`
   - `status`: `text("status", { enum: ["ACTIVE", "EXPIRED", "CORRUPTED"] }).notNull().default("ACTIVE")`
   - `createdAt`: `integer("created_at").default(sql`(strftime('%s', 'now'))`)`

2. Indexes:
   - `idx_threads_root_hash ON conversation_threads(client_scope, root_hash)`
   - `idx_threads_expires_at ON conversation_threads(expires_at)`

---

## Tasks Breakdown

- **Task 1.1:** Add `conversationThreads` table definition to `apps/gateway/src/db/schema.ts`.
- **Task 1.2:** Add additive migration DDL to `apps/gateway/src/db/migrate.ts`.
- **Task 1.3:** Verify database migration applies cleanly without errors.

---

## Verification Commands
```bash
pnpm --filter @cli-to-api/gateway test tests/unit/sqlite-lifecycle.test.ts
```
