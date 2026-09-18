# Phase 01 report
Status: DONE

Built:
- Added `apps/gateway/src/adapters/cursor-agent.ts` with model list, `buildArgs` (`-p --trust --output-format stream-json --stream-partial-output`, `--force` / `--mode ask`, `--resume`), `buildEnv` (`CURSOR_INVOKED_AS`), `parseLine` / `parseStderr` per the committed fixture.
- Extended `Adapter["id"]` and `KNOWN_ADAPTER_IDS` to `"cursor-agent"`; removed `omp` from types, registry, tests, fixture, and README.
- Updated `resolve-executable.ts` to resolve Cursor's Windows shim: `%SCRIPT_DIR%` → `.ps1` → sibling or `versions/<latest>/` `node.exe` + `index.js` without `shell: true`; added unit tests for `%dp0%`, `%SCRIPT_DIR%`, and bundled layouts.
- Wired `prependSystemInPrompt` for `codex`, `agy`, and `cursor-agent` in `execute-candidate.ts`.
- Hardened `run-cli.ts` for signals already aborted before the stream starts (kills on spawn / at generator entry); added `run-cli` regression test.
- Updated `route-request.test.ts` to re-import `runCli` after `vi.resetModules()` and warm adapter detection in `beforeEach` so abort timing stays stable with the extra adapter probe.
- README adapter table: Cursor agent row added, OMP removed; troubleshooting note for the Windows shim.

Verified:
- `pnpm lint` — gateway + web `tsc --noEmit` green.
- `pnpm test` — 25 files, 105 tests passed (includes new `cursor-agent` and resolver tests; e2e unchanged).
- `pnpm build` — web + gateway dist green.
- `grep -ri omp apps tests README.md` — no adapter references (only unrelated substrings elsewhere in repo plans/history).
- Manual resolver check on dev host: `resolveExecutable("cursor-agent")` → `node.exe` + `index.js`, `shell: false`.

Deviations:
- Fixture `tests/fixtures/cursor-agent-2026.09.15-pong.jsonl` yields **two** `thinking_delta`, **one** `text_delta` `"pong"`, and usage `{ input: 9357, cachedInput: 6624, output: 39 }`. Tests follow the fixture (AGENTS.md), not the outdated counts in the phase draft (`"p"`, `"ong"`, 8109/7872).
- Extra production/test hardening beyond the phase bullet list: pre-aborted `AbortSignal` handling in `run-cli.ts` and `route-request.test.ts` setup fixes exposed once `cursor-agent` lengthened cold adapter detection.

Concerns / questions for review:
- Real-CLI smoke for `cursor-agent` through an isolated account (auth error classified as `auth`) and host-profile `pong` are deferred to phase 02 as specified.
- Phase 02 should add host-login detection and `use_host_profile` accounts; no phase 02 work was started.
