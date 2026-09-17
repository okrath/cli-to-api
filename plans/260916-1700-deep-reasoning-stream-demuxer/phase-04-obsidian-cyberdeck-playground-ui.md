---
phase: 4
title: "Obsidian Cyberdeck Playground UI"
status: completed
priority: P2
effort: "0.25d"
dependencies: [3]
---

# Phase 4: Obsidian Cyberdeck Playground UI

## Goal
Upgrade `apps/web/src/views/PlaygroundView.tsx` with an Obsidian Cyberdeck Thought Accordion component that streams reasoning in real-time, displays a live elapsed timer (`Thinking... 3.4s` $\to$ `Thought for 5.2s`), provides a one-click "Copy Reasoning" action, and renders an execution metrics bar.

---

## Detailed Technical Context & Requirements

1. SSE Client Stream Parser (`PlaygroundView.tsx`):
   - In addition to `delta?.content`, parse `delta?.reasoning_content`.
   - Maintain state:
     - `thoughtText: string`
     - `thoughtDurationMs: number | null`
     - `isThinking: boolean`
     - `thoughtOpen: boolean` (collapsible accordion)

2. Thought Accordion UI:
   - Styling: Obsidian Dark with violet accent (`border-violet-500/40 bg-violet-950/20 text-violet-200`).
   - Header:
     - When streaming thoughts: Glowing animated pulse `● THINKING` + live timer ticking up (`Thinking for 2.4s...`).
     - When thinking complete: Checkmark icon `✓ Thought for 4.1s`.
     - Chevron toggle button (open/close).
     - "Copy Reasoning" button with brief clipboard confirmation ("Copied!").
   - Body:
     - Monospace font with auto-scroll while streaming thoughts.

3. Execution Metrics Bar:
   - Show TTFR (Time to First Reasoning token) if reasoning occurred.
   - Show TTFT (Time to First Answer token).
   - Show Total Time.

---

## Tasks Breakdown

- **Task 4.1:** Update `PlaygroundView.tsx` with state for `thoughtText`, `isThinking`, `thoughtDurationMs`, and live timer. [COMPLETED]
- **Task 4.2:** Build the Cyberdeck Thought Accordion with Lucide icons (`Brain`, `ChevronDown`, `ChevronRight`, `Copy`, `Check`). [COMPLETED]
- **Task 4.3:** Wire action handlers for Copy Reasoning and Copy Answer. [COMPLETED]
- **Task 4.4:** Verify web app builds cleanly with `pnpm --filter @cli-to-api/web build`. [COMPLETED]

---

## Verification Commands
```bash
pnpm --filter @cli-to-api/web build
```
