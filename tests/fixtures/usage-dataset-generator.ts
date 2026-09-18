import { sqlite } from "../../apps/gateway/src/db/index.js";
import { randomUUID } from "node:crypto";

export interface SeedOptions {
  count?: number;
  daysSpan?: number;
  prefix?: string;
  models?: string[];
  adapters?: string[];
  accounts?: string[];
}

interface GeneratedMetricItem {
  id: string;
  requestId: string;
  adapterId: string;
  accountId: string;
  modelRequested: string;
  modelExecuted: string;
  promptTokens: number;
  reasoningTokens: number;
  completionTokens: number;
  totalTokens: number;
  ttftMs: number;
  totalDurationMs: number;
  statusCode: number;
  status: string;
  errorMessage: string | null;
  createdAt: number;
}

/**
 * Deterministic synthetic dataset generator for Usage Analytics testing.
 */
export function seedUsageDataset(options: SeedOptions = {}) {
  const count = options.count ?? 500;
  const daysSpan = options.daysSpan ?? 14;
  const prefix = options.prefix ?? "fixture-req-";

  const models = options.models ?? [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "gpt-4o",
    "gpt-4o-mini",
    "o1-mini",
    "deepseek-reasoner",
  ];

  const adapters = options.adapters ?? ["claude-code", "codex-cli", "devin-cli", "omp-cli"];
  const accounts = options.accounts ?? ["acc-prod-1", "acc-prod-2", "acc-sandbox-dev"];

  const now = Math.floor(Date.now() / 1000);
  const totalSeconds = daysSpan * 86400;

  const insertStmt = sqlite.prepare(`
    INSERT INTO request_metrics (
      id, request_id, adapter_id, account_id,
      model_requested, model_executed,
      prompt_tokens, reasoning_tokens, completion_tokens, total_tokens,
      ttft_ms, total_duration_ms, status_code, status, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = sqlite.transaction((items: GeneratedMetricItem[]) => {
    for (const item of items) {
      insertStmt.run(
        item.id,
        item.requestId,
        item.adapterId,
        item.accountId,
        item.modelRequested,
        item.modelExecuted,
        item.promptTokens,
        item.reasoningTokens,
        item.completionTokens,
        item.totalTokens,
        item.ttftMs,
        item.totalDurationMs,
        item.statusCode,
        item.status,
        item.errorMessage,
        item.createdAt
      );
    }
  });

  const generatedItems: GeneratedMetricItem[] = [];
  for (let i = 0; i < count; i++) {
    const id = `fix-${randomUUID().slice(0, 8)}`;
    const requestId = `${prefix}${randomUUID().slice(0, 10)}`;
    const model = models[i % models.length];
    const adapter = adapters[i % adapters.length];
    const account = accounts[i % accounts.length];

    // Timestamp evenly distributed across daysSpan
    const createdAt = now - Math.floor((i / count) * totalSeconds);

    const isReasoning = model.includes("o1") || model.includes("reasoner") || model.includes("3-7");
    const promptTokens = 200 + (i % 80) * 20;
    const reasoningTokens = isReasoning ? 100 + (i % 40) * 15 : 0;
    const completionTokens = 150 + (i % 60) * 10;
    const totalTokens = promptTokens + reasoningTokens + completionTokens;

    const ttftMs = 150 + (i % 50) * 10;
    const totalDurationMs = ttftMs + 500 + (i % 30) * 50;

    const isError = i % 25 === 0;
    const isRateLimit = i % 40 === 0;
    const statusCode = isRateLimit ? 429 : isError ? 500 : 200;
    const status = isRateLimit ? "RATE_LIMITED" : isError ? "ERROR" : "SUCCESS";
    const errorMessage = isError ? "Simulated downstream CLI failure" : null;

    generatedItems.push({
      id,
      requestId,
      adapterId: adapter,
      accountId: account,
      modelRequested: model,
      modelExecuted: model,
      promptTokens,
      reasoningTokens,
      completionTokens,
      totalTokens,
      ttftMs,
      totalDurationMs,
      statusCode,
      status,
      errorMessage,
      createdAt,
    });
  }

  insertMany(generatedItems);
  return { generatedCount: generatedItems.length, prefix };
}

export function cleanUsageDataset(prefix = "fixture-req-") {
  sqlite.prepare("DELETE FROM request_metrics WHERE request_id LIKE ?").run(`${prefix}%`);
}
