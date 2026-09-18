import { Readable } from "node:stream";
import { sqlite } from "../db/index.js";
import { resolveTokenRates, calculateMicroCost } from "./model-pricing.js";

export interface ComparativeSummaryItem {
  totalTokens: number;
  promptTokens: number;
  reasoningTokens: number;
  completionTokens: number;
  requests: number;
  successCount: number;
  rateLimitCount: number;
  errorCount: number;
  errorRate: number;
  avgTtftMs: number;
  estimatedCostUsd: number;
}

export interface SummaryDelta {
  totalTokensPercent: number;
  promptTokensPercent: number;
  reasoningTokensPercent: number;
  completionTokensPercent: number;
  requestsPercent: number;
  avgTtftPercent: number;
  costPercent: number;
}

export interface ComparativeSummaryResult {
  current: ComparativeSummaryItem;
  previous: ComparativeSummaryItem | null;
  delta: SummaryDelta | null;
  window: {
    startCurrent: number;
    endCurrent: number;
    startPrevious?: number;
    endPrevious?: number;
  };
}

export interface UsageTimeSeriesItem {
  bucket: string;
  requests: number;
  promptTokens: number;
  reasoningTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgTtftMs: number;
  estimatedCostUsd: number;
}

export interface PivotRowItem {
  dimAVal: string;
  dimBVal: string;
  requests: number;
  promptTokens: number;
  reasoningTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgTtftMs: number;
  avgDurationMs: number;
  tokensPerSecond: number;
  errorRate: number;
  estimatedCostUsd: number;
}

export interface FilterOptionsResult {
  models: string[];
  adapters: string[];
  accounts: string[];
}

export const ALLOWED_PIVOT_DIMENSIONS: Record<string, string> = {
  model: "COALESCE(model_executed, model_requested, 'unknown')",
  adapter: "COALESCE(adapter_id, 'unknown')",
  account: "COALESCE(account_id, 'unknown')",
  status: "CAST(status_code AS TEXT)",
  date: "strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))",
};

export class UsageAnalyticsEngine {
  /**
   * Helper to calculate percentage delta between current and previous value without division-by-zero errors.
   */
  private calcDelta(cur: number, prev: number): number {
    if (!Number.isFinite(prev) || prev === 0) {
      return cur > 0 ? 100 : 0;
    }
    const diff = cur - prev;
    return Math.round((diff / prev) * 1000) / 10;
  }

  /**
   * Compute model-accurate aggregated cost for a time slice.
   */
  private computeCostForWindow(start: number, end: number): number {
    const rows = sqlite.prepare(`
      SELECT
        COALESCE(model_executed, model_requested) as model,
        COALESCE(SUM(prompt_tokens), 0) as p,
        COALESCE(SUM(completion_tokens), 0) as c,
        COALESCE(SUM(reasoning_tokens), 0) as r
      FROM request_metrics
      WHERE created_at BETWEEN ? AND ?
      GROUP BY model
    `).all(start, end) as Array<{ model: string; p: number; c: number; r: number }>;

    let totalCost = 0;
    for (const r of rows) {
      const rates = resolveTokenRates(r.model);
      totalCost += calculateMicroCost(r.p, r.c, r.r, rates);
    }
    return Math.round(totalCost * 1_000_000) / 1_000_000;
  }

