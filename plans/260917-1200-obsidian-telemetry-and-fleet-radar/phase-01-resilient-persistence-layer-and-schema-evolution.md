---
phase: 1
title: "Resilient Persistence Layer & Schema Evolution"
status: planned
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Resilient Persistence Layer & Schema Evolution

## 1. Requirements

### 1.1. Functional Requirements
1. **Schema Evolution for Request Metrics:**
   - Extend the existing `request_metrics` SQLite table with three additional audit columns:
     - `adapter_id`: Text identifier of the CLI engine (e.g. `codex-cli`, `gemini-cli`, `claude-cli`).
     - `reasoning_tokens`: Non-negative integer tracking Deep Thinking / CoT token volume. Default: `0`.
     - `total_tokens`: Non-negative integer representing the sum of prompt, reasoning, and completion tokens. Default: `0`.
2. **Safe Additive Migration:**
   - Migration must execute non-destructively on startup via `runMigrations()` in `apps/gateway/src/db/migrate.ts`.
   - Table column existence must be probed via `PRAGMA table_info(request_metrics)` before invoking `ALTER TABLE` statements to ensure idempotency.
3. **Composite Indexing for High-Performance Queries:**
   - Create indexes on `created_at DESC`, `adapter_id`, `model_executed`, `request_id`, and a composite index on `(account_id, created_at DESC)` to enable sub-millisecond filtering across thousands of audit rows.
4. **Decoupled In-Memory Micro-Batch Queue (`TelemetryPersistQueue`):**
   - The completion of a request must **never** perform a synchronous or direct asynchronous write to SQLite on the hot path.
   - Finished request records must be enqueued into an in-memory batch buffer.
   - Batch writes must trigger when either condition is met:
     - **Debounce Timer:** $2,000\text{ms}$ elapsed since the oldest unwritten record.
     - **Batch Threshold:** Queue size reaches $50$ records.
   - Execution of batch writes must use a single SQLite transaction (`BEGIN ... COMMIT`) within WAL mode.
   - Provide a `flushSync()` / `shutdown()` hook to guarantee zero data loss during graceful server restarts.
5. **Audit Query Data Access Layer (`TelemetryStore`):**
   - Provide typed query functions for paginated historical ledger retrieval, date/search filtering, KPI summary aggregation, and provider/model consumption breakdown.

### 1.2. Non-Functional & Reliability Requirements
- **WAL Concurrency Safety:** Zero occurrences of `SQLITE_BUSY` or `SQLITE_LOCKED` under 50 concurrent request completions.
- **Hot-Path Overhead:** Metric submission to the queue must execute in $< 0.05\text{ms}$ ($O(1)$ push).
- **Bounded Memory Safeguard:** The queue buffer must be capped at $5,000$ items. If the database locks persistently, overflow records must drop oldest gracefully with an error log rather than crashing Node.js with `ERR_WORKER_OUT_OF_MEMORY`.

```gherkin
Feature: Resilient Persistence & Schema Migration
  Scenario: Additive migration on existing database
    Given An existing SQLite database with legacy request_metrics table
    When runMigrations() is invoked
    Then adapter_id, reasoning_tokens, and total_tokens columns exist
    And SQLite indexes are created without table lock errors
    And Running runMigrations() a second time succeeds idempotently

  Scenario: High-throughput batch write persistence
    Given 50 completed requests finish within a 500ms window
    When Each request enqueues its metric record into TelemetryPersistQueue
    Then All 50 records are written in a single SQLite transaction
    And No SQLITE_BUSY errors are thrown
    And Querying TelemetryStore returns all 50 persisted records
```

---

## 2. Architecture

