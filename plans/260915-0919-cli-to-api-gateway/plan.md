---
title: "cli-to-api: Universal AI CLI to OpenAI API Gateway & Web Management Console"
description: "Production-grade local API gateway transforming user-installed AI CLIs into OpenAI-compatible endpoints with multi-account sandboxing, namespaced and virtual tier load balancing, and an Obsidian Cyber-Deck Web Console."
status: completed
priority: P1
effort: "12d"
tags: [api, gateway, cli, load-balancer, reverse-proxy, webshell, ui-ux, sqlite]
created: 2026-09-15
---

# `cli-to-api`: Universal AI CLI to OpenAI API Gateway & Web Management Console

## Overview

`cli-to-api` is an enterprise-grade, local-first API gateway daemon designed to run natively on developer workstations and edge servers. It transforms any locally installed AI Command-Line Interface (CLI)—including `@anthropic-ai/claude-code`, `codex-cli`, `opencode`, `grok-cli`, `gemini-cli`, and `ollama`—into an OpenAI-compatible REST & SSE Streaming API endpoint (`/v1/chat/completions`, `/v1/models`).

The architecture strictly adheres to an **Agnostic Bridge** philosophy: the daemon never downloads unauthorized binary packages or runs package managers. The user installs whichever CLIs they prefer. The gateway orchestrates them as isolated child worker processes within a resilient multi-tenant sandbox, normalizing their distinct stdin/stdout streams, terminal escapes, and authentication contexts into a seamless OpenAI interface compatible with Cursor, Continue.dev, LibreChat, Open WebUI, and official SDKs.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          CLIENT LAYER                                            │
│            Cursor IDE / Continue.dev / Open WebUI / LangChain / cURL (Bearer sk-cta-...)         │
└────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                 │ POST /v1/chat/completions (stream: true)
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FASTIFY GATEWAY ENGINE (Node.js 22)                              │
│                                                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────────────────────────┐  │
│  │ 1. Ingress & Auth Guard │  │ 2. Router & Tier Engine │  │ 3. Account Pool & Load Balancer  │  │
│  │    • Bearer sk-cta-...  │  │    • Namespace targeting│  │    • Least-Connections           │  │
│  │    • Quota & Rate Limit │  │    • Virtual auto tiers │  │    • Slot Semaphore Lock (ACID)  │  │
│  └─────────────────────────┘  └─────────────────────────┘  └──────────────────────────────────┘  │
│                                                 │                                                │
│  ┌──────────────────────────────────────────────▼─────────────────────────────────────────────┐  │
│  │ 4. Process Supervisor & Sandbox Executor                                                   │  │
│  │    • Directory Jail: HOME & USERPROFILE -> $DATA/sandboxes/{adapter}/{account}             │  │
│  │    • Prompt Transport: Auto-switch to temp_file / stdin if prompt > 4,000 chars            │  │
│  │    • Zero-Zombie Containment: Win32 Job Object (KILL_ON_JOB_CLOSE) / POSIX setsid (-pgid)  │  │
│  │    • Windows PATHEXT: Resolves .cmd/.ps1/.bat via cmd.exe safe execution rules             │  │
│  └──────────────────────────────────────────────┬─────────────────────────────────────────────┘  │
│                                                 │ Raw stdout / stderr chunks                     │
│  ┌──────────────────────────────────────────────▼─────────────────────────────────────────────┐  │
│  │ 5. Resilient Byte Stream & Sanitization Pipeline                                           │  │
│  │    • StringDecoder('utf8'): Assembles fragmented multi-byte Unicode (Vietnamese, Emoji)   │  │
│  │    • Dual-Stage ANSI Sanitizer: Non-blocking rolling \r buffer strips spinner garbage     │  │
│  │    • Dynamic 429 Interceptor: Extracts reset durations ("resets in 45m") -> Cooldown Timer │  │
│  │    • SSE Serializer: Emits standard data: {"choices":[{"delta":{"content":"..."}}]}\n\n   │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                 │ Spawned Process Tree
         ┌───────────────────────────────────────┼───────────────────────────────────────┐
         ▼ (Pool: Codex CLI)                     ▼ (Pool: OpenCode CLI)                  ▼ (Pool: Claude Code)
