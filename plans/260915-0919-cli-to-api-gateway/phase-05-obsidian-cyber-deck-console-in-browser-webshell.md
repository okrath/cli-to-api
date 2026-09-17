---
phase: 5
title: "Obsidian Cyber-Deck Web Management Console & In-Browser WebShell (xterm.js)"
status: pending
priority: P1
effort: "2d"
dependencies: ["phase-01-substrate-engine-sqlite-wal-adapter-schema", "phase-03-multi-account-sandboxing-concurrency-cooldown", "phase-04-openai-api-gateway-intelligent-tier-router"]
---

# Phase 5: Obsidian Cyber-Deck Web Management Console & In-Browser WebShell (xterm.js)

## Goal
Build the developer management console adhering to AK UI/UX Pro Max standards with an Obsidian Cyber-Deck aesthetic (`#090B0F`), featuring a real-time fleet overview, a Model Catalog & Routing Studio, an Account Manager, and an in-browser WebShell powered by `@xterm/xterm` over WebSocket to enable direct CLI login without host terminal access.

## Files to Create / Modify
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/index.css`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/components/layout/Header.tsx`
- Create: `apps/web/src/components/layout/Sidebar.tsx`
- Create: `apps/web/src/components/layout/StatusBadge.tsx`
- Create: `apps/web/src/components/webshell/TerminalView.tsx`
- Create: `apps/web/src/views/DashboardView.tsx`
- Create: `apps/web/src/views/ModelCatalogView.tsx`
- Create: `apps/web/src/views/AccountsView.tsx`
- Create: `apps/web/src/views/WebShellView.tsx`
- Create: `apps/gateway/src/api/ws/webshell.ts`

## Tasks & Steps

### Task 5.1: React 19 & Tailwind v4 Obsidian Theme Setup
1. Initialize `apps/web/` using Vite with React 19 and TypeScript.
2. Configure Tailwind CSS v4 in `apps/web/src/index.css`:
   - Canvas: `#090B0F` (deep void)
   - Surface: `#12141C` (panels, cards)
   - Border: `#242B3B` (subtle hairline)
   - Brand Accent: `#6366F1` (electric indigo)
   - Status: `#10B981` (ready/healthy), `#F59E0B` (cooldown), `#EF4444` (error)
   - Tier Badges: `#06B6D4` (auto-low), `#3B82F6` (auto-medium), `#8B5CF6` (auto-high), `#EC4899` (auto-xhigh)
3. Install frontend libraries: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `lucide-react`, `@radix-ui/react-dialog`, `@radix-ui/react-select`.

### Task 5.2: WebSocket WebShell Backend (`apps/gateway/src/api/ws/webshell.ts`)
1. Register `@fastify/websocket` on `/api/ws/terminal`.
2. Extract `adapterId` and `accountId` from query parameters.
3. Provision/mount the account's sandbox directory (`provisionSandbox`).
4. Spawn an interactive PTY session via `node-pty` inside the sandbox workspace directory.
5. Pipe bidirectional PTY output to WebSocket and incoming WebSocket text to PTY.
6. Handle resize messages: `{ type: "resize", cols, rows }`.
7. Kill PTY process immediately upon socket close.

### Task 5.3: In-Browser WebShell Component (`TerminalView.tsx`)
1. Implement `apps/web/src/components/webshell/TerminalView.tsx`:
   - Mount xterm.js instance with `FitAddon` and `WebLinksAddon`.
   - Apply Cyber-Deck terminal color palette matching the web theme.
   - Connect to `/api/ws/terminal` with automatic reconnection on disconnect.
   - Add action buttons: "Run Login" (types `{adapterId} login\r`), "Whoami", "Clear Screen".
   - Support clicking OAuth verification URLs directly in the terminal output.

### Task 5.4: Fleet Overview Dashboard (`DashboardView.tsx`)
1. Implement `apps/web/src/views/DashboardView.tsx`:
   - System status indicators: Gateway uptime, port, active process slots.
   - Account Health Matrix: Grid of accounts with live status pills (`READY`, `BUSY`, `COOLDOWN`, `ERROR`).
   - Cooldown countdown timers with real-time second decrements.

### Task 5.5: Model Catalog & Routing Studio (`ModelCatalogView.tsx`)
1. Implement `apps/web/src/views/ModelCatalogView.tsx`:
   - Table of Virtual Auto Tiers (`auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`) displaying eligible model counts and active accounts.
   - Table of Namespaced Models displaying provider mappings (`codex/gpt-5.6-asta`, `opencode/gpt-5.6-asta`).

### Task 5.6: Account Manager View (`AccountsView.tsx`)
1. Implement `apps/web/src/views/AccountsView.tsx`:
   - List accounts with active concurrency slots, total request counts, and sandbox paths.
   - Add Account modal with adapter selector.
   - "Launch WebShell" button opening interactive terminal for the account.
   - "Clear Cooldown" button to manually reset throttled accounts.

## Todo
- [x] Initialize `apps/web/` with Vite, React 19, Tailwind v4
- [x] Configure Obsidian Cyber-Deck CSS tokens and dark palette
- [x] Implement `apps/gateway/src/api/ws/webshell.ts` (node-pty over WebSocket)
- [x] Implement `TerminalView.tsx` with xterm.js, auto-fit, and web-links
- [x] Implement `DashboardView.tsx` with fleet status and slot utilization gauges
- [x] Implement `ModelCatalogView.tsx` with virtual auto tiers and namespaced models
- [x] Implement `AccountsView.tsx` with sandbox explorer and cooldown controls
- [x] Verify frontend builds cleanly with 0 TypeScript errors

## Verification
- Run `pnpm --filter @cli-to-api/web build` and verify production assets compile without error.
- Open `http://localhost:8080/` in browser, navigate to Accounts, click "Launch WebShell", and verify interactive terminal responds to commands inside the isolated sandbox directory.