### 2.1. Batch Write Pipeline & Concurrency Isolation

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ FASTIFY REQUEST LIFECYCLE (Hot Path)                                        │
 │                                                                             │
 │  Request Completion ──► enqueueMetricRecord(record)                         │
 │                                  │ (O(1) memory push, <0.05ms)              │
 └──────────────────────────────────┼──────────────────────────────────────────┘
                                    ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ TELEMETRY PERSIST QUEUE (apps/gateway/src/telemetry/persist-queue.ts)       │
 │                                                                             │
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ In-Memory Array: Array<InsertRequestMetric> (Bounded: max 5000 items)  │  │
 │  └───────────────────────────────────────────────────────────────────────┘  │
 │        │                                                      │             │
 │        ▼ (Condition 1: Size >= 50)                            ▼ (Condition 2│
 │   Immediate Flush                                      Debounce 2000ms Flush│
 │        │                                                      │             │
 │        └─────────────────────────┬────────────────────────────┘             │
 │                                  ▼                                          │
 │                    Single SQLite Transaction:                               │
 │                    BEGIN TRANSACTION                                        │
 │                      INSERT INTO request_metrics VALUES (...) x N           │
 │                    COMMIT                                                   │
 └──────────────────────────────────┬──────────────────────────────────────────┘
                                    ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ SQLITE WAL DATABASE (apps/gateway/src/db/index.ts)                          │
 │                                                                             │
 │  - PRAGMA journal_mode = WAL;                                               │
 │  - PRAGMA busy_timeout = 5000;                                              │
 │  - PRAGMA synchronous = NORMAL;                                             │
 │                                                                             │
 │  TABLE: request_metrics                                                     │
 │    ├── id (TEXT PK)                                                         │
 │    ├── request_id (TEXT, indexed)                                           │
 │    ├── adapter_id (TEXT, indexed)            ◄── [NEW COLUMN]               │
 │    ├── account_id (TEXT)                                                    │
 │    ├── model_requested (TEXT)                                               │
 │    ├── model_executed (TEXT, indexed)                                       │
 │    ├── prompt_tokens (INTEGER)                                              │
 │    ├── reasoning_tokens (INTEGER)            ◄── [NEW COLUMN]               │
 │    ├── completion_tokens (INTEGER)                                          │
 │    ├── total_tokens (INTEGER)                ◄── [NEW COLUMN]               │
 │    ├── ttft_ms (INTEGER)                                                    │
 │    ├── total_duration_ms (INTEGER)                                          │
 │    ├── status_code (INTEGER)                                                │
 │    ├── status (TEXT)                                                        │
 │    ├── error_message (TEXT)                                                 │
 │    └── created_at (INTEGER, indexed DESC)                                   │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Related Code Files

| File Path | Status | Purpose |
|---|---|---|
| `apps/gateway/src/db/schema.ts` | **MODIFIED** | Add `adapterId`, `reasoningTokens`, `totalTokens` to `requestMetrics` schema; declare composite indexes. |
| `apps/gateway/src/db/migrate.ts` | **MODIFIED** | Implement non-destructive additive column checks and index generation in SQLite WAL. |
| `apps/gateway/src/telemetry/persist-queue.ts` | **CREATED** | Debounced micro-batch persistence queue with lock resilience and graceful flush. |
| `apps/gateway/src/telemetry/telemetry-store.ts` | **CREATED** | Data access repository for paginated historical ledger, time-window aggregations, and breakdowns. |
| `tests/unit/telemetry-persist-queue.test.ts` | **CREATED** | Unit tests for queue thresholding, debounce timers, transaction atomicity, and flush-on-shutdown. |

---

## 4. Implementation Steps

### Step 1: Update Drizzle Schema Definition (`apps/gateway/src/db/schema.ts`)
Add the required telemetry columns and indexes to the `requestMetrics` table definition:

```typescript
// apps/gateway/src/db/schema.ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const requestMetrics = sqliteTable(
  "request_metrics",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    adapterId: text("adapter_id"), // e.g. "codex-cli", "gemini-cli"
    accountId: text("account_id"),
    modelRequested: text("model_requested").notNull(),
    modelExecuted: text("model_executed"),
    promptTokens: integer("prompt_tokens").default(0),
    reasoningTokens: integer("reasoning_tokens").default(0), // CoT thinking tokens
    completionTokens: integer("completion_tokens").default(0),
    totalTokens: integer("total_tokens").default(0),
    ttftMs: integer("ttft_ms"),
    totalDurationMs: integer("total_duration_ms").notNull(),
    statusCode: integer("status_code").notNull().default(200),
    status: text("status").notNull(), // "SUCCESS" | "RATE_LIMITED" | "ERROR" | "ABORTED"
    errorMessage: text("error_message"),
    createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  },
  (table) => ({
    createdAtIndex: index("idx_request_metrics_created_at").on(table.createdAt),
    adapterIndex: index("idx_request_metrics_adapter_id").on(table.adapterId),
    modelExecutedIndex: index("idx_request_metrics_model_executed").on(table.modelExecuted),
    requestIdIndex: index("idx_request_metrics_request_id").on(table.requestId),
    accountCreatedIndex: index("idx_request_metrics_account_created").on(table.accountId, table.createdAt),
  })
);

export type RequestMetric = typeof requestMetrics.$inferSelect;
export type InsertRequestMetric = typeof requestMetrics.$inferInsert;
```

### Step 2: Implement Additive Safe Migrations (`apps/gateway/src/db/migrate.ts`)
Inspect existing table schema before applying DDL modifications:

```typescript
// In apps/gateway/src/db/migrate.ts runMigrations()
const metricColumns = sqlite.pragma("table_info(request_metrics)") as Array<{ name: string }>;
const metricColumnSet = new Set(metricColumns.map((c) => c.name));

if (!metricColumnSet.has("adapter_id")) {
  sqlite.exec("ALTER TABLE request_metrics ADD COLUMN adapter_id TEXT;");
}
if (!metricColumnSet.has("reasoning_tokens")) {
  sqlite.exec("ALTER TABLE request_metrics ADD COLUMN reasoning_tokens INTEGER DEFAULT 0;");
}
if (!metricColumnSet.has("total_tokens")) {
  sqlite.exec("ALTER TABLE request_metrics ADD COLUMN total_tokens INTEGER DEFAULT 0;");
}

// Ensure high-performance composite indexes
sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_request_metrics_created_at ON request_metrics(created_at);
  CREATE INDEX IF NOT EXISTS idx_request_metrics_adapter_id ON request_metrics(adapter_id);
  CREATE INDEX IF NOT EXISTS idx_request_metrics_model_executed ON request_metrics(model_executed);
  CREATE INDEX IF NOT EXISTS idx_request_metrics_request_id ON request_metrics(request_id);
  CREATE INDEX IF NOT EXISTS idx_request_metrics_account_created ON request_metrics(account_id, created_at);
`);
```

### Step 3: Construct `TelemetryPersistQueue` (`apps/gateway/src/telemetry/persist-queue.ts`)
Design the in-memory queue with dual-trigger flush (50 items or 2000ms):

```typescript
// apps/gateway/src/telemetry/persist-queue.ts
import { db, sqlite } from "../db/index.js";
import { requestMetrics, InsertRequestMetric } from "../db/schema.js";