  /**
   * 1. Single-Pass Comparative Rollup
   */
  public getComparativeSummary(
    startCurrent: number,
    endCurrent: number,
    compare = true
  ): ComparativeSummaryResult {
    const duration = Math.max(1, endCurrent - startCurrent);
    const startPrevious = startCurrent - duration;
    const endPrevious = startCurrent - 1;

    const row = sqlite.prepare(`
      SELECT
        -- Current Period Metrics
        SUM(CASE WHEN created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) as cur_requests,
        SUM(CASE WHEN created_at BETWEEN ? AND ? AND status_code = 200 THEN 1 ELSE 0 END) as cur_success,
        SUM(CASE WHEN created_at BETWEEN ? AND ? AND status_code = 429 THEN 1 ELSE 0 END) as cur_rate_limits,
        SUM(CASE WHEN created_at BETWEEN ? AND ? AND (status_code >= 500 OR status = 'ERROR') THEN 1 ELSE 0 END) as cur_errors,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN prompt_tokens ELSE 0 END), 0) as cur_prompt_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN reasoning_tokens ELSE 0 END), 0) as cur_reasoning_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN completion_tokens ELSE 0 END), 0) as cur_completion_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN total_tokens ELSE 0 END), 0) as cur_total_tokens,
        COALESCE(AVG(CASE WHEN created_at BETWEEN ? AND ? AND ttft_ms > 0 THEN ttft_ms END), 0) as cur_avg_ttft,

        -- Previous Period Metrics
        SUM(CASE WHEN created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) as prev_requests,
        SUM(CASE WHEN created_at BETWEEN ? AND ? AND status_code = 200 THEN 1 ELSE 0 END) as prev_success,
        SUM(CASE WHEN created_at BETWEEN ? AND ? AND status_code = 429 THEN 1 ELSE 0 END) as prev_rate_limits,
        SUM(CASE WHEN created_at BETWEEN ? AND ? AND (status_code >= 500 OR status = 'ERROR') THEN 1 ELSE 0 END) as prev_errors,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN prompt_tokens ELSE 0 END), 0) as prev_prompt_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN reasoning_tokens ELSE 0 END), 0) as prev_reasoning_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN completion_tokens ELSE 0 END), 0) as prev_completion_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN total_tokens ELSE 0 END), 0) as prev_total_tokens,
        COALESCE(AVG(CASE WHEN created_at BETWEEN ? AND ? AND ttft_ms > 0 THEN ttft_ms END), 0) as prev_avg_ttft
      FROM request_metrics
      WHERE created_at BETWEEN ? AND ?
    `).get(
      // Current bounds
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      // Previous bounds
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      // Global outer filter
      startPrevious, endCurrent
    ) as Record<string, number> | undefined;

    const safe = row || {};
    const curRequests = safe.cur_requests || 0;
    const prevRequests = safe.prev_requests || 0;

    const curCost = this.computeCostForWindow(startCurrent, endCurrent);
    const prevCost = compare ? this.computeCostForWindow(startPrevious, endPrevious) : 0;

    const current: ComparativeSummaryItem = {
      totalTokens: safe.cur_total_tokens || 0,
      promptTokens: safe.cur_prompt_tokens || 0,
      reasoningTokens: safe.cur_reasoning_tokens || 0,
      completionTokens: safe.cur_completion_tokens || 0,
      requests: curRequests,
      successCount: safe.cur_success || 0,
      rateLimitCount: safe.cur_rate_limits || 0,
      errorCount: safe.cur_errors || 0,
      errorRate: curRequests > 0 ? Math.round(((safe.cur_errors || 0) / curRequests) * 1000) / 10 : 0,
      avgTtftMs: Math.round(safe.cur_avg_ttft || 0),
      estimatedCostUsd: curCost,
    };

    let previous: ComparativeSummaryItem | null = null;
    let delta: SummaryDelta | null = null;

    if (compare) {
      previous = {
        totalTokens: safe.prev_total_tokens || 0,
        promptTokens: safe.prev_prompt_tokens || 0,
        reasoningTokens: safe.prev_reasoning_tokens || 0,
        completionTokens: safe.prev_completion_tokens || 0,
        requests: prevRequests,
        successCount: safe.prev_success || 0,
        rateLimitCount: safe.prev_rate_limits || 0,
        errorCount: safe.prev_errors || 0,
        errorRate: prevRequests > 0 ? Math.round(((safe.prev_errors || 0) / prevRequests) * 1000) / 10 : 0,
        avgTtftMs: Math.round(safe.prev_avg_ttft || 0),
        estimatedCostUsd: prevCost,
      };

      delta = {
        totalTokensPercent: this.calcDelta(current.totalTokens, previous.totalTokens),
        promptTokensPercent: this.calcDelta(current.promptTokens, previous.promptTokens),
        reasoningTokensPercent: this.calcDelta(current.reasoningTokens, previous.reasoningTokens),
        completionTokensPercent: this.calcDelta(current.completionTokens, previous.completionTokens),
        requestsPercent: this.calcDelta(current.requests, previous.requests),
        avgTtftPercent: this.calcDelta(current.avgTtftMs, previous.avgTtftMs),
        costPercent: this.calcDelta(current.estimatedCostUsd, previous.estimatedCostUsd),
      };
    }

    return {
      current,
      previous,
      delta,
      window: {
        startCurrent,
        endCurrent,
        startPrevious: compare ? startPrevious : undefined,
        endPrevious: compare ? endPrevious : undefined,
      },
    };
  }

