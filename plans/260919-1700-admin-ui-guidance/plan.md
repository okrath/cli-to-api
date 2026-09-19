---
title: "Admin console guidance: explain every setting where it is edited"
status: completed
priority: P2
effort: "0.5d"
branch: main
implementer: Cursor Composer 2.5 Fast
reviewer: Claude (Fable 5.1)
created: 2026-09-19
depends_on: plans/260919-1300-data-retention (completed)
tags: [web, admin-console, docs]
---

# Admin console guidance

## 1. Outcome

Someone who opens the console for the first time can configure accounts,
groups, keys and settings correctly without reading the README: every field
that has a non-obvious effect carries a one-line hint, the dangerous ones carry
a warning, and each page links to the matching README section.

## 2. Context

The README ([Setup guide](../../README.md#setup-guide)) is now the reference;
the console shows bare labels. Real misconfigurations seen on 2026-09-19:
`Allow tools` on for agent traffic, `Cache TTL = 86400` for coding use, five
same-model accounts at tiers 1…5 (no load sharing), `Max concurrent = 1` for a
client that sends parallel requests. The copy below is fixed; implement it
verbatim (English, no emoji). The `Field` component already has a `hint` prop.

## 3. Non-goals

Redesigning pages, new settings, validation logic beyond what exists.

## 4. Phase

Single phase: [phase-01-hints.md](./phase-01-hints.md).

## 5. Acceptance

- [x] Every field listed in the phase file shows its hint text; warnings render in the amber/red style used for errors elsewhere in the console.
- [x] Each page header has a "Docs" link to the README anchor given in the phase file (opens in a new tab).
- [x] `pnpm lint`, `pnpm build` green; no gateway changes.
- [x] Manual check in the browser (dev server or built console) recorded in the report with one screenshot per page saved under `plans/260919-1700-admin-ui-guidance/reports/`.
