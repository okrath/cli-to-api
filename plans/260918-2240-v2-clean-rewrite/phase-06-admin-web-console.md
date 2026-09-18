# Phase 06 — Admin web console

Status: pending · Depends on: 05 · Effort: 1.5d

## Context

v1's UI was rejected as ugly and hard to use. v2 is a plain operator console:
dense tables, forms, one chart type, light/dark from the OS. No decorative
effects, no custom "design system" vocabulary. Function over flair.

## Requirements

Stack: Vite + React 18 + TypeScript + Tailwind + `react-router-dom` + `@xterm/xterm` + `@xterm/addon-fit` + `recharts` (stacked bar only). No global state library; a tiny `api.ts` fetch wrapper with the admin token in `localStorage` and `useQuery`-style hooks written by hand (or `@tanstack/react-query` if it keeps code smaller — pick one, say why in the report).

Pages (left sidebar nav, content max-width 1400px):

1. **Login** — password → token; redirect back.
2. **Overview** — cards: installed adapters (with version), accounts ready / cooling / busy, in-flight count, today's tokens (in, cached, out) and cost. Table "In flight" (request id, key, model, account, elapsed, tokens out, Abort button). Table "Recent requests" (last 20).
3. **Accounts** — table: adapter, name, status (`ready` / `busy n/m` / `cooldown until … (reason)` / `disabled`), quota bars (one thin bar per rate-limit window with `utilization %` and "resets in …"), today's tokens, actions: **Terminal**, Reset cooldown, Enable/Disable, Delete (confirm; checkbox "also delete sandbox files"). "New account" dialog: adapter select (installed only), name, max concurrent. After create, offer "Open terminal to log in".
4. **Groups** — list with model id (`group:<slug>`), targets count, effort, cache TTL. Editor page: fields + targets table (tier, adapter, model — select from adapter's static list with free-text override —, account (Any / specific), effort override, enabled) with add/remove and move up/down (tier is editable directly). Save = `PUT`. Show the model id to paste into a client.
5. **API keys** — table (name, prefix, enabled, last used, created), "New key" → modal showing the plaintext once with a copy button and the two client snippets (OpenAI base URL `http://host:8080/v1`, Anthropic base URL `http://host:8080`).
6. **Usage** — controls: date range (today / 7d / 30d / custom), bucket (day/hour), by (key / account / model / group). Stacked bar chart of input / cached input / output / reasoning per bucket. Table of the same rows with cost. Below: paged "Requests" log with columns time, key, model → executed, account, status, in / cached / out / reasoning, ttft, duration, session-reused, failovers, cache.
7. **Terminal** — full-page xterm.js. Target selector (Host, or any account). Reconnect button. Opening from the Accounts page pre-selects that account.
8. **Settings** — the `settings` keys as a form.

Behaviour
- Poll Overview and Accounts every 5 s while visible; everything else on demand.
- All mutations show inline error text from `{ error.message }`.
- Keyboard-accessible; visible focus; tables readable at 1280px.

## Files

```
apps/web/index.html, vite.config.ts (proxy /admin and /v1 to :8080 in dev), tailwind.config.ts, postcss.config.js
apps/web/src/main.tsx, app.tsx (router + layout), api.ts, format.ts (tokens, durations, relative time)
apps/web/src/pages/{login,overview,accounts,groups,group-editor,api-keys,usage,terminal,settings}.tsx
apps/web/src/components/{table,dialog,field,quota-bar,usage-chart,terminal-view}.tsx
```

## Validation

- `pnpm build` → `apps/web/dist`; gateway serves it at `/` with SPA fallback; deep link `/usage` reloads correctly.
- Walk AC-6 from `plan.md` end to end by hand and paste screenshots or a short description into the report.
- `pnpm lint` (tsc) green for the web package.

## Risks / rollback

xterm.js sizing in a flex layout — use the fit addon on mount and on `ResizeObserver`. Rollback: additive.

## Report

`reports/phase-06-report.md`.