  /**
   * 2. Time-Series Aggregator
   */
  public getTimeSeries(
    start: number,
    end: number,
    granularity: "hour" | "day" = "day"
  ): UsageTimeSeriesItem[] {
    const pattern = granularity === "hour" ? "%Y-%m-%d %H:00" : "%Y-%m-%d";

    const rows = sqlite.prepare(`
      SELECT
        strftime('${pattern}', datetime(created_at, 'unixepoch')) as bucket,
        COUNT(*) as requests,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) as avg_ttft_ms
      FROM request_metrics
      WHERE created_at BETWEEN ? AND ?
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(start, end) as Array<{
      bucket: string;
      requests: number;
      prompt_tokens: number;
      reasoning_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      avg_ttft_ms: number;
    }>;

    return rows.map((r) => {
      // Estimate approximate cost for this bucket based on prompt/completion/reasoning
      const defaultRates = resolveTokenRates(null);
      const cost = calculateMicroCost(r.prompt_tokens, r.completion_tokens, r.reasoning_tokens, defaultRates);

      return {
        bucket: r.bucket,
        requests: r.requests,
        promptTokens: r.prompt_tokens,
        reasoningTokens: r.reasoning_tokens,
        completionTokens: r.completion_tokens,
        totalTokens: r.total_tokens,
        avgTtftMs: Math.round(r.avg_ttft_ms),
        estimatedCostUsd: cost,
      };
    });
  }

  /**
   * 3. Cross-Tabulation Pivot Matrix
   */
  public getPivotMatrix(
    dimA: string,
    dimB: string,
    start: number,
    end: number,
    search?: string
  ): PivotRowItem[] {
    const colA = ALLOWED_PIVOT_DIMENSIONS[dimA] || ALLOWED_PIVOT_DIMENSIONS["model"];
    const colB = ALLOWED_PIVOT_DIMENSIONS[dimB] || ALLOWED_PIVOT_DIMENSIONS["adapter"];

    let whereClause = "WHERE created_at BETWEEN ? AND ?";
    const bindings: unknown[] = [start, end];

    if (search && search.trim()) {
      whereClause += ` AND (${colA} LIKE ? OR ${colB} LIKE ?)`;
      const pattern = `%${search.trim()}%`;
      bindings.push(pattern, pattern);
    }

    const query = `
      SELECT
        ${colA} as dim_a_val,
        ${colB} as dim_b_val,
        COUNT(*) as requests,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) as avg_ttft_ms,
        COALESCE(AVG(total_duration_ms), 0) as avg_duration_ms,
        SUM(CASE WHEN status_code >= 400 OR status = 'ERROR' THEN 1 ELSE 0 END) as error_count
      FROM request_metrics
      ${whereClause}
      GROUP BY dim_a_val, dim_b_val
      ORDER BY total_tokens DESC
    `;

    const rows = sqlite.prepare(query).all(...bindings) as Array<{
      dim_a_val: string;
      dim_b_val: string;
      requests: number;
      prompt_tokens: number;
      reasoning_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      avg_ttft_ms: number;
      avg_duration_ms: number;
      error_count: number;
    }>;

    return rows.map((r) => {
      const activeGenSeconds = Math.max((r.avg_duration_ms - r.avg_ttft_ms) / 1000, 0.05);
      const generatedTokens = r.completion_tokens + r.reasoning_tokens;
      const tokensPerSecond = Math.round(generatedTokens / activeGenSeconds);
      const errorRate = r.requests > 0 ? Math.round((r.error_count / r.requests) * 1000) / 10 : 0;

      // Model-aware pricing if dimA or dimB is model
      const modelCandidate = dimA === "model" ? r.dim_a_val : dimB === "model" ? r.dim_b_val : null;
      const rates = resolveTokenRates(modelCandidate);
      const cost = calculateMicroCost(r.prompt_tokens, r.completion_tokens, r.reasoning_tokens, rates);

      return {
        dimAVal: String(r.dim_a_val || "unknown"),
        dimBVal: String(r.dim_b_val || "unknown"),
        requests: r.requests,
        promptTokens: r.prompt_tokens,
        reasoningTokens: r.reasoning_tokens,
        completionTokens: r.completion_tokens,
        totalTokens: r.total_tokens,
        avgTtftMs: Math.round(r.avg_ttft_ms),
        avgDurationMs: Math.round(r.avg_duration_ms),
        tokensPerSecond,
        errorRate,
        estimatedCostUsd: cost,
      };
    });
  }

  /**
   * 4. Drill-Down Records
   */
  public getDrillDownRecords(params: {
    dimA?: string;
    valA?: string;
    dimB?: string;
    valB?: string;
    start: number;
    end: number;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);

    let whereClause = "WHERE created_at BETWEEN ? AND ?";
    const bindings: unknown[] = [params.start, params.end];

    if (params.dimA && params.valA && ALLOWED_PIVOT_DIMENSIONS[params.dimA]) {
      const colA = ALLOWED_PIVOT_DIMENSIONS[params.dimA];
      whereClause += ` AND ${colA} = ?`;
      bindings.push(params.valA);
    }

    if (params.dimB && params.valB && ALLOWED_PIVOT_DIMENSIONS[params.dimB]) {
      const colB = ALLOWED_PIVOT_DIMENSIONS[params.dimB];
      whereClause += ` AND ${colB} = ?`;
      bindings.push(params.valB);
    }

    const countStmt = sqlite.prepare(`SELECT COUNT(*) as total FROM request_metrics ${whereClause}`);
    const countRow = countStmt.get(...bindings) as { total?: number } | undefined;
    const total = countRow?.total ?? 0;

    const dataStmt = sqlite.prepare(`
      SELECT
        id,
        request_id as requestId,
        adapter_id as adapterId,
        account_id as accountId,
        model_requested as modelRequested,
        COALESCE(model_executed, model_requested) as modelExecuted,
        prompt_tokens as promptTokens,
        reasoning_tokens as reasoningTokens,
        completion_tokens as completionTokens,
        total_tokens as totalTokens,
        ttft_ms as ttftMs,
        total_duration_ms as totalDurationMs,
        status_code as statusCode,
        status,
        error_message as errorMessage,
        created_at as createdAt
      FROM request_metrics
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const records = dataStmt.all(...bindings, limit, offset);
    return { records, total, limit, offset };
  }