export interface PersistQueueOptions {
  batchSize?: number;       // default: 50
  flushIntervalMs?: number; // default: 2000
  maxQueueDepth?: number;   // default: 5000
}

export class TelemetryPersistQueue {
  private queue: InsertRequestMetric[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueueDepth: number;
  private isFlushing = false;

  constructor(options: PersistQueueOptions = {}) {
    this.batchSize = options.batchSize ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 2000;
    this.maxQueueDepth = options.maxQueueDepth ?? 5000;
  }

  public enqueue(metric: InsertRequestMetric): void {
    if (this.queue.length >= this.maxQueueDepth) {
      console.warn(`[TelemetryPersistQueue] Buffer reached cap (${this.maxQueueDepth}). Dropping oldest record.`);
      this.queue.shift();
    }

    this.queue.push(metric);

    if (this.queue.length >= this.batchSize) {
      this.flush().catch((err) => console.error("[TelemetryPersistQueue] Batch threshold flush failed:", err));
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush().catch((err) => console.error("[TelemetryPersistQueue] Timer flush failed:", err));
      }, this.flushIntervalMs);
    }
  }

  public async flush(): Promise<number> {
    if (this.isFlushing || this.queue.length === 0) return 0;
    this.isFlushing = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const batch = this.queue.splice(0, this.batchSize);

    try {
      // Execute single atomic SQLite transaction
      await db.insert(requestMetrics).values(batch);
      return batch.length;
    } catch (err) {
      console.error(`[TelemetryPersistQueue] Failed to persist batch of ${batch.length} items:`, err);
      // Re-insert unwritten items at head for retry if under cap
      if (this.queue.length + batch.length <= this.maxQueueDepth) {
        this.queue.unshift(...batch);
      }
      throw err;
    } finally {
      this.isFlushing = false;
      if (this.queue.length > 0 && !this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.flush().catch(() => {});
        }, this.flushIntervalMs);
      }
    }
  }

  public flushSync(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) return;

    const remaining = this.queue.splice(0);
    try {
      const insertStmt = sqlite.prepare(`
        INSERT INTO request_metrics (
          id, request_id, adapter_id, account_id, model_requested, model_executed,
          prompt_tokens, reasoning_tokens, completion_tokens, total_tokens,
          ttft_ms, total_duration_ms, status_code, status, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = sqlite.transaction((records: InsertRequestMetric[]) => {
        for (const r of records) {
          insertStmt.run(
            r.id, r.requestId, r.adapterId ?? null, r.accountId ?? null,
            r.modelRequested, r.modelExecuted ?? null,
            r.promptTokens ?? 0, r.reasoningTokens ?? 0, r.completionTokens ?? 0, r.totalTokens ?? 0,
            r.ttftMs ?? null, r.totalDurationMs, r.statusCode ?? 200, r.status,
            r.errorMessage ?? null, r.createdAt ?? Math.floor(Date.now() / 1000)
          );
        }
      });

      insertMany(remaining);
      console.log(`[TelemetryPersistQueue] Synchronously flushed ${remaining.length} records on shutdown.`);
    } catch (err) {
      console.error("[TelemetryPersistQueue] Synchronous shutdown flush failed:", err);
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}

export const globalTelemetryQueue = new TelemetryPersistQueue();
```

### Step 4: Implement Telemetry Query Store (`apps/gateway/src/telemetry/telemetry-store.ts`)
Provide clean methods for UI and admin queries:

```typescript
// apps/gateway/src/telemetry/telemetry-store.ts
import { sqlite } from "../db/index.js";

export interface LedgerQueryParams {
  limit?: number;
  offset?: number;
  search?: string;
  adapterId?: string;
  model?: string;
  status?: string;
  timeWindowSeconds?: number;
}

export class TelemetryStore {
  public queryLedger(params: LedgerQueryParams) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);

    let whereClause = "WHERE 1=1";
    const bindings: unknown[] = [];

    if (params.timeWindowSeconds && params.timeWindowSeconds > 0) {
      const minTimestamp = Math.floor(Date.now() / 1000) - params.timeWindowSeconds;
      whereClause += " AND created_at >= ?";
      bindings.push(minTimestamp);
    }
    if (params.adapterId) {
      whereClause += " AND adapter_id = ?";
      bindings.push(params.adapterId);
    }
    if (params.model) {
      whereClause += " AND (model_requested = ? OR model_executed = ?)";
      bindings.push(params.model, params.model);
    }
    if (params.status) {
      whereClause += " AND status = ?";
      bindings.push(params.status);
    }
    if (params.search) {
      whereClause += " AND (request_id LIKE ? OR error_message LIKE ?)";
      const pattern = `%${params.search}%`;
      bindings.push(pattern, pattern);
    }

    const countStmt = sqlite.prepare(`SELECT COUNT(*) as total FROM request_metrics ${whereClause}`);
    const total = (countStmt.get(...bindings) as { total: number }).total;

    const dataStmt = sqlite.prepare(`
      SELECT * FROM request_metrics
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    const records = dataStmt.all(...bindings, limit, offset);

    return { records, total, limit, offset };
  }

  public getSummary(timeWindowSeconds?: number) {
    let whereClause = "";
    const bindings: unknown[] = [];
    if (timeWindowSeconds && timeWindowSeconds > 0) {
      whereClause = "WHERE created_at >= ?";
      bindings.push(Math.floor(Date.now() / 1000) - timeWindowSeconds);
    }

    const row = sqlite.prepare(`
      SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) as successful_requests,
        SUM(CASE WHEN status_code = 429 THEN 1 ELSE 0 END) as rate_limited_requests,
        SUM(CASE WHEN status_code >= 500 OR status = 'ERROR' THEN 1 ELSE 0 END) as failed_requests,
        COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as total_reasoning_tokens,
        COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) as avg_ttft_ms,
        COALESCE(AVG(total_duration_ms), 0) as avg_duration_ms
      FROM request_metrics
      ${whereClause}
    `).get(...bindings) as Record<string, number>;

    return row;
  }

  public getBreakdown(timeWindowSeconds?: number) {
    let whereClause = "";
    const bindings: unknown[] = [];
    if (timeWindowSeconds && timeWindowSeconds > 0) {
      whereClause = "WHERE created_at >= ?";
      bindings.push(Math.floor(Date.now() / 1000) - timeWindowSeconds);
    }

    const byProvider = sqlite.prepare(`
      SELECT
        COALESCE(adapter_id, 'unknown') as adapter_id,
        COUNT(*) as call_count,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens
      FROM request_metrics
      ${whereClause}
      GROUP BY adapter_id
      ORDER BY total_tokens DESC
    `).all(...bindings);

    const byModel = sqlite.prepare(`
      SELECT
        COALESCE(model_executed, model_requested) as model,
        COALESCE(adapter_id, 'unknown') as adapter_id,
        COUNT(*) as call_count,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(ttft_ms), 0) as avg_ttft_ms
      FROM request_metrics
      ${whereClause}
      GROUP BY model, adapter_id
      ORDER BY total_tokens DESC
    `).all(...bindings);

    return { byProvider, byModel };
  }
}

