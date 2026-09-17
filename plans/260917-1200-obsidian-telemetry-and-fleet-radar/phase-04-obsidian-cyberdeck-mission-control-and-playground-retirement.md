---
phase: 4
title: "Obsidian Cyberdeck Mission Control & Playground Retirement"
status: planned
priority: P1
effort: "0.5d"
dependencies: [
  "phase-01-resilient-persistence-layer-and-schema-evolution.md",
  "phase-02-os-process-containment-pid-binding-and-token-speedometer.md",
  "phase-03-zero-overhead-streaming-demuxer-and-admin-control-plane.md"
]
---

# Phase 4: Obsidian Cyberdeck Mission Control & Playground Retirement

## 1. Requirements

### 1.1. Functional Requirements
1. **Retire Chat Playground Cleanly:**
   - Remove the `"Chat Playground"` navigation tab (`PlaygroundView.tsx`) from `apps/web/src/components/layout/Sidebar.tsx` and `apps/web/src/App.tsx`.
   - Introduce the new nav item: `"Fleet Radar & Ledger"` (`id: "radar"`) using a prominent `Radar` or `Activity` Lucide icon.
   - Transition all routing references so that direct access or default bookmarks cleanly resolve to `TelemetryStationView`.
2. **Zone 1: Top HUD Status Gauges & Diagnostic Probe Harness:**
   - 4 Telemetry Metric Cards:
     - **Cumulative Ingress Tokens (Prompt):** Total tokens received.
     - **Cumulative Egress Tokens (Completion):** Total output tokens generated.
     - **Reasoning Tokens (Thinking CoT):** Separate counter for internal thinking tokens.
     - **Fleet Velocity:** Current instantaneous $\text{tok/s}$ across all active streams with a pulsing emerald radar ring.
   - **One-Click Diagnostic Probe Harness:**
     - In-place quick trigger buttons: `[Probe: Ping]`, `[Probe: Code Gen]`, `[Probe: CoT Reasoning]`.
     - Enables operators to fire instant synthetic benchmark requests through the gateway and visually observe live radar, token deltas, and velocity meters without needing an external IDE or chat interface.
3. **Zone 2: Provider Slot Saturation & Concurrency Matrix:**
   - Visual capacity bar (`activeSlots / maxSlots`) for each CLI adapter (`codex-cli`, `gemini-cli`, `claude-cli`, custom adapters).
   - Dynamic threshold coloring: Emerald ($< 70\%$), Amber ($70\% - 99\%$), Crimson Pulsing ($100\%$ SATURATED).
   - Account badges displaying status (`READY`, `BUSY`, `COOLDOWN` with real-time countdown timer).
4. **Zone 3: Plane 1 — Live Execution Radar (Active In-Flight Processes):**
   - Real-time tabular grid displaying all in-flight CLI processes:
     - `PID`: OS Process ID badge.
     - `Status`: `PRE_FLIGHT` (amber), `REASONING` (violet pulsing badge), `STREAMING` (emerald pulsing badge).
     - `Provider & Model`: Executing CLI and model identifier.
     - `Bound Account & Sandbox`: Account ID and active sandbox directory path.
     - `Tokens`: Triple split `In / CoT / Out`.
     - `Velocity`: Instantaneous $\text{tok/s}$ speedometer.
     - `Emergency Kill Switch`: Crimson `[KILL ✕]` button that triggers `POST /api/admin/telemetry/abort/:requestId`.
   - Visual Failover Trail Breadcrumb Sub-strip:
     - Displays real-time fallback transitions: `[P0: codex-acc-1 ⚠️ 429 (+142ms)] ──➔ [P1: gemini-acc-2 🟢 200 Streaming]`.
5. **Zone 4: Plane 2 — Token Accounting Matrix & Paginated Audit Ledger:**
   - Time window filter tabs: `[ 5 Min ]`, `[ 1 Hour ]`, `[ 24 Hours ]`, `[ All-Time ]`.
   - Provider & Model token consumption breakdown bars.
   - Searchable, paginated audit table backed by SQLite `request_metrics`:
     - Timestamp, Request ID, Provider, Model Executed, Prompt Tokens, Reasoning Tokens, Completion Tokens, TTFT, Total Duration, Status Code, Status Badge.

### 1.2. Non-Functional & UI Design Requirements
- **Obsidian Cyberdeck Design Language (`ak-ui-ux-pro-max`):**
  - Dark theme palette: Canvas `#090B0F`, Surface `#11151C`, Border `#1E2638`, Text `#E2E8F0`, Accents: Cyan `#06B6D4`, Emerald `#10B981`, Amber `#F59E0B`, Violet `#8B5CF6`, Crimson `#EF4444`.
  - Monospace font styling for numbers, PIDs, token counts, and velocity metrics.
