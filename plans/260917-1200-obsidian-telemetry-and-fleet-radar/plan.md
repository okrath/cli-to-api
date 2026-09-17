---
title: "Obsidian Hybrid Telemetry & Fleet Radar (OHTFR) — Production Reliability & Observability First Plan"
status: planned
priority: P1
effort: "2.5d"
branch: main
tags: [telemetry, fleet-radar, token-accounting, kill-switch, circular-buffer, micro-batch, sqlite-wal, obsidian-cyberdeck, playground-retirement, production-reliability]
blockedBy: []
blocks: []
created: 2026-09-17
---

# Obsidian Hybrid Telemetry & Fleet Radar (OHTFR)
## Production Reliability & Observability First Implementation Plan

---

## Executive Summary

This engineering plan formalizes the retirement of the **Chat Playground** (`PlaygroundView.tsx`) and establishes the **Obsidian Hybrid Telemetry & Fleet Radar (OHTFR)** (`TelemetryStationView.tsx`) in the `cli-to-api` gateway. 

As a high-performance local AI proxy bridging IDE clients (Cursor, Claude Code, Cline, Continue, Aider) with host-resident CLI engines (`codex-cli`, `gemini-cli`, `claude-cli`, and custom recipes), maintaining an interactive toy chat bubble in the management console contradicts the architectural purpose of a developer-grade infrastructure gateway.

Adopting the **Production Reliability & Observability First** angle, this plan prioritizes rock-solid system stability under high concurrent loads and uncompromised runtime visibility:
1. **Zero Hot-Path Contention:** Streaming token counters and velocity calculations run in $O(1)$ memory without locking the Fastify Event Loop. Database persistence is fully decoupled via a debounced micro-batch queue writing to SQLite in WAL mode, eliminating `SQLITE_BUSY` crashes.
2. **Deterministic OS Process Containment:** Subprocess PIDs (`child.pid` / `ptyProcess.pid`) are bound within $< 20\text{ms}$ of spawn via an `onSpawn` lifecycle callback. Integrated with Win32 Job Objects and POSIX Process Groups, administrators possess an instantaneous Emergency Kill Switch (`killProcessTree(pid)`) to terminate runaway or hanging subprocesses in $< 200\text{ms}$.
3. **Deep CoT & Multilingual Observability:** Demuxing hooks isolate Thinking/Reasoning tokens from Content tokens in real time. Token estimations employ an Adaptive Multilingual Character Heuristic (3.7 ASCII / 2.2 Unicode chars per token), and live token velocity is computed across a sliding 3-second circular ring buffer.
4. **Resilient Mission Control HUD:** A 4-zone Obsidian Cyberdeck control station (`ak-ui-ux-pro-max`) provides real-time slot saturation gauges, failover trail breadcrumbs, active in-flight subprocess tracking, paginated historical auditing, and one-click diagnostic test probes.

---

## Phased Roadmap

| Phase | Title | Objective | Effort | Status |
|:---:|---|---|:---:|:---:|
| **1** | [Resilient Persistence Layer & Schema Evolution](./phase-01-resilient-persistence-layer-and-schema-evolution.md) | Safe additive SQLite schema migration (`adapter_id`, `reasoning_tokens`, `total_tokens`), composite performance indexes, in-memory micro-batch queue (2000ms / 50 items) with WAL mode concurrency safety, and audit data access repository. | 0.5d | planned |
| **2** | [OS Process Containment, PID Binding & Token Speedometer](./phase-02-os-process-containment-pid-binding-and-token-speedometer.md) | Inject `onSpawn` callback across `pipe-executor` and `pty-executor`, bind OS PIDs to account slots in `ActiveExecutionRegistry`, implement $O(1)$ circular timestamp velocity buffer (3s window), and calibrate adaptive multilingual char heuristic. | 0.5d | planned |
| **3** | [Zero-Overhead Streaming Demuxer & Admin Control Plane](./phase-03-zero-overhead-streaming-demuxer-and-admin-control-plane.md) | Wire `openai-chat.ts` streaming hooks to `ThinkingDemuxer`, implement 100ms micro-throttled SSE pulse broadcaster, capture dynamic failover trail breadcrumbs in `pipeline-executor`, and expose Admin REST control endpoints (ledger query, active snapshot, emergency abort/kill). | 0.5d | planned |
| **4** | [Obsidian Cyberdeck Mission Control & Playground Retirement](./phase-04-obsidian-cyberdeck-mission-control-and-playground-retirement.md) | Deprecate and remove Chat Playground from navigation, construct 4-zone `TelemetryStationView.tsx` HUD adhering to `ak-ui-ux-pro-max` (Gauges, Concurrency Saturation, Live Radar with Kill Switch, Paginated Ledger, and Diagnostic Probe Harness). | 0.5d | planned |
| **5** | [Zero-Regression E2E Suite & Production Verification](./phase-05-zero-regression-e2e-suite-and-production-verification.md) | Comprehensive test suite: 50-request concurrency stress test, SQLite WAL busy-lock verification, <200ms emergency kill latency benchmark, SSE snapshot hydration, and zero-regression OpenAI client acceptance. | 0.5d | planned |

