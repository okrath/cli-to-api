---
phase: 6
title: "Automated Verification Suite & End-to-End Acceptance Tests"
status: pending
priority: P1
effort: "0.5d"
dependencies: [
  "phase-01-schema-migration-binary-resolver",
  "phase-02-discovery-engine-legacy-reconciler",
  "phase-03-catalog-projection-routing-guard",
  "phase-04-universal-recipes-dry-run-probe",
  "phase-05-ui-ux-cyberdeck-studio-upgrade"
]
---

# Phase 6: Automated Verification Suite & End-to-End Acceptance Tests

## Goal
Construct comprehensive automated unit, integration, and end-to-end acceptance test suites validating zero-phantom clean boots, dynamic CLI discovery, custom CLI registration (`omp`, `devin`), and sub-15ms uninstalled routing protection.

---

## Detailed Test Matrix

| ID | Test Scenario | Target File | Verification Method & Assertions |
|:---:|---|---|---|
| **AC-01** | Zero-Phantom Clean Boot | `tests/unit/reconciler.test.ts` | Seed uninstalled blueprints (`opencode`, `grok`). Boot gateway. Assert `accounts` has 0 rows for uninstalled tools and sandbox directory does not exist on disk. |
| **AC-02** | Binary Resolver Multi-Path | `tests/unit/resolver.test.ts` | Test `resolveBinary("node")` returns `isInstalled: true`. Test `resolveBinary("missing_cli_xyz")` returns `isInstalled: false` and `resolvedPath: null`. |
| **AC-03** | Bounded Version Prober | `tests/unit/prober.test.ts` | Execute prober against `tests/mocks/mock-hanging-cli.js`. Assert prober terminates process in $\le 1.5\text{s}$ and returns `isHealthy: false` without hanging. |
| **AC-04** | Projected Catalog Truth | `tests/unit/model-catalog.test.ts` | Register installed + uninstalled blueprints. Call `getOpenAiModelsList()`. Assert models from uninstalled adapters are excluded from response. |
| **AC-05** | Load Balancer 404 Guard | `tests/e2e/chat-completions.test.ts` | Send `POST /v1/chat/completions` with `"model": "opencode/gpt-5.6-asta"`. Assert HTTP 404 with code `adapter_not_installed` in $\le 15\text{ms}$. |
| **AC-06** | Custom Adapter Probe API | `tests/e2e/custom-adapter.test.ts` | Send `POST /api/adapters/probe` with valid `omp-cli.yaml` draft. Assert response `{ valid: true, ... }` within $2\text{s}$. |
| **AC-07** | Hot-Scan Discovery | `tests/e2e/custom-adapter.test.ts` | Add mock executable to PATH while running. Trigger `POST /api/adapters/scan`. Assert adapter transitions from `NOT_INSTALLED` to `INSTALLED`. |
| **AC-08** | Legacy Orphan Clean-up | `tests/e2e/orphan-cleanup.test.ts` | Manually insert 0-request account for uninstalled tool. Call `POST /api/adapters/cleanup-orphans`. Assert account row and sandbox folder are purged. |

---

## Tasks Breakdown

### Task 6.1: Unit Test Suite (`tests/unit/resolver.test.ts`, `prober.test.ts`, `reconciler.test.ts`)
- Refactor `resolver.test.ts` to test new `ResolvedBinary` schema with `isInstalled` boolean.
- Author `prober.test.ts`: Test normal exit 0 version probe and hanging timeout probe.
- Author `reconciler.test.ts`: Verify 0-request phantom accounts are deleted while accounts with `totalRequests > 0` are marked `CLI_MISSING`.

### Task 6.2: Integration Test Suite (`tests/unit/model-catalog.test.ts`, `load-balancer.test.ts`)
- Test `model-catalog.test.ts`: Assert virtual tiers (`auto-xhigh`) disappear if all candidate providers are uninstalled.
- Test `load-balancer.test.ts`: Assert load balancer throws `AdapterNotInstalledError` when requesting uninstalled targets.

### Task 6.3: End-to-End Acceptance Suite (`tests/e2e/custom-adapter.test.ts`, `orphan-cleanup.test.ts`)
- Implement `custom-adapter.test.ts`:
  - Upload `devin-cli` and `omp-cli` schemas.
  - Verify dry-run probe API returns accurate exit codes.
  - Verify mock CLI execution through the custom adapter streaming pipeline.
- Implement `orphan-cleanup.test.ts`:
  - Verify startup cleans up legacy phantom test entries from `sqlite.db`.

### Task 6.4: Monorepo Verification Sweep
- Run `pnpm lint` across workspace.
- Run `pnpm test` (verify all unit and e2e test suites pass).
- Run `pnpm build` (verify gateway and web bundles compile without errors).

---

## Verification Commands
```bash
# Run all unit tests
pnpm --filter @cli-to-api/gateway test:unit

# Run all end-to-end integration tests
pnpm --filter @cli-to-api/gateway test:e2e

# Full workspace test suite
pnpm test
```

## Definition of Done
- All 8 acceptance criteria (AC-01 through AC-08) pass with automated test coverage.
- Monorepo `pnpm test` and `pnpm build` complete with 0 errors.
- System is ready for production execution.
