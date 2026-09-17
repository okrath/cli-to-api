---
phase: 1
title: "Schema Migration & Pipeline Data Layer"
status: completed
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Schema Migration & Pipeline Data Layer

## Objective
Define the SQLite WAL Drizzle schema for user-defined routing groups, targets, and failover audit records, apply non-destructive additive migrations, and provide a clean data access layer for CRUD operations.

## Detailed Tasks

1. **Schema Definition (`apps/gateway/src/db/schema.ts`)**:
   - Define `targetKindEnum = ["ACCOUNT", "CLI", "MODEL", "PIPELINE"] as const`.
   - Define `effortLevelEnum = ["none", "low", "medium", "high", "xhigh"] as const`.
   - Define table `routingPipelines`:
     - `id`: text primary key (e.g. `group:deep-code` or `group:fast`)
     - `name`: text not null
     - `description`: text nullable
     - `virtualModelId`: text not null unique
     - `defaultEffortLevel`: text enum default `"medium"`
     - `fallbackPolicy`: text enum `["cascade_failover", "strict_reject"]` default `"cascade_failover"`
     - `maxPipelineDepth`: integer default 3
     - `isEnabled`: integer boolean default true
     - `createdAt`, `updatedAt`
   - Define table `pipelineTargets`:
     - `id`: text primary key (UUID)
     - `pipelineId`: text references `routingPipelines.id` on delete cascade
     - `targetKind`: text enum `["ACCOUNT", "CLI", "MODEL"]` default `"MODEL"`
     - `priorityTier`: integer default 1 (1 = P0, 2 = P1, 3 = P2)
     - `weight`: integer default 100
     - `adapterId`: text references `adapters.id` on delete cascade
     - `modelId`: text not null
     - `targetAccountId`: text nullable references `accounts.id` on delete set null
     - `effortOverride`: text enum nullable
     - `isEnabled`: integer boolean default true
     - `createdAt`
   - Define table `failoverEvents`:
     - `id`: integer primary key autoIncrement
     - `pipelineId`: text not null
     - `requestId`: text not null
     - `fromAccountId`: text not null
     - `toAccountId`: text not null
     - `triggerReason`: text not null
     - `failoverLatencyMs`: integer default 0
     - `timestamp`

2. **Additive Safe Migration (`apps/gateway/src/db/migrate.ts`)**:
   - Check if `routing_pipelines`, `pipeline_targets`, `failover_events` exist; create them if missing.
   - Verify WAL mode and foreign key pragmas.

3. **Data Access Repository / Store**:
   - Provide clean typed query functions for:
     - `listPipelines()`, `getPipelineById()`, `getPipelineByVirtualModel()`
     - `createPipeline()`, `updatePipeline()`, `deletePipeline()`
     - `listPipelineTargets(pipelineId)`, `setPipelineTargets(pipelineId, targets)`
     - `recordFailoverEvent()`

4. **Unit Verification (`tests/unit/routing-groups-db.test.ts`)**:
   - Test CRUD for routing pipelines and nested targets.
   - Verify cascade delete when a pipeline is removed.
   - Verify unique constraint on `virtualModelId`.

## Verify
- `pnpm test tests/unit/routing-groups-db.test.ts` passes with 100% success.
