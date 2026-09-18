# Phase 02 review — host-profile accounts

Reviewer: Claude · Commit reviewed: 2ad2791 · Verdict: DONE. Plan complete.

## Verified independently

- `pnpm lint`, `pnpm build` (dist cleaned before build, no stale omp files), `pnpm test` 117/117 green (28 files).
- Additive migration `0001` adds `accounts.use_host_profile`; runner uses `hostEnv()` (real profile, no config-dir overrides) for host-profile accounts and the sandbox env otherwise; the terminal bridge does the same with an explicit banner; second host-profile account per adapter → 409.
- `detectHostLogin` implemented for claude-code (`claude auth status` JSON), codex (`codex login status`), cursor-agent (`cursor-agent status`), agy returns `unknown`; results cached with adapter detection.

## Real-CLI smoke (reviewer, built gateway, host-profile accounts, 2026-09-19)

```
adapters: claude-code=2.1.277 hostLogin=logged_in(claude.ai · <owner email>) | codex=0.154.0 hostLogin=logged_in(Logged in using ChatGPT) | agy=1.2.6 hostLogin=unknown | cursor-agent=2026.09.15 hostLogin=logged_in(<cursor email>)

claude-code/haiku via group:default        → 200 in 3538 ms, content "pong",
   usage prompt 10309 / completion 42 / reasoning 34; requests row ok, account claude-code-smoke
cursor-agent/composer-2.5-fast via group:default → 200 in 11243 ms, content "pong",
   reasoning_content present, cached_tokens 7136; requests row ok, account cursor-agent-smoke
```

Both accounts stayed out of cooldown; `x-cta-account` names the executing account; no processes left behind (the only `claude.exe` is the reviewer's own Claude Code session).

## Acceptance criteria of this plan

- AC-1 cursor-agent models listed, omp gone — pass (phase 01).
- AC-2 real "pong" through host-profile claude-code and cursor-agent — pass.
- AC-3 host-login status per adapter — pass (agy `unknown` as specified).
- AC-4 second host-profile account → 409 — covered by admin test; delete stays within `data/` — by construction (`purge` removes only the account dir).
- AC-5 host-profile terminal uses the real profile — implemented (`process.env`), not clicked through by the reviewer.
- AC-6 lint/build/test green — pass.

## Notes

- Claude's `input_tokens` in the requests table is the uncached input only (10); `prompt_tokens` returned to the client adds cache read/write (10309). That matches the plan's usage definition; the usage page should label the columns accordingly (it already splits input / cached / cache write).
