---
phase: 2
title: "OS Process Containment, PID Binding & Token Speedometer"
status: planned
priority: P1
effort: "0.5d"
dependencies: ["phase-01-resilient-persistence-layer-and-schema-evolution.md"]
---

# Phase 2: OS Process Containment, PID Binding & Token Speedometer

## 1. Requirements

### 1.1. Functional Requirements
1. **Low-Latency Subprocess PID Capture (`onSpawn` Callback):**
   - Both execution backends (`pipe-executor.ts` using `execa` and `pty-executor.ts` using `node-pty`) must emit an `onSpawn(pid: number)` event within $< 20\text{ms}$ of process instantiation.
   - The Gateway supervisor must immediately bind this OS PID to the request ID, target account ID, sandbox directory, and adapter ID in the `ExecutionRegistry`.
2. **OS Process Tree Containment & Emergency Kill Switch:**
   - All spawned CLI subprocesses must run inside containment wrappers (Win32 Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` on Windows, detached process group `setsid` on POSIX).
   - The Gateway must provide an emergency kill switch `killProcessTree(pid)` capable of terminating the subprocess and all its grandchildren in $< 200\text{ms}$, releasing the associated account slot immediately.
3. **$O(1)$ Circular Timestamp Velocity Buffer (Token Speedometer):**
   - Each active request stream must maintain a lightweight, fixed-size ring buffer of token timestamp samples over a sliding 3-second ($3,000\text{ms}$) window.
   - Calculating the instantaneous token velocity ($\text{tokens/second}$) must be strictly $O(1)$ in time and $O(1)$ in space, allocating no garbage collection overhead on the Fastify thread.
4. **Adaptive Multilingual Character Heuristic:**
   - Estimate prompt and completion token counts using an adaptive character-class heuristic:
     - ASCII alphanumeric & standard code: $\approx 3.7\text{ characters / token}$
     - Unicode, CJK, and accented Vietnamese text: $\approx 2.2\text{ characters / token}$
   - Accuracy must be within $\pm 5\%$ of standard BPE tokenizers without requiring heavy WASM dependencies.
5. **In-Memory Active Execution Registry:**
   - Maintain the active state of all in-flight requests: Request ID, PID, Account, Adapter, Model Requested, Model Executed, Sandbox directory, Prompt tokens, Reasoning tokens, Completion tokens, Current Velocity, and Phase (`PRE_FLIGHT` | `REASONING` | `STREAMING`).

### 1.2. Non-Functional & Reliability Requirements
- **Memory Footprint:** The in-memory execution registry and circular velocity buffers must consume $< 15\text{MB}$ total for 100 concurrent streams.
- **Process Cleanup Guarantee:** If an execution is aborted or killed, orphaned processes must not remain active on the host OS.

```gherkin
Feature: OS Process Containment and PID Speedometer
  Scenario: Rapid PID binding on CLI execution
    Given A client initiates a streaming completion request
    When pipe-executor or pty-executor launches the CLI binary
    Then onSpawn is triggered with the OS PID within 20ms
    And The active execution record in ExecutionRegistry contains the valid PID

  Scenario: Emergency kill switch execution
    Given An active runaway CLI subprocess with PID 12345
    When Admin invokes abortExecution(requestId)
    Then killProcessTree(12345) is executed
    And The process and child tree are terminated within 200ms
    And The account slot is marked READY
    And The execution record status changes to "TERMINATED"

  Scenario: High-frequency token velocity calculation
    Given A model streaming 10 tokens every 100ms
    When Token chunks are ingested into the circular velocity buffer
    Then The calculated velocity reflects ~100 tokens/sec across the 3s window
    And Memory allocations during the calculation are zero
```

---

## 2. Architecture

### 2.1. Subprocess Containment & Velocity Architecture

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ PROCESS MANAGER & SUPERVISOR (apps/gateway/src/supervisor/)                 │
 │                                                                             │
 │  executeStreaming(ctx)                                                      │
 │    │                                                                        │
 │    ├──► pipe-executor (execa)                                               │
 │    │      │                                                                 │
 │    │      ├── child = execa(...)                                            │
 │    │      └── child.pid ──► ctx.onSpawn(child.pid) ──┐                      │
 │    │                                                 │                      │
 │    └──► pty-executor (node-pty)                      │                      │
 │           │                                          │                      │
 │           ├── ptyProcess = pty.spawn(...)            │                      │
 │           └── ptyProcess.pid ──► ctx.onSpawn(pid) ───┤                      │
 └──────────────────────────────────────────────────────┼──────────────────────┘
                                                        │ (Instant PID Binding)
                                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ IN-MEMORY EXECUTION REGISTRY (apps/gateway/src/telemetry/execution-registry)│
 │                                                                             │
 │  Map<RequestId, ActiveExecutionRecord>                                      │
 │   ├── id: "chatcmpl-99a"                                                    │
 │   ├── pid: 18492 ◄───────────────────────────────────┘                      │
 │   ├── adapterId: "codex-cli"                                                │
 │   ├── modelExecuted: "gpt-4o"                                               │
 │   ├── accountId: "acc-dev-1"                                                │
 │   ├── tokens: { prompt: 1240, reasoning: 342, completion: 890 }             │
 │   │                                                                         │
 │   ├── velocityBuffer: CircularTimestampBuffer (3000ms window)               │
 │   │     ┌─────────────────────────────────────────────────────────┐         │
 │   │     │ Ring: [(t0, tok0), (t1, tok1), ..., (tN, tokN)]         │         │
 │   │     │ computeVelocity() -> tok/s in O(1) time                 │         │
 │   │     └─────────────────────────────────────────────────────────┘         │
 │   │                                                                         │
 │   └── Emergency Interceptor:                                                │
 │         abortController.abort()  +  killProcessTree(pid)                    │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Related Code Files

| File Path | Status | Purpose |
|---|---|---|
| `apps/gateway/src/supervisor/types.ts` | **MODIFIED** | Add `onSpawn?: (pid: number) => void;` to `ProcessSpawnOptions` and `ExecutionContext`. |
| `apps/gateway/src/supervisor/pipe-executor.ts` | **MODIFIED** | Immediately trigger `options.onSpawn(child.pid)` upon process launch. |
| `apps/gateway/src/supervisor/pty-executor.ts` | **MODIFIED** | Immediately trigger `options.onSpawn(ptyProcess.pid)` upon PTY spawn. |
| `apps/gateway/src/supervisor/process-manager.ts` | **MODIFIED** | Forward `ctx.onSpawn` and export `killSubprocessTree(pid)`. |
| `apps/gateway/src/telemetry/execution-registry.ts` | **CREATED** | Active execution tracker, $O(1)$ circular ring buffer, and emergency kill controller. |
| `apps/gateway/src/utils/token-estimator.ts` | **MODIFIED** | Implement `estimateTextTokensAdaptive` differentiating ASCII and Unicode character sets. |
| `tests/unit/token-speedometer.test.ts` | **CREATED** | Unit tests for ring buffer velocity math and adaptive multilingual tokenizer accuracy. |
| `tests/unit/process-containment-kill.test.ts` | **CREATED** | Unit tests for PID binding latency and process tree termination speed. |

---

## 4. Implementation Steps

### Step 1: Update Supervisor Types (`apps/gateway/src/supervisor/types.ts`)
Add `onSpawn` lifecycle callback:

```typescript
// apps/gateway/src/supervisor/types.ts
export interface ProcessSpawnOptions {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  executionMode: ProcessExecutionMode;
  stdinContent?: string;
  signal?: AbortSignal;
  timeoutSeconds?: number;
  effortLevel?: EffortLevel | null;
  onSpawn?: (pid: number) => void; // <--- NEW: Instantaneous PID capture
  onDelta?: (chunk: string) => void;
  onContentDelta?: (chunk: string) => void;
  onThoughtDelta?: (chunk: string) => void;
  onError?: (errText: string) => void;
}
```

### Step 2: Inject `onSpawn` in Pipe and PTY Executors
In `apps/gateway/src/supervisor/pipe-executor.ts`:

```typescript
// apps/gateway/src/supervisor/pipe-executor.ts
const child = execa(executable, args, {
  cwd,
  env,
  timeout: timeoutSeconds * 1000,
  reject: false,
  stripFinalNewline: false,
  buffer: false,
  windowsHide: true,
});

const pid = child.pid;
if (pid && options.onSpawn) {
  try {
    options.onSpawn(pid);
  } catch (err) {
    console.error("[pipe-executor] onSpawn callback threw:", err);
  }
}
```

In `apps/gateway/src/supervisor/pty-executor.ts`:

```typescript
// apps/gateway/src/supervisor/pty-executor.ts
ptyProcess = pty.spawn(executable, args, {
  name: "xterm-color",
  cols: 120,
  rows: 30,
  cwd,
  env: env as Record<string, string>,
});

if (ptyProcess.pid && options.onSpawn) {
  try {
    options.onSpawn(ptyProcess.pid);
  } catch (err) {
    console.error("[pty-executor] onSpawn callback threw:", err);
  }
}
```

### Step 3: Implement Adaptive Multilingual Heuristics (`apps/gateway/src/utils/token-estimator.ts`)

```typescript
// apps/gateway/src/utils/token-estimator.ts
import { normalizeContentToString, MessageContent } from "./content-normalizer.js";

export function estimateTextTokensAdaptive(text: string): number {
  if (!text || text.length === 0) return 0;

  let asciiChars = 0;
  let nonAsciiChars = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 127) {
      asciiChars++;
    } else {
      nonAsciiChars++;
    }
  }

  // ASCII tokens average ~3.7 characters per token (code, English)
  // Non-ASCII tokens (Vietnamese accented, CJK, emojis) average ~2.2 chars
  const asciiTokens = asciiChars / 3.7;
  const nonAsciiTokens = nonAsciiChars / 2.2;

  return Math.max(1, Math.ceil(asciiTokens + nonAsciiTokens));
}

