---
title: "Dynamic CLI Discovery, Zero-Phantom Lifecycle & Universal AI CLI Extensibility (omp, devin) with UI/UX Pro Max Cyber-Deck"
description: "Eliminates phantom accounts and empty sandboxes for uninstalled CLIs, introduces reactive host binary probing with hot-reload, enables arbitrary AI CLI onboarding (omp, devin), and upgrades the Obsidian Cyber-Deck console to AK UI/UX Pro Max standards."
status: pending
priority: P1
effort: "5d"
branch: main
tags: [architecture, discovery, ui-ux, load-balancer, sandboxes, sqlite, adapters]
blockedBy: []
blocks: []
created: 2026-09-16
---

# Dynamic CLI Discovery, Zero-Phantom Lifecycle & Universal AI CLI Extensibility

## Executive Summary

`cli-to-api` transforms user-installed AI CLIs into OpenAI-compliant REST and SSE streaming endpoints. However, the initial substrate eagerly instantiates default accounts (`*-acc-01`) and directory jails for every declarative YAML file in `./adapters/`, regardless of whether the binary is actually installed on the host system. This creates phantom accounts in SQLite, dead filesystem sandboxes, catalog clutter, and routing failures (`spawn ENOENT`).

This implementation plan delivers a production-grade **Blueprint-Instance Separation Architecture with Reactive Discovery & UI/UX Pro Max Cyber-Deck Studio**:
1. **Zero-Phantom Invariant:** Default accounts and sandbox jails are provisioned strictly for verified, physically installed CLIs.
2. **Tri-State Host Discovery:** Decouples static templates (Blueprints) from host presence (`INSTALLED`, `NOT_INSTALLED`, `DEGRADED`) across Windows (`PATHEXT`, `%APPDATA%\npm`, `%LOCALAPPDATA%\pnpm`, Scoop) and POSIX (`$PATH`, Homebrew, Cargo).
3. **Dynamic Catalog & Routing Guard:** `/v1/models` and virtual auto-tiers (`auto-*`) project only healthy, installed capabilities. Requests targeting uninstalled CLIs return instant HTTP 404 OpenAI envelopes without spawning zombie processes.
4. **Universal AI CLI Onboarding (`omp`, `devin`):** Supports dual-directory resolution (`./adapters/` + `$DATA_DIR/adapters/`), `fs.watch` hot-reloading, pre-bundled recipes for `omp` and `devin`, and a dry-run test probe API (`POST /api/adapters/probe`).
5. **Legacy Phantom Reconciler:** Auto-sweeps 0-request phantom accounts on startup, purging empty directories while preserving historical metrics.
6. **Obsidian Cyber-Deck Console Upgrade (`/skill:ak-ui-ux-pro-max`):** High-density dark aesthetics (`#090B0F` canvas, `#12141C` surface, `#6366F1` brand), tabbed Fleet Management (Active Fleet vs Available Catalog), Custom CLI Studio modal with syntax validation and live probe runner, full keyboard navigation, and WCAG AA 4.5:1 contrast compliance.

---

## Architectural State Machine

```
                                  [ YAML Manifest Sources ]
                         Builtin: adapters/*.yaml  |  Custom: $DATA_DIR/adapters/*.yaml
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │ Enhanced Binary Resolver  │
                               │  - Windows: PATH + PATHEXT│
                               │  - POSIX: PATH + Homebrew │
                               │  - NPM / PNPM / Cargo     │
                               └─────────────┬─────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │                                           │
             [ isInstalled = true ]                      [ isInstalled = false ]
                       │                                           │
                       ▼                                           ▼
          ┌─────────────────────────┐                 ┌─────────────────────────┐
          │    Status: INSTALLED    │                 │  Status: NOT_INSTALLED  │
          ├─────────────────────────┤                 ├─────────────────────────┤
          │ • Provision default acc │                 │ • ZERO accounts created │
          │ • Create sandbox jail   │                 │ • ZERO sandbox folders  │
          │ • Publish to /v1/models │                 │ • Omit from /v1/models  │
          │ • Route auto-* tiers    │                 │ • Exclude from auto-*   │
          │ • Green badge in UI     │                 │ • Install hint in UI    │
          └─────────────────────────┘                 └─────────────────────────┘
```

---

## Phased Roadmap Overview

| Phase | Title | Focus | Effort |
|:---:|---|---|:---:|
| **1** | [Schema Migration & Binary Resolver](./phase-01-schema-migration-binary-resolver.md) | Drizzle SQLite schema evolution, `isInstalled` boolean detection, multi-path resolver | 1d |
| **2** | [Discovery Engine & Legacy Reconciler](./phase-02-discovery-engine-legacy-reconciler.md) | Bounded version prober, `fs.watch` hot-reloader, startup phantom auto-cleaner | 1d |
| **3** | [Model Catalog & Ingress Guarding](./phase-03-catalog-projection-routing-guard.md) | Dynamic `/v1/models` projection, virtual tier candidate filtering, instant 404 guard | 1d |
| **4** | [Universal Recipes & Dry-Run API](./phase-04-universal-recipes-dry-run-probe.md) | Pre-bundled `omp-cli.yaml`, `devin-cli.yaml`, `POST /api/adapters/probe` test runner | 0.5d |
| **5** | [UI/UX Pro Max Cyber-Deck Upgrades](./phase-05-ui-ux-cyberdeck-studio-upgrade.md) | AccountsView Fleet tabs, ModelCatalogView availability, Custom CLI Studio modal | 1d |
| **6** | [Automated Verification & Acceptance Tests](./phase-06-verification-suite-acceptance.md) | Unit, integration, and E2E acceptance tests for dynamic discovery & zero-phantom SLA | 0.5d |

