import { db, sqlite } from "../db/index.js";
import { requestMetrics, type InsertRequestMetric } from "../db/schema.js";

export interface PersistQueueOptions {
  batchSize?: number; // default: 50
  flushIntervalMs?: number; // default: 2000
  maxQueueDepth?: number; // default: 5000
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
      this.flush().catch((err) => {
        console.error("[TelemetryPersistQueue] Batch threshold flush failed:", err);
      });
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush().catch((err) => {
          console.error("[TelemetryPersistQueue] Timer flush failed:", err);
        });
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
      // Single atomic SQLite transaction via drizzle-orm
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
      if (this.queue.length >= this.batchSize) {
        this.flush().catch(() => {});
      } else if (this.queue.length > 0 && !this.timer) {
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
            r.id,
            r.requestId,
            r.adapterId ?? null,
            r.accountId ?? null,
            r.modelRequested,
            r.modelExecuted ?? null,
            r.promptTokens ?? 0,
            r.reasoningTokens ?? 0,
            r.completionTokens ?? 0,
            r.totalTokens ?? 0,
            r.ttftMs ?? null,
            r.totalDurationMs,
            r.statusCode ?? 200,
            r.status,
            r.errorMessage ?? null,
            r.createdAt ?? Math.floor(Date.now() / 1000)
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

  public clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }
}

export const globalTelemetryQueue = new TelemetryPersistQueue();
