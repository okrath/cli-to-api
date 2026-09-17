---
phase: 5
title: "E2E Verification & Acceptance Suite"
status: completed
priority: P1
effort: "0.25d"
dependencies: [
  "phase-01-schema-migration-and-pipeline-data-layer",
  "phase-02-router-engine-swrr-and-dynamic-pipeline-executor",
  "phase-03-reasoning-effort-compilation-and-ingress-api",
  "phase-04-obsidian-cyberdeck-routing-studio-and-playground-ui"
]
---

# Phase 5: E2E Verification & Acceptance Suite

## Objective
Implement end-to-end integration tests validating all 7 Acceptance Criteria from the Bounded Contract, ensuring zero regression across the existing 24 test suites.

## Detailed Tasks

1. **E2E Test Suite (`tests/e2e/routing-groups-pipeline.test.ts`)**:
   - **Scenario 1 (AC-1):** Create routing group via API, verify projection in `GET /v1/models`.
   - **Scenario 2 (AC-2):** Send chat completion request targeting a group with `reasoning_effort: high`, verify mock CLI process spawned with `--thinking-budget 16000` / `--reasoning-effort high`.
   - **Scenario 3 (AC-3):** Simulate primary target in cooldown, verify transparent dispatch to secondary target in $\le 1.5\text{ms}$.
   - **Scenario 4 (AC-4):** Simulate primary target spawn exit code 1 / 429 within 100ms, verify automatic failover to P1 target and record in `failover_events`.
   - **Scenario 5 (AC-5):** Send 50 concurrent requests, verify SWRR distribution ratio.
   - **Scenario 6 (AC-6):** Send prompt >4,000 characters with `reasoning_effort`, verify temp file generated and effort flags preserved.

2. **Full Regression Suite**:
   - Run `pnpm test` across all unit and e2e test files.
   - Ensure 100% tests pass (expecting >100 tests passing).

## Verify
- `pnpm test` passes cleanly with 0 failures.
