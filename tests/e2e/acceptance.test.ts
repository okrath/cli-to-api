import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  anthropicWeatherTool,
  createAccount,
  createAdapterAccount,
  createDefaultGroup,
  createGroup,
  fetchLive,
  isProcessAlive,
  patchSettings,
  startE2eServer,
  stopE2eServer,
  weatherTool,
  writeFakeConfig,
  type E2eContext,
} from "./harness.js";

describe("acceptance criteria", () => {
  describe("AC-1 OpenAI and Anthropic SDK clients", () => {
    let ctx: E2eContext;

    beforeAll(async () => {
      ctx = await startE2eServer();
      const a = await createAccount(ctx, "A", "ok", "from-a");
      const b = await createAccount(ctx, "B", "ok", "from-b");
      await createDefaultGroup(ctx, [a, b]);
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("streams and completes via the OpenAI SDK against group:default", async () => {
      const client = new OpenAI({
        apiKey: ctx.apiKey,
        baseURL: `${ctx.baseUrl}/v1`,
      });

      const stream = await client.chat.completions.create({
        model: "group:default",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      });

      let text = "";
      for await (const chunk of stream) {
        text += chunk.choices[0]?.delta?.content ?? "";
      }
      expect(text.length).toBeGreaterThan(0);

      const completion = await client.chat.completions.create({
        model: "group:default",
        messages: [{ role: "user", content: "usage check" }],
        stream: false,
      });
      expect(completion.usage?.total_tokens).toBeGreaterThan(0);
      expect(completion.usage?.prompt_tokens).toBeGreaterThan(0);
      expect(completion.usage?.completion_tokens).toBeGreaterThan(0);
    }, 30_000);

    it("streams and completes via the Anthropic SDK against group:default", async () => {
      const client = new Anthropic({
        apiKey: ctx.apiKey,
        baseURL: ctx.baseUrl,
      });

      const stream = client.messages.stream({
        model: "group:default",
        max_tokens: 256,
        messages: [{ role: "user", content: "hello" }],
      });

      const message = await stream.finalMessage();
      const textBlock = message.content.find((block) => block.type === "text");
      expect(textBlock?.type).toBe("text");
      if (textBlock?.type === "text") {
        expect(textBlock.text.length).toBeGreaterThan(0);
      }

      const reply = await client.messages.create({
        model: "group:default",
        max_tokens: 256,
        messages: [{ role: "user", content: "usage check" }],
      });
      expect(reply.usage.input_tokens).toBeGreaterThan(0);
      expect(reply.usage.output_tokens).toBeGreaterThan(0);
    }, 30_000);
  });

  describe("AC-2 failover from rate-limited account", () => {
    let ctx: E2eContext;
    let accountA: string;

    beforeAll(async () => {
      ctx = await startE2eServer();
      accountA = await createAccount(ctx, "A", "rate_limit");
      const accountB = await createAccount(ctx, "B", "ok", "from-b");
      await createDefaultGroup(ctx, [accountA, accountB]);
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("completes on account B, cools A, and records failoverCount 1", async () => {
      const res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:default",
          messages: [{ role: "user", content: "failover" }],
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      expect(body.choices[0]?.message.content).toContain("from-b");

      const accountsRes = await fetch(`${ctx.adminUrl}/accounts`, {
        headers: { Authorization: `Bearer ${ctx.adminToken}` },
      });
      const accounts = (await accountsRes.json()) as Array<{
        id: string;
        cooldownUntil: number | null;
      }>;
      const cooled = accounts.find((row) => row.id === accountA);
      expect(cooled?.cooldownUntil).toBeGreaterThan(Date.now());

      const requestsRes = await fetch(`${ctx.adminUrl}/requests?limit=5`, {
        headers: { Authorization: `Bearer ${ctx.adminToken}` },
      });
      const requests = (await requestsRes.json()) as Array<{ failoverCount: number | null }>;
      expect(requests.some((row) => row.failoverCount === 1)).toBe(true);
    }, 30_000);
  });

  describe("failover from an unclassified CLI error", () => {
    let ctx: E2eContext;
    let accountA: string;

    beforeAll(async () => {
      ctx = await startE2eServer();
      accountA = await createAccount(ctx, "A", "unsupported_model");
      const accountB = await createAccount(ctx, "B", "ok", "from-b");
      // B sits on a higher tier so A is always tried first (round-robin only rotates within a tier).
      await createGroup(ctx, "a-then-b", [
        { tier: 1, accountId: accountA, adapterId: "fake", modelId: "fake" },
        { tier: 2, accountId: accountB, adapterId: "fake", modelId: "fake" },
      ]);
      await createGroup(ctx, "only-a", [
        { tier: 1, accountId: accountA, adapterId: "fake", modelId: "fake" },
      ]);
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("moves to account B without cooling A", async () => {
      const res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:a-then-b",
          messages: [{ role: "user", content: "unsupported model on A" }],
        }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("x-cta-failovers")).toBe("1");
      const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      expect(body.choices[0]?.message.content).toContain("from-b");

      const accountsRes = await fetch(`${ctx.adminUrl}/accounts`, {
        headers: { Authorization: `Bearer ${ctx.adminToken}` },
      });
      const accounts = (await accountsRes.json()) as Array<{
        id: string;
        cooldownUntil: number | null;
      }>;
      expect(accounts.find((row) => row.id === accountA)?.cooldownUntil ?? null).toBeNull();
    }, 30_000);

    it("returns 502 with the CLI message when no target is left", async () => {
      const res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:only-a",
          messages: [{ role: "user", content: "unsupported model everywhere" }],
        }),
      });
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: { message: string } };
      expect(body.error.message).toContain("'fake-pro' model is not supported");
    }, 30_000);
  });

  describe("AC-3 CLI session reuse across three turns", () => {
    let ctx: E2eContext;

    beforeAll(async () => {
      ctx = await startE2eServer();
      const account = await createAccount(ctx, "solo", "ok", "pong");
      await createDefaultGroup(ctx, [account]);
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("reuses the session on turns 2 and 3 with resume flag and header", async () => {
      const client = new OpenAI({
        apiKey: ctx.apiKey,
        baseURL: `${ctx.baseUrl}/v1`,
      });

      const turn1 = await client.chat.completions.create({
        model: "group:default",
        messages: [{ role: "user", content: "turn one" }],
      });
      const assistant1 = turn1.choices[0]?.message.content ?? "";

      const turn2Res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:default",
          messages: [
            { role: "user", content: "turn one" },
            { role: "assistant", content: assistant1 },
            { role: "user", content: "turn two" },
          ],
        }),
      });
      expect(turn2Res.headers.get("x-cta-session-reused")).toBe("1");
      const turn2Body = (await turn2Res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      expect(turn2Body.choices[0]?.message.content).toContain("--resume");

      const turn3Res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:default",
          messages: [
            { role: "user", content: "turn one" },
            { role: "assistant", content: assistant1 },
            { role: "user", content: "turn two" },
            { role: "assistant", content: turn2Body.choices[0]?.message.content ?? "" },
            { role: "user", content: "turn three" },
          ],
        }),
      });
      expect(turn3Res.headers.get("x-cta-session-reused")).toBe("1");
      const turn3Body = (await turn3Res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      expect(turn3Body.choices[0]?.message.content).toContain("--resume");
    }, 30_000);
  });

  describe("AC-4 response cache", () => {
    let ctx: E2eContext;

    beforeAll(async () => {
      ctx = await startE2eServer();
      const account = await createAccount(ctx, "cache", "ok", "cached-reply");
      await createDefaultGroup(ctx, [account], 60);
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("serves a cache hit quickly without spawning again and streams valid frames", async () => {
      const payload = {
        model: "group:default",
        messages: [{ role: "user", content: "cache me exactly" }],
      };

      const first = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      expect(first.status).toBe(200);

      const requestsAfterFirst = await fetch(`${ctx.adminUrl}/requests?limit=10`, {
        headers: { Authorization: `Bearer ${ctx.adminToken}` },
      });
      const rowsAfterFirst = (await requestsAfterFirst.json()) as Array<{ status: string }>;
      const cliRuns = rowsAfterFirst.filter((row) => row.status === "ok").length;
      expect(cliRuns).toBe(1);

      const started = Date.now();
      const second = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const elapsed = Date.now() - started;
      expect(second.status).toBe(200);
      expect(second.headers.get("x-cta-cache")).toBe("hit");
      expect(elapsed).toBeLessThan(50);

      const requestsAfterSecond = await fetch(`${ctx.adminUrl}/requests?limit=10`, {
        headers: { Authorization: `Bearer ${ctx.adminToken}` },
      });
      const rowsAfterSecond = (await requestsAfterSecond.json()) as Array<{ status: string }>;
      expect(rowsAfterSecond.filter((row) => row.status === "ok").length).toBe(cliRuns);

      const streamRes = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...payload, stream: true }),
      });
      expect(streamRes.status).toBe(200);
      expect(streamRes.headers.get("content-type")).toContain("text/event-stream");
      const streamText = await streamRes.text();
      expect(streamText).toContain("data:");
      expect(streamText).toContain("[DONE]");
    }, 30_000);
  });

  describe("AC-5 abort kills the CLI process tree", () => {
    let ctx: E2eContext;

    beforeAll(async () => {
      ctx = await startE2eServer();
      const account = await createAccount(ctx, "hang", "hang");
      await createDefaultGroup(ctx, [account]);
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("removes the live PID within 500 ms after aborting mid-stream", async () => {
      const controller = new AbortController();
      const responsePromise = fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:default",
          messages: [{ role: "user", content: "hang" }],
          stream: true,
        }),
        signal: controller.signal,
      });

      const response = await responsePromise;
      expect(response.status).toBe(200);

      const reader = response.body!.getReader();
      await reader.read();

      let pid = -1;
      for (let attempt = 0; attempt < 20 && pid <= 0; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const liveRes = await fetch(`${ctx.adminUrl}/live`, {
          headers: { Authorization: `Bearer ${ctx.adminToken}` },
        });
        const live = (await liveRes.json()) as Array<{ pid?: number }>;
        pid = live.find((entry) => entry.pid != null && entry.pid > 0)?.pid ?? -1;
      }
      expect(pid).toBeGreaterThan(0);

      controller.abort();
      await reader.cancel().catch(() => undefined);
      await response.body?.cancel().catch(() => undefined);

      const deadline = Date.now() + 500;
      while (Date.now() < deadline && isProcessAlive(pid)) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(isProcessAlive(pid)).toBe(false);
    }, 30_000);
  });

  describe("client tools AC-1 OpenAI tool loop", () => {
    let ctx: E2eContext;

    beforeAll(async () => {
      ctx = await startE2eServer();
      const account = await createAccount(ctx, "tools", "tool_call");
      await createDefaultGroup(ctx, [account]);
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    async function fetchRound1ToolCall() {
      const res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:default",
          messages: [{ role: "user", content: "weather in Hanoi?" }],
          tools: [weatherTool],
          stream: false,
        }),
      });
      const body = (await res.json()) as {
        choices: Array<{
          finish_reason: string;
          message: {
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
          };
        }>;
      };
      expect(res.status).toBe(200);
      expect(body.choices[0]?.finish_reason).toBe("tool_calls");
      return body.choices[0]!.message.tool_calls![0]!;
    }

    async function runOpenAiToolLoop() {
      const round1 = await fetchRound1ToolCall();

      expect(round1.id).toBe("toolu_fake_1");
      expect(round1.function.name).toBe("get_weather");
      expect(JSON.parse(round1.function.arguments).city).toBe("Hanoi");

      const liveDuringHold = await fetchLive(ctx);
      expect(liveDuringHold.some((e) => e.state === "waiting_tool_result")).toBe(true);
      const round1Pid = liveDuringHold.find((e) => e.pid != null && e.pid > 0)?.pid;
      expect(round1Pid).toBeGreaterThan(0);

      const round2Res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:default",
          messages: [
            { role: "user", content: "weather in Hanoi?" },
            {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: round1.id,
                  type: "function",
                  function: {
                    name: round1.function.name,
                    arguments: round1.function.arguments,
                  },
                },
              ],
            },
            {
              role: "tool",
              tool_call_id: round1.id,
              content: "Weather in Hanoi: 31C, sunny (recorded)",
            },
          ],
          tools: [weatherTool],
          stream: false,
        }),
      });
      expect(round2Res.status).toBe(200);
      expect(round2Res.headers.get("x-cta-session-reused")).toBe("1");
      const round2Body = (await round2Res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      expect(round2Body.choices[0]?.message.content).toContain("Result:");

      const liveAfterRound2 = await fetchLive(ctx);
      const round2Pid = liveAfterRound2.find((e) => e.pid != null && e.pid > 0)?.pid ?? round1Pid;
      expect(round2Pid).toBe(round1Pid);

    }

    it("non-stream round 1 tool_calls and round 2 resume with same pid", async () => {
      await runOpenAiToolLoop();
    }, 30_000);
  });

  describe("client tools AC-1 stream isolation", () => {
    let ctx: E2eContext;

    beforeAll(async () => {
      ctx = await startE2eServer();
      const account = await createAccount(ctx, "tools-stream", "tool_call");
      await createDefaultGroup(ctx, [account]);
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("OpenAI SDK stream round 1 tool_calls then round 2 resume with same pid", async () => {
      const client = new OpenAI({
        apiKey: ctx.apiKey,
        baseURL: `${ctx.baseUrl}/v1`,
      });
      const stream = await client.chat.completions.create({
        model: "group:default",
        messages: [{ role: "user", content: "weather in Hanoi?" }],
        tools: [weatherTool],
        stream: true,
      });

      const toolCall: { id: string; name: string; arguments: string } = {
        id: "",
        name: "",
        arguments: "",
      };
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.tool_calls?.[0];
        if (delta?.id) toolCall.id = delta.id;
        if (delta?.function?.name) toolCall.name = delta.function.name;
        if (delta?.function?.arguments) toolCall.arguments += delta.function.arguments;
      }
      expect(toolCall.id).toBe("toolu_fake_1");
      expect(toolCall.name).toBe("get_weather");
      expect(JSON.parse(toolCall.arguments).city).toBe("Hanoi");

      const liveDuringHold = await fetchLive(ctx);
      expect(liveDuringHold.some((e) => e.state === "waiting_tool_result")).toBe(true);
      const round1Pid = liveDuringHold.find((e) => e.pid != null && e.pid > 0)?.pid;
      expect(round1Pid).toBeGreaterThan(0);

      const round2Res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:default",
          messages: [
            { role: "user", content: "weather in Hanoi?" },
            {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: toolCall.id,
                  type: "function",
                  function: { name: toolCall.name, arguments: toolCall.arguments },
                },
              ],
            },
            {
              role: "tool",
              tool_call_id: toolCall.id,
              content: "Weather in Hanoi: 31C, sunny (recorded)",
            },
          ],
          tools: [weatherTool],
          stream: false,
        }),
      });
      expect(round2Res.status).toBe(200);
      expect(round2Res.headers.get("x-cta-session-reused")).toBe("1");
      const round2Body = (await round2Res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      expect(round2Body.choices[0]?.message.content).toContain("Result:");

      const liveAfterRound2 = await fetchLive(ctx);
      const round2Pid = liveAfterRound2.find((e) => e.pid != null && e.pid > 0)?.pid ?? round1Pid;
      expect(round2Pid).toBe(round1Pid);
    }, 30_000);
  });

  describe("client tools AC-2 Anthropic tool loop", () => {
    let ctx: E2eContext;

    beforeAll(async () => {
      ctx = await startE2eServer();
      const account = await createAccount(ctx, "anthropic-tools", "tool_call");
      await createDefaultGroup(ctx, [account]);
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("messages.stream round 1 tool_use and round 2 text", async () => {
      const client = new Anthropic({
        apiKey: ctx.apiKey,
        baseURL: ctx.baseUrl,
      });

      const stream = client.messages.stream({
        model: "group:default",
        max_tokens: 1024,
        messages: [{ role: "user", content: "weather in Hanoi?" }],
        tools: [anthropicWeatherTool],
      });
      const message = await stream.finalMessage();
      expect(message.stop_reason).toBe("tool_use");
      const toolUse = message.content.find((block) => block.type === "tool_use");
      expect(toolUse?.type).toBe("tool_use");
      if (toolUse?.type !== "tool_use") return;

      const round2 = await client.messages.create({
        model: "group:default",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "weather in Hanoi?" },
          { role: "assistant", content: message.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: "Weather in Hanoi: 31C, sunny (recorded)",
              },
            ],
          },
        ],
        tools: [anthropicWeatherTool],
      });
      const text = round2.content.find((block) => block.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("Result:");
      }
    }, 30_000);

    it("messages.create non-stream tool loop", async () => {
      const client = new Anthropic({
        apiKey: ctx.apiKey,
        baseURL: ctx.baseUrl,
      });

      const round1 = await client.messages.create({
        model: "group:default",
        max_tokens: 1024,
        messages: [{ role: "user", content: "weather in Hanoi?" }],
        tools: [anthropicWeatherTool],
      });
      expect(round1.stop_reason).toBe("tool_use");
      const toolUse = round1.content.find((block) => block.type === "tool_use");
      expect(toolUse?.type).toBe("tool_use");
      if (toolUse?.type !== "tool_use") return;

      const round2 = await client.messages.create({
        model: "group:default",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "weather in Hanoi?" },
          { role: "assistant", content: round1.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: "Weather in Hanoi: 31C, sunny (recorded)",
              },
            ],
          },
        ],
        tools: [anthropicWeatherTool],
      });
      const text = round2.content.find((block) => block.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text") {
        expect(text.text).toContain("Result:");
      }
    }, 30_000);
  });

  describe("client tools AC-3 two tool calls in one round", () => {
    let ctx: E2eContext;

    beforeAll(async () => {
      ctx = await startE2eServer();
      const account = await createAccount(ctx, "twice", "tool_call_twice");
      await createDefaultGroup(ctx, [account]);
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("returns two tool_calls and one round-2 with both results", async () => {
      const round1Res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:default",
          messages: [{ role: "user", content: "weather?" }],
          tools: [weatherTool],
        }),
      });
      const round1 = (await round1Res.json()) as {
        choices: Array<{
          message: { tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
        }>;
      };
      const toolCalls = round1.choices[0]?.message.tool_calls ?? [];
      expect(toolCalls).toHaveLength(2);

      const round2Res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:default",
          messages: [
            { role: "user", content: "weather?" },
            {
              role: "assistant",
              content: null,
              tool_calls: toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: call.function,
              })),
            },
            ...toolCalls.map((call) => ({
              role: "tool",
              tool_call_id: call.id,
              content: `result-${call.id}`,
            })),
          ],
          tools: [weatherTool],
        }),
      });
      const round2 = (await round2Res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      expect(round2.choices[0]?.message.content).toContain("Result:");
      expect(round2.choices[0]?.message.content).toContain("|");
    }, 30_000);
  });

  describe("client tools AC-4 parked run expiry fallback", () => {
    let ctx: E2eContext;
    let hangAccountId: string;

    beforeAll(async () => {
      ctx = await startE2eServer();
      await patchSettings(ctx, { toolResultTimeoutSec: 1 });
      hangAccountId = await createAccount(ctx, "hang", "tool_call_hang");
      await createDefaultGroup(ctx, [hangAccountId]);
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("kills parked pid and succeeds on fallback round 2", async () => {
      const round1Res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:default",
          messages: [{ role: "user", content: "weather?" }],
          tools: [weatherTool],
        }),
      });
      const round1 = (await round1Res.json()) as {
        choices: Array<{
          message: { tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
        }>;
      };
      const toolCall = round1.choices[0]?.message.tool_calls?.[0];
      expect(toolCall).toBeDefined();

      let pid = -1;
      for (let attempt = 0; attempt < 10 && pid <= 0; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const live = await fetchLive(ctx);
        pid = live.find((e) => e.pid != null && e.pid > 0)?.pid ?? -1;
      }
      expect(pid).toBeGreaterThan(0);

      const deadline = Date.now() + 6500;
      while (Date.now() < deadline) {
        if (!isProcessAlive(pid) && (await fetchLive(ctx)).length === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      expect(isProcessAlive(pid)).toBe(false);
      const liveAfterExpiry = await fetchLive(ctx);
      expect(liveAfterExpiry.every((e) => e.state !== "running" || e.pid == null || !isProcessAlive(e.pid))).toBe(
        true,
      );

      writeFakeConfig(ctx.dataDir, "fake", hangAccountId, "ok", "fallback");

      const round2Res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:default",
          messages: [
            { role: "user", content: "weather?" },
            {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: toolCall!.id,
                  type: "function",
                  function: toolCall!.function,
                },
              ],
            },
            {
              role: "tool",
              tool_call_id: toolCall!.id,
              content: "31C, sunny",
            },
          ],
          tools: [weatherTool],
        }),
      });
      expect(round2Res.status).toBe(200);
      const round2 = (await round2Res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      expect(round2.choices[0]?.message.content).toContain("fallback");
      expect(round2.choices[0]?.message.content).not.toContain("--resume");
    }, 30_000);
  });

  describe("client tools AC-5 unsupported and mixed groups", () => {
    let ctx: E2eContext;

    beforeAll(async () => {
      ctx = await startE2eServer();
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("returns tools_unsupported for agy-only group", async () => {
      const agyAccount = await createAdapterAccount(ctx, "agy", "agy-only");
      await createGroup(ctx, "no-tools", [{ tier: 1, accountId: agyAccount, adapterId: "agy", modelId: "gpt-5" }], {
        allowTools: true,
      });

      const res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:no-tools",
          messages: [{ role: "user", content: "hi" }],
          tools: [weatherTool],
        }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("tools_unsupported");
    }, 30_000);

    it("mixed agy + fake group with tools succeeds on fake target", async () => {
      const agyAccount = await createAdapterAccount(ctx, "agy", "mixed-agy");
      const fakeAccount = await createAccount(ctx, "mixed-fake", "tool_call");
      await createGroup(
        ctx,
        "mixed",
        [
          { tier: 1, accountId: agyAccount, adapterId: "agy", modelId: "gpt-5" },
          { tier: 2, accountId: fakeAccount, adapterId: "fake", modelId: "fake" },
        ],
        { allowTools: true },
      );

      const res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "group:mixed",
          messages: [{ role: "user", content: "weather in Hanoi?" }],
          tools: [weatherTool],
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        choices: Array<{ finish_reason: string }>;
      };
      expect(body.choices[0]?.finish_reason).toBe("tool_calls");
    }, 30_000);
  });

  describe("retention ephemeral API key", () => {
    let ctx: E2eContext;
    let ephemeralKey: string;
    let accountId: string;

    beforeAll(async () => {
      ctx = await startE2eServer();
      accountId = await createAccount(ctx, "ephemeral", "ok", "pong");
      await createDefaultGroup(ctx, [accountId], 3600);

      const create = await fetch(`${ctx.adminUrl}/api-keys`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "ephemeral-e2e", retention: "ephemeral" }),
      });
      const body = (await create.json()) as { plaintext: string };
      ephemeralKey = body.plaintext;
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("two turns reuse no session, write no cache, and drop the fake transcript", async () => {
      const headers = {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/json",
      };

      const turn1 = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "group:default",
          messages: [{ role: "user", content: "one" }],
        }),
      });
      expect(turn1.status).toBe(200);
      expect(turn1.headers.get("x-cta-session-reused")).toBe("0");

      const turn2 = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "group:default",
          messages: [
            { role: "user", content: "one" },
            { role: "assistant", content: "pong" },
            { role: "user", content: "two" },
          ],
        }),
      });
      expect(turn2.status).toBe(200);
      expect(turn2.headers.get("x-cta-session-reused")).toBe("0");

      const { sessions, responseCache } = await import("../../apps/gateway/src/db/schema.js");
      expect(ctx.db.db.select().from(sessions).all()).toHaveLength(0);
      expect(ctx.db.db.select().from(responseCache).all()).toHaveLength(0);

      const sessionFile = resolve(
        ctx.dataDir,
        "sandboxes",
        "fake",
        accountId,
        "config",
        "fake-sessions",
        "fake-session-001.jsonl",
      );
      expect(existsSync(sessionFile)).toBe(false);
    }, 30_000);
  });

  describe("AC-7 gateway serves built web console", () => {
    let ctx: E2eContext;

    beforeAll(async () => {
      ctx = await startE2eServer();
    }, 30_000);

    afterAll(async () => {
      await stopE2eServer(ctx);
    });

    it("returns the built index.html at GET /", async () => {
      const webDist = resolve(ctx.config.repoRoot, "apps/web/dist/index.html");
      expect(existsSync(webDist)).toBe(true);
      const expected = readFileSync(webDist, "utf8");

      const res = await fetch(`${ctx.baseUrl}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toBe(expected);
      expect(html.toLowerCase()).toContain("<!doctype html>");
    });
  });
});
