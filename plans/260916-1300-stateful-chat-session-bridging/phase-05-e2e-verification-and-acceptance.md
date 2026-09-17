---
phase: 5
title: "E2E Verification & Multi-Turn Acceptance"
status: pending
priority: P1
effort: "0.5d"
dependencies: [
  "phase-01-schema-and-thread-registry",
  "phase-02-merkle-prefix-thread-manager",
  "phase-03-native-cli-session-bridge",
  "phase-04-sticky-routing-and-ingress-wiring"
]
---

# Phase 5: E2E Verification & Multi-Turn Acceptance

## Goal
Implement end-to-end multi-turn conversation tests validating that context provided in Turn 1 (e.g. outline/background) is accurately remembered and utilized in Turn 2 (e.g. writing chapter 1) with native CLI memory.

---

## Detailed Test Matrix

| Test Scenario | Verification Target | Assertions |
|:---|---|---|
| **Multi-Turn Story Continuation** | `POST /v1/chat/completions` (Turn 1 -> Turn 2) | Turn 1 sends outline; Turn 2 asks "Dựa vào đó viết chương 1". Assert Turn 2 includes chapter content based on Turn 1 outline. |
| **Session Header Inspection** | Ingress response headers | Assert Turn 1 returns `X-Debug-Session-Status: NEW`, Turn 2 returns `X-Debug-Session-Status: RESUMED` with matching `X-Debug-Session-Id`. |
| **Incremental Delta Verification** | `ProcessManager` invocation parameters | Assert Turn 2 CLI invocation passes ONLY the newest user prompt, not the entire historical array. |
| **Sticky Sandbox Affinity** | Multi-account setup | Assert Turn 2 routes to the exact same account sandbox as Turn 1. |

---

## Verification Commands
```bash
pnpm test tests/e2e/stateful-session.test.ts
pnpm test
pnpm build
```
