import { db } from "../db/index.js";
import { accounts } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

export class AccountPoolManager {
  private activeSlots = new Map<string, number>();

  public async acquireSlot(accountId: string, maxSlots = 1): Promise<boolean> {
    const current = this.activeSlots.get(accountId) || 0;
    if (current >= maxSlots) {
      return false;
    }

    this.activeSlots.set(accountId, current + 1);

    // Sync to SQLite asynchronously
    await db.update(accounts)
      .set({
        activeSlots: current + 1,
        lastActiveAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(accounts.id, accountId));

    return true;
  }

  public async releaseSlot(accountId: string): Promise<void> {
    const current = this.activeSlots.get(accountId) || 0;
    const next = Math.max(0, current - 1);
    this.activeSlots.set(accountId, next);

    await db.update(accounts)
      .set({ activeSlots: next })
      .where(eq(accounts.id, accountId));
  }

  public getActiveSlots(accountId: string): number {
    return this.activeSlots.get(accountId) || 0;
  }

  public async recordRequestMetrics(
    accountId: string,
    success: boolean,
    latencyMs: number
  ): Promise<void> {
    const target = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (target.length === 0) return;

    const acc = target[0];
    const newTotal = acc.totalRequests + 1;
    const newFailed = success ? acc.failedRequests : acc.failedRequests + 1;
    // Running exponential moving average for latency
    const newAvgLatency = acc.avgLatencyMs === 0
      ? latencyMs
      : Math.round(acc.avgLatencyMs * 0.8 + latencyMs * 0.2);

    await db.update(accounts)
      .set({
        totalRequests: newTotal,
        failedRequests: newFailed,
        avgLatencyMs: newAvgLatency,
      })
      .where(eq(accounts.id, accountId));
  }
}

export const globalAccountPool = new AccountPoolManager();
