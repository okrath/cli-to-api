import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import { openDb, type DbHandle } from "../../src/db/db.js";
import { runMigrations } from "../../src/db/migrate.js";
import { accounts, sessions } from "../../src/db/schema.js";
import { cliDirs, ensureSandbox } from "../../src/runner/sandbox.js";
describe("retention", () => {
  let dataDir: string;
  let db: DbHandle;
  const log = pino({ level: "silent" });
  let deleteSessionArtifacts: typeof import("../../src/sessions/retention.js").deleteSessionArtifacts;
  let purgeSessionsWithArtifacts: typeof import("../../src/sessions/retention.js").purgeSessionsWithArtifacts;
  let sweepSandboxes: typeof import("../../src/sessions/retention.js").sweepSandboxes;
  let sweepTempPromptFiles: typeof import("../../src/sessions/retention.js").sweepTempPromptFiles;

  beforeEach(async () => {
    vi.stubEnv("CTA_ENABLE_FAKE_ADAPTER", "1");
    vi.resetModules();
    ({ deleteSessionArtifacts, purgeSessionsWithArtifacts, sweepSandboxes, sweepTempPromptFiles } =
      await import("../../src/sessions/retention.js"));
    dataDir = mkdtempSync(join(tmpdir(), "cta-retention-"));
    db = openDb(join(dataDir, "test.db"));
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("purges expired sessions and their sandbox transcript files", () => {
    const accountId = "fake-acc";
    ensureSandbox(dataDir, "fake", accountId);
    db.db
      .insert(accounts)
      .values({
        id: accountId,
        adapterId: "fake",
        name: "t",
        sandboxDir: join(dataDir, "sandboxes", "fake", accountId),
        maxConcurrent: 1,
        enabled: true,
        useHostProfile: false,
        createdAt: Date.now(),
      })
      .run();

    const cliSessionId = "fake-session-001";
    const sandbox = ensureSandbox(dataDir, "fake", accountId);
    const sessionFile = join(sandbox.configDir, "fake-sessions", `${cliSessionId}.jsonl`);
    mkdirSync(join(sandbox.configDir, "fake-sessions"), { recursive: true });
    writeFileSync(sessionFile, "{}\n");

    db.db
      .insert(sessions)
      .values({
        fingerprint: "fp1",
        accountId,
        adapterId: "fake",
        modelId: "fake",
        cliSessionId,
        turns: 1,
        lastUsedAt: Date.now(),
        expiresAt: Date.now() - 1000,
      })
      .run();

    const count = purgeSessionsWithArtifacts({ db, dataDir, log }, Date.now());
    expect(count).toBe(1);
    expect(db.db.select().from(sessions).all()).toHaveLength(0);
    expect(existsSync(sessionFile)).toBe(false);
  });

  it("sweeps old sandbox artifacts and prunes agy history lines", () => {
    const accountId = "agy-acc";
    ensureSandbox(dataDir, "agy", accountId);
    db.db
      .insert(accounts)
      .values({
        id: accountId,
        adapterId: "agy",
        name: "t",
        sandboxDir: join(dataDir, "sandboxes", "agy", accountId),
        maxConcurrent: 1,
        enabled: true,
        useHostProfile: false,
        createdAt: Date.now(),
      })
      .run();

    const sandbox = ensureSandbox(dataDir, "agy", accountId);
    const base = join(sandbox.homeDir, ".gemini", "antigravity-cli");
    const oldBrain = join(base, "brain", "old-conv");
    mkdirSync(oldBrain, { recursive: true });
    const oldAnn = join(base, "annotations", "old-conv.pbtxt");
    mkdirSync(join(base, "annotations"), { recursive: true });
    writeFileSync(oldAnn, "x");
    const oldTime = new Date(Date.now() - 86400_000 * 2);
    utimesSync(oldBrain, oldTime, oldTime);
    utimesSync(oldAnn, oldTime, oldTime);

    const historyPath = join(base, "history.jsonl");
    mkdirSync(base, { recursive: true });
    writeFileSync(
      historyPath,
      `${JSON.stringify({ timestamp: Date.now() - 86400_000 * 2, display: "old" })}\n${JSON.stringify({ timestamp: Date.now(), display: "new" })}\n`,
    );

    const { deleted } = sweepSandboxes({ db, dataDir, log }, 86400_000);
    expect(deleted.some((p) => p.includes("old-conv"))).toBe(true);
    const kept = readFileSync(historyPath, "utf8");
    expect(kept).toContain("new");
    expect(kept).not.toContain("old");
  });

  it("removes temp system-prompt files older than one hour", () => {
    const dir = tmpdir();
    const path = join(dir, `cli-to-api-system-prompt-retention-test-${Date.now()}.txt`);
    writeFileSync(path, "prompt");
    const old = new Date(Date.now() - 3_600_000 * 2);
    utimesSync(path, old, old);
    const deleted = sweepTempPromptFiles(3_600_000);
    expect(deleted).toContain(path);
    expect(existsSync(path)).toBe(false);
  });

  it("tolerates missing artifact paths", () => {
    db.db
      .insert(accounts)
      .values({
        id: "fake-x",
        adapterId: "fake",
        name: "t",
        sandboxDir: join(dataDir, "sandboxes", "fake", "fake-x"),
        maxConcurrent: 1,
        enabled: true,
        useHostProfile: false,
        createdAt: Date.now(),
      })
      .run();
    ensureSandbox(dataDir, "fake", "fake-x");
    const removed = deleteSessionArtifacts(
      { db, dataDir, log },
      { accountId: "fake-x", adapterId: "fake", cliSessionId: "missing" },
    );
    expect(removed).toEqual([]);
  });
});

describe("claude host-profile sessionArtifacts", () => {
  it("only returns paths under the session transcript file", () => {
    const configDir = mkdtempSync(join(tmpdir(), "cta-claude-host-"));
    const sessionId = "sess-abc";
    const projectDir = join(configDir, "projects", "encoded-ws");
    mkdirSync(projectDir, { recursive: true });
    const transcript = join(projectDir, `${sessionId}.jsonl`);
    writeFileSync(transcript, "{}");
    writeFileSync(join(projectDir, "other.jsonl"), "{}");

    const dirs = cliDirs("claude-code", { useHostProfile: true }, {
      accountDir: "/unused",
      homeDir: "/unused/home",
      configDir: "/unused/config",
      workspaceDir: "/unused/ws",
    });
    const paths = claudeCodeAdapter.sessionArtifacts!(
      { ...dirs, configDir },
      sessionId,
    );
    expect(paths).toEqual([transcript]);
    rmSync(configDir, { recursive: true, force: true });
  });
});
