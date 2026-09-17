import { killProcessTree } from "../supervisor/process-group.js";

export interface TokenSample {
  timestamp: number;
  tokens: number;
}

export class CircularTimestampBuffer {
  private readonly capacity: number;
  private readonly windowMs: number;
  private timestamps: Float64Array;
  private tokenCounts: Uint16Array;
  private head = 0;
  private count = 0;

  constructor(windowMs = 3000, capacity = 64) {
    this.windowMs = windowMs;
    this.capacity = capacity;
    this.timestamps = new Float64Array(capacity);
    this.tokenCounts = new Uint16Array(capacity);
  }

  public addSample(tokens: number, now = Date.now()): void {
    if (tokens <= 0) return;
    this.timestamps[this.head] = now;
    this.tokenCounts[this.head] = tokens;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  public getVelocity(now = Date.now()): number {
    if (this.count === 0) return 0;

    const cutoff = now - this.windowMs;
    let accumulatedTokens = 0;
    let earliestTime = now;

    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      const t = this.timestamps[idx];
      if (t < cutoff) break;
      accumulatedTokens += this.tokenCounts[idx];
      earliestTime = t;
    }

    if (accumulatedTokens === 0) return 0;

    const elapsedSeconds = Math.max(0.1, (now - earliestTime) / 1000);
    return Number((accumulatedTokens / elapsedSeconds).toFixed(1));
  }

  public clear(): void {
    this.head = 0;
    this.count = 0;
  }
}

export interface ActiveExecutionRecord {
  requestId: string;
  pid: number | null;
  accountId: string;
  adapterId: string;
  modelRequested: string;
  modelExecuted: string;
  sandboxDir: string;
  promptTokens: number;
  reasoningTokens: number;
  completionTokens: number;
  totalTokens: number;
  startedAt: number;
  firstTokenAt?: number;
  ttftMs?: number;
  firstThoughtAt?: number;
  ttfrMs?: number;
  status: "PRE_FLIGHT" | "REASONING" | "STREAMING" | "COMPLETED" | "ERROR" | "ABORTED" | "TERMINATED";
  velocityBuffer: CircularTimestampBuffer;
  currentVelocity: number;
  abortController?: AbortController;
  failoverTrail: Array<{
    attempt: number;
    fromAccountId: string;
    toAccountId: string;
    reason: string;
    latencyMs: number;
  }>;
}

export class ExecutionRegistry {
  private activeMap = new Map<string, ActiveExecutionRecord>();

  public register(record: Omit<ActiveExecutionRecord, "velocityBuffer" | "currentVelocity" | "failoverTrail">): ActiveExecutionRecord {
    const entry: ActiveExecutionRecord = {
      ...record,
      velocityBuffer: new CircularTimestampBuffer(3000),
      currentVelocity: 0,
      failoverTrail: [],
    };
    this.activeMap.set(record.requestId, entry);
    return entry;
  }

  public bindPid(requestId: string, pid: number): void {
    const entry = this.activeMap.get(requestId);
    if (entry) {
      entry.pid = pid;
    }
  }

  public recordTokenChunk(
    requestId: string,
    chunkTokens: number,
    type: "reasoning" | "content",
    now = Date.now()
  ): void {
    const entry = this.activeMap.get(requestId);
    if (!entry) return;

    if (type === "reasoning") {
      entry.reasoningTokens += chunkTokens;
      if (!entry.firstThoughtAt) {
        entry.firstThoughtAt = now;
        entry.ttfrMs = now - entry.startedAt;
      }
      entry.status = "REASONING";
    } else {
      entry.completionTokens += chunkTokens;
      if (!entry.firstTokenAt) {
        entry.firstTokenAt = now;
        entry.ttftMs = now - entry.startedAt;
      }
      entry.status = "STREAMING";
    }

    entry.totalTokens = entry.promptTokens + entry.reasoningTokens + entry.completionTokens;
    entry.velocityBuffer.addSample(chunkTokens, now);
    entry.currentVelocity = entry.velocityBuffer.getVelocity(now);
  }

  public addFailoverBreadcrumb(
    requestId: string,
    breadcrumb: ActiveExecutionRecord["failoverTrail"][number]
  ): void {
    const entry = this.activeMap.get(requestId);
    if (entry) {
      entry.failoverTrail.push(breadcrumb);
    }
  }

  public async abortExecution(requestId: string): Promise<{ success: boolean; pid: number | null; killed: boolean }> {
    const entry = this.activeMap.get(requestId);
    if (!entry) return { success: false, pid: null, killed: false };

    let killed = false;
    if (entry.abortController) {
      entry.abortController.abort();
    }

    if (entry.pid) {
      try {
        await killProcessTree(entry.pid);
        killed = true;
      } catch (err) {
        console.warn(`[ExecutionRegistry] killProcessTree for pid ${entry.pid} encountered error:`, err);
      }
    }

    entry.status = "TERMINATED";
    return { success: true, pid: entry.pid, killed };
  }

  public complete(requestId: string, finalStatus: "COMPLETED" | "ERROR" | "ABORTED" = "COMPLETED"): ActiveExecutionRecord | undefined {
    const entry = this.activeMap.get(requestId);
    if (entry) {
      entry.status = finalStatus;
      this.activeMap.delete(requestId);
    }
    return entry;
  }

  public getSnapshot(): ActiveExecutionRecord[] {
    const now = Date.now();
    const result: ActiveExecutionRecord[] = [];
    for (const record of this.activeMap.values()) {
      record.currentVelocity = record.velocityBuffer.getVelocity(now);
      result.push(record);
    }
    return result;
  }

  public get(requestId: string): ActiveExecutionRecord | undefined {
    return this.activeMap.get(requestId);
  }

  public clear(): void {
    this.activeMap.clear();
  }
}

export const globalExecutionRegistry = new ExecutionRegistry();
