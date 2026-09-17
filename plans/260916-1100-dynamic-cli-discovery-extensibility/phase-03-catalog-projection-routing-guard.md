---
phase: 3
title: "Model Catalog Projection & Router Ingress Guarding"
status: pending
priority: P1
effort: "1d"
dependencies: ["phase-01-schema-migration-binary-resolver", "phase-02-discovery-engine-legacy-reconciler"]
---

# Phase 3: Model Catalog Projection & Router Ingress Guarding

## Goal
Ensure `/v1/models` dynamically projects only dispatchable models backed by installed CLIs with healthy accounts, filter candidate models in virtual tiers (`auto-*`), and implement instant pre-flight guards in the Load Balancer that return standard OpenAI HTTP 404/400 errors for uninstalled targets without attempting process execution.

---

## Detailed Technical Context & Requirements

1. **Catalog Hallucination Defect:**
   In `apps/gateway/src/router/model-catalog.ts`, `getOpenAiModelsList()` currently iterates over all registered adapters indiscriminately. If `opencode-cli.yaml` is in `adapters/`, its models (`gpt-5.6-asta`, `deepseek-r1`, `qwen-2.5-coder`) are published in `/v1/models`, misleading downstream clients (Cursor, Continue.dev).

2. **Load Balancer Failure Defect:**
   In `apps/gateway/src/router/load-balancer.ts`, when a client targets a virtual tier (`auto-xhigh`), `candidateModels` includes OpenCode models. When selected, `execa.spawn()` fails with `ENOENT`, terminating the stream with an internal error.

3. **OpenAI Protocol Compliance:**
   If a client explicitly requests a namespaced model for an uninstalled provider (e.g. `opencode/deepseek-r1`), the gateway must return HTTP 404 with OpenAI error code `adapter_not_installed` in $\le 15\text{ms}$ rather than timing out.

---

## Tasks Breakdown

### Task 3.1: Refactor Model Catalog (`apps/gateway/src/router/model-catalog.ts`)
Update `ModelCatalog.getOpenAiModelsList()`:
- Query active adapters: `adapters.filter(a => a.resolvedExecutable.isInstalled)`.
- Query active accounts: Ensure adapter has at least 1 account with status `READY` or `COOLDOWN`.
- Virtual Tiers Projection:
  - For each tier (`low`, `medium`, `high`, `xhigh`): Only append `auto-${tier}` if at least one candidate provider is installed and has healthy accounts.
  - Only append `auto` if at least one model is dispatchable across the entire gateway.
- Concrete Models Projection:
  - Exclude all models from adapters whose `isInstalled === false` or account count is 0.

### Task 3.2: Ingress Guard in Load Balancer (`apps/gateway/src/router/load-balancer.ts`)
Update `LoadBalancer.resolveTarget(requestedModel: string)`:
- Namespaced targeting (`provider/model`):
  - Look up provider adapter in registry.
  - If `!adapter || !adapter.resolvedExecutable.isInstalled`:
    - Throw new `AdapterNotInstalledError(providerId, executableName)`.
- Virtual tier targeting (`auto-*`):
  - Filter candidate models: Require `adapter.resolvedExecutable.isInstalled === true`.
  - If no candidate models exist for the requested tier:
    - Throw descriptive error: `404: No installed AI CLI engines available for tier '${requestedModel}'.`

### Task 3.3: OpenAI Error Mapping (`apps/gateway/src/api/routes/openai-chat.ts`)
Update route error handler in `openai-chat.ts`:
- Catch `AdapterNotInstalledError`:
  - Respond immediately with HTTP 404:
    ```json
    {
      "error": {
        "message": "Provider '${providerId}' executable '${executable}' is not installed on host PATH.",
        "type": "invalid_request_error",
        "param": "model",
        "code": "adapter_not_installed"
      }
    }
    ```
  - Ensure zero child processes are spawned, zero temporary files are created, and no semaphores are locked.

---

## Verification Commands
```bash
# Verify load balancer tests with uninstalled provider filtering
pnpm --filter @cli-to-api/gateway test tests/unit/load-balancer.test.ts

# Verify chat completions route error handling
pnpm --filter @cli-to-api/gateway test tests/e2e/chat-completions.test.ts
```

## Definition of Done
- `GET /v1/models` returns zero models belonging to uninstalled CLIs.
- Virtual tiers (`auto-*`) never select uninstalled candidate providers.
- Direct namespaced requests to uninstalled CLIs return clean HTTP 404 OpenAI error envelopes in $\le 15\text{ms}$.