export function estimatePromptTokens(
  messages: Array<{ role: string; content: MessageContent }>
): number {
  let total = 0;
  for (const m of messages) {
    const text = normalizeContentToString(m.content);
    total += estimateTextTokensAdaptive(text) + 4; // Add role overhead
  }
  return Math.max(1, total + 3); // Prime completion
}
```

### Step 4: Implement $O(1)$ Circular Timestamp Buffer and Execution Registry (`apps/gateway/src/telemetry/execution-registry.ts`)

```typescript
// apps/gateway/src/telemetry/execution-registry.ts
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

    const elapsedSeconds = Math.max(0.1, (now - earliestTime) / 1000);
    return Number((accumulatedTokens / elapsedSeconds).toFixed(1));
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
}

export const globalExecutionRegistry = new ExecutionRegistry();
```

---

## 5. Todo List

- [ ] Update `ProcessSpawnOptions` in `apps/gateway/src/supervisor/types.ts` with `onSpawn?: (pid: number) => void`.
- [ ] Connect `child.pid` in `apps/gateway/src/supervisor/pipe-executor.ts` to trigger `options.onSpawn`.
- [ ] Connect `ptyProcess.pid` in `apps/gateway/src/supervisor/pty-executor.ts` to trigger `options.onSpawn`.
- [ ] Forward `onSpawn` in `apps/gateway/src/supervisor/process-manager.ts`.
- [ ] Implement `estimateTextTokensAdaptive` and `estimatePromptTokens` in `apps/gateway/src/utils/token-estimator.ts`.
- [ ] Create `apps/gateway/src/telemetry/execution-registry.ts` with `CircularTimestampBuffer` and `ExecutionRegistry`.
- [ ] Write unit tests in `tests/unit/token-speedometer.test.ts` verifying velocity calculations and heuristic accuracy.
- [ ] Write unit tests in `tests/unit/process-containment-kill.test.ts` verifying process tree destruction and PID capture.

---

## 6. Success Criteria

1. Subprocess PID is captured in $< 20\text{ms}$ upon process creation.
2. Circular buffer computes sliding 3-second token velocity in strictly $O(1)$ operations with zero heap allocation.
3. Adaptive character heuristic accurately differentiates ASCII vs Unicode and processes 10,000 characters in $< 1\text{ms}$.
4. `abortExecution(requestId)` terminates the target process tree and sets record state to `TERMINATED` in $< 200\text{ms}$.
5. `tests/unit/token-speedometer.test.ts` and `tests/unit/process-containment-kill.test.ts` pass cleanly.

---

## 7. Risk Assessment & Mitigation

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **PID reuse race condition** | Medium (Killing wrong process if PID wrapped) | Verify target process exists before executing `killProcessTree`; remove execution record immediately once killed. |
| **Pty spawn failure on non-standard Windows setups** | High (Crash) | Wrap `pty.spawn` in try/catch; fallback gracefully to `pipe-executor` if PTY instantiation fails. |
| **Event loop delay from rapid token chunks** | Medium (Streaming latency) | Velocity buffer uses preallocated TypedArrays (`Float64Array`, `Uint16Array`), completely bypassing garbage collector pauses. |

---

## 8. Verification Commands

```bash
# 1. Run velocity speedometer and tokenizer tests
pnpm test tests/unit/token-speedometer.test.ts

# 2. Run process containment and kill switch unit tests
pnpm test tests/unit/process-containment-kill.test.ts
```