---

## Target File Ownership & Changes

```
apps/gateway/src/
├── db/
│   ├── schema.ts                    [MODIFY] Add isInstalled, status, detectedVersion, lastProbedAt, isCustom to adapters; CLI_MISSING to accounts
│   └── migrate.ts                   [MODIFY] Additive SQLite DDL migration for new columns
├── adapters/
│   ├── resolver.ts                  [MODIFY] Multi-path binary resolution with isInstalled: boolean and null fallback
│   ├── prober.ts                    [CREATE] Bounded version probe (<=1.5s) under Win32 Job Object / POSIX group
│   ├── watcher.ts                   [CREATE] fs.watch hot-reload debouncer for builtin & custom adapter dirs
│   ├── reconciler.ts                [CREATE] Legacy phantom account auto-pruner and orphan sandbox cleaner
│   ├── loader.ts                    [MODIFY] Multi-directory loader (builtin + $DATA_DIR/adapters) with discovery sync
│   └── registry.ts                  [MODIFY] Installed provider query helpers and capability filtering
├── router/
│   ├── model-catalog.ts             [MODIFY] Filter /v1/models by adapter.isInstalled && healthyAccounts > 0
│   └── load-balancer.ts             [MODIFY] Guard target selection with AdapterNotInstalledError (HTTP 404)
├── api/routes/
│   ├── admin-adapters.ts            [MODIFY] Endpoints: GET /api/adapters, POST /api/adapters/probe, POST /api/adapters/scan, POST /api/adapters/cleanup-orphans
│   └── admin-accounts.ts            [MODIFY] Guard account creation against uninstalled adapters (with force flag)
└── index.ts                         [MODIFY] Gated bootstrap: only provision accounts for verified installed CLIs

adapters/
├── omp-cli.yaml                     [CREATE] Pre-bundled recipe for Open Multi-Model Prompt CLI (pipe mode)
└── devin-cli.yaml                   [CREATE] Pre-bundled recipe for Cognition Devin Autonomous CLI (pty mode)

apps/web/src/
├── components/
│   ├── adapters/
│   │   ├── CustomAdapterStudioModal.tsx [CREATE] Guided wizard with YAML editor, Archetype presets, live test runner
│   │   └── AdapterCard.tsx              [CREATE] Dual-state card for installed vs dormant recipes with 1-click install copy
│   └── layout/
│       └── StatusBadge.tsx          [MODIFY] Add NOT_INSTALLED, UNPROVISIONED, and DEGRADED badges
├── views/
│   ├── AccountsView.tsx             [MODIFY] Tabbed Fleet: Active Accounts vs Catalog Recipes; zero phantom cards
│   └── ModelCatalogView.tsx         [MODIFY] Dynamic filter for installed vs uninstalled model availability
└── lib/
    └── api-client.ts                [MODIFY] Add probeAdapter, scanAdapters, cleanupOrphans, createCustomAdapter

tests/
├── unit/
│   ├── resolver.test.ts             [MODIFY] Test positive and negative resolution across PATHEXT
│   ├── prober.test.ts               [CREATE] Test bounded timeout and Job Object termination of version probes
│   └── reconciler.test.ts           [CREATE] Test 0-request phantom deletion vs active account preservation
└── e2e/
    ├── custom-adapter.test.ts       [CREATE] End-to-end custom adapter upload, probe, and prompt execution
    └── zero-phantom.test.ts         [CREATE] Clean-boot assertion verifying 0 accounts for uninstalled CLIs
```

---

## Success Criteria & Verification Gates

1. **Clean-Boot Zero-Phantom Gate:** On a system with only `claude` and `codex` installed, `accounts` table contains $\le 2$ rows, and `data/sandboxes/opencode-cli` does not exist.
2. **Sub-15ms Route Pre-Flight Gate:** Calling `/v1/chat/completions` with `"model": "opencode/deepseek-r1"` returns HTTP 404 in $\le 15\text{ms}$ without spawning child processes or leaking slot locks.
3. **Dynamic Hot-Discovery Gate:** Installing a CLI globally while the gateway runs and triggering `POST /api/adapters/scan` detects the executable and updates `/v1/models` in $<500\text{ms}$ with zero daemon restarts.
4. **Custom Extensibility Gate:** Adding `omp-cli.yaml` or `devin-cli.yaml` enables routing to their respective models immediately upon binary verification.
5. **UI/UX Pro Max Compliance Gate:** Web Console passes WCAG AA 4.5:1 contrast check, displays high-density Obsidian Cyber-Deck layout, provides responsive keyboard navigation, and enables 1-click custom CLI test probing.
