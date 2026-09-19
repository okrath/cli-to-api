#!/usr/bin/env node

import { createInterface } from "node:readline";

const scenario = process.env.FAKE_SCENARIO ?? "ok";
const text = process.env.FAKE_TEXT ?? "pong";
const toolName = process.env.FAKE_TOOL_NAME ?? "get_weather";
const sessionId = "fake-session-001";

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

const mcpUrl = readArg("--mcp-url");

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

async function mcpCall(url, toolUseId, name, args) {
  const initRes = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "fake-cli" } },
    }),
    signal: AbortSignal.timeout(600_000),
  });
  await initRes.json();

  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    signal: AbortSignal.timeout(600_000),
  });

  const listRes = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    signal: AbortSignal.timeout(600_000),
  });
  await listRes.json();

  const callRes = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: { "claudecode/toolUseId": toolUseId },
      },
    }),
    signal: AbortSignal.timeout(600_000),
  });
  const callBody = await callRes.json();
  const resultText = callBody.result?.content?.[0]?.text ?? "";
  return resultText;
}

function emitToolUseBlock(id, name, input) {
  emit({ type: "system", subtype: "init", session_id: sessionId });
  emit({
    type: "assistant",
    message: {
      content: [{ type: "tool_use", id, name: `mcp__cta__${name}`, input }],
    },
  });
  emit({
    type: "stream_event",
    event: {
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 5,
        output_tokens_details: { thinking_tokens: 0 },
      },
    },
  });
}

function emitFinalText(resultText, usage) {
  emit({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "ignored", content: resultText }],
    },
  });
  emit({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: `Result: ${resultText}` },
    },
  });
  emit({
    type: "stream_event",
    event: {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: {
        input_tokens: usage.roundInput,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: usage.roundOutput,
        output_tokens_details: { thinking_tokens: 0 },
      },
    },
  });
  emit({
    type: "result",
    is_error: false,
    stop_reason: "end_turn",
    result: `Result: ${resultText}`,
    usage: {
      input_tokens: usage.totalInput,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: usage.totalOutput,
      output_tokens_details: { thinking_tokens: 0 },
    },
    total_cost_usd: 0.01,
  });
}

async function runToolCall() {
  if (!mcpUrl) {
    process.stderr.write("tool_call scenario requires --mcp-url\n");
    process.exit(2);
  }
  const id = "toolu_fake_1";
  emitToolUseBlock(id, toolName, { city: "Hanoi" });
  const resultText = await mcpCall(mcpUrl, id, toolName, { city: "Hanoi" });
  emitFinalText(resultText, { roundInput: 7, roundOutput: 3, totalInput: 17, totalOutput: 8 });
  process.exit(0);
}

async function runToolCallTwice() {
  if (!mcpUrl) {
    process.stderr.write("tool_call_twice scenario requires --mcp-url\n");
    process.exit(2);
  }
  emit({ type: "system", subtype: "init", session_id: sessionId });
  emit({
    type: "assistant",
    message: {
      content: [
        { type: "tool_use", id: "toolu_fake_1", name: `mcp__cta__${toolName}`, input: { city: "Hanoi" } },
        { type: "tool_use", id: "toolu_fake_2", name: `mcp__cta__${toolName}`, input: { city: "Hue" } },
      ],
    },
  });
  emit({
    type: "stream_event",
    event: {
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
      usage: {
        input_tokens: 12,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 8,
        output_tokens_details: { thinking_tokens: 0 },
      },
    },
  });

  const r1 = await mcpCall(mcpUrl, "toolu_fake_1", toolName, { city: "Hanoi" });
  const r2 = await mcpCall(mcpUrl, "toolu_fake_2", toolName, { city: "Hue" });
  emitFinalText(`${r1} | ${r2}`, { roundInput: 10, roundOutput: 4, totalInput: 22, totalOutput: 12 });
  process.exit(0);
}

async function runToolCallHang() {
  if (!mcpUrl) {
    process.stderr.write("tool_call_hang scenario requires --mcp-url\n");
    process.exit(2);
  }
  emitToolUseBlock("toolu_fake_1", toolName, { city: "Hanoi" });
  await mcpCall(mcpUrl, "toolu_fake_1", toolName, { city: "Hanoi" });
  setInterval(() => {}, 60_000);
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

  if (scenario === "tool_call") {
    await readStdin();
    await runToolCall();
    return;
  }

  if (scenario === "tool_call_twice") {
    await readStdin();
    await runToolCallTwice();
    return;
  }

  if (scenario === "tool_call_hang") {
    await readStdin();
    await runToolCallHang();
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
