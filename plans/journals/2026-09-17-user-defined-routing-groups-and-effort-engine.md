# Technical Journal: User-Defined Routing Groups, 3-Tier Reasoning Effort Engine & Obsidian Cyberdeck Studio

- **Date:** 2026-09-17
- **Status:** Complete & Verified
- **Monorepo Build:** 2/2 packages built cleanly (`@cli-to-api/gateway`, `@cli-to-api/web`)
- **Automated Test Suite:** 28 test files passed (108/108 tests passing, 100%)

## Core Problems Solved

1. **Replaced Rigid Hardcoded Auto Tiers with User-Defined Routing Groups:**
   - Decommissioned the assumption that the gateway must dictate automatic load balancing across 5 fixed tiers (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`).
   - Enabled users to create custom Routing Groups (`routing_pipelines` table in SQLite WAL) with customizable fallback policies (`cascade_failover` vs `strict_reject`).
   - Each group is projected as an OpenAI-compatible virtual model (`GET /v1/models`) with metadata including `is_group: true`, `default_effort`, and target counts.

2. **Multi-Level Granular Targeting (By Account, By CLI, By Model):**
   - Targets within a group can target:
     1. A specific provisioned account (`targetAccountId`, e.g. `codex-vip-1`).
     2. An entire CLI adapter (`adapterId`, e.g. `claude-code`, load balancing across all ready accounts).
     3. A specific model within an adapter (`adapterId/modelId`).
   - Configured with Priority Tiers (P0 Primary, P1 Fallback, P2 Disaster Recovery) and NGINX Smooth Weighted Round-Robin (SWRR) weights (1-100) for smooth interleaving.

3. **3-Tier Context-Aware Reasoning Effort Resolver:**
   - Bridges OpenAI SDK's `reasoning_effort: "low" | "medium" | "high"` with native CLI execution parameters.
   - Strict 3-tier precedence hierarchy:
     `Request Ingress Override > Target Link Override > Group Default Effort`.
   - Transpiled dynamically via `compileEffortFlags()`:
     - `claude-code` $\to$ `["--thinking-budget", "2048" | "8192" | "16384" | "32768"]`
     - `codex-cli` $\to$ `["--reasoning-effort", "low" | "medium" | "high"]`
     - `omp-cli` $\to$ `["--effort", "low" | "medium" | "high"]`
   - Preserves all effort flags through temporary files when long prompts ($>4,000$ characters) trigger Windows command length protection.

4. **Runtime Spawn-Probe Transparent Failover (`DynamicTargetPipelineExecutor`):**
   - Catches spawn-time crashes and immediate 429 rate limits in a 150ms pre-stream safety window before any bytes are transmitted to the client.
   - Automatically releases the failing account slot, places it in cooldown, logs the event to `failover_events`, and cascades to the next candidate in the priority chain without breaking the client connection.
   - Establishes a Cutoff Point once the first byte is emitted to protect against broken or duplicated streaming chunks.

5. **Obsidian Cyberdeck Studio UI/UX (`ak-ui-ux-pro-max`):**
   - **`ModelCatalogView.tsx`**:
     - Dual-tab navigation between "User Routing Groups" and "Discovered Models & Adapters".
     - Cards grid displaying groups, priority fallback chains, and default effort badges.
     - Interactive `RoutingGroupModal` with accessible backdrop, escape dismiss, target builder, SWRR weights, and effort overrides.
   - **`PlaygroundView.tsx`**:
     - Group-aware model dropdown distinguishing user groups with `⚡ User Routing Groups`.
     - Tactile 3-tier Reasoning Effort selector (`[Off]`, `[Low]`, `[Medium]`, `[High]`) with semantic color indicators.
     - Live Route Breadcrumb Trail inspector displaying resolved execution path and active targets.

## Verification Artifacts
- Unit Tests: `tests/unit/routing-groups-db.test.ts` (1/1 passing)
- Unit Tests: `tests/unit/swrr-load-balancer.test.ts` (3/3 passing)
- Unit Tests: `tests/unit/effort-transpiler.test.ts` (6/6 passing)
- E2E Tests: `tests/e2e/routing-groups-pipeline.test.ts` (5/5 passing)
- Full Monorepo Test Suite: `pnpm test` (28/28 test files, 108/108 tests passing, 100%)
- Full Production Monorepo Build: `pnpm --filter gateway build && pnpm --filter web build` (clean compilation with 0 errors)