- **Zero DOM Churn:** UI updates driven by SSE `telemetry:pulse` updates state in a React ref or memoized table to prevent frame drops during high-speed token generation.

```gherkin
Feature: Obsidian Cyberdeck Telemetry Station UI
  Scenario: Retiring Chat Playground
    Given A user accesses the Web Console
    When The user checks the sidebar navigation
    Then "Chat Playground" is not present
    And "Fleet Radar & Ledger" is visible with a Radar icon
    And Clicking "Fleet Radar & Ledger" renders TelemetryStationView

  Scenario: Diagnostic Probe execution
    Given The operator clicks "[Probe: CoT Reasoning]" on the Top HUD
    When The synthetic probe completion request starts
    Then A new process line appears in Live Execution Radar with PID and "REASONING" badge
    And Reasoning tokens tally upwards in real time
    And Velocity speedometer shows active tok/s
    And On completion, the record appears in the Historical Ledger

  Scenario: Emergency kill switch activation from UI
    Given A hanging process displayed in Live Execution Radar
    When The operator clicks "[KILL ✕]"
    Then A confirmation toast appears "Terminating process tree..."
    And The process row changes status to "TERMINATED" and vanishes within 500ms
```

---

## 2. Architecture

### 2.1. Cyberdeck 4-Zone Layout Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [● HUD ONLINE]  CYBERDECK FLEET RADAR & TOKEN MATRIX            [AUTO-REFRESH: 1s] [STREAM: SSE LIVE]   │
│ Real-time CLI token streaming velocity, in-flight process containment, and multi-model ledger.         │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 1: TOP HUD STATUS CARDS & DIAGNOSTIC PROBE HARNESS                                                │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────────────┐ │
│ │ INGRESS TOKENS │ │ EGRESS TOKENS  │ │ REASONING CoT  │ │ FLEET VELOCITY │ │ DIAGNOSTIC PROBES      │ │
│ │ 1,248,910 tok  │ │ 3,841,200 tok  │ │ 842,100 tok    │ │ 142.4 tok/s    │ │ [Ping] [Code] [CoT]   │ │
│ └────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘ └────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 2: PROVIDER SLOT SATURATION & CONCURRENCY MATRIX                                                  │
│ • codex-cli:  [████████████████████] 2/2 (100% SATURATED)  [acc-1: BUSY, acc-2: BUSY]                │
│ • gemini-cli: [██████████..........] 1/2 (50% HEALTHY)     [acc-gem-1: BUSY, acc-gem-2: READY]        │
│ • claude-cli: [....................] 0/2 (0% IDLE)         [acc-cl-1: READY, acc-cl-2: READY]         │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 3: PLANE 1 - LIVE EXECUTION RADAR (IN-FLIGHT SUBPROCESSES)                                        │
│ [PID]   [STATUS]     [PROVIDER / MODEL]       [ACCOUNT / SANDBOX]      [IN / COT / OUT] [TOK/S] [KILL] │
│ #18492  STREAMING    codex-cli ➔ gpt-4o       acc-dev-1 (~/sandboxes/1) 1.2k / 0 / 412   42.1/s [KILL] │
│ #19104  REASONING    gemini-cli ➔ 2.5-flash   acc-pro-2 (~/sandboxes/2) 840 / 512 / 0    58.4/s [KILL] │
│                                                                                                        │
│ ⚡ FAILOVER TRAIL: [P0: codex-acc-1 ⚠️ 429 (+142ms)] ──➔ [P1: gemini-acc-2 🟢 200 Streaming]           │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 4: PLANE 2 - TOKEN ACCOUNTING MATRIX & AUDIT LEDGER                                               │
│ Time Window: [ 5 Min ] [ 1 Hour ] [ 24 Hours ] [ All-Time ]            Search: [ Filter ID / error... ]│
│ ┌────────────┬──────────────────┬──────────┬─────────────┬────────────┬─────────────┬────────┬───────┐ │
│ │ PROVIDER   │ MODEL EXECUTED   │ CALLS    │ PROMPT TOK  │ REASON TOK │ COMPL TOK   │ TTFT   │ STATUS│ │
│ ├────────────┼──────────────────┼──────────┼─────────────┼────────────┼─────────────┼────────┼───────┤ │
│ │ codex-cli  │ gpt-4o           │ 1,420    │ 840,120     │ 0          │ 320,400     │ 340ms  │ 200 OK│ │
│ │ gemini-cli │ gemini-2.5-flash │ 890      │ 412,000     │ 210,000    │ 180,500     │ 410ms  │ 200 OK│ │
│ └────────────┴──────────────────┴──────────┴─────────────┴────────────┴─────────────┴────────┴───────┘ │
│ (Pagination: [< Page 1 of 18 >] Showing 50 records per page from SQLite WAL)                           │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Related Code Files

