# Phase 06 review

Reviewer: Claude · Commits reviewed: adeffcf (phase 05 follow-ups), 5843085 (admin console) · Verdict: DONE — no fix-up cycle; small items folded into phase 07.

## Verified independently

- `pnpm lint` green for gateway and web; `pnpm build` produces `apps/web/dist` (index + one CSS + one JS chunk) and `apps/gateway/dist`; `pnpm test` 85/85 green.
- No gateway, vite or agent processes left running after Cursor's own smoke run on port 9876.
- Console structure matches the phase file: login, overview, accounts (status, quota bars, today's tokens, terminal link, reset cooldown, enable/disable, delete with "also delete sandbox" checkbox), groups + group editor, API keys with one-time plaintext, usage (today/7d/30d/custom, day/hour, by key/account/model/group, stacked chart + table), terminal (host or `account:<id>` via query string), settings.
- Terminal component: xterm + fit addon, WebSocket to `/admin/ws/terminal` with token, resize messages via `ResizeObserver`, clean disposal on unmount and reconnect key.
- Auth guard redirects to `/login` when no token; 401 responses clear the token.

## Findings (carried into phase 07, no separate fix-up)

- SHOULD-1 — after a 401 the token is cleared but the page stays; navigate to `/login` so the operator is not left with an error table. One-line change in the fetch helper or a top-level effect.
- SHOULD-2 — main bundle is ~880 kB because xterm and recharts sit in the initial chunk; lazy-load the Terminal and Usage pages (already listed in the phase 07 cleanup items).
- Not verified by the reviewer: a real browser click-through and a real CLI login inside the account terminal. The WebSocket bridge itself was smoke-tested against a real server in the phase 05 review. The human walk-through of AC-6 remains for the owner after phase 07.
