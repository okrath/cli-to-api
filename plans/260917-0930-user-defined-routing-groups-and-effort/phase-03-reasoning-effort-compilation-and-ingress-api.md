---
phase: 3
title: "Reasoning Effort Compilation & Ingress API"
status: completed
priority: P1
effort: "0.25d"
dependencies: ["phase-02-router-engine-swrr-and-dynamic-pipeline-executor"]
---

# Phase 3: Reasoning Effort Compilation & Ingress API

## Objective
Implement dynamic compilation of standardized reasoning effort levels to native CLI arguments in `prompt-transport.ts`, preserve flags through `temp_file`, support `reasoning_effort` in OpenAI chat completions, and provide admin REST endpoints for routing groups.

## Detailed Tasks

1. **CLI Effort Flag Transpiler (`apps/gateway/src/supervisor/prompt-transport.ts`)**:
   - Implement `compileEffortFlags(adapterId: string, level: EffortLevel): string[]`:
     - `claude-code`:
       - `low`: `["--thinking-budget", "2048"]`
       - `medium`: `["--thinking-budget", "8192"]`
       - `high`: `["--thinking-budget", "16384"]`
       - `xhigh`: `["--thinking-budget", "32768"]`
     - `codex-cli`:
       - `low`: `["--reasoning-effort", "low"]`
       - `medium`: `["--reasoning-effort", "medium"]`
       - `high`, `xhigh`: `["--reasoning-effort", "high"]`
     - `omp-cli`:
       - `["--effort", level]`
     - Default / unrecognised: return `[]`.
   - Update `preparePromptTransport`:
     - Accept optional `effortLevel?: EffortLevel`.
     - Inject compiled effort flags into `finalArgs`.
     - Ensure flags are preserved when switching to `mode === "temp_file"`.

2. **Propagate Effort in Supervisor (`process-manager.ts` & `types.ts`)**:
   - Add `effortLevel?: EffortLevel` to `ExecutionContext` and `ProcessSpawnOptions`.
   - Pass through `executeStreaming` and `executeNonStreaming`.

3. **Ingress Ingestion (`apps/gateway/src/api/routes/openai-chat.ts`)**:
   - Parse `reasoning_effort` from request body (or header `x-reasoning-effort`).
   - Validate against `effortLevelEnum`.
   - Forward `requestEffort` into load balancer and pipeline executor.

4. **Admin REST API for Routing Groups (`apps/gateway/src/api/routes/admin-groups.ts`)**:
   - `GET /api/routing-groups`: List all groups with targets count and health stats.
   - `POST /api/routing-groups`: Create a new routing group with targets array.
   - `GET /api/routing-groups/:id`: Get group details and target links.
   - `PUT /api/routing-groups/:id`: Update group configuration and targets.
   - `DELETE /api/routing-groups/:id`: Delete a routing group.
   - Register route in `apps/gateway/src/api/server.ts`.

5. **Unit Verification (`tests/unit/effort-transpiler.test.ts`)**:
   - Verify argument array output for Claude Code, Codex CLI, OMP CLI.
   - Verify temp_file preservation when prompt exceeds 4,000 characters.

## Verify
- `pnpm test tests/unit/effort-transpiler.test.ts` passes with 100% success.
