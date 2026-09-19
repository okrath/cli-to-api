# Phase 01 report

Status: DONE

Built:

- `DocsLink` component (`apps/web/src/components/docs-link.tsx`) — `Docs ↗` links to README anchors on every admin page listed in the phase file.
- `FieldWarning` in `field.tsx` for amber callout text under fields.
- `Table` column `headerHint` / `headerTitle` for target-column guidance in the group editor.
- Verbatim hints on accounts (create dialog + cooldown note under table), groups (slug hint unchanged), group editor (effort, cache, allow tools hint/warning, targets section note, tier/account/effort header hints), API keys (name/retention + per-row delete error on 409), settings (all six fields), overview (Accounts card sub-hint, In flight `state` badges with tooltip), usage and terminal (docs links only).
- `LiveEntry.state` typed on the web client for overview badges.

Verified:

- `pnpm lint` — both packages `tsc --noEmit` clean.
- `pnpm build` — web Vite build + gateway compile clean.
- Manual browser check via `pnpm dev:web` against the user's gateway on port 8080 (login, all nav pages). Screenshots under `plans/260919-1700-admin-ui-guidance/reports/`:
  - `overview.png`, `accounts.png`, `accounts-new-dialog.png`, `groups.png`, `group-editor.png`, `api-keys.png`, `api-keys-new-dialog.png`, `settings.png`, `usage.png`, `terminal.png`

Deviations:

- None.

Concerns / questions for review:

- Target tier/account/effort hints render as small text under table headers; on narrow viewports the targets table is wide — acceptable for this phase (no layout redesign).
- API key delete 409 shows the gateway message (`API key has usage history; disable it instead`) rather than the phase's illustrative quoted string; behaviour matches the spec (server message, row retained).