  /**
   * 5. Filter Dropdown Options
   */
  public getFilterOptions(): FilterOptionsResult {
    const modelsRows = sqlite.prepare(`
      SELECT DISTINCT COALESCE(model_executed, model_requested) as name
      FROM request_metrics
      WHERE model_requested IS NOT NULL
      ORDER BY name ASC
    `).all() as Array<{ name: string }>;

    const adaptersRows = sqlite.prepare(`
      SELECT DISTINCT adapter_id as name
      FROM request_metrics
      WHERE adapter_id IS NOT NULL
      ORDER BY name ASC
    `).all() as Array<{ name: string }>;

    const accountsRows = sqlite.prepare(`
      SELECT DISTINCT account_id as name
      FROM request_metrics
      WHERE account_id IS NOT NULL
      ORDER BY name ASC
    `).all() as Array<{ name: string }>;

    return {
      models: modelsRows.map((r) => r.name).filter(Boolean),
      adapters: adaptersRows.map((r) => r.name).filter(Boolean),
      accounts: accountsRows.map((r) => r.name).filter(Boolean),
    };
  }

  /**
   * 6. Streaming CSV Export
   */
  public createCsvExportStream(
    start: number,
    end: number,
    filters?: { adapterId?: string; model?: string; status?: string }
  ): Readable {
    let whereClause = "WHERE created_at BETWEEN ? AND ?";
    const bindings: unknown[] = [start, end];

    if (filters?.adapterId) {
      whereClause += " AND adapter_id = ?";
      bindings.push(filters.adapterId);
    }
    if (filters?.model) {
      whereClause += " AND (model_requested = ? OR model_executed = ?)";
      bindings.push(filters.model, filters.model);
    }
    if (filters?.status) {
      whereClause += " AND status = ?";
      bindings.push(filters.status);
    }

    const stmt = sqlite.prepare(`
      SELECT
        id,
        request_id,
        adapter_id,
        account_id,
        COALESCE(model_executed, model_requested) as model,
        prompt_tokens,
        reasoning_tokens,
        completion_tokens,
        total_tokens,
        ttft_ms,
        total_duration_ms,
        status_code,
        status,
        datetime(created_at, 'unixepoch') as created_at_utc
      FROM request_metrics
      ${whereClause}
      ORDER BY created_at DESC
    `);

    const iterator = stmt.iterate(...bindings);
    let headerSent = false;

    return new Readable({
      read() {
        if (!headerSent) {
          headerSent = true;
          this.push(
            "ID,Request ID,Adapter,Account,Model,Prompt Tokens,Reasoning Tokens,Completion Tokens,Total Tokens,TTFT (ms),Duration (ms),Status Code,Status,Timestamp UTC\n"
          );
          return;
        }

        try {
          const next = iterator.next();
          if (next.done) {
            this.push(null);
          } else {
            const r = next.value as unknown as {
              id: string;
              request_id: string;
              adapter_id?: string | null;
              account_id?: string | null;
              model: string;
              prompt_tokens?: number;
              reasoning_tokens?: number;
              completion_tokens?: number;
              total_tokens?: number;
              ttft_ms?: number | null;
              total_duration_ms: number;
              status_code: number;
              status: string;
              created_at_utc: string;
            };
            const line = `"${r.id}","${r.request_id}","${r.adapter_id || ""}","${r.account_id || ""}","${r.model}",${r.prompt_tokens || 0},${r.reasoning_tokens || 0},${r.completion_tokens || 0},${r.total_tokens || 0},${r.ttft_ms || 0},${r.total_duration_ms || 0},${r.status_code || 200},"${r.status || "OK"}","${r.created_at_utc}"\n`;
            this.push(line);
          }
        } catch (err) {
          this.destroy(err instanceof Error ? err : new Error(String(err)));
        }
      },
      destroy(err, callback) {
        try {
          if (typeof iterator.return === "function") {
            iterator.return();
          }
        } finally {
          callback(err);
        }
      },
    });
  }
}

export const globalUsageAnalytics = new UsageAnalyticsEngine();
