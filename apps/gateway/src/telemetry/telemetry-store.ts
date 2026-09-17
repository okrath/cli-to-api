import { sqlite } from "../db/index.js";

export interface LedgerQueryParams {
  limit?: number;
  offset?: number;
  search?: string;
  adapterId?: string;
  model?: string;
  status?: string;
  timeWindowSeconds?: number;
}

export class TelemetryStore {
  public queryLedger(params: LedgerQueryParams) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);

    let whereClause = "WHERE 1=1";
    const bindings: unknown[] = [];

    if (params.timeWindowSeconds && params.timeWindowSeconds > 0) {
      const minTimestamp = Math.floor(Date.now() / 1000) - params.timeWindowSeconds;
      whereClause += " AND created_at >= ?";
      bindings.push(minTimestamp);
    }
    if (params.adapterId) {
      whereClause += " AND adapter_id = ?";
      bindings.push(params.adapterId);
    }
    if (params.model) {
      whereClause += " AND (model_requested = ? OR model_executed = ?)";
      bindings.push(params.model, params.model);
    }
    if (params.status) {
      whereClause += " AND status = ?";
      bindings.push(params.status);
    }
    if (params.search) {
      whereClause += " AND (request_id LIKE ? OR error_message LIKE ?)";
      const pattern = `%${params.search}%`;
      bindings.push(pattern, pattern);
    }

    const countStmt = sqlite.prepare(`SELECT COUNT(*) as total FROM request_metrics ${whereClause}`);
    const countRow = countStmt.get(...bindings);
    const total = (typeof countRow === "object" && countRow !== null && "total" in countRow && typeof countRow.total === "number")
      ? countRow.total
      : 0;

    const dataStmt = sqlite.prepare(`
      SELECT * FROM request_metrics
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    const records = dataStmt.all(...bindings, limit, offset);

    return { records, total, limit, offset };
  }

  public getSummary(timeWindowSeconds?: number) {
    let whereClause = "";
    const bindings: unknown[] = [];
    if (timeWindowSeconds && timeWindowSeconds > 0) {
      whereClause = "WHERE created_at >= ?";
      bindings.push(Math.floor(Date.now() / 1000) - timeWindowSeconds);
    }

    const row = sqlite.prepare(`
      SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) as successful_requests,
        SUM(CASE WHEN status_code = 429 THEN 1 ELSE 0 END) as rate_limited_requests,
        SUM(CASE WHEN status_code >= 500 OR status = 'ERROR' THEN 1 ELSE 0 END) as failed_requests,
        COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as total_reasoning_tokens,
        COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) as avg_ttft_ms,
        COALESCE(AVG(total_duration_ms), 0) as avg_duration_ms
      FROM request_metrics
      ${whereClause}
    `).get(...bindings) as Record<string, number>;

    return row || {};
  }

  public getBreakdown(timeWindowSeconds?: number) {
    let whereClause = "";
    const bindings: unknown[] = [];
    if (timeWindowSeconds && timeWindowSeconds > 0) {
      whereClause = "WHERE created_at >= ?";
      bindings.push(Math.floor(Date.now() / 1000) - timeWindowSeconds);
    }

    const byProvider = sqlite.prepare(`
      SELECT
        COALESCE(adapter_id, 'unknown') as adapter_id,
        COUNT(*) as call_count,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens
      FROM request_metrics
      ${whereClause}
      GROUP BY adapter_id
      ORDER BY total_tokens DESC
    `).all(...bindings);

    const byModel = sqlite.prepare(`
      SELECT
        COALESCE(model_executed, model_requested) as model,
        COALESCE(adapter_id, 'unknown') as adapter_id,
        COUNT(*) as call_count,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(ttft_ms), 0) as avg_ttft_ms
      FROM request_metrics
      ${whereClause}
      GROUP BY model, adapter_id
      ORDER BY total_tokens DESC
    `).all(...bindings);

    return { byProvider, byModel };
  }
}

export const globalTelemetryStore = new TelemetryStore();
