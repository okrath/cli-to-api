import { db } from "../db/index.js";
import { accounts, cooldownHistory } from "../db/schema.js";
import { eq } from "drizzle-orm";

export class CooldownTracker {
  private recoveryTimers = new Map<string, NodeJS.Timeout>();

  public async triggerCooldown(
    accountId: string,
    cooldownSeconds: number,
    reason: string
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + cooldownSeconds;

    // Clear existing timer if any
    const existing = this.recoveryTimers.get(accountId);
    clearTimeout(existing);

    // Update account status in DB
    await db.update(accounts)
      .set({
        status: "COOLDOWN",
        cooldownUntil: expiresAt,
        cooldownReason: reason,
      })
      .where(eq(accounts.id, accountId));

    // Log to history
    await db.insert(cooldownHistory).values({
      accountId,
      reason,
      cooldownSeconds,
      startedAt: now,
      expiresAt,
    });

    // Schedule auto-recovery timer
    const timer = setTimeout(async () => {
      await this.clearCooldown(accountId);
    }, cooldownSeconds * 1000);

    this.recoveryTimers.set(accountId, timer);
  }

  public async clearCooldown(accountId: string): Promise<void> {
    const timer = this.recoveryTimers.get(accountId);
    clearTimeout(timer);
    this.recoveryTimers.delete(accountId);

    await db.update(accounts)
      .set({
        status: "READY",
        cooldownUntil: null,
        cooldownReason: null,
      })
      .where(eq(accounts.id, accountId));
  }

  public async isAccountInCooldown(accountId: string): Promise<boolean> {
    const target = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (target.length === 0) return false;

    const acc = target[0];
    if (acc.status !== "COOLDOWN") return false;

    const now = Math.floor(Date.now() / 1000);
    if (acc.cooldownUntil && acc.cooldownUntil <= now) {
      // Cooldown expired naturally
      await this.clearCooldown(accountId);
      return false;
    }

    return true;
  }

  public async getCooldownRemainingSeconds(accountId: string): Promise<number> {
    const target = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (target.length === 0) return 0;
    const acc = target[0];
    if (acc.status !== "COOLDOWN" || !acc.cooldownUntil) return 0;

    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, acc.cooldownUntil - now);
  }
}

export const globalCooldownTracker = new CooldownTracker();