---

## File Ownership Matrix

```
apps/gateway/src/
├── db/
│   ├── schema.ts                                      [MODIFIED] Added adapterId, reasoningTokens, totalTokens to requestMetrics; defined composite indexes
│   └── migrate.ts                                     [MODIFIED] Safe additive column migration & index creation for request_metrics in WAL mode
├── supervisor/
│   ├── types.ts                                       [MODIFIED] Added onSpawn callback to ProcessSpawnOptions and ExecutionContext
│   ├── pipe-executor.ts                               [MODIFIED] Trigger onSpawn(child.pid) immediately after execa spawn
│   ├── pty-executor.ts                                [MODIFIED] Trigger onSpawn(ptyProcess.pid) immediately after node-pty spawn
│   └── process-manager.ts                             [MODIFIED] Forward onSpawn and expose abortProcessTree(pid) kill switch
├── telemetry/                                         [NEW MODULE]
│   ├── persist-queue.ts                               [CREATED]  Debounced micro-batch queue (2000ms / 50 items) for SQLite WAL inserts
│   ├── execution-registry.ts                          [CREATED]  In-memory active execution registry & O(1) circular velocity buffer
│   ├── telemetry-broadcaster.ts                       [CREATED]  100ms micro-throttled SSE pulse aggregator & snapshot hydrator
│   └── telemetry-store.ts                             [CREATED]  Query repository for paginated ledger, metrics summary & breakdown
├── utils/
│   └── token-estimator.ts                             [MODIFIED] Adaptive multilingual char heuristic (ASCII 3.7 / Unicode 2.2) & delta counter
├── router/
│   ├── pipeline-executor.ts                           [MODIFIED] Record failover breadcrumbs into execution registry and SSE
│   └── account-pool.ts                                [MODIFIED] Provide active slot saturation snapshot helper
└── api/
    ├── routes/
    │   ├── openai-chat.ts                             [MODIFIED] Hook into token estimators, demuxer deltas, PID binding & queue flush
    │   ├── admin-events.ts                            [MODIFIED] Emit radar:snapshot on SSE client connection
    │   └── admin-telemetry.ts                         [CREATED]  REST endpoints for ledger, active snapshot, summary & emergency abort
    └── server.ts                                      [MODIFIED] Register admin-telemetry routes and graceful queue flush on shutdown

apps/web/src/
├── lib/
│   └── api-client.ts                                  [MODIFIED] Added Telemetry types and API methods (summary, breakdown, ledger, abort, probe)
├── components/
│   └── layout/
│       ├── Sidebar.tsx                                [MODIFIED] Retire Chat Playground; add "Fleet Radar & Ledger" nav tab with Radar icon
│       └── StatusBadge.tsx                            [MODIFIED] Add status badge variants for REASONING (purple pulsing) and SATURATED (red pulsing)
├── views/
│   ├── PlaygroundView.tsx                             [RETIRED]  Removed from navigation; redirected or replaced by TelemetryStationView
│   └── TelemetryStationView.tsx                       [CREATED]  4-zone Obsidian Cyberdeck HUD (KPIs, Saturation Matrix, Live Radar, Historical Ledger)

tests/
├── unit/
│   ├── telemetry-persist-queue.test.ts                [CREATED]  Unit test for batch flushing, retry policy, backpressure and graceful flush
│   ├── token-speedometer.test.ts                      [CREATED]  Unit test for circular velocity buffer, adaptive char heuristic and prompt tally
│   ├── process-containment-kill.test.ts               [CREATED]  Unit test for onSpawn PID binding and <200ms process tree kill switch
│   └── admin-telemetry-routes.test.ts                 [CREATED]  Integration test for admin REST endpoints, filters, pagination and abort
└── e2e/
    ├── telemetry-concurrency-stress.test.ts           [CREATED]  50 concurrent requests stress test verifying zero SQLITE_BUSY errors
    └── telemetry-acceptance.test.ts                   [CREATED]  Full acceptance suite verifying playground deprecation, SSE hydration & OpenAI compat
```

---

## Architectural Principles & Guarantees

1. **Zero External Infrastructure Dependency:** No Prometheus, Grafana, OpenTelemetry, Redis, or Kafka. The gateway operates 100% self-contained using Fastify, Node.js memory structures, and embedded SQLite.
2. **Event Loop Non-Blocking Guarantee:** Telemetry computations are strictly $O(1)$ operations (circular ring buffer index wrapping, byte length division). SSE pushes are micro-throttled at 100ms. Database writes are micro-batched, preventing I/O stalls on the Fastify thread.
3. **Deterministic Subprocess Isolation:** Every CLI spawn binds to a dedicated account sandbox and is encapsulated in an OS-level isolation container (Win32 Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` or POSIX detached process group).
4. **OpenAI Protocol Invariance:** The public `/v1/chat/completions` API behavior remains 100% compliant with standard OpenAI SSE stream and JSON unary response contracts.
