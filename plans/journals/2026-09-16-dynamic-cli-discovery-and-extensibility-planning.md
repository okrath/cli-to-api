# Technical Journal: Dynamic CLI Discovery, Zero-Phantom Lifecycle & Universal AI Extensibility Planning

- **Date:** 2026-09-16
- **Context:** `cli-to-api` Architecture & Lifecycle Optimization
- **Skills Invoked:** `ak:brainstorm --ultra`, `ak:plan --ultra`, `/skill:ak-ui-ux-pro-max`

## 1. Problem Identification
1. **Phantom Accounts & Ghost Sandboxes:** Gateway startup in `apps/gateway/src/index.ts` eagerly created default account records (`*-acc-01`) and filesystem directories for every YAML adapter in `./adapters/`, even when the binary (such as `opencode` or `grok`) was not installed on the host.
2. **Catalog & Routing Poisoning:** `/v1/models` and virtual auto-tiers (`auto-*`) advertised models from uninstalled CLIs. When selected, requests crashed with `spawn ENOENT`.
3. **Extensibility Bottleneck:** Users lacked an automated, pluggable mechanism to register and use arbitrary newly installed AI CLIs (such as `omp` or `devin`) without editing internal daemon code.

## 2. Architectural Solution Designed
1. **Blueprint-Instance Separation:** Decouples declarative adapter capability contracts (Blueprints) from host presence (`INSTALLED`, `NOT_INSTALLED`, `DEGRADED`) and runtime sandboxes (Accounts).
2. **Deterministic Multi-Path Binary Resolver:** Checks host `PATH`, Windows `PATHEXT` (`.cmd`, `.bat`, `.ps1`, `.exe`), global package roots (npm, pnpm, Cargo, Scoop), and POSIX paths, returning an explicit `isInstalled: boolean` and `null` fallback.
3. **Guarded Bootstrap & Legacy Reconciler:** Auto-provisions accounts strictly for verified installed CLIs; purges 0-request legacy phantom accounts on boot while preserving active account history.
4. **Dynamic Catalog & Ingress Guard:** Filters `/v1/models` and virtual tiers; provides an instant ($\le 15\text{ms}$) HTTP 404 OpenAI envelope for uninstalled targets.
5. **Universal Recipes (`omp`, `devin`) & Dry-Run API:** Shipped recipes in `./adapters/` + `$DATA_DIR/adapters/` with hot-reload (`fs.watch`) and `POST /api/adapters/probe`.
6. **UI/UX Pro Max Obsidian Cyber-Deck Upgrades:** Dual-tabbed Fleet View (Active Accounts vs Available Catalog), Custom CLI Studio modal, 1-click install snippets, WCAG AA 4.5:1 contrast, and smooth 150-300ms micro-interactions.

## 3. Plan Artifacts Created
- `plans/260916-1100-dynamic-cli-discovery-extensibility/plan.md`
- `plans/260916-1100-dynamic-cli-discovery-extensibility/phase-01-schema-migration-binary-resolver.md`
- `plans/260916-1100-dynamic-cli-discovery-extensibility/phase-02-discovery-engine-legacy-reconciler.md`
- `plans/260916-1100-dynamic-cli-discovery-extensibility/phase-03-catalog-projection-routing-guard.md`
- `plans/260916-1100-dynamic-cli-discovery-extensibility/phase-04-universal-recipes-dry-run-probe.md`
- `plans/260916-1100-dynamic-cli-discovery-extensibility/phase-05-ui-ux-cyberdeck-studio-upgrade.md`
- `plans/260916-1100-dynamic-cli-discovery-extensibility/phase-06-verification-suite-acceptance.md`
