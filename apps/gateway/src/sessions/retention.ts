import { readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Logger } from "pino";
import { eq, lte } from "drizzle-orm";
import { adapters } from "../adapters/index.js";
import type { Adapter } from "../core/types.js";
import type { DbHandle } from "../db/db.js";
import { accounts, sessions } from "../db/schema.js";
import { cliDirs, ensureSandbox } from "../runner/sandbox.js";

export interface RetentionDeps {
  db: DbHandle;
  dataDir: string;
  log: Pick<Logger, "debug" | "error" | "info" | "warn">;
}

function resolveAdapter(adapterId: string): Adapter | undefined {
  return (adapters as Record<string, Adapter | undefined>)[adapterId];
}

function safeRemove(
  path: string,
  log: RetentionDeps["log"],
): { ok: true } | { ok: false; code?: string } {
  try {
    rmSync(path, { recursive: true, force: true });
    return { ok: true };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM" || code === "ENOENT") {
      log.warn({ path, code }, "artifact delete skipped");
      return { ok: false, code };
    }
    log.error({ err, path }, "artifact delete failed");
    return { ok: false, code };
  }
}

function removePaths(paths: string[], log: RetentionDeps["log"]): string[] {
  const deleted: string[] = [];
  for (const path of paths) {
    if (safeRemove(path, log).ok) {
      deleted.push(path);
    }
  }
  return deleted;
}

function artifactPaths(
  deps: RetentionDeps,
  accountId: string,
  adapterId: string,
  cliSessionId: string,
): string[] {
  const account = deps.db.db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    return [];
  }
  const adapter = resolveAdapter(adapterId);
  if (!adapter?.sessionArtifacts) {
    return [];
  }
  const sandbox = ensureSandbox(deps.dataDir, adapterId, accountId);
  const dirs = cliDirs(adapterId, account, sandbox);
  try {
    return adapter.sessionArtifacts(dirs, cliSessionId);
  } catch {
    return [];
  }
}

export function deleteSessionArtifacts(
  deps: RetentionDeps,
  row: { accountId: string; adapterId: string; cliSessionId: string },
): string[] {
  const paths = artifactPaths(deps, row.accountId, row.adapterId, row.cliSessionId);
  return removePaths(paths, deps.log);
}

export function deleteRunArtifacts(
  deps: RetentionDeps,
  accountId: string,
  adapterId: string,
  cliSessionId: string,
): string[] {
  return deleteSessionArtifacts(deps, { accountId, adapterId, cliSessionId });
}

export function sweepSandboxes(
  deps: RetentionDeps,
  olderThanMs: number,
): { deleted: string[]; failed: string[] } {
  const deleted: string[] = [];
  const failed: string[] = [];
  const rows = deps.db.db
    .select()
    .from(accounts)
    .where(eq(accounts.useHostProfile, false))
    .all();

  for (const account of rows) {
    const adapter = resolveAdapter(account.adapterId);
    if (!adapter?.sweepArtifacts) {
      continue;
    }
    const sandbox = ensureSandbox(deps.dataDir, account.adapterId, account.id);
    const dirs = cliDirs(account.adapterId, account, sandbox);
    let paths: string[] = [];
    try {
      paths = adapter.sweepArtifacts(dirs, olderThanMs);
    } catch {
      continue;
    }
    for (const path of paths) {
      const result = safeRemove(path, deps.log);
      if (result.ok) {
        deleted.push(path);
      } else {
        failed.push(path);
      }
    }
  }
  return { deleted, failed };
}

export function sweepTempPromptFiles(olderThanMs: number): string[] {
  const cutoff = Date.now() - olderThanMs;
  const dir = tmpdir();
  const deleted: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return deleted;
  }
  for (const name of entries) {
    if (!name.startsWith("cli-to-api-system-prompt-") || !name.endsWith(".txt")) {
      continue;
    }
    const path = join(dir, name);
    try {
      if (statSync(path).mtimeMs < cutoff) {
        rmSync(path, { force: true });
        deleted.push(path);
      }
    } catch {
      /* skip */
    }
  }
  return deleted;
}

export function purgeSessionsWithArtifacts(deps: RetentionDeps, now: number): number {
  const expired = deps.db.db.select().from(sessions).where(lte(sessions.expiresAt, now)).all();
  for (const row of expired) {
    deleteSessionArtifacts(deps, {
      accountId: row.accountId,
      adapterId: row.adapterId,
      cliSessionId: row.cliSessionId,
    });
    deps.db.db.delete(sessions).where(eq(sessions.fingerprint, row.fingerprint)).run();
  }
  return expired.length;
}
