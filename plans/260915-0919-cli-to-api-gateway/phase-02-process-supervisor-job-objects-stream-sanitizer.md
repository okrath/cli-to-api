---
phase: 2
title: "Process Supervisor Engine, Windows Job Objects & Bulletproof Stream Sanitizer"
status: pending
priority: P1
effort: "2d"
dependencies: ["phase-01-substrate-engine-sqlite-wal-adapter-schema"]
---

# Phase 2: Process Supervisor Engine, Windows Job Objects & Bulletproof Stream Sanitizer

## Goal
Build the robust process execution, containment, and stream sanitization engine. Ensure zero zombie processes upon client abort via Win32 Job Objects and POSIX process groups, transparently bypass the Windows 8,191-character command limit via atomic prompt files, and eliminate terminal spinner noise without delaying real-time token emission.

## Files to Create / Modify
- Create: `apps/gateway/src/supervisor/types.ts`
- Create: `apps/gateway/src/supervisor/job-object.ts`
- Create: `apps/gateway/src/supervisor/process-group.ts`
- Create: `apps/gateway/src/supervisor/prompt-transport.ts`
- Create: `apps/gateway/src/supervisor/pipe-executor.ts`
- Create: `apps/gateway/src/supervisor/pty-executor.ts`
- Create: `apps/gateway/src/supervisor/process-manager.ts`
- Create: `apps/gateway/src/stream/utf8-decoder.ts`
- Create: `apps/gateway/src/stream/ansi-sanitizer.ts`
- Create: `apps/gateway/src/stream/rate-limit-detector.ts`
- Create: `apps/gateway/src/stream/sse-serializer.ts`
- Create: `tests/mocks/mock-spinner-cli.js`
- Create: `tests/mocks/mock-ratelimit-cli.js`
- Create: `tests/mocks/mock-hanging-cli.js`
- Create: `tests/unit/stream-sanitizer.test.ts`
- Create: `tests/unit/rate-limit-detector.test.ts`
- Create: `tests/unit/prompt-transport.test.ts`
- Create: `tests/unit/process-lifecycle.test.ts`

## Tasks & Steps

### Task 2.1: Win32 Job Object Containment (Zero-Zombie Guarantee on Windows)
1. Implement `apps/gateway/src/supervisor/job-object.ts`:
   - On Windows, dynamically import `windows-job-node` (or use kernel32 Win32 API bindings).
   - Create Job Object with `LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (0x2000)`.
   - Bind spawned child process PID to the Job Object immediately upon spawn.
   - Implement fallback to tree termination via `taskkill /F /T /PID ${pid}`.
   - Verify process terminates within $\le 200\text{ms}$ upon abort signal.

### Task 2.2: POSIX Process Group Containment
1. Implement `apps/gateway/src/supervisor/process-group.ts`:
   - Spawn child processes with `{ detached: true }` (`setsid`).
   - On abort signal or timeout, send `process.kill(-child.pid, 'SIGKILL')`.

### Task 2.3: Prompt Transport Manager (Windows Argv Limit Bypass)
1. Implement `apps/gateway/src/supervisor/prompt-transport.ts`:
   - Calculate total length of command arguments with prompt.
   - If length $> 4,000$ characters and mode is `auto` or `temp_file`:
     - Write prompt to an atomic file: `$SANDBOX/tmp/prompt_{uuid}.txt`.
     - Replace `{prompt}` and `{prompt_file}` placeholders in arguments with the file path.
     - Register `cleanupHook` to safely unlink the temp file in a `finally` block.
   - If mode is `stdin`:
     - Remove prompt placeholders from arguments and stream prompt directly into child `stdin`.

### Task 2.4: UTF-8 Multi-Byte Decoder
1. Implement `apps/gateway/src/stream/utf8-decoder.ts`:
   - Use Node.js `string_decoder.StringDecoder('utf8')`.
   - Maintain byte buffer state across chunk boundaries to prevent replacement characters (`\uFFFD`) on Vietnamese diacritics and emojis.

### Task 2.5: Non-Blocking Dual-Stage ANSI & Rolling `\r` Sanitizer
1. Implement `apps/gateway/src/stream/ansi-sanitizer.ts`:
   - **Stage 1:** Strip ANSI color codes, VT100 control sequences, and OSC terminal escapes.
   - **Stage 2 (Non-blocking Rolling `\r` Buffer):**
     - Maintain `hasPendingCarriageReturn` state.
     - On `\r`, clear pending line buffer (overwriting spinner text).
     - On `\n`, emit line followed by newline.
     - **Streaming Preservation Rule:** If characters arrive without an active `\r`, and do not match standalone spinner glyphs (`⠋⠙⠹|/-\`), emit them **immediately** to the stream without waiting for `\n`.

### Task 2.6: Dynamic Rate-Limit Interceptor
1. Implement `apps/gateway/src/stream/rate-limit-detector.ts`:
   - Match stdout and stderr against configured adapter regex patterns.
   - Parse durations from error text (e.g. `"resets in 2h 15m"` -> 8100s, `"resets in 45m"` -> 2700s).
   - Return `{ isRateLimited: true, cooldownSeconds, errorType: "RATE_LIMIT" }`.

### Task 2.7: Unified Process Manager
1. Implement `apps/gateway/src/supervisor/process-manager.ts`:
   - Orchestrate pipe executor (`execa v9`) vs PTY executor (`node-pty`).
   - Attach Job Object / Process Group containment.
   - Connect UTF-8 decoder -> ANSI sanitizer -> SSE stream emitter.
   - Attach `AbortSignal` listener to kill process immediately on client disconnect.

## Todo
- [x] Implement `apps/gateway/src/supervisor/job-object.ts` (Win32 Job Object)
- [x] Implement `apps/gateway/src/supervisor/process-group.ts` (POSIX setsid)
- [x] Implement `apps/gateway/src/supervisor/prompt-transport.ts` (temp_file & stdin fallback)
- [x] Implement `apps/gateway/src/stream/utf8-decoder.ts` (`StringDecoder`)
- [x] Implement `apps/gateway/src/stream/ansi-sanitizer.ts` (Non-blocking Dual-Stage `\r` buffer)
- [x] Implement `apps/gateway/src/stream/rate-limit-detector.ts` (Dynamic duration parser)
- [x] Implement `apps/gateway/src/supervisor/process-manager.ts`
- [x] Create mock CLI test scripts in `tests/mocks/`
- [x] Pass unit tests for sanitization, prompt transport, and process termination ($\le 200\text{ms}$)

## Verification
- Run `pnpm --filter @cli-to-api/gateway test tests/unit/stream-sanitizer.test.ts` and verify Vietnamese diacritics and emojis are intact while spinner progress overwrites are eliminated.
- Run `pnpm --filter @cli-to-api/gateway test tests/unit/prompt-transport.test.ts` and verify prompts $>4,000$ chars automatically create and clean up temporary files.
- Run `pnpm --filter @cli-to-api/gateway test tests/unit/process-lifecycle.test.ts` and verify mock hanging process terminates within $\le 200\text{ms}$ upon abort.
