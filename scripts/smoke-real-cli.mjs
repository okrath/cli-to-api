#!/usr/bin/env node

const args = process.argv.slice(2);

function readArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) {
    return undefined;
  }
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

const adapter = readArg("--adapter");
const accountId = readArg("--account");
const modelArg = readArg("--model");
const model =
  modelArg.startsWith("group:") || modelArg.includes("/")
    ? modelArg
    : `${adapter}/${modelArg}`;
const holdMs = Number(readArg("--hold-ms") ?? "0");
const baseUrl = process.env.CTA_BASE_URL ?? "http://127.0.0.1:8080";
const apiKey = process.env.CTA_API_KEY;

if (!adapter || !accountId || !modelArg) {
  console.error("Usage: node scripts/smoke-real-cli.mjs --adapter <id> --account <id> --model <id> [--tools] [--hold-ms <n>]");
  console.error("Env: CTA_BASE_URL (default http://127.0.0.1:8080), CTA_API_KEY (required)");
  process.exit(2);
}

if (!apiKey) {
  console.error("Set CTA_API_KEY to a client API key created in the admin console.");
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  "x-cta-account": accountId,
};

const weatherTool = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get current weather for a city",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
};

const anthropicWeatherTool = {
  name: "get_weather",
  description: "Get current weather for a city",
  input_schema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
};

function printCtaHeaders(res) {
  for (const [key, value] of res.headers.entries()) {
    if (key.startsWith("x-cta-")) {
      console.log(`  ${key}: ${value}`);
    }
  }
}

async function openAiToolLoop() {
  const round1 = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "What is the weather in Hanoi?" }],
      tools: [weatherTool],
      stream: false,
    }),
  });
  const body1 = await round1.json();
  console.log("OpenAI round 1:", round1.status, body1.choices?.[0]?.finish_reason ?? body1.error);
  printCtaHeaders(round1);

  const toolCall = body1.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    console.error("OpenAI round 1: expected tool_calls");
    process.exit(1);
  }

  if (holdMs > 0) {
    console.log(`Holding ${holdMs}ms before round 2…`);
    await new Promise((r) => setTimeout(r, holdMs));
  }

  const round2 = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content: "What is the weather in Hanoi?" },
        { role: "assistant", content: null, tool_calls: [toolCall] },
        { role: "tool", tool_call_id: toolCall.id, content: "31C, sunny" },
      ],
      tools: [weatherTool],
      stream: false,
    }),
  });
  const body2 = await round2.json();
  console.log("OpenAI round 2:", round2.status, body2.choices?.[0]?.finish_reason ?? body2.error);
  console.log("OpenAI round 2 text:", body2.choices?.[0]?.message?.content ?? "");
  printCtaHeaders(round2);
}

async function anthropicToolLoop() {
  const round1 = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { ...headers, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [{ role: "user", content: "What is the weather in Hanoi?" }],
      tools: [anthropicWeatherTool],
      stream: false,
    }),
  });
  const body1 = await round1.json();
  console.log("Anthropic round 1:", round1.status, body1.stop_reason ?? body1.error);
  printCtaHeaders(round1);

  const toolUse = body1.content?.find((b) => b.type === "tool_use");
  if (!toolUse) {
    console.error("Anthropic round 1: expected tool_use");
    process.exit(1);
  }

  if (holdMs > 0) {
    console.log(`Holding ${holdMs}ms before round 2…`);
    await new Promise((r) => setTimeout(r, holdMs));
  }

  const round2 = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { ...headers, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [
        { role: "user", content: "What is the weather in Hanoi?" },
        { role: "assistant", content: [toolUse] },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolUse.id, content: "31C, sunny" }],
        },
      ],
      tools: [anthropicWeatherTool],
      stream: false,
    }),
  });
  const body2 = await round2.json();
  console.log("Anthropic round 2:", round2.status, body2.stop_reason ?? body2.error);
  const text = (body2.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  console.log("Anthropic round 2 text:", text);
  printCtaHeaders(round2);
}

async function openAiRequest() {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: `Smoke test via ${adapter} account ${accountId}` }],
      stream: false,
    }),
  });
  const body = await res.json();
  console.log("OpenAI:", res.status, body.usage ?? body.error);
  printCtaHeaders(res);
}

async function anthropicRequest() {
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { ...headers, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      messages: [{ role: "user", content: `Smoke test via ${adapter} account ${accountId}` }],
      stream: false,
    }),
  });
  const body = await res.json();
  console.log("Anthropic:", res.status, body.usage ?? body.error);
  printCtaHeaders(res);
}

if (hasFlag("--tools")) {
  await openAiToolLoop();
  await anthropicToolLoop();
} else {
  await openAiRequest();
  await anthropicRequest();
}
