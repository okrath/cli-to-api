import { globalAdminEventBus } from "../api/routes/admin-events.js";
import { globalExecutionRegistry } from "./execution-registry.js";
import { globalAccountPool } from "../router/account-pool.js";
import { globalTelemetryStore } from "./telemetry-store.js";
import { globalCooldownTracker } from "../router/cooldown-tracker.js";
import { db } from "../db/index.js";
import { accounts } from "../db/schema.js";

export class TelemetryBroadcaster {
  private timer: NodeJS.Timeout | null = null;
  private isDirty = false;
  private readonly pulseIntervalMs = 100;

  constructor() {
    this.startPulseLoop();
  }

  public markDirty(): void {
    this.isDirty = true;
  }

  private startPulseLoop(): void {
    this.timer = setInterval(() => {
      const active = globalExecutionRegistry.getSnapshot();
      if (active.length > 0 && this.isDirty) {
        this.isDirty = false;
        globalAdminEventBus.broadcast("telemetry:pulse", {
          activeStreams: active.map((a) => ({
            requestId: a.requestId,
            pid: a.pid,
            status: a.status,
            adapterId: a.adapterId,
            modelRequested: a.modelRequested,
            modelExecuted: a.modelExecuted,
            accountId: a.accountId,
            promptTokens: a.promptTokens,
            reasoningTokens: a.reasoningTokens,
            completionTokens: a.completionTokens,
            totalTokens: a.totalTokens,
            currentVelocity: a.currentVelocity,
            elapsedMs: Date.now() - a.startedAt,
            ttftMs: a.ttftMs,
            ttfrMs: a.ttfrMs,
            failoverTrail: a.failoverTrail,
          })),
        });
      }
    }, this.pulseIntervalMs);
  }

  public async getFullHydrationSnapshot() {
    const activeStreams = globalExecutionRegistry.getSnapshot();
    const adapterSummary = globalTelemetryStore.getBreakdown(300);

    const accountList = await db.select().from(accounts);
    const enrichedAccounts = await Promise.all(
      accountList.map(async (acc) => {
        const remainingCooldown = await globalCooldownTracker.getCooldownRemainingSeconds(acc.id);
        const liveActiveSlots = globalAccountPool.getActiveSlots(acc.id);
        return {
          ...acc,
          activeSlots: liveActiveSlots,
          cooldownSecondsRemaining: remainingCooldown,
        };
      })
    );

    return {
      activeStreams,
      adapterSummary,
      accounts: enrichedAccounts,
      serverTime: Date.now(),
    };
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const globalTelemetryBroadcaster = new TelemetryBroadcaster();
