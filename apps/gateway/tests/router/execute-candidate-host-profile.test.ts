import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRequest } from "../../src/core/types.js";
import { openDb, type DbHandle } from "../../src/db/db.js";
import { runMigrations } from "../../src/db/migrate.js";
import { accounts } from "../../src/db/schema.js";
import type { runCli as RunCliFn } from "../../src/runner/run-cli.js";

const log = pino({ level: "silent" });

describe("executeCandidate host profile env", () => {
  let dataDir: string;
  let db: DbHandle;
  let executeCandidate: typeof import("../../src/router/execute-candidate.js").executeCandidate;
  let runCli: typeof RunCliFn;
  let capturedEnv: NodeJS.ProcessEnv | undefined;

  beforeEach(async () => {
    vi.stubEnv("CTA_ENABLE_FAKE_ADAPTER", "1");
    vi.resetModules();
    [{ executeCandidate }, { runCli }] = await Promise.all([
      import("../../src/router/execute-candidate.js"),
      import("../../src/runner/run-cli.js"),
    ]);

    dataDir = mkdtempSync(join(tmpdir(), "cli-to-api-host-profile-"));
    db = openDb(join(dataDir, "test.db"));
    runMigrations(db);
    capturedEnv = undefined;

    db.db
      .insert(accounts)
      .values({
        id: "fake-host",
        adapterId: "fake",
        name: "Host profile",
        sandboxDir: join(dataDir, "sandboxes", "fake", "fake-host"),
        maxConcurrent: 1,
        enabled: true,
        useHostProfile: true,
        createdAt: Date.now(),
      })
      .run();
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function collectTextFromEvents(events: Iterable<{ type: string; text?: string }>): string {
    let text = "";
    for (const event of events) {
      if (event.type === "text_delta") text += event.text ?? "";
    }
    return text;
  }

  async function collectText(result: {
    leadIn: Array<{ type: string; text?: string }>;
    stream: AsyncIterable<{ type: string; text?: string }>;
  }): Promise<string> {
    let text = collectTextFromEvents(result.leadIn);
    for await (const event of result.stream) {
      if (event.type === "text_delta") text += event.text ?? "";
    }
    return text;
  }

  it("uses the real profile env and skips adapter buildEnv", async () => {
    const req: ChatRequest = {
      requestId: "req_host",
      apiKeyId: "key_test",
      dialect: "openai",
      model: "fake/fake",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      retention: "standard",
      clientAbort: new AbortController().signal,
    };

    const result = await executeCandidate({
      req,
      db,
      log,
      dataDir,
      candidate: {
        tier: 1,
        adapterId: "fake",
        modelId: "fake",
        accountId: "fake-host",
      },
      account: { id: "fake-host", adapterId: "fake", useHostProfile: true },
      allowTools: false,
      effort: undefined,
      settings: {
        defaultCooldownSec: 1800,
        sessionTtlSec: 86400,
        requestTimeoutSec: 600,
        queueTimeoutSec: 30,
        toolResultTimeoutSec: 300,
        toolMaxTurns: 25,
      },
      release: () => {},
      mcpBaseUrl: "http://127.0.0.1:8080",
      runCliFn: (opts) => {
        capturedEnv = opts.env;
        return runCli({
          ...opts,
          env: {
            ...opts.env,
            FAKE_SCENARIO: "ok",
            FAKE_ECHO_ENV: "1",
            FAKE_TEXT: "host-profile-ok",
          },
        });
      },
      controller: new AbortController(),
    });

    const text = await collectText(result);
    expect(text).toContain("host-profile-ok");
    expect(text).toContain(`USERPROFILE=${process.env.USERPROFILE ?? ""}`);
    expect(text).toContain(`HOME=${process.env.HOME ?? ""}`);
    expect(capturedEnv?.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(capturedEnv?.USERPROFILE).toBe(process.env.USERPROFILE);
  });
});