export const globalTelemetryStore = new TelemetryStore();
```

---

## 5. Todo List

- [ ] Update `requestMetrics` definition in `apps/gateway/src/db/schema.ts` with `adapterId`, `reasoningTokens`, `totalTokens`, and composite index mapping.
- [ ] Implement additive migration logic in `apps/gateway/src/db/migrate.ts` with `table_info` check.
- [ ] Create `apps/gateway/src/telemetry/persist-queue.ts` with threshold + debounce timer flush and `flushSync()`.
- [ ] Implement `apps/gateway/src/telemetry/telemetry-store.ts` with SQL queries for ledger pagination and aggregations.
- [ ] Create unit test `tests/unit/telemetry-persist-queue.test.ts` covering queue operations, debounce, batch limits, and sync flush.
- [ ] Run `pnpm db:migrate` and verify database schema integrity.

---

## 6. Success Criteria

1. `pnpm db:migrate` executes without error and reports correct WAL journal mode.
2. `PRAGMA table_info(request_metrics)` contains `adapter_id`, `reasoning_tokens`, and `total_tokens`.
3. All 5 composite indexes (`idx_request_metrics_*`) are visible in SQLite index list.
4. `TelemetryPersistQueue` successfully flushes 50 items within 1 transaction and flushes leftover items after $2,000\text{ms}$.
5. `tests/unit/telemetry-persist-queue.test.ts` passes with 100% assertions.

---

## 7. Risk Assessment & Mitigation

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **SQLite table lock on concurrent access** | High (500 errors) | All writes are queued in-memory and flushed in single batched transactions; WAL mode and `busy_timeout = 5000` are strictly enabled. |
| **Node.js process crash losing queued metrics** | Medium (Loss of recent ~50 items) | Register `process.on('SIGINT')`, `process.on('SIGTERM')`, and Fastify `onClose` to invoke `globalTelemetryQueue.flushSync()` synchronously. |
| **Memory growth during prolonged DB lock** | High (OOM) | Enforce `maxQueueDepth = 5000`. If queue overflows, drop oldest records and emit critical alert logs. |

---

## 8. Verification Commands

```bash
# 1. Run database migration script
pnpm --filter @cli-to-api/gateway db:migrate

# 2. Run unit tests for persistence queue & schema
pnpm test tests/unit/telemetry-persist-queue.test.ts
```
