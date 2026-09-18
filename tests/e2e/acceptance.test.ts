import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createAccount,
  createDefaultGroup,
  isProcessAlive,
  startE2eServer,
  stopE2eServer,
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
