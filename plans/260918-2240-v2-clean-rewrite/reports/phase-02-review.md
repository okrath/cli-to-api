# Phase 02 review

Reviewer: Claude · Commit reviewed: 25c0ca2 · Verdict: DONE_WITH_CONCERNS — fix the MUST items before phase 04 starts.

## Verified independently

- `pnpm lint` green; `pnpm test` 19/19 green (runner timeout/abort tests kill the fake CLI).
- `parseLine` for claude-code and codex matches the committed fixtures and the phase file, including ignoring hook lines and the Codex skills-budget warning.
- `kill-tree`, `sandbox`, `render-transcript` match the phase file.

## Contract clarification (plan updated by the reviewer, read it first)

`plan.md` §4.1 now states: the adapter never sees the prompt; the runner delivers
it — `stdin` → written then closed, `argv` → appended as the **final** argv
entry after `args`. `buildArgs` must not depend on sandbox paths. The agy and
omp sections of `phase-02-runner-and-adapters.md` were rewritten accordingly.

## Findings

### MUST-1 — agy and omp `buildArgs` return placeholders the "caller must fill"

`agy.ts` emits `"--print", ""` and `omp.ts` emits `"--profile", ""`, and the
report asks the caller to patch those slots. That breaks the `Adapter` contract
and moves adapter knowledge into the router. Fix per the updated phase file:

- agy: put `"--print"` last in `args`; the runner appends the prompt as its value. Delete `agyBuildArgsWithPrompt` and the untested `--input-format stream-json` path.
- omp: drop `--profile`; the sandbox `HOME` provides isolation. The runner appends the positional prompt.
- `run-cli.ts`: `const argv = promptVia === "argv" ? [...args, prompt] : args`.

### MUST-2 — spawn failure is not handled

`runCli` attaches no `error` listener to the child for the event stream, and
writes to `child.stdin` without a stdin `error` listener. With a missing
executable (ENOENT) this becomes an unhandled `error` event / unhandled
rejection (`pid` rejects with nobody awaiting) and can crash the gateway.
Fix: on child `error` → record a crash, stop waiting, emit
`error { kind: "crash", message }` + `done`; swallow stdin `EPIPE`; make `pid`
resolve to `-1` on spawn failure instead of rejecting.
Add a test: adapter whose `executable` is `definitely-not-a-binary-xyz` →
events are exactly `[error crash, done error]`, no process-level warnings.

### MUST-3 — `detectAdapters` blocks the event loop

`findExecutable` and `probeVersion` use `spawnSync` (up to 5 s each, four
CLIs) and are called from the request path via `buildCatalog`. Use
`execFile` with `{ timeout: 5000 }` wrapped in a promise, run the four probes
with `Promise.all`, keep the 60 s cache. Also cache the in-flight promise so
concurrent first requests do not probe twice.

### MUST-4 — claude-code model ids must be the CLI aliases

`claudeCodeAdapter.models` lists `claude-sonnet-4-5` etc., but phase 03's
alias table resolves `claude-*` names to the Claude Code aliases `sonnet`,
`opus`, `haiku`, and `claude --model` accepts those. Set `models` to
`[{ id: "sonnet" }, { id: "opus" }, { id: "haiku" }]` with readable labels.
Codex: use the ids the user's Codex install offers today
(`gpt-5.6-asta`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`),
not invented ones. agy: `agy models` on this host lists `gemini-3.8-flash-high`, `gemini-3.1-pro-high`,
`claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium` — use those.
omp: `gemini-3.8-flash` (seen in the fixture). Lists are static and editable, so short is fine.

### SHOULD-1 — tests for agy and omp parsers

Fixtures exist; add `tests/adapters/agy.test.ts` and `omp.test.ts` asserting
the expected event lists from the phase file. Cheap, and they lock the shapes.

### SHOULD-2 — duplicate error classification in `codex.ts`

`item.completed`/`error` re-tests the same regexes that `classifyError`
contains. Call `classifyError` once and drop the event when it classifies as
`unknown`.

### Notes (no action now)

- `fake` adapter id cast is acceptable for test-only code.
- agy config isolation under the sandbox `HOME` is unverified with a live
  login; phase 05's terminal is where that gets exercised. Keep the concern in
  the report.

## Instructions for the fix-up

1. Re-read `plan.md` §4.1 and the agy/omp sections of the phase file (both updated). Apply MUST-1 to MUST-4 and the SHOULD items.
2. `pnpm lint` and `pnpm test` green.
3. Append a `## Fix-up` section to `reports/phase-02-report.md`.
4. Commit as `fix(gateway): runner appends argv prompt, handles spawn errors, async adapter detection`.
5. Stage only the files you changed. Another agent is working in a separate worktree; do not touch `protocol/` or `api/`.
