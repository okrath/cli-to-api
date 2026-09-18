import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashKey } from "../../src/auth/api-key-auth.js";
import type { ChatRequest } from "../../src/core/types.js";
import { openDb, type DbHandle } from "../../src/db/db.js";
import { runMigrations } from "../../src/db/migrate.js";
import { accounts, apiKeys, groupTargets, groups, requests, settings } from "../../src/db/schema.js";
import { resetRoundRobin } from "../../src/router/select-target.js";
import { getActiveCount, resetSlots } from "../../src/router/slots.js";
import { runCli } from "../../src/runner/run-cli.js";

const log = pino({ level: "silent" });

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  if (process.platform === "win32") {
    const result = spawnSync("tasklist", ["/FI", `PID eq ${pid}`], { encoding: "utf8" });
    return result.stdout.includes(String(pid));
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function accountIdFromCwd(cwd: string): string {
  const parts = cwd.split(/[\\/]/);
  const sandboxesIdx = parts.indexOf("sandboxes");
  if (sandboxesIdx >= 0 && parts[sandboxesIdx + 2]) {
    return parts[sandboxesIdx + 2]!;
  }
  return parts.at(-2) ?? "";
}

function makeRequest(overrides: Partial<ChatRequest> & { messages: ChatRequest["messages"] }): ChatRequest {
  return {
    requestId: `req_${Math.random().toString(36).slice(2, 12)}`,
    apiKeyId: "key_test",
    dialect: "openai",
    model: "group:test",
    stream: false,
    clientAbort: new AbortController().signal,
    ...overrides,
  };
}

describe("routeRequest integration", () => {
  let dataDir: string;
  let db: DbHandle;
  let spawnCount = 0;
  let routeRequest: typeof import("../../src/router/route-request.js").routeRequest;
  const scenarios: Record<string, string> = {
    "acc-a": "rate_limit",
    "acc-b": "ok",
  };

  beforeEach(async () => {
    vi.stubEnv("CTA_ENABLE_FAKE_ADAPTER", "1");
    vi.resetModules();
    ({ routeRequest } = await import("../../src/router/route-request.js"));
    await import("../../src/adapters/index.js").then((mod) => mod.refreshAdapterDetection());

    resetSlots();
    resetRoundRobin();
    spawnCount = 0;
    dataDir = mkdtempSync(join(tmpdir(), "cli-to-api-route-"));
    db = openDb(join(dataDir, "test.db"));
    runMigrations(db);

    db.db
      .insert(apiKeys)
      .values({
        id: "key_test",
        keyHash: hashKey("sk-test"),
        keyPrefix: "sk-test",
        name: "test",
        enabled: true,
        createdAt: Date.now(),
      })
      .run();

    db.db
      .insert(groups)
      .values({
        id: "group:test",
        name: "Test",
        enabled: true,
        allowTools: false,
        cacheTtlSec: 0,
      })
      .run();

    for (const id of ["acc-a", "acc-b"]) {
      db.db
        .insert(accounts)
        .values({
          id,
          adapterId: "fake",
          name: id,
          sandboxDir: join(dataDir, id),
          maxConcurrent: 1,
          enabled: true,
          createdAt: Date.now(),
        })
        .run();
    }

    db.db
      .insert(groupTargets)
      .values([
        {
          id: "gt-a",
          groupId: "group:test",
          tier: 1,
          accountId: "acc-a",
          adapterId: "fake",
          modelId: "fake",
          enabled: true,
        },
        {
          id: "gt-b",
          groupId: "group:test",
          tier: 1,
          accountId: "acc-b",
          adapterId: "fake",
          modelId: "fake",
          enabled: true,
        },
      ])
      .run();
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function deps(extra?: { onSpawn?: () => void; runCliFn?: typeof runCli }) {
    return {
      db,
      log,
      dataDir,
      onSpawn: () => {
        spawnCount++;
        extra?.onSpawn?.();
      },
      runCliFn:
        extra?.runCliFn ??
        ((opts: Parameters<typeof runCli>[0]) => {
          const accountId = accountIdFromCwd(opts.cwd);
          const scenario = scenarios[accountId] ?? "ok";
          return runCli({
            ...opts,
            env: {
              ...opts.env,
              FAKE_SCENARIO: scenario,
              FAKE_TEXT: `from-${accountId}`,
              FAKE_ECHO_ARGV: "1",
            },
          });
        }),
    };
  }

  async function collectText(events: AsyncIterable<{ type: string; text?: string }>): Promise<string> {
    let text = "";
    for await (const event of events) {
      if (event.type === "text_delta") text += event.text ?? "";
    }
    return text;
  }

  async function collectEvents(events: AsyncIterable<{ type: string }>): Promise<Array<{ type: string }>> {
    const collected: Array<{ type: string }> = [];
    for await (const event of events) {
      collected.push(event);
    }
    return collected;
  }

  it("failovers from rate-limited account A to account B", async () => {
    const { events, meta } = await routeRequest(
      makeRequest({ messages: [{ role: "user", content: "hi" }] }),
      deps(),
    );
    const text = await collectText(events);
    expect(text).toContain("from-acc-b");
    expect(meta.failoverCount).toBe(1);

    const cooled = db.db.select().from(accounts).where(eq(accounts.id, "acc-a")).get();
    expect(cooled?.cooldownUntil).toBeGreaterThan(Date.now());
    expect(getActiveCount("acc-a")).toBe(0);
    expect(getActiveCount("acc-b")).toBe(0);
  });

  it("returns 429 when every candidate is rate limited", async () => {
    scenarios["acc-a"] = "rate_limit";
    scenarios["acc-b"] = "rate_limit";

    await expect(
      routeRequest(makeRequest({ messages: [{ role: "user", content: "hi" }] }), deps()),
    ).rejects.toMatchObject({ code: "all_rate_limited", retryAfterSec: expect.any(Number) });
  });

  it("reuses CLI sessions on turns two and three", async () => {
    scenarios["acc-a"] = "ok";
    scenarios["acc-b"] = "ok";

    db.db.delete(groupTargets).run();
    db.db
      .insert(groupTargets)
      .values({
        id: "gt-b-only",
        groupId: "group:test",
        tier: 1,
        accountId: "acc-b",
        adapterId: "fake",
        modelId: "fake",
        enabled: true,
      })
      .run();

    const turn1 = await routeRequest(
      makeRequest({ messages: [{ role: "user", content: "turn one" }] }),
      deps(),
    );
    const assistant1 = await collectText(turn1.events);
    expect(turn1.meta.sessionReused).toBe(false);

    const turn2 = await routeRequest(
      makeRequest({
        messages: [
          { role: "user", content: "turn one" },
          { role: "assistant", content: assistant1 },
          { role: "user", content: "turn two" },
        ],
      }),
      deps(),
    );
    const text2 = await collectText(turn2.events);
    expect(turn2.meta.sessionReused).toBe(true);
    expect(text2).toContain("--resume");

    const turn3 = await routeRequest(
      makeRequest({
        messages: [
          { role: "user", content: "turn one" },
          { role: "assistant", content: assistant1 },
          { role: "user", content: "turn two" },
          { role: "assistant", content: text2 },
          { role: "user", content: "turn three" },
        ],
      }),
      deps(),
    );
    const text3 = await collectText(turn3.events);
    expect(turn3.meta.sessionReused).toBe(true);
    expect(text3).toContain("--resume");
  });

  it("accepts empty completion without failover", async () => {
    db.db.delete(groupTargets).run();
    db.db
      .insert(groupTargets)
      .values({
        id: "gt-a-only",
        groupId: "group:test",
        tier: 1,
        accountId: "acc-a",
        adapterId: "fake",
        modelId: "fake",
        enabled: true,
      })
      .run();

    scenarios["acc-a"] = "empty";

    const { events, meta } = await routeRequest(
      makeRequest({ messages: [{ role: "user", content: "hi" }] }),
      deps(),
    );
    const collected = await collectEvents(events);
    const text = collected
      .filter((e) => e.type === "text_delta")
      .map((e) => (e as { text?: string }).text ?? "")
      .join("");
    expect(text).toBe("");
    expect(collected.some((e) => e.type === "usage")).toBe(true);
    expect(collected.some((e) => e.type === "done")).toBe(true);
    expect(meta.failoverCount).toBe(0);
    expect(spawnCount).toBe(1);
  });

  it("returns 502 when every candidate crashes and records the failed request", async () => {
    scenarios["acc-a"] = "crash";
    scenarios["acc-b"] = "crash";

    const requestId = `req_crash_${Math.random().toString(36).slice(2, 12)}`;
    const startedAt = Date.now();
    const req = makeRequest({ requestId, messages: [{ role: "user", content: "hi" }] });
    const { RouteError } = await import("../../src/protocol/errors.js");
    const { recordRouteFailure } = await import("../../src/usage/record-usage.js");

    let routeErr: unknown;
    try {
      await routeRequest(req, deps());
    } catch (err) {
      routeErr = err;
    }

    expect(routeErr).toMatchObject({
      code: "upstream_crash",
      context: { failoverCount: 2, adapterId: "fake", modelExecuted: "fake" },
    });
    expect(routeErr).toBeInstanceOf(RouteError);
    recordRouteFailure(db, req, routeErr as InstanceType<typeof RouteError>, startedAt);

    const row = db.db.select().from(requests).where(eq(requests.id, requestId)).get();
    expect(row?.status).toBe("error");
    expect(row?.errorKind).toBe("upstream_crash");
    expect(row?.failoverCount).toBe(2);
    expect(row?.accountId).toBeNull();
  });

  it("records ttft below total duration for slow responses", async () => {
    db.db.delete(groupTargets).run();
    db.db
      .insert(groupTargets)
      .values({
        id: "gt-a-only",
        groupId: "group:test",
        tier: 1,
        accountId: "acc-a",
        adapterId: "fake",
        modelId: "fake",
        enabled: true,
      })
      .run();

    scenarios["acc-a"] = "slow";
    const requestId = `req_slow_${Math.random().toString(36).slice(2, 12)}`;
    const { events } = await routeRequest(
      makeRequest({ requestId, messages: [{ role: "user", content: "slow" }] }),
      deps({
        runCliFn: (opts) => {
          spawnCount++;
          return runCli({
            ...opts,
            env: { ...opts.env, FAKE_SCENARIO: "slow", FAKE_TEXT: "slow-response" },
          });
        },
      }),
    );
    await collectText(events);

    const row = db.db.select().from(requests).where(eq(requests.id, requestId)).get();
    expect(row?.ttftMs).not.toBeNull();
    expect(row?.durationMs).not.toBeNull();
    expect(row!.ttftMs!).toBeLessThan(row!.durationMs!);
  });

  it("serves identical group requests from cache without spawning", async () => {
    db.db.update(groups).set({ cacheTtlSec: 300 }).where(eq(groups.id, "group:test")).run();

    const first = await routeRequest(
      makeRequest({ messages: [{ role: "user", content: "cache me" }] }),
      deps(),
    );
    await collectText(first.events);
    expect(spawnCount).toBe(1);

    const second = await routeRequest(
      makeRequest({ messages: [{ role: "user", content: "cache me" }] }),
      deps(),
    );
    await collectText(second.events);
    expect(second.meta.cacheHit).toBe(true);
    expect(second.meta.accountId).toBeNull();
    expect(spawnCount).toBe(1);

    const cachedRow = db.db
      .select()
      .from(requests)
      .where(eq(requests.status, "cache_hit"))
      .get();
    expect(cachedRow?.accountId).toBeNull();
  });

  it(
    "aborts a hanging run and releases the slot",
    async () => {
      db.db.delete(groupTargets).run();
      db.db
        .insert(groupTargets)
        .values({
          id: "gt-a-only",
          groupId: "group:test",
          tier: 1,
          accountId: "acc-a",
          adapterId: "fake",
          modelId: "fake",
          enabled: true,
        })
        .run();

      const controller = new AbortController();
      let childPid = -1;
      const routedPromise = routeRequest(
        makeRequest({
          messages: [{ role: "user", content: "hang" }],
          clientAbort: controller.signal,
        }),
        deps({
          runCliFn: (opts) => {
            spawnCount++;
            const result = runCli({
              ...opts,
              env: { ...opts.env, FAKE_SCENARIO: "hang" },
            });
            void result.pid.then((pid) => {
              childPid = pid;
            });
            return result;
          },
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 300));
      controller.abort();

      const routed = await routedPromise.catch(() => null);
      if (routed) {
        await collectText(routed.events).catch(() => "");
      }
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(childPid).toBeGreaterThan(0);
      expect(isProcessAlive(childPid)).toBe(false);
      expect(getActiveCount("acc-a")).toBe(0);
    },
    15_000,
  );

  it("returns 503 when queue wait times out", async () => {
    db.db
      .insert(settings)
      .values({ key: "queue_timeout_sec", value: "1" })
      .onConflictDoUpdate({ target: settings.key, set: { value: "1" } })
      .run();

    db.db.delete(groupTargets).run();
    db.db
      .insert(groupTargets)
      .values({
        id: "gt-a-only",
        groupId: "group:test",
        tier: 1,
        accountId: "acc-a",
        adapterId: "fake",
        modelId: "fake",
        enabled: true,
      })
      .run();

    const hangController = new AbortController();
    const hangPromise = routeRequest(
      makeRequest({
        messages: [{ role: "user", content: "block" }],
        clientAbort: hangController.signal,
      }),
      deps({
        runCliFn: (opts) => {
          spawnCount++;
          return runCli({ ...opts, env: { ...opts.env, FAKE_SCENARIO: "hang" } });
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 150));

    await expect(
      routeRequest(makeRequest({ messages: [{ role: "user", content: "queued" }] }), deps({
        runCliFn: (opts) => {
          spawnCount++;
          return runCli({ ...opts, env: { ...opts.env, FAKE_SCENARIO: "ok" } });
        },
      })),
    ).rejects.toMatchObject({ code: "queue_timeout" });

    hangController.abort();
    try {
      const first = await hangPromise;
      for await (const _ of first.events) {
        /* drain */
      }
    } catch {
      /* aborted route may reject or error in stream */
    }
    expect(getActiveCount("acc-a")).toBe(0);
  });
});