| File Path | Status | Purpose |
|---|---|---|
| `apps/web/src/components/layout/Sidebar.tsx` | **MODIFIED** | Replace `playground` with `radar` ("Fleet Radar & Ledger"). |
| `apps/web/src/App.tsx` | **MODIFIED** | Switch tab route from `PlaygroundView` to `TelemetryStationView`. |
| `apps/web/src/views/PlaygroundView.tsx` | **RETIRED** | Safely retire legacy chat playground component. |
| `apps/web/src/views/TelemetryStationView.tsx` | **CREATED** | Complete 4-zone Obsidian Cyberdeck Telemetry Station HUD. |
| `apps/web/src/components/layout/StatusBadge.tsx` | **MODIFIED** | Add `REASONING` and `SATURATED` status badge styling. |
| `apps/web/src/lib/api-client.ts` | **MODIFIED** | Add Telemetry API client bindings, types, and diagnostic probe caller. |

---

## 4. Implementation Steps

### Step 1: Update API Client with Telemetry Methods (`apps/web/src/lib/api-client.ts`)

```typescript
// Additions to apps/web/src/lib/api-client.ts
export interface ActiveStreamData {
  requestId: string;
  pid: number | null;
  status: "PRE_FLIGHT" | "REASONING" | "STREAMING" | "COMPLETED" | "ERROR" | "ABORTED" | "TERMINATED";
  adapterId: string;
  modelRequested: string;
  modelExecuted: string;
  accountId: string;
  promptTokens: number;
  reasoningTokens: number;
  completionTokens: number;
  totalTokens: number;
  currentVelocity: number;
  elapsedMs: number;
  ttftMs?: number;
  ttfrMs?: number;
  failoverTrail: Array<{
    attempt: number;
    fromAccountId: string;
    toAccountId: string;
    reason: string;
    latencyMs: number;
  }>;
}

export interface TelemetrySummaryData {
  total_requests: number;
  successful_requests: number;
  rate_limited_requests: number;
  failed_requests: number;
  total_prompt_tokens: number;
  total_reasoning_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  avg_ttft_ms: number;
  avg_duration_ms: number;
}

export interface TelemetryBreakdownData {
  byProvider: Array<{
    adapter_id: string;
    call_count: number;
    prompt_tokens: number;
    reasoning_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }>;
  byModel: Array<{
    model: string;
    adapter_id: string;
    call_count: number;
    prompt_tokens: number;
    reasoning_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    avg_ttft_ms: number;
  }>;
}

export interface TelemetryLedgerItem {
  id: string;
  request_id: string;
  adapter_id: string;
  account_id: string;
  model_requested: string;
  model_executed: string;
  prompt_tokens: number;
  reasoning_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  ttft_ms: number | null;
  total_duration_ms: number;
  status_code: number;
  status: string;
  error_message: string | null;
  created_at: number;
}

export interface TelemetryLedgerResponse {
  records: TelemetryLedgerItem[];
  total: number;
  limit: number;
  offset: number;
}

// Client methods:
export async function getTelemetryActive(): Promise<{ activeStreams: ActiveStreamData[]; count: number }> {
  const res = await fetch(`${API_BASE}/api/admin/telemetry/active`, { credentials: "include" });
  return res.json();
}

export async function getTelemetrySummary(window = "24h"): Promise<TelemetrySummaryData> {
  const res = await fetch(`${API_BASE}/api/admin/telemetry/summary?window=${window}`, { credentials: "include" });
  return res.json();
}

export async function getTelemetryBreakdown(window = "24h"): Promise<TelemetryBreakdownData> {
  const res = await fetch(`${API_BASE}/api/admin/telemetry/breakdown?window=${window}`, { credentials: "include" });
  return res.json();
}

export async function getTelemetryLedger(params: {
  limit?: number;
  offset?: number;
  search?: string;
  adapterId?: string;
  model?: string;
  status?: string;
  window?: string;
}): Promise<TelemetryLedgerResponse> {
  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  if (params.search) q.set("search", params.search);
  if (params.adapterId) q.set("adapterId", params.adapterId);
  if (params.model) q.set("model", params.model);
  if (params.status) q.set("status", params.status);
  if (params.window) q.set("window", params.window);

  const res = await fetch(`${API_BASE}/api/admin/telemetry/ledger?${q.toString()}`, { credentials: "include" });
  return res.json();
}

export async function abortTelemetryProcess(requestId: string): Promise<{ success: boolean; pid: number | null; killed: boolean }> {
  const res = await fetch(`${API_BASE}/api/admin/telemetry/abort/${encodeURIComponent(requestId)}`, {
    method: "POST",
    credentials: "include",
  });
  return res.json();
}

export async function runDiagnosticProbe(type: "ping" | "code" | "cot"): Promise<Response> {
  let prompt = "Reply with 'pong' and nothing else.";
  let model = "auto";
  let reasoning_effort: string | undefined;

  if (type === "code") {
    prompt = "Write a fast TypeScript binary search function.";
    model = "auto";
  } else if (type === "cot") {
    prompt = "Explain in detail how Dijkstra's shortest path algorithm works step-by-step.";
    model = "auto";
    reasoning_effort = "high";
  }

  return fetch(`${API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getStoredApiKey()}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      reasoning_effort,
      messages: [{ role: "user", content: prompt }],
    }),
  });
}
```

### Step 2: Overhaul Navigation in `Sidebar.tsx` and `App.tsx`
Update `apps/web/src/components/layout/Sidebar.tsx`:

```typescript
// apps/web/src/components/layout/Sidebar.tsx
import { LayoutDashboard, Layers, Users, Terminal, Radar, Activity } from "lucide-react";

