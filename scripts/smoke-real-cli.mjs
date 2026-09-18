#!/usr/bin/env node

const args = process.argv.slice(2);

function readArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) {
    return undefined;
  }
  return args[idx + 1];
}

const adapter = readArg("--adapter");
const accountId = readArg("--account");
const model = readArg("--model");
const baseUrl = process.env.CTA_BASE_URL ?? "http://127.0.0.1:8080";
const apiKey = process.env.CTA_API_KEY;

if (!adapter || !accountId || !model) {
  console.error("Usage: node scripts/smoke-real-cli.mjs --adapter <id> --account <id> --model <id>");
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
  for (const [key, value] of res.headers.entries()) {
    if (key.startsWith("x-cta-")) {
      console.log(`  ${key}: ${value}`);
    }
  }
}

async function anthropicRequest() {
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 256,
      messages: [{ role: "user", content: `Smoke test via ${adapter} account ${accountId}` }],
      stream: false,
    }),
  });
  const body = await res.json();
  console.log("Anthropic:", res.status, body.usage ?? body.error);
  for (const [key, value] of res.headers.entries()) {
    if (key.startsWith("x-cta-")) {
      console.log(`  ${key}: ${value}`);
    }
  }
}

await openAiRequest();
await anthropicRequest();
