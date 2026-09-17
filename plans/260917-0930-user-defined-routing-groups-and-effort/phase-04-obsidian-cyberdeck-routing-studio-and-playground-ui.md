---
phase: 4
title: "Obsidian Cyberdeck Routing Studio & Playground UI"
status: completed
priority: P1
effort: "0.5d"
dependencies: ["phase-03-reasoning-effort-compilation-and-ingress-api"]
---

# Phase 4: Obsidian Cyberdeck Routing Studio & Playground UI

## Objective
Implement an interactive, developer-grade Routing Studio in `ModelCatalogView.tsx` and upgrade `PlaygroundView.tsx` with a 3-tier Reasoning Effort selector and Live Route Breadcrumb Trace, adhering strictly to **`ak-ui-ux-pro-max`** design principles.

## Detailed Tasks

1. **Frontend API Client Integration (`apps/web/src/lib/api-client.ts`)**:
   - Add TypeScript interfaces: `RoutingGroupData`, `PipelineTargetData`, `CreateRoutingGroupInput`.
   - Add API methods:
     - `getRoutingGroups(): Promise<RoutingGroupData[]>`
     - `createRoutingGroup(input: CreateRoutingGroupInput): Promise<RoutingGroupData>`
     - `updateRoutingGroup(id: string, input: Partial<CreateRoutingGroupInput>): Promise<RoutingGroupData>`
     - `deleteRoutingGroup(id: string): Promise<{ success: boolean }>`

2. **ModelCatalogView Redesign (`apps/web/src/views/ModelCatalogView.tsx`)**:
   - **Tab Navigation**:
     - "Routing Groups Studio" (Primary operational view)
     - "Raw CLI Models & Adapters" (Secondary discovery view)
   - **Routing Groups Studio View**:
     - Header with "Create Routing Group" CTA button (`bg-brand`, keyboard accessible).
     - Cards Grid displaying active user-defined groups:
       - Visual tier indicators (P0, P1, P2) with high-contrast semantic badges.
       - Default Reasoning Effort badge with distinct color (Low = Cyan, Medium = Violet, High = Amber).
       - Target count & live availability status.
       - Quick action buttons: Edit, Delete, Copy model ID.
   - **Interactive Create/Edit Group Modal (`CreateRoutingGroupModal.tsx`)**:
     - Accessible dialog with escape key dismiss and focus trap.
     - Group Info: Name, ID (auto-slugged), Description.
     - Default Effort Level selector (None, Low, Medium, High, X-High).
     - Fallback Policy selector (Cascade Failover vs Strict Reject).
     - Target Builder list with 3 selection modes:
       - **By Account**: Select from active provisioned accounts.
       - **By CLI / Adapter**: Select installed adapter.
       - **By Specific Model**: Select adapter + model.
       - Set Priority Tier (P0 = 1, P1 = 2, P2 = 3), Weight (1-100), and optional Effort Override.
     - Form validation with inline error messages and loading state.

3. **PlaygroundView Upgrade (`apps/web/src/views/PlaygroundView.tsx`)**:
   - **Group-Aware Model Selector**:
     - Display user groups with distinct `[GROUP]` badge and visual grouping.
   - **Tactile 3-Tier Reasoning Effort Deck**:
     - Segmented control / pill buttons: `[Low]` (Cyan), `[Medium]` (Violet), `[High]` (Amber).
     - Tooltip explaining token budget / reasoning depth.
     - Seamlessly sent with request as `reasoning_effort`.
   - **Live Route Breadcrumb Inspector**:
     - Displays actual execution path:
       `Route: [group:deep-code] -> [Tier P0] -> [codex-cli/codex-acc-1] | Effort: High (16k tokens)`.
     - Shows failover notification toast if a transparent switch occurred.

4. **Design Quality Standards (`ak-ui-ux-pro-max`)**:
   - Palette: Obsidian Cyberdeck (`#0F1117`, `#181C26`, `#222738`, violet `#8B5CF6`, cyan `#06B6D4`, amber `#F59E0B`).
   - Contrast ratio $\ge 4.5:1$ across text and badges.
   - Visible focus states on interactive buttons and inputs.
   - Meaningful empty states when no groups exist with one-click creation guide.
   - SVG icons exclusively from `lucide-react`.

## Verify
- Open Web Console in browser, test creating a group, editing targets, selecting group in Playground, and firing prompt with `reasoning_effort: high`.