┌─────────────────────────────────┐     ┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│ Sandbox: codex/acc-01           │     │ Sandbox: opencode/acc-01        │     │ Sandbox: claude/acc-work        │
│ HOME: $DATA/sandboxes/codex/a1  │     │ HOME: $DATA/sandboxes/open/a1   │     │ HOME: $DATA/sandboxes/claude/w1 │
│ Concurrency Semaphore: 1/1      │     │ Concurrency Semaphore: 1/1      │     │ Concurrency Semaphore: 1/1      │
└─────────────────────────────────┘     └─────────────────────────────────┘     └─────────────────────────────────┘
```

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | OpenAI API Protocol Compliance (`GET /v1/models`, `POST /v1/chat/completions` SSE & Unary) | P1 |
| 2 | Agnostic Declarative CLI Adapter Engine with Windows PATHEXT Resolution (`.cmd`, `.bat`, `.ps1`, `.exe`) | P1 |
| 3 | Multi-Account Filesystem Sandboxing (`$HOME`, `$USERPROFILE`, `$XDG_CONFIG_HOME`, `%APPDATA%`) | P1 |
| 4 | Intelligent Load Balancing: Namespaced Targeting (`provider/model`) & Virtual Tiers (`auto-*`) | P1 |
| 5 | Byte-Level Stream Pipeline: `StringDecoder('utf8')` + Dual-Stage ANSI Rolling `\r` Buffer | P1 |
| 6 | Zero-Zombie Process Containment ($\le 200\text{ms}$) via Win32 Job Objects & POSIX `setsid` | P1 |
| 7 | Windows Argv Bypass (>4,000 chars) via Atomic Temporary Files (`temp_file`) & Piped Stdin | P1 |
| 8 | Obsidian Cyber-Deck Web Management Console (UI/UX Pro Max) with In-Browser WebShell (`xterm.js`) | P1 |

## Phases

| # | Phase | Status | Priority | Effort |
|---|-------|--------|----------|--------|
| 1 | [Phase 1: Substrate Engine, SQLite WAL & Adapter Schema](./phase-01-substrate-engine-sqlite-wal-adapter-schema.md) | Completed | P1 | 2d |
| 2 | [Phase 2: Process Supervisor Engine, Job Objects & Stream Sanitizer](./phase-02-process-supervisor-job-objects-stream-sanitizer.md) | Completed | P1 | 2d |
| 3 | [Phase 3: Multi-Account Directory Sandboxing & Dynamic Cooldown Engine](./phase-03-multi-account-sandboxing-concurrency-cooldown.md) | Completed | P1 | 2d |
| 4 | [Phase 4: OpenAI API Gateway Engine & Intelligent Tier Router](./phase-04-openai-api-gateway-intelligent-tier-router.md) | Completed | P1 | 2d |
| 5 | [Phase 5: Obsidian Cyber-Deck Web Management Console & In-Browser WebShell](./phase-05-obsidian-cyber-deck-console-in-browser-webshell.md) | Completed | P1 | 2d |
| 6 | [Phase 6: Live SSE Inspector, Playground Studio & Automated Acceptance Suite](./phase-06-live-sse-inspector-playground-acceptance-tests.md) | Completed | P1 | 2d |

## Monorepo Directory Architecture

```
cli-to-api/
├── package.json                                # Workspace root configuration & unified scripts
├── pnpm-workspace.yaml                         # Workspace packages configuration
├── tsconfig.base.json                          # Base TypeScript compiler configuration (Node 22 / ESNext)
├── vitest.config.ts                            # Monorepo-wide Vitest configuration
│
├── apps/
│   ├── gateway/                                # Core Fastify API Daemon & Process Supervisor
│   │   ├── src/
│   │   │   ├── index.ts                        # Process bootstrap, signal trapping & graceful shutdown
│   │   │   ├── server.ts                       # Fastify application factory & plugin registrations
│   │   │   ├── config/ (env.ts, paths.ts)      # Zod-validated environment config & deterministic paths
│   │   │   ├── db/ (schema.ts, index.ts, migrate.ts) # Drizzle SQLite schema, WAL mode, migrations
│   │   │   ├── adapters/                       # Zod schema, PATHEXT resolver, loader & registry
│   │   │   ├── supervisor/                     # Win32 Job Objects, POSIX setsid, prompt transport, pty/pipe
│   │   │   ├── stream/                         # StringDecoder, Dual-Stage ANSI rolling buffer, 429 detector
│   │   │   ├── router/                         # Model catalog, tier matcher, load balancer, slot semaphore
│   │   │   ├── api/ (middleware, routes, ws)   # OpenAI routes, admin REST routes, WebShell WebSocket
│   │   │   └── utils/                          # Logger, token estimator, temp file cleanup
│   │
│   └── web/                                    # Obsidian Cyber-Deck Web Management Console
│       ├── src/
│       │   ├── components/ (layout, ui, webshell) # Cyber-Deck components & xterm.js WebShell
│       │   └── views/                          # Dashboard, Model Catalog, Accounts, Inspector, Playground
│
├── adapters/                                   # Pre-packaged declarative adapter definitions (codex, opencode, claude, grok)
├── data/                                       # Local persistent state (sqlite.db, sandboxes/)
└── tests/                                      # Unit, integration & end-to-end acceptance test suites
```

## Success Criteria

- [x] AC-01: `GET /v1/models` returns complete catalog with namespaced models (`codex/gpt-5.6-asta`, `opencode/gpt-5.6-asta`) and virtual auto tiers (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`).
- [x] AC-02: Namespaced targeting routes strictly to the specified provider account pool (`codex/gpt-5.6-asta` routes only to Codex accounts).
- [x] AC-03: Virtual tier auto-routing filters eligible models by tier and applies least-connections load balancing.
- [x] AC-04: Concurrent requests targeting distinct accounts of the same CLI execute in discrete sandbox directory jails without session or token collision.
- [x] AC-05: Dynamic 429 interceptor extracts reset duration ("resets in 45m") to trigger automatic cooldown and transparent request failover.
- [x] AC-06: Zero-zombie termination cleans up child processes and sub-shells in $\le 200\text{ms}$ upon client disconnect.
- [x] AC-07: Web Console and in-browser WebShell (`xterm.js` over WebSocket) provide interactive CLI OAuth authentication, Live SSE stream inspection, and a Chat Playground.

## Ultra Verifier Ranking Appendix (Kongming Verdict)

This plan was selected through an Ultra Plan Best-of-5 Verifier Pass scored independently by Lead Architectural Verifier Kongming across 4 dimensions (Faithfulness, Actionability, Test Sharpness, Dependencies):

| Rank | Candidate | Plan Document | Score | Verdict |
| :---: | :--- | :--- | :---: | :--- |
| 🥇 | **Candidate A (Winner)** | `reports/planner-ultra-candidate-4.md` | **80 / 80** | **Selected as Master Implementation Plan** |
| 🥈 | Candidate C | `reports/planner-ultra-candidate-5.md` | 72 / 80 | Runner-up |
| 🥉 | Candidate B | `reports/planner-ultra-candidate-1.md` | 67 / 80 | Contender |
| 4th | Candidate D | `reports/planner-ultra-candidate-2.md` | 64 / 80 | Eliminated |
| 5th | Candidate E | `reports/planner-ultra-candidate-3.md` | 62 / 80 | Eliminated |

<!-- slug: cli-to-api-gateway -->
