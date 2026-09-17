---
phase: 3
title: "Native CLI Session Bridge"
status: pending
priority: P1
effort: "0.5d"
dependencies: ["phase-02-merkle-prefix-thread-manager"]
---

# Phase 3: Native CLI Session Bridge

## Goal
Wire native session parameters into `ProcessManager`, updating CLI invocations for Claude Code (`--session-id` / `--resume`) and Codex CLI (`exec resume <sid>`), removing `--ephemeral` to maintain on-disk session state.

---

## Detailed Technical Context & Requirements

1. **Claude Code Session Bridging:**
   - Turn 1 (Bootstrap):
     `claude --print --dangerously-skip-permissions --model {model} --session-id {session_id} {prompt}`
   - Turn 2+ (Resume):
     `claude --print --dangerously-skip-permissions --model {model} --resume {session_id} {prompt}`
     where `{prompt}` is ONLY the incremental user delta!

2. **OpenAI Codex CLI Session Bridging:**
   - Remove `--ephemeral` from `adapters/codex-cli.yaml` so sessions are persisted to `.codex/sessions/`.
   - Turn 1 (Bootstrap):
     `codex exec --model {model} --skip-git-repo-check --color never {prompt}`
     On process completion: capture `session id: <sid>` from stdout/stderr, save to `conversation_threads.cli_session_id`!
   - Turn 2+ (Resume):
     `codex exec resume {session_id} {prompt}`
     where `{prompt}` is ONLY the incremental user delta!

3. **ProcessManager Updates:**
   - Extend `ExecutionContext`:
     - `session?: { id: string; cliSessionId?: string; isResume: boolean; deltaPrompt: string }`
   - In `preparePromptTransport`:
     - If `isResume === true`, replace `{prompt}` with `deltaPrompt`!
     - In `args_template`, substitute `{session_id}` with `cliSessionId`.
   - On completion, extract any newly created session ID and return it in `ProcessExecutionResult`.

---

## Tasks Breakdown

- **Task 3.1:** Update `adapters/claude-code.yaml` and `adapters/codex-cli.yaml` with session resume argument templates.
- **Task 3.2:** Update `apps/gateway/src/supervisor/types.ts` and `prompt-transport.ts`.
- **Task 3.3:** Update `apps/gateway/src/supervisor/process-manager.ts` to handle session resume and ID capture.

---

## Verification Commands
```bash
pnpm --filter @cli-to-api/gateway test tests/unit/prompt-transport.test.ts
```
