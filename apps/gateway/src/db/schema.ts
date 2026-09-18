import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  adapterId: text("adapter_id").notNull(),
  name: text("name").notNull(),
  sandboxDir: text("sandbox_dir").notNull(),
  maxConcurrent: integer("max_concurrent").notNull().default(1),
  cooldownUntil: integer("cooldown_until"),
  cooldownReason: text("cooldown_reason"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

export const accountRateLimits = sqliteTable(
  "account_rate_limits",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    windowName: text("window_name").notNull(),
    utilization: real("utilization").notNull(),
    resetsAt: integer("resets_at").notNull(),
    observedAt: integer("observed_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.windowName] })],
);

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  defaultEffort: text("default_effort"),
  allowTools: integer("allow_tools", { mode: "boolean" }).notNull().default(false),
  cacheTtlSec: integer("cache_ttl_sec").notNull().default(0),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

export const groupTargets = sqliteTable("group_targets", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id),
  tier: integer("tier").notNull().default(1),
  accountId: text("account_id").references(() => accounts.id),
  adapterId: text("adapter_id").notNull(),
  modelId: text("model_id").notNull(),
  effortOverride: text("effort_override"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastUsedAt: integer("last_used_at"),
  createdAt: integer("created_at").notNull(),
});

export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(),
  apiKeyId: text("api_key_id")
    .notNull()
    .references(() => apiKeys.id),
  dialect: text("dialect").notNull(),
  modelRequested: text("model_requested").notNull(),
  groupId: text("group_id"),
  accountId: text("account_id"),
  adapterId: text("adapter_id"),
  modelExecuted: text("model_executed"),
  status: text("status").notNull(),
  errorKind: text("error_kind"),
  inputTokens: integer("input_tokens"),
  cachedInputTokens: integer("cached_input_tokens"),
  cacheWriteTokens: integer("cache_write_tokens"),
  outputTokens: integer("output_tokens"),
  reasoningTokens: integer("reasoning_tokens"),
  costUsd: real("cost_usd"),
  ttftMs: integer("ttft_ms"),
  durationMs: integer("duration_ms"),
  sessionReused: integer("session_reused", { mode: "boolean" }),
  failoverCount: integer("failover_count"),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  fingerprint: text("fingerprint").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  adapterId: text("adapter_id").notNull(),
  modelId: text("model_id").notNull(),
  cliSessionId: text("cli_session_id").notNull(),
  turns: integer("turns").notNull(),
  lastUsedAt: integer("last_used_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const responseCache = sqliteTable("response_cache", {
  key: text("key").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id),
  bodyJson: text("body_json").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
