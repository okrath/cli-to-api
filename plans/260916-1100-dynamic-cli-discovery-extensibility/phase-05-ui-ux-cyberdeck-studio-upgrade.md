---
phase: 5
title: "UI/UX Pro Max Obsidian Cyber-Deck Console Upgrade"
status: pending
priority: P1
effort: "1d"
dependencies: ["phase-01-schema-migration-binary-resolver", "phase-04-universal-recipes-dry-run-probe"]
---

# Phase 5: UI/UX Pro Max Obsidian Cyber-Deck Console Upgrade

## Goal
Upgrade the React 19 Web Management Console to **AK UI/UX Pro Max** design standards: eliminate visual clutter by refactoring `AccountsView.tsx` into a dual-tabbed Fleet View (Active Accounts vs Available Blueprints), add real-time status badges with install copy shortcuts, enhance `ModelCatalogView.tsx` with dynamic availability filters, and introduce the `CustomAdapterStudioModal` with Archetype presets and live dry-run testing.

---

## UI/UX Pro Max Design Intelligence Specification

### Design Foundations & Color Tokens
Following the **Modern Dark / Obsidian Cyber-Deck** palette:
- **Canvas / Void Background:** `#090B0F`
- **Surface / Deck Panels:** `#12141C`
- **Surface Hover:** `#1A1E29`
- **Border Subtle (Hairline):** `#242B3B`
- **Primary Brand Neon:** `#6366F1` (Electric Indigo) / Hover `#4F46E5`
- **Semantic Status Signals:**
  - `ACTIVE / READY`: `#10B981` (Emerald Green)
  - `NOT_INSTALLED`: `#64748B` (Muted Slate / Dashed Border)
  - `UNPROVISIONED`: `#F59E0B` (Cyber Amber / Needs Account)
  - `COOLDOWN`: `#F59E0B` (Amber with pulsing glow)
  - `ERROR / DEGRADED`: `#EF4444` (Ruby Crimson)

### Accessibility & Ergonomics Standards
- **Contrast:** Strict WCAG 2.1 Level AA compliance (minimum 4.5:1 for body text, 3:1 for large labels/borders).
- **Touch Targets:** Minimum $44 \times 44\text{px}$ touch target size on buttons, tabs, and interactive pills.
- **Keyboard Navigation:** Full Tab/Shift-Tab order, visible focus rings with 2px offset (`focus-visible:ring-2 focus-visible:ring-brand`), Escape to dismiss modals.
- **Transitions:** Micro-interactions bounded to $150\text{ms} - 300\text{ms}$ with `cubic-bezier(0.16, 1, 0.3, 1)`.

---

## Tasks Breakdown

### Task 5.1: Extend Frontend API Client (`apps/web/src/lib/api-client.ts`)
Add discovery endpoints to `apiClient`:
- `getAdapters(): Promise<AdapterData[]>` (enriched with `isInstalled`, `status`, `detectedVersion`, `lastProbedAt`)
- `scanAdapters(): Promise<{ scanned: number; installed: number; uninstalled: number }>`
- `probeAdapter(config: object): Promise<ProbeResult>`
- `createCustomAdapter(yamlContent: string): Promise<{ success: boolean }>`
- `cleanupOrphans(): Promise<{ purgedAccounts: number }>`

### Task 5.2: StatusBadge Enhancements (`apps/web/src/components/layout/StatusBadge.tsx`)
Support new adapter lifecycle states with geometric redundancy (color + icon + text):
- `INSTALLED / READY`: Emerald dot + "READY"
- `NOT_INSTALLED`: CircleOff icon + "NOT INSTALLED" (slate)
- `UNPROVISIONED`: AlertCircle icon + "NEEDS ACCOUNT" (amber)
- `DEGRADED / CLI_MISSING`: AlertTriangle icon + "CLI MISSING" (crimson)

### Task 5.3: AccountsView Fleet Refactor (`apps/web/src/views/AccountsView.tsx`)
Eliminate phantom account clutter:
1. **Header Actions:**
   - Add **"Scan Host for CLIs"** button (triggers `scanAdapters()`, spins indicator for 500ms).
   - Add **"Add Custom CLI"** button (opens Studio Modal).
   - Orphan cleanup banner: If accounts exist for missing CLIs, show dismissible alert with `[Clean Up Orphaned Sandboxes]` action.
2. **Dual-Tab Fleet Architecture:**
   - **Tab 1: Active Accounts ({count})**:
     - Renders verified account cards (`codex-cli-acc-01`, etc.) with slot counters, sandbox paths, Launch WebShell, and Clear Cooldown.
     - Zero phantom cards. Empty state provides clear guidance if no accounts are active.
   - **Tab 2: Available Catalog Blueprints ({count})**:
     - Displays cards for all registered blueprints (`claude-code`, `codex`, `opencode`, `grok`, `omp`, `devin`).
     - If installed: Shows green badge, detected path, and a **"Provision Account"** button.
     - If not installed: Shows slate badge, detected status, and a 1-click **"Copy Install Command"** snippet (e.g., `npm i -g @cognition-ai/devin`).

### Task 5.4: Custom CLI Studio Modal (`apps/web/src/components/adapters/CustomAdapterStudioModal.tsx`)
Create an interactive onboarding studio:
- **Archetype Presets Dropdown:**
  - "Interactive PTY Agent (e.g. Devin, Claude)"
  - "Piped Subcommand (e.g. OMP, Ollama, Codex)"
  - "Custom Script Wrapper"
  Selecting a preset scaffolds valid YAML into the editor.
- **YAML Editor:**
  - High-contrast monospace textarea with real-time Zod client-side validation.
- **Action Bar:**
  - **"Test Probe" Button:** Calls `POST /api/adapters/probe`. Displays live spinner, followed by detected binary path, execution latency (e.g., `142ms`), and stdout sample in a mini terminal preview.
  - **"Save & Register" Button:** Enabled only when YAML is valid. Saves manifest to `$DATA_DIR/adapters/` and auto-provisions if installed.

### Task 5.5: ModelCatalogView Availability Filtering (`apps/web/src/views/ModelCatalogView.tsx`)
- Add filter toggle: `[All Models] | [Installed & Ready Only]`.
- Add visual indicators for each model's provider installation status.
- Virtual Auto Tiers card displays healthy provider count (e.g., `"2 of 4 providers healthy"`).

---

## Verification Commands
```bash
# Verify web console builds cleanly
pnpm --filter @cli-to-api/web build

# Verify linting and typechecking
pnpm --filter @cli-to-api/web exec tsc --noEmit
```

## Definition of Done
- Web Console eliminates phantom accounts; displays distinct tabs for Active Accounts vs Available Blueprints.
- Custom CLI Studio modal allows drafting, live probing, and registering new tools (`omp`, `devin`).
- 100% compliant with AK UI/UX Pro Max design standards, contrast ratios, and touch-target sizes.
