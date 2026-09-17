import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const adapterStatusEnum = ["INSTALLED", "NOT_INSTALLED", "DEGRADED"] as const;
export type AdapterStatus = (typeof adapterStatusEnum)[number];

export const adapters = sqliteTable("adapters", {
  id: text("id").primaryKey(), // e.g. "codex-cli"
  name: text("name").notNull(),
  version: text("version").notNull().default("1.0.0"),
  executable: text("executable").notNull(),
  resolvedPath: text("resolved_path").notNull().default(""),
  executionMode: text("execution_mode", { enum: ["pty", "pipe"] }).notNull().default("pipe"),
  configJson: text("config_json").notNull(),
  isInstalled: integer("is_installed", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["INSTALLED", "NOT_INSTALLED", "DEGRADED"] }).notNull().default("NOT_INSTALLED"),
  detectedVersion: text("detected_version"),
  lastProbedAt: integer("last_probed_at"),
  isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // e.g. "codex-acc-1"
  adapterId: text("adapter_id").notNull().references(() => adapters.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sandboxDir: text("sandbox_dir").notNull(),
  status: text("status", { enum: ["READY", "BUSY", "COOLDOWN", "ERROR"] }).notNull().default("READY"),
  activeSlots: integer("active_slots").notNull().default(0),
  maxSlots: integer("max_slots").notNull().default(1),
  cooldownUntil: integer("cooldown_until"),
  cooldownReason: text("cooldown_reason"),
  totalRequests: integer("total_requests").notNull().default(0),
  failedRequests: integer("failed_requests").notNull().default(0),
  avgLatencyMs: integer("avg_latency_ms").notNull().default(0),
  lastActiveAt: integer("last_active_at"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

export const models = sqliteTable("models", {
  id: text("id").primaryKey(), // e.g. "codex-cli/gpt-5.6-asta"
  adapterId: text("adapter_id").notNull().references(() => adapters.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(), // "gpt-5.6-asta"
  name: text("name").notNull(),
  tier: text("tier", { enum: ["low", "medium", "high", "xhigh"] }).notNull().default("medium"),
  contextWindow: integer("context_window").notNull().default(128000),
  costWeight: integer("cost_weight").notNull().default(1),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

export const modelAliases = sqliteTable("model_aliases", {
  alias: text("alias").primaryKey(), // "gpt-5.6-asta"
  targetModel: text("target_model").notNull(), // "codex/gpt-5.6-asta"
  description: text("description"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

export const cooldownHistory = sqliteTable("cooldown_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  cooldownSeconds: integer("cooldown_seconds").notNull(),
  startedAt: integer("started_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const requestMetrics = sqliteTable(
  "request_metrics",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    adapterId: text("adapter_id"),
    accountId: text("account_id"),
    modelRequested: text("model_requested").notNull(),
    modelExecuted: text("model_executed"),
    promptTokens: integer("prompt_tokens").default(0),
    reasoningTokens: integer("reasoning_tokens").default(0),
    completionTokens: integer("completion_tokens").default(0),
    totalTokens: integer("total_tokens").default(0),
    ttftMs: integer("ttft_ms"),
    totalDurationMs: integer("total_duration_ms").notNull(),
    statusCode: integer("status_code").notNull().default(200),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  },
  (table) => ({
    createdAtIndex: index("idx_request_metrics_created_at").on(table.createdAt),
    adapterIndex: index("idx_request_metrics_adapter_id").on(table.adapterId),
    modelExecutedIndex: index("idx_request_metrics_model_executed").on(table.modelExecuted),
    requestIdIndex: index("idx_request_metrics_request_id").on(table.requestId),
    adapterModelIndex: index("idx_request_metrics_adapter_model").on(table.adapterId, table.modelExecuted),
    accountCreatedIndex: index("idx_request_metrics_account_created").on(table.accountId, table.createdAt),
  })
);

export type RequestMetric = typeof requestMetrics.$inferSelect;
export type InsertRequestMetric = typeof requestMetrics.$inferInsert;

export const conversationThreads = sqliteTable("conversation_threads", {
  id: text("id").primaryKey(), // e.g. "th_123..."
  clientScope: text("client_scope").notNull(),
  rootHash: text("root_hash").notNull(),
  leafHash: text("leaf_hash").notNull(),
  adapterId: text("adapter_id").notNull(),
  accountId: text("account_id").notNull(),
  cliSessionId: text("cli_session_id"),
  totalTurns: integer("total_turns").notNull().default(1),
  lastActiveAt: integer("last_active_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  status: text("status", { enum: ["ACTIVE", "EXPIRED", "CORRUPTED"] }).notNull().default("ACTIVE"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});
export const targetKindEnum = ["ACCOUNT", "CLI", "MODEL", "PIPELINE"] as const;
export type TargetKind = (typeof targetKindEnum)[number];

export const effortLevelEnum = ["none", "low", "medium", "high", "xhigh"] as const;
export type EffortLevel = (typeof effortLevelEnum)[number];

export const routingPipelines = sqliteTable("routing_pipelines", {
  id: text("id").primaryKey(), // e.g. "group:deep-code" or "group:fast"
  name: text("name").notNull(),
  description: text("description"),
  virtualModelId: text("virtual_model_id").notNull().unique(), // Expose to GET /v1/models
  defaultEffortLevel: text("default_effort_level", { enum: ["none", "low", "medium", "high", "xhigh"] })
    .notNull()
    .default("medium"),
  fallbackPolicy: text("fallback_policy", { enum: ["cascade_failover", "strict_reject"] })
    .notNull()
    .default("cascade_failover"),
  maxPipelineDepth: integer("max_pipeline_depth").notNull().default(3),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});

export const pipelineTargets = sqliteTable("pipeline_targets", {
  id: text("id").primaryKey(), // UUID v4
  pipelineId: text("pipeline_id")
    .notNull()
    .references(() => routingPipelines.id, { onDelete: "cascade" }),
  targetKind: text("target_kind", { enum: ["ACCOUNT", "CLI", "MODEL", "PIPELINE"] }).notNull().default("MODEL"),
  priorityTier: integer("priority_tier").notNull().default(1), // 1 = P0, 2 = P1, 3 = P2...
  weight: integer("weight").notNull().default(100), // SWRR weight within same tier (1..100)
  adapterId: text("adapter_id")
    .notNull()
    .references(() => adapters.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(), // Model ID in adapter
  targetAccountId: text("target_account_id").references(() => accounts.id, { onDelete: "set null" }), // null = auto-balance
  effortOverride: text("effort_override", { enum: ["none", "low", "medium", "high", "xhigh"] }),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

export const failoverEvents = sqliteTable("failover_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pipelineId: text("pipeline_id").notNull(),
  requestId: text("request_id").notNull(),
  fromAccountId: text("from_account_id").notNull(),
  toAccountId: text("to_account_id").notNull(),
  triggerReason: text("trigger_reason").notNull(), // "COOLDOWN" | "SPAWN_RATE_LIMIT" | "SPAWN_CRASH"
  failoverLatencyMs: integer("failover_latency_ms").notNull().default(0),
  timestamp: integer("timestamp").default(sql`(strftime('%s', 'now'))`),
});
