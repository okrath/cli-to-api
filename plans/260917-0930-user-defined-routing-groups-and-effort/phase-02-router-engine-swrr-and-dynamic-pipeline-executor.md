---
phase: 2
title: "Router Engine, SWRR & Dynamic Pipeline Executor"
status: completed
priority: P1
effort: "0.5d"
dependencies: ["phase-01-schema-migration-and-pipeline-data-layer"]
---

# Phase 2: Router Engine, SWRR & Dynamic Pipeline Executor

## Objective
Implement Smooth Weighted Round-Robin (SWRR) target selection across priority tiers, the 3-tier Context-Aware Effort Resolver, and the runtime `DynamicTargetPipelineExecutor` with 150ms spawn-probe failover.

## Detailed Tasks

1. **SWRR Load Balancer Algorithm**:
   - For a given priority tier with multiple targets, calculate current weights using NGINX Smooth Weighted Round-Robin:
     - Each candidate adds its configured `weight` to its `currentWeight`.
     - Select the candidate with highest `currentWeight`.
     - Deduct `totalWeight` from the selected candidate's `currentWeight`.
   - Combine with healthy account availability (`status === "READY"` and `activeSlots < maxSlots`).

2. **Flow-Chain Target Resolution (`apps/gateway/src/router/load-balancer.ts`)**:
   - Update `resolveTarget(requestedModel, pinnedAccountId)`:
     - Check if `requestedModel` corresponds to an active `routing_pipeline` (either `virtual_model_id` or `id`).
     - If so, load enabled targets ordered by `priorityTier ASC`.
     - Group targets by `priorityTier` (P0 = 1, P1 = 2, P2 = 3...).
     - Build an ordered execution chain of candidate targets.
     - For each target, resolve the effective effort level using 3-tier precedence:
       `requestEffort ?? target.effortOverride ?? pipeline.defaultEffortLevel`.

3. **Dynamic Target Pipeline Executor (`apps/gateway/src/router/pipeline-executor.ts`)**:
   - Execute candidates in the chain sequentially (up to `maxFailovers = 3`).
   - Acquire semaphore slot for candidate account.
   - Spawn-probe safety window:
     - Attach listeners to detect immediate exit code != 0 or rate limit errors within the first 150ms.
     - If error occurs before any data byte is emitted to client:
       - Release slot.
       - Place failing account into cooldown.
       - Log failover event to SQLite `failover_events`.
       - Transparently try next candidate in the chain.
     - If first byte is emitted or process survives 150ms:
       - Establish Cutoff Point (disable failover to prevent broken/duplicate streams).

4. **Model Catalog Virtual Group Projection (`apps/gateway/src/router/model-catalog.ts`)**:
   - In `getOpenAiModelsList()`:
     - Query active `routing_pipelines`.
     - Project each group as an `OpenAiModelObject` with `owned_by: "custom-group"`, metadata including targets count, default effort, and priority tiers.

5. **Unit Verification (`tests/unit/swrr-load-balancer.test.ts`)**:
   - Verify SWRR distribution ratio (e.g. 70/30 across 100 iterations).
   - Verify priority tier fallback when P0 accounts are busy or in cooldown.
   - Verify 3-tier effort resolution precedence.

## Verify
- `pnpm test tests/unit/swrr-load-balancer.test.ts` passes with 100% success.
