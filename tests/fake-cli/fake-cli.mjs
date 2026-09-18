#!/usr/bin/env node

import { createInterface } from "node:readline";

const scenario = process.env.FAKE_SCENARIO ?? "ok";
const text = process.env.FAKE_TEXT ?? "pong";
const sessionId = "fake-session-001";

function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

async function readStdin() {
  const rl = createInterface({ input: process.stdin });
  for await (const _line of rl) {
    /* prompt consumed */
  }
}

function emitArgvEcho() {
  if (process.env.FAKE_ECHO_ARGV !== "1") {
    return;
  }
  const argvText = process.argv.slice(2).join("|");
  emit({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: `__argv__:${argvText}` },
    },
  });
}

function emitEnvEcho() {
  if (process.env.FAKE_ECHO_ENV !== "1") {
    return;
  }
  const keys = ["USERPROFILE", "HOME", "CLAUDE_CONFIG_DIR"];
  const parts = keys.map((key) => `${key}=${process.env[key] ?? ""}`);
  emit({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: `__env__:${parts.join("|")}` },
    },
  });
}

function emitOkStream() {
  emit({ type: "system", subtype: "init", session_id: sessionId });
  emitArgvEcho();
  emitEnvEcho();
  emit({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text },
    },
  });
  emit({
    type: "result",
    is_error: false,
    stop_reason: "end_turn",
    result: text,
    usage: {
      input_tokens: 1,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: text.length,
      output_tokens_details: { thinking_tokens: 0 },
    },
    total_cost_usd: 0,
  });
}

function emitEmptyCompletion() {
  emit({ type: "system", subtype: "init", session_id: sessionId });
  emit({
    type: "result",
    is_error: false,
    stop_reason: "end_turn",
    result: "",
    usage: {
      input_tokens: 3,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      output_tokens_details: { thinking_tokens: 0 },
    },
    total_cost_usd: 0,
  });
}

function emitRateLimit() {
  emit({ type: "system", subtype: "init", session_id: sessionId });
  emit({
    type: "result",
    is_error: true,
    result: "Rate limit exceeded. Resets in 1 hour.",
    usage: {
      input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
    },
  });
}

async function main() {
  if (scenario === "hang") {
    emit({ type: "system", subtype: "init", session_id: sessionId });
    emit({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "hanging…" },
      },
    });
    await readStdin().catch(() => {});
    setInterval(() => {}, 60_000);
    return;
  }

  await readStdin();

  switch (scenario) {
    case "ok":
    case "slow":
      if (scenario === "slow") {
        await new Promise((r) => setTimeout(r, 2000));
      }
      emitOkStream();
      process.exit(0);
      break;
    case "rate_limit":
      emitRateLimit();
      process.exit(0);
      break;
    case "empty":
      emitEmptyCompletion();
      process.exit(0);
      break;
    case "crash":
      process.stderr.write("fatal: simulated crash\n");
      process.exit(1);
      break;
    default:
      process.stderr.write(`unknown FAKE_SCENARIO: ${scenario}\n`);
      process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(String(err));
  process.exit(1);
});
