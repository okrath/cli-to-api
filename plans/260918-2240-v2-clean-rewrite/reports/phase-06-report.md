# Phase 06 report

Status: DONE_WITH_CONCERNS

## Built

- Phase 05 review fixes (prior commit): interactive terminal env strips `CI`/`NO_COLOR`/`FORCE_COLOR`; account delete removes `sessions` rows; `GET /admin/accounts` loads rate limits in one query.
- `apps/web` Vite + React 18 + TypeScript + Tailwind stack with `react-router-dom`, `@xterm/xterm`, `@xterm/addon-fit`, and `recharts` (stacked bar only).
- Hand-written `useQuery` hook in `api.ts` (no `@tanstack/react-query` — keeps dependencies small for a thin admin client).
- Pages: Login, Overview, Accounts, Groups, Group editor, API keys, Usage, Terminal, Settings — sidebar layout, max-width 1400px, OS light/dark via Tailwind `darkMode: "media"`.
- Shared components: table, dialog, field, quota-bar, usage-chart, terminal-view (fit addon + `ResizeObserver`).
- Overview and Accounts poll every 5 s; mutations surface `{ error.message }` inline.
- `vite.config.ts` dev proxy for `/admin` and `/v1` → `:8080`.

## Verified

```
pnpm lint             # exit 0 (gateway + web)
pnpm build            # apps/web/dist + apps/gateway/dist
pnpm test             # 85 passed (22 files)
```

Smoke test (gateway on `:9876`, temp `DATA_DIR`, built web dist):

- `POST /admin/login` → token issued.
- `GET /` and `GET /usage` both return SPA `index.html` (deep link reload OK).
- `POST /admin/accounts` (claude-code), `POST /admin/groups` (two targets), `POST /admin/api-keys` → created successfully.
- `GET /admin/usage/quota` returns quota row for the new account.
- Server stopped; port 9876 released.

AC-6 walk-through: API-level steps above cover account → group (two targets) → API key → usage/quota visibility. Full browser UI click-through (including opening the account terminal and running a real CLI login) was not performed in this run; the terminal page uses the same WebSocket bridge verified in phase 05 review.

## Deviations

- None from phase 06 requirements.

## Concerns / questions for review

- AC-6 end-to-end browser verification (screenshots, real `claude login` in the xterm UI) left for human review; implementation matches the phase spec and reuses the phase 05 terminal bridge.
- Production JS bundle is ~880 kB (xterm + recharts); acceptable for a local admin tool but could be code-split later if desired.
