#!/usr/bin/env node
// Records how a CLI talks to an MCP server over streamable HTTP.
//
// Hosts a one-tool MCP server (get_weather) on 127.0.0.1:8765, runs the CLI
// against it with the same flags the gateway uses, and writes:
//   <out>.jsonl     the CLI's stdout (JSONL)
//   <out>.mcp.json  every HTTP request the CLI sent to the MCP server
//
// Usage:
//   node scripts/record-mcp-fixture.mjs --cli claude --out tests/fixtures/claude-code-<ver>-mcp-tool
//   node scripts/record-mcp-fixture.mjs --cli codex  --out tests/fixtures/codex-<ver>-mcp-tool --extra "-c approval_policy=\"never\""
//
// Uses the host login of the CLI. Nothing is written outside --out.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const readArg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const cli = readArg("--cli") ?? "claude";
const out = readArg("--out");
const extra = readArg("--extra");
const holdMs = Number(readArg("--hold-ms") ?? 3000);

function parseExtraFlags(raw) {
  if (!raw) return [];
  const args = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  for (const ch of raw) {
    if ((ch === '"' || ch === "'") && !inQuote) {
      inQuote = true;
      quoteChar = ch;
      continue;
    }
    if (ch === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = "";
      continue;
    }
    if (ch === " " && !inQuote) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) args.push(current);
  return args;
}
if (!out) {
  console.error("Usage: node scripts/record-mcp-fixture.mjs --cli claude|codex --out <path-without-extension> [--extra \"<flags>\"] [--hold-ms 3000]");
  process.exit(2);
}

const PORT = 8765;
const TOOL = {
  name: "get_weather",
  description: "Get the current weather for a city.",
  inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
};
const mcpLog = [];

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const msg = body ? JSON.parse(body) : null;
    mcpLog.push({ t: Date.now(), method: req.method, url: req.url, headers: req.headers, body: msg });
    console.error(`[mcp] ${req.method} ${req.url} ${body.slice(0, 160)}`);
    if (req.method === "GET") {
      res.writeHead(405).end();
      return;
    }
    if (req.method === "DELETE") {
      res.writeHead(200).end();
      return;
    }
    const reply = (result) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
    };
    if (msg.id === undefined) {
      res.writeHead(202).end();
    } else if (msg.method === "initialize") {
      reply({
        protocolVersion: msg.params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "cta", version: "0.0.1" },
      });
    } else if (msg.method === "tools/list") {
      reply({ tools: [TOOL] });
    } else if (msg.method === "tools/call") {
      setTimeout(
        () => reply({ content: [{ type: "text", text: `Weather in ${msg.params?.arguments?.city}: 31C, sunny (recorded)` }] }),
        holdMs,
      );
    } else {
      reply({});
    }
  });
});

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${PORT}/mcp`;
// A file, not inline JSON: cmd.exe would eat the quotes when shell: true is needed for the .cmd shim.
const mcpConfigPath = `${out}.mcp-config.json`;
writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: { cta: { type: "http", url } } }));
const prompt = "Use the get_weather tool for Hanoi, then tell me the result in one sentence.";

let cmd;
let cmdArgs;
if (cli === "claude") {
  cmd = "claude";
  cmdArgs = [
    "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    "--model", "sonnet", "--max-turns", "3", "--tools", '""',
    "--mcp-config", mcpConfigPath, "--strict-mcp-config", "--allowedTools", "mcp__cta",
  ];
} else {
  cmd = "codex";
  cmdArgs = [
    "exec", "--json", "--skip-git-repo-check", "--color", "never", "-m", "gpt-5.5",
    "--sandbox", "read-only", "-c", `mcp_servers.cta.url="${url}"`,
  ];
}
if (extra) cmdArgs.push(...parseExtraFlags(extra));
if (cli === "codex") cmdArgs.push("-");

console.error(`[record] ${cmd} ${cmdArgs.join(" ")}`);
const child = spawn(cmd, cmdArgs, {
  shell: cli === "claude" && process.platform === "win32",
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, MCP_TOOL_TIMEOUT: "120000" },
});
child.stdin.write(prompt);
child.stdin.end();
let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => (stdout += chunk));
child.stderr.on("data", (chunk) => (stderr += chunk));
const code = await new Promise((resolve) => child.on("close", resolve));

writeFileSync(`${out}.jsonl`, stdout);
writeFileSync(`${out}.mcp.json`, JSON.stringify(mcpLog, null, 2));
if (stderr.trim()) console.error(`[record] stderr:\n${stderr.slice(0, 2000)}`);
console.error(`[record] exit ${code}; stdout lines=${stdout.split("\n").filter(Boolean).length}; mcp requests=${mcpLog.length}`);
server.close();
