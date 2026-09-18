import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { DbHandle } from "../../db/db.js";
import { accountRateLimits, accounts, apiKeys, requests } from "../../db/schema.js";
import { sendAdminError } from "./shared.js";

function todayStartMs(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function parseIsoMs(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : fallback;
}

type SummaryBy = "api_key" | "account" | "model" | "group";
type SummaryBucket = "day" | "hour";

function bucketExpr(bucket: SummaryBucket) {
  if (bucket === "hour") {
    return sql<string>`strftime('%Y-%m-%dT%H:00:00.000Z', ${requests.createdAt} / 1000, 'unixepoch')`;
  }
  return sql<string>`strftime('%Y-%m-%d', ${requests.createdAt} / 1000, 'unixepoch')`;
}

function keyExpr(by: SummaryBy) {
  switch (by) {
    case "api_key":
      return sql<string>`coalesce(${requests.apiKeyId}, '')`;
    case "account":
      return sql<string>`coalesce(${requests.accountId}, '')`;
    case "model":
      return sql<string>`coalesce(${requests.modelExecuted}, ${requests.modelRequested}, '')`;
    case "group":
      return sql<string>`coalesce(${requests.groupId}, '')`;
  }
}

function labelExpr(by: SummaryBy) {
  switch (by) {
    case "api_key":
      return sql<string>`coalesce(${apiKeys.name}, ${requests.apiKeyId}, '')`;
    case "account":
      return sql<string>`coalesce(${accounts.name}, ${requests.accountId}, '')`;
    case "model":
      return sql<string>`coalesce(${requests.modelExecuted}, ${requests.modelRequested}, '')`;
    case "group":
      return sql<string>`coalesce(${requests.groupId}, '')`;
  }
}

export function registerUsageRoutes(app: FastifyInstance, handle: DbHandle): void {
  app.get("/requests", async (request) => {
    const query = request.query as {
      limit?: string;
      offset?: string;
      status?: string;
      apiKeyId?: string;
      accountId?: string;
      groupId?: string;
    };

    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);
    const offset = Math.max(Number(query.offset ?? 0), 0);

    const filters = [];
    if (query.status) {
      filters.push(eq(requests.status, query.status));
    }
    if (query.apiKeyId) {
      filters.push(eq(requests.apiKeyId, query.apiKeyId));
    }
    if (query.accountId) {
      filters.push(eq(requests.accountId, query.accountId));
    }
    if (query.groupId) {
      filters.push(eq(requests.groupId, query.groupId));
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const rows = handle.db
      .select()
      .from(requests)
      .where(whereClause)
      .orderBy(desc(requests.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return rows.map((row) => ({
      id: row.id,
      apiKeyId: row.apiKeyId,
      dialect: row.dialect,
      modelRequested: row.modelRequested,
      groupId: row.groupId,
      accountId: row.accountId,
      adapterId: row.adapterId,
      modelExecuted: row.modelExecuted,
      status: row.status,
      errorKind: row.errorKind,
      inputTokens: row.inputTokens,
      cachedInputTokens: row.cachedInputTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      outputTokens: row.outputTokens,
      reasoningTokens: row.reasoningTokens,
      costUsd: row.costUsd,
      ttftMs: row.ttftMs,
      durationMs: row.durationMs,
      sessionReused: row.sessionReused,
      failoverCount: row.failoverCount,
      createdAt: row.createdAt,
    }));
  });

  app.get("/usage/summary", async (request, reply) => {
    const query = request.query as {
      from?: string;
      to?: string;
      bucket?: string;
      by?: string;
    };

    const bucket = query.bucket === "hour" ? "hour" : "day";
    const by = query.by as SummaryBy | undefined;
    if (!by || !["api_key", "account", "model", "group"].includes(by)) {
      sendAdminError(reply, 400, "Query param 'by' must be api_key, account, model, or group");
      return;
    }

    const now = Date.now();
    const fromMs = parseIsoMs(query.from, now - 7 * 24 * 60 * 60 * 1000);
    const toMs = parseIsoMs(query.to, now);

    const bucketCol = bucketExpr(bucket);
    const keyCol = keyExpr(by);
    const labelCol = labelExpr(by);
    const aggregates = {
      requests: sql<number>`count(*)`,
      input: sql<number>`coalesce(sum(${requests.inputTokens}), 0)`,
      cachedInput: sql<number>`coalesce(sum(${requests.cachedInputTokens}), 0)`,
      cacheWrite: sql<number>`coalesce(sum(${requests.cacheWriteTokens}), 0)`,
      output: sql<number>`coalesce(sum(${requests.outputTokens}), 0)`,
      reasoning: sql<number>`coalesce(sum(${requests.reasoningTokens}), 0)`,
      costUsd: sql<number>`coalesce(sum(${requests.costUsd}), 0)`,
    };
    const timeFilter = and(gte(requests.createdAt, fromMs), lt(requests.createdAt, toMs));

    const rows =
      by === "api_key"
        ? handle.db
            .select({ bucket: bucketCol, key: keyCol, label: labelCol, ...aggregates })
            .from(requests)
            .leftJoin(apiKeys, eq(requests.apiKeyId, apiKeys.id))
            .where(timeFilter)
            .groupBy(bucketCol, keyCol, labelCol)
            .orderBy(bucketCol, keyCol)
            .all()
        : by === "account"
          ? handle.db
              .select({ bucket: bucketCol, key: keyCol, label: labelCol, ...aggregates })
              .from(requests)
              .leftJoin(accounts, eq(requests.accountId, accounts.id))
              .where(timeFilter)
              .groupBy(bucketCol, keyCol, labelCol)
              .orderBy(bucketCol, keyCol)
              .all()
          : handle.db
              .select({ bucket: bucketCol, key: keyCol, label: labelCol, ...aggregates })
              .from(requests)
              .where(timeFilter)
              .groupBy(bucketCol, keyCol, labelCol)
              .orderBy(bucketCol, keyCol)
              .all();

    return rows.map((row) => ({
      bucket: row.bucket,
      key: row.key,
      label: row.label,
      requests: Number(row.requests),
      input: Number(row.input),
      cachedInput: Number(row.cachedInput),
      cacheWrite: Number(row.cacheWrite),
      output: Number(row.output),
      reasoning: Number(row.reasoning),
      costUsd: Number(row.costUsd),
    }));
  });

  app.get("/usage/quota", async () => {
    const accountRows = handle.db.select().from(accounts).all();
    const start = todayStartMs();

    return accountRows.map((account) => {
      const windows = handle.db
        .select({
          name: accountRateLimits.windowName,
          utilization: accountRateLimits.utilization,
          resetsAt: accountRateLimits.resetsAt,
          observedAt: accountRateLimits.observedAt,
        })
        .from(accountRateLimits)
        .where(eq(accountRateLimits.accountId, account.id))
        .all();

      const tokenRow = handle.db
        .select({
          total: sql<number>`coalesce(sum(
            coalesce(${requests.inputTokens}, 0) +
            coalesce(${requests.cachedInputTokens}, 0) +
            coalesce(${requests.cacheWriteTokens}, 0) +
            coalesce(${requests.outputTokens}, 0) +
            coalesce(${requests.reasoningTokens}, 0)
          ), 0)`,
        })
        .from(requests)
        .where(and(eq(requests.accountId, account.id), gte(requests.createdAt, start)))
        .get();

      return {
        accountId: account.id,
        accountName: account.name,
        adapterId: account.adapterId,
        cooldownUntil: account.cooldownUntil,
        cooldownReason: account.cooldownReason,
        windows,
        todayTokens: Number(tokenRow?.total ?? 0),
      };
    });
  });
}
