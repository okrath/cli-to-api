---
title: "User-Defined Routing Groups & 3-Tier Reasoning Effort Engine"
status: completed
priority: P1
effort: "2d"
branch: main
tags: [routing-groups, dynamic-pipeline, failover, reasoning-effort, thinking-budget, swrr, sqlite-wal, cyberdeck-ui, ak-ui-ux-pro-max]
blockedBy: []
blocks: []
created: 2026-09-17
---

# User-Defined Routing Groups & 3-Tier Reasoning Effort Engine

## Executive Summary

Replaces the rigid, hardcoded "Virtual Auto Tiers" (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`) with **User-Defined Routing Groups (Dynamic Target Pipelines)**, while integrating a **3-Tier Context-Aware Reasoning Effort Resolver** that bridges OpenAI SDK's `reasoning_effort` (`low`, `medium`, `high`) with local CLI parameters (`--thinking-budget` for Claude Code, `--reasoning-effort` for Codex CLI, `--effort` for OMP).

Adheres strictly to the **`ak-ui-ux-pro-max`** Cyberdeck Obsidian Developer design standard for the Web Console (`ModelCatalogView.tsx` and `PlaygroundView.tsx`).

---

## Phased Roadmap

| Phase | Title | Objective | Effort | Status |
|:---:|---|---|:---:|:---:|
| **1** | [Schema Migration & Pipeline Data Layer](./phase-01-schema-migration-and-pipeline-data-layer.md) | SQLite Drizzle tables `routing_pipelines`, `pipeline_targets`, `failover_events`, safe additive migrations, CRUD helpers | 0.5d | completed |
| **2** | [Router Engine, SWRR & Dynamic Pipeline Executor](./phase-02-router-engine-swrr-and-dynamic-pipeline-executor.md) | Flow-Chain target resolution, SWRR load balancing within priority tiers, 150ms spawn-probe failover loop, 3-tier effort resolution | 0.5d | completed |
| **3** | [Reasoning Effort Compilation & Ingress API](./phase-03-reasoning-effort-compilation-and-ingress-api.md) | Map `reasoning_effort` to CLI flags in `prompt-transport.ts`, preserve flags through `temp_file`, expose Admin REST endpoints for routing groups | 0.25d | completed |
| **4** | [Obsidian Cyberdeck Routing Studio & Playground UI](./phase-04-obsidian-cyberdeck-routing-studio-and-playground-ui.md) | Build interactive Routing Studio in `ModelCatalogView.tsx` with modal target builder, add 3-tier Reasoning Effort selector and Live Breadcrumb Trace in `PlaygroundView.tsx` per `ak-ui-ux-pro-max` | 0.5d | completed |
| **5** | [E2E Verification & Acceptance Suite](./phase-05-e2e-verification-and-acceptance-suite.md) | Comprehensive integration tests verifying routing by Account/CLI/Model, SWRR balancing, spawn-time failover, effort flag injection, and zero regressions | 0.25d | completed |

---

## File Ownership & Changes

```
apps/gateway/src/
├── db/
│   ├── schema.ts                                      [MODIFIED] Added routingPipelines, pipelineTargets, failoverEvents
│   └── migrate.ts                                     [MODIFIED] Additive safe migrations for routing tables
├── router/
│   ├── model-catalog.ts                               [MODIFIED] Project user-defined groups as virtual models
│   ├── load-balancer.ts                               [MODIFIED] Integrated Flow-Chain routing and SWRR
│   ├── pipeline-store.ts                              [CREATED] PipelineStore CRUD and failover audit recording
│   ├── swrr-balancer.ts                               [CREATED] NGINX Smooth Weighted Round-Robin load balancer
│   └── pipeline-executor.ts                           [CREATED] DynamicTargetPipelineExecutor with spawn-probe failover
├── supervisor/
│   ├── types.ts                                       [MODIFIED] Added effortLevel to ProcessSpawnOptions and ExecutionContext
│   ├── process-manager.ts                             [MODIFIED] Propagate effortLevel to invocation
│   └── prompt-transport.ts                            [MODIFIED] Dynamic compileEffortFlags, preserve through temp_file
└── api/routes/
    ├── openai-chat.ts                                 [MODIFIED] Extract reasoning_effort from body / header
    ├── admin-groups.ts                                [CREATED] REST CRUD API for routing groups & targets
    └── server.ts                                      [MODIFIED] Register admin-groups route

apps/web/src/
├── lib/
│   └── api-client.ts                                  [MODIFIED] Routing Groups API client methods and types
├── components/
│   └── routing/
│       └── RoutingGroupModal.tsx                      [CREATED] Accessible Obsidian Cyberdeck modal builder (ak-ui-ux-pro-max)
└── views/
    ├── ModelCatalogView.tsx                           [MODIFIED] Overhaul with Routing Groups Studio & Target Builder (ak-ui-ux-pro-max)
    └── PlaygroundView.tsx                             [MODIFIED] 3-tier Reasoning Effort deck & Live Route Breadcrumb Trace

tests/
├── unit/
│   ├── routing-groups-db.test.ts                      [CREATED] Test schema, CRUD, and migrations
│   ├── swrr-load-balancer.test.ts                     [CREATED] Test SWRR weights, priority tiers, and 3-tier effort resolution
│   └── effort-transpiler.test.ts                      [CREATED] Test compilation of effort levels to CLI flags and Admin REST API
└── e2e/
    └── routing-groups-pipeline.test.ts                [CREATED] Full end-to-end integration and failover tests
```
