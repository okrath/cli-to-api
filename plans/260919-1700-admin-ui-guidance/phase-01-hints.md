# Phase 01 — Hints, warnings and docs links

Status: pending · Effort: 0.5d

## Requirements

Use the existing `Field` `hint` prop for hints. For warnings add a small
`Callout`-style paragraph (`components/field.tsx` may export a `FieldWarning`
or reuse the error text style) directly under the field. Add a `DocsLink`
component (`components/docs-link.tsx`) rendering `Docs ↗` that opens
`https://github.com/okrath/cli-to-api#<anchor>` in a new tab; place it next to
each page's `<h1>`.

### Accounts (`pages/accounts.tsx`) — anchor `accounts`

| Field | Hint |
|---|---|
| Adapter | "Which CLI this login belongs to. Only installed CLIs are listed." |
| Name | "Shown in routing and usage. The account id is derived from it." |
| Max concurrent | "CLI processes that may run at once for this account. Agent clients (omp, Cursor, Continue) send parallel requests and a parked tool round also takes a slot — use 2–4 for them. Extra requests wait 'Queue timeout' and then move to the next target." |
| Use host profile (checkbox/toggle) | "Run the CLI with the login already present on this machine instead of an isolated sandbox. Rate limits are shared with your own use of that CLI; only one host-profile account per adapter." |
| Cooldown column / Reset cooldown | Tooltip or hint under the table: "Cooling accounts are skipped by routing. Set by rate limits (until the reported reset) or for 'Default cooldown' after an auth error or crash." |

### Groups (`pages/groups.tsx`, `pages/group-editor.tsx`) — anchor `groups`

| Field | Hint |
|---|---|
| Slug | existing hint stays ("Becomes group:your-slug") |
| Default effort | "Reasoning effort when the client sends none. Claude/Codex honour it; agy clamps xhigh to high; Cursor ignores it (effort is in the model id)." |
| Cache TTL (seconds) | "Exact-match response cache. 0 = off (recommended for coding/agent use — prompts never repeat and stale answers confuse tools). Stores the full answer text in the database. Never used for requests with tools." |
| Allow tools | Hint: "Lets the CLI use its OWN built-in tools (shell, file edits) with permission prompts bypassed, for requests that carry no client tools. Not needed for client tool calling (omp, SDK `tools`)." Warning (always visible when checked): "Bypasses CLI safety prompts. With a host-profile account the CLI acts as your user. Only Codex client-tool bridging requires this." |
| Targets: Tier | "Lowest available tier is tried first; higher tiers are failover. Accounts that should SHARE load must be on the SAME tier — load balancing only happens within a tier." |
| Targets: Account | "Pin to one account, or leave empty for any enabled account of this adapter." |
| Targets: Effort override | "Overrides the group default for this target." |
| Targets section header | Note under the header: "Requests with client tools are routed only to targets whose adapter can bridge them (Claude Code; Codex when Allow tools is on). Cursor agent and agy targets are skipped for those requests." |

### API keys (`pages/api-keys.tsx`) — anchor `api-keys`

| Field | Hint |
|---|---|
| Name | "Label shown in usage reports." |
| Retention | "standard: sessions are reused; transcripts are deleted when the session expires. ephemeral: no session reuse, no cache, the run's transcript is deleted right after each response — safest for sensitive content, costs more tokens." |
| Delete button | On 409 show the server message and keep the key visible: "This key has usage history — disable it instead." (adminFetch already surfaces the message; make sure the row stays and the message is shown near the row.) |

### Settings (`pages/settings.tsx`) — anchor `settings`

| Field | Hint |
|---|---|
| Default cooldown (seconds) | "Skip an account for this long after an auth error or crash when the CLI did not report a reset time. Lower it (300–600) while setting up logins." |
| Session TTL (seconds) | "How long a CLI session can be resumed, and how old sandbox transcripts must be before the hourly sweep deletes them. Lower for shorter data retention." |
| Request timeout (seconds) | "Kill a CLI run that has not completed within this time. Paused while a run waits for a tool result." |
| Queue timeout (seconds) | "How long a request waits for a free slot on an account before trying the next target. Prefer raising the account's Max concurrent over raising this." |
| Tool result timeout (seconds) | "How long a CLI process is kept parked waiting for the client's tool result. It holds an account slot meanwhile — 60–120 s for automated clients." |
| Tool max turns | "--max-turns for Claude Code runs with client tools; each tool round is one turn." |

### Overview (`pages/overview.tsx`) — anchor `how-routing-works`

- In the **In flight** table, render `state` as a badge: `running` (neutral) and `waiting_tool_result` (amber) with the tooltip "Parked: waiting for the client to return a tool result; holds an account slot until Tool result timeout."
- Under **Accounts** card: hint "busy = all slots taken · cooling = skipped by routing".

### Docs links

Page header `Docs ↗` anchors: accounts → `#accounts`, groups/group editor → `#groups`, api-keys → `#api-keys`, settings → `#settings`, overview → `#how-routing-works`, usage → `#how-routing-works` (section "Usage"), terminal → `#accounts`.

## Files

```
apps/web/src/components/docs-link.tsx        (new)
apps/web/src/components/field.tsx            (warning style if missing)
apps/web/src/pages/{accounts,groups,group-editor,api-keys,settings,overview,usage,terminal}.tsx
plans/260919-1700-admin-ui-guidance/reports/phase-01-report.md (+ screenshots)
```

## Validation

- `pnpm lint`, `pnpm build` green.
- Open the built console (`pnpm build` then `pnpm start`, or `pnpm dev:web` against a running gateway) and check every page; the report includes one screenshot per page showing the hints. Do not change gateway code; do not commit `data/`. Stop only the gateway PID you started.

## Report

`reports/phase-01-report.md` in the AGENTS.md format.