export type NavTab = "dashboard" | "models" | "accounts" | "webshell" | "radar" | "inspector";

export function Sidebar({ activeTab, onSelectTab }: SidebarProps) {
  const items: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: "dashboard", label: "Fleet Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "models", label: "Model Catalog & Tiers", icon: <Layers className="w-4 h-4" /> },
    { id: "accounts", label: "Accounts & Sandboxes", icon: <Users className="w-4 h-4" /> },
    { id: "webshell", label: "WebShell Terminal", icon: <Terminal className="w-4 h-4" /> },
    { id: "radar", label: "Fleet Radar & Ledger", icon: <Radar className="w-4 h-4" /> }, // <--- REPLACED PLAYGROUND
    { id: "inspector", label: "Live SSE Inspector", icon: <Activity className="w-4 h-4" /> },
  ];
  // ...
}
```

Update `apps/web/src/App.tsx`:

```typescript
// In apps/web/src/App.tsx
import { TelemetryStationView } from "./views/TelemetryStationView.js";

// Inside App component:
{activeTab === "radar" && <TelemetryStationView />}
```

### Step 3: Build `TelemetryStationView.tsx`
Construct the complete 4-zone Obsidian Cyberdeck control console with:
- SSE hook subscription to `GET /api/admin/events`
- `radar:snapshot` and `telemetry:pulse` handlers
- Zone 1 KPI Status Cards & Diagnostic Probe harness
- Zone 2 Slot Saturation progress bars
- Zone 3 Live Execution Radar with PID badges, pulsing status indicators, failover breadcrumbs, and emergency `[KILL ✕]` button
- Zone 4 Paginated Historical SQLite Audit Ledger with sliding window filters (5m, 1h, 24h, all).

---

## 5. Todo List

- [ ] Retire `PlaygroundView.tsx` from `Sidebar.tsx` and `App.tsx`.
- [ ] Add `radar` navigation tab with Lucide `Radar` icon.
- [ ] Implement Telemetry types and API helpers in `apps/web/src/lib/api-client.ts`.
- [ ] Add `runDiagnosticProbe` helper in `api-client.ts` for ping, code, and CoT test execution.
- [ ] Build `apps/web/src/views/TelemetryStationView.tsx` implementing Zones 1-4 per `ak-ui-ux-pro-max`.
- [ ] Update `apps/web/src/components/layout/StatusBadge.tsx` with `REASONING` (purple) and `SATURATED` (crimson) styling.
- [ ] Verify build passes with `pnpm --filter @cli-to-api/web build`.

---

## 6. Success Criteria

1. Web Console sidebar shows `"Fleet Radar & Ledger"` in place of `"Chat Playground"`.
2. TelemetryStationView displays live gauges for Prompt, Completion, and Reasoning tokens.
3. Diagnostic probe buttons fire test requests that immediately register in Live Execution Radar.
4. Clicking `[KILL ✕]` on an active process sends abort command, terminates the process tree, and updates status.
5. Historical ledger queries SQLite `request_metrics` with correct pagination and search filtering.
6. Vite production build completes cleanly without TypeScript errors.

---

## 7. Risk Assessment & Mitigation

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **High streaming frequency freezes browser UI** | High (UI freeze) | Backend micro-throttles SSE updates to 100ms; frontend updates state using React functional state setters and avoids re-rendering the historical ledger on pulse ticks. |
| **Orphaned browser tabs remaining on old playground URL** | Low (404/blank) | Fallback redirect in `App.tsx` routes any unrecognized tab to `"radar"`. |
| **Diagnostic probe overload** | Low (Self-inflicted 429) | Disable probe buttons with a 1-second debounce after clicking. |

---

## 8. Verification Commands

```bash
# 1. Verify frontend builds without TypeScript or bundling errors
pnpm --filter @cli-to-api/web build

# 2. Run web dev server and test UI interaction
pnpm --filter @cli-to-api/web dev
```
