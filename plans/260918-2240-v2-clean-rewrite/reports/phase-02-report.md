# Phase 02 report

Status: DONE

## Built

- `runner/kill-tree.ts`: Windows `taskkill /T /F`; POSIX process-group SIGTERM then SIGKILL after 300 ms; never throws.
- `runner/sandbox.ts`: `ensureSandbox()` creates `home`, `config`, `workspace` under `data/sandboxes/<adapter>/<account>`; `baseEnv()` sets sandboxed profile paths plus `CI=1`, `NO_COLOR=1`, `FORCE_COLOR=0`, `TERM=dumb`.
- `runner/render-transcript.ts`: shared prompt rendering per plan §4.1 (system extraction, single-turn raw text, multi-turn `<conversation>` wrapper, resume = last user only, optional `<system>` inline for Codex/agy).
- `runner/run-cli.ts`: spawns CLI, stdin/argv prompt, line-by-line JSONL parse, stderr cap 64 KB, crash/timeout/abort handling, exactly one trailing `done`.
- Adapters: `claude-code.ts`, `codex.ts`, `agy.ts`, `omp.ts` — each `buildArgs`, `buildEnv`, `parseLine` (optional `parseStderr`) against committed fixtures.
- `adapters/index.ts`: registry, `detectAdapters()` with 60 s cache and `refreshAdapterDetection()`, fake adapter gated on `CTA_ENABLE_FAKE_ADAPTER=1`.
- `tests/fake-cli/fake-cli.mjs`: scenarios `ok`, `rate_limit`, `crash`, `hang`, `slow` via env; Claude-shaped JSONL; `hang` uses `setInterval` keep-alive (Node 24 exits on unresolved floating `await`).
- Tests: `adapters/claude-code.test.ts`, `adapters/codex.test.ts`, `runner/render-transcript.test.ts`, `runner/run-cli.test.ts` (fake CLI ok/crash/timeout/abort).

## Verified

```
pnpm lint             # exit 0
pnpm test             # 19 passed (6 files)
```

Fixture assertions (claude-code): session, rate_limit windows `five_hour`/`seven_day`, thinking deltas, text `pong`, final usage input 10 / cached 21894 / cacheWrite 12828 / output 43 / reasoning 35 / costUsd ≈ 0.029, `done end_turn`, zero errors.

Fixture assertions (codex): session, text `pong`, usage 23198/6784/0/5/0, skills-budget error item ignored, `done end_turn`.

Manual spot-check: agy and omp fixtures parse to session + text `pong` + usage + `done end_turn` with zero errors (no dedicated test file per phase scope).

## Deviations

- `buildArgs` for agy/omp/claude omit the rendered prompt text (passed separately to `runCli`); agy exports `agyBuildArgsWithPrompt()` for the >6000 char stdin path (no fixture recorded yet — short argv path only).
- `buildArgs` for omp leaves `--profile` empty; caller must inject `sandbox.configDir` before spawn (same pattern as agy `--print` prompt slot).
- Fake adapter uses `id: "fake" as Adapter["id"]` because §4.1 `Adapter.id` union has no `fake` member.

## Concerns / questions for review

- agy login/config isolation under `homeDir` was not manually verified with a live `agy` account in this session; only fixture parsing and sandbox env layout were implemented.
- agy long-prompt `--input-format stream-json` stdin mode is coded but lacks a recorded fixture and automated test.
- omp `type:"error"` event name was not seen in the pong fixture; parser follows phase spec.
- codex `turn.failed` handler follows phase spec; not exercised by the committed pong fixture.
