# Technical Journal: Obsidian Hybrid Telemetry & Fleet Radar (OHTFR) — Planning Phase Complete

- **Date:** 2026-09-17
- **Status:** Planning Complete & Verified (Ready for Implementation)
- **Target Feature:** Retirement of Chat Playground in favor of Obsidian Hybrid Telemetry & Fleet Radar
- **Planning Mode:** `ak-plan --ultra` (Best-of-5 Verifier Evaluation by Kongming)
- **Winning Candidate:** Candidate Plan C (Production Reliability & Observability First Plan, Score: 78/80)
- **Plan Directory:** `plans/260917-1200-obsidian-telemetry-and-fleet-radar/`

---

## 1. Architectural Decisions & Scope Settled

1. **Decommissioning the Chat Playground:**
   - Evaluated the role of `PlaygroundView.tsx` within a high-performance local AI proxy gateway.
   - Concluded that interactive bubble chat in the management console is an architectural distraction that consumes bundle size and obscures real-time proxy observability.
   - Decommissioning replaces the `playground` navigation tab with a dedicated `radar` tab linking to `TelemetryStationView.tsx`.

2. **In-Memory Zero Hot-Path Execution Registry & Velocity Buffer:**
   - Live stream tracking is decoupled entirely from disk storage.
   - Subprocesses push telemetry deltas to an in-memory `ActiveExecutionRegistry` with an $O(1)$ circular timestamp ring buffer (3-second sliding window) calculating live token generation velocity (`tok/s`).
   - Server-Sent Events (SSE) to the Web Console are micro-throttled at $100\text{ms}$ intervals to prevent browser DOM render thrashing.

3. **Deterministic OS Process Containment & Emergency Kill Switch:**
   - Both `pipe-executor.ts` (execa) and `pty-executor.ts` (node-pty) are augmented with an `onSpawn: (pid: number) => void` lifecycle hook, capturing operating system PIDs in $< 20\text{ms}$.
   - Coupled with Win32 Job Objects (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) and POSIX process groups, administrators gain an instant Kill Switch (`killProcessTree(pid)`) to terminate runaway or frozen subprocesses in $< 200\text{ms}$.

4. **Decoupled Micro-Batch Persistence & SQLite WAL Concurrency:**
   - Bounded in-memory queue (`TelemetryPersistQueue`, max 5,000 items) flushes records in debounced batches ($2,000\text{ms}$ or 50 records) within a single SQLite WAL transaction.
   - Eliminates 100% of potential `SQLITE_BUSY` contention during high-concurrency request bursts.
   - Schema extension on `request_metrics` adds `adapter_id`, `reasoning_tokens`, `total_tokens`, and composite indexes for sub-millisecond filtering.

5. **Obsidian Cyberdeck HUD Mission Control (ak-ui-ux-pro-max):**
   - 4-zone tactical control station:
     - **Zone 1:** Top Diagnostic HUD Cards (Ingress, Egress, CoT tokens, Fleet TPS) + 1-Click Diagnostic Test Probe Harness.
     - **Zone 2:** Provider Slot Saturation Matrix (`activeSlots / maxSlots` progress bar with 100% saturation alarm and 429 cooldown countdowns).
     - **Zone 3:** Plane 1 Live Execution Radar (PID, Request ID, Model, Sandbox, In/CoT/Out tokens, tok/s, Kill Switch button) + Failover Trail Breadcrumbs (`P0 [429] ➔ P1 [200 OK]`).
     - **Zone 4:** Plane 2 Token Accounting Matrix & Paginated Historical Audit Ledger (Sliding window filters: 5m, 1h, 24h, all).

---

## 2. Planning Artifacts Generated

- **Canonical Plan Index:** `plans/260917-1200-obsidian-telemetry-and-fleet-radar/plan.md`
- **Phase 1 Spec:** `plans/260917-1200-obsidian-telemetry-and-fleet-radar/phase-01-resilient-persistence-layer-and-schema-evolution.md`
- **Phase 2 Spec:** `plans/260917-1200-obsidian-telemetry-and-fleet-radar/phase-02-os-process-containment-pid-binding-and-token-speedometer.md`
- **Phase 3 Spec:** `plans/260917-1200-obsidian-telemetry-and-fleet-radar/phase-03-zero-overhead-streaming-demuxer-and-admin-control-plane.md`
- **Phase 4 Spec:** `plans/260917-1200-obsidian-telemetry-and-fleet-radar/phase-04-obsidian-cyberdeck-mission-control-and-playground-retirement.md`
- **Phase 5 Spec:** `plans/260917-1200-obsidian-telemetry-and-fleet-radar/phase-05-zero-regression-e2e-suite-and-production-verification.md`
- **Evaluation Report:** `plans/reports/planner-evaluation-ohtfr-candidate-plans.md`
- **Brainstorm Foundation:** `plans/reports/brainstorm-260917-1120-runtime-telemetry-token-radar.md`
- **Task Management Hydration:** 20 granular work items synchronized into `todo` across all 5 phases.

---

## 3. Next Execution Step

Proceed to implementation via:
```bash
/ak:cook plans/260917-1200-obsidian-telemetry-and-fleet-radar/plan.md
```
