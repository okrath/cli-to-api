import { sqlite, closeDatabase } from "./index.js";

export function runMigrations(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS adapters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0.0',
      executable TEXT NOT NULL,
      resolved_path TEXT,
      execution_mode TEXT NOT NULL DEFAULT 'pipe' CHECK(execution_mode IN ('pty', 'pipe')),
      config_json TEXT NOT NULL,
      is_installed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'NOT_INSTALLED' CHECK(status IN ('INSTALLED', 'NOT_INSTALLED', 'DEGRADED')),
      detected_version TEXT,
      last_probed_at INTEGER,
      is_custom INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      adapter_id TEXT NOT NULL REFERENCES adapters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sandbox_dir TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY', 'BUSY', 'COOLDOWN', 'ERROR', 'CLI_MISSING')),
      active_slots INTEGER NOT NULL DEFAULT 0,
      max_slots INTEGER NOT NULL DEFAULT 1,
      cooldown_until INTEGER,
      cooldown_reason TEXT,
      total_requests INTEGER NOT NULL DEFAULT 0,
      failed_requests INTEGER NOT NULL DEFAULT 0,
      avg_latency_ms INTEGER NOT NULL DEFAULT 0,
      last_active_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      adapter_id TEXT NOT NULL REFERENCES adapters(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      name TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'medium' CHECK(tier IN ('low', 'medium', 'high', 'xhigh')),
      context_window INTEGER NOT NULL DEFAULT 128000,
      cost_weight INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS model_aliases (
      alias TEXT PRIMARY KEY,
      target_model TEXT NOT NULL,
      description TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS cooldown_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      cooldown_seconds INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS request_metrics (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      adapter_id TEXT,
      account_id TEXT,
      model_requested TEXT NOT NULL,
      model_executed TEXT,
      prompt_tokens INTEGER DEFAULT 0,
      reasoning_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      ttft_ms INTEGER,
      total_duration_ms INTEGER NOT NULL,
      status_code INTEGER NOT NULL DEFAULT 200,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );


    CREATE INDEX IF NOT EXISTS idx_accounts_adapter_id ON accounts(adapter_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
    CREATE INDEX IF NOT EXISTS idx_models_adapter_id ON models(adapter_id);
    CREATE INDEX IF NOT EXISTS idx_models_tier ON models(tier);
    CREATE INDEX IF NOT EXISTS idx_adapters_status ON adapters(status);

    CREATE TABLE IF NOT EXISTS conversation_threads (
      id TEXT PRIMARY KEY,
      client_scope TEXT NOT NULL,
      root_hash TEXT NOT NULL,
      leaf_hash TEXT NOT NULL,
      adapter_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      cli_session_id TEXT,
      total_turns INTEGER NOT NULL DEFAULT 1,
      last_active_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'EXPIRED', 'CORRUPTED')),
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_threads_root_hash ON conversation_threads(client_scope, root_hash);
    CREATE INDEX IF NOT EXISTS idx_threads_expires_at ON conversation_threads(expires_at);
    CREATE TABLE IF NOT EXISTS routing_pipelines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      virtual_model_id TEXT NOT NULL UNIQUE,
      default_effort_level TEXT NOT NULL DEFAULT 'medium' CHECK(default_effort_level IN ('none', 'low', 'medium', 'high', 'xhigh')),
      fallback_policy TEXT NOT NULL DEFAULT 'cascade_failover' CHECK(fallback_policy IN ('cascade_failover', 'strict_reject')),
      max_pipeline_depth INTEGER NOT NULL DEFAULT 3,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS pipeline_targets (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL REFERENCES routing_pipelines(id) ON DELETE CASCADE,
      target_kind TEXT NOT NULL DEFAULT 'MODEL' CHECK(target_kind IN ('ACCOUNT', 'CLI', 'MODEL')),
      priority_tier INTEGER NOT NULL DEFAULT 1,
      weight INTEGER NOT NULL DEFAULT 100,
      adapter_id TEXT NOT NULL REFERENCES adapters(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      target_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      effort_override TEXT CHECK(effort_override IN ('none', 'low', 'medium', 'high', 'xhigh')),
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS failover_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      from_account_id TEXT NOT NULL,
      to_account_id TEXT NOT NULL,
      trigger_reason TEXT NOT NULL,
      failover_latency_ms INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_targets_pipeline_id ON pipeline_targets(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_pipeline_targets_priority ON pipeline_targets(priority_tier);
    CREATE INDEX IF NOT EXISTS idx_routing_pipelines_virtual_model ON routing_pipelines(virtual_model_id);
    CREATE INDEX IF NOT EXISTS idx_failover_events_pipeline_id ON failover_events(pipeline_id);
  `);

  // Additive migrations for existing tables
  const adapterColumns = sqlite.pragma("table_info(adapters)") as Array<{ name: string }>;
  const columnNames = new Set(adapterColumns.map((c) => c.name));

  if (!columnNames.has("is_installed")) {
    sqlite.exec("ALTER TABLE adapters ADD COLUMN is_installed INTEGER NOT NULL DEFAULT 0;");
  }
  if (!columnNames.has("status")) {
    sqlite.exec("ALTER TABLE adapters ADD COLUMN status TEXT NOT NULL DEFAULT 'NOT_INSTALLED';");
  }
  if (!columnNames.has("detected_version")) {
    sqlite.exec("ALTER TABLE adapters ADD COLUMN detected_version TEXT;");
  }
  if (!columnNames.has("last_probed_at")) {
    sqlite.exec("ALTER TABLE adapters ADD COLUMN last_probed_at INTEGER;");
  }
  if (!columnNames.has("is_custom")) {
    sqlite.exec("ALTER TABLE adapters ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0;");
  }

  // Additive migrations for request_metrics
  const metricColumns = sqlite.pragma("table_info(request_metrics)") as Array<{ name: string }>;
  const metricColumnSet = new Set(metricColumns.map((c) => c.name));

  try {
    if (!metricColumnSet.has("adapter_id")) {
      sqlite.exec("ALTER TABLE request_metrics ADD COLUMN adapter_id TEXT;");
    }
  } catch {}
  try {
    if (!metricColumnSet.has("reasoning_tokens")) {
      sqlite.exec("ALTER TABLE request_metrics ADD COLUMN reasoning_tokens INTEGER DEFAULT 0;");
    }
  } catch {}
  try {
    if (!metricColumnSet.has("total_tokens")) {
      sqlite.exec("ALTER TABLE request_metrics ADD COLUMN total_tokens INTEGER DEFAULT 0;");
    }
  } catch {}
  // Composite and single indexes for request_metrics (created after columns guaranteed)
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_request_metrics_created_at ON request_metrics(created_at);
    CREATE INDEX IF NOT EXISTS idx_request_metrics_adapter_id ON request_metrics(adapter_id);
    CREATE INDEX IF NOT EXISTS idx_request_metrics_model_executed ON request_metrics(model_executed);
    CREATE INDEX IF NOT EXISTS idx_request_metrics_request_id ON request_metrics(request_id);
    CREATE INDEX IF NOT EXISTS idx_request_metrics_adapter_model ON request_metrics(adapter_id, model_executed);
    CREATE INDEX IF NOT EXISTS idx_request_metrics_account_created ON request_metrics(account_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_request_metrics_usage_analytics ON request_metrics(created_at, adapter_id, model_executed, account_id, status_code);
  `);
}

// If executed directly via CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("migrate.ts")) {
  console.log("Running SQLite migrations in WAL mode...");
  runMigrations();
  const journalMode = sqlite.pragma("journal_mode", { simple: true });
  console.log(`Migrations complete. Database journal_mode: ${journalMode}`);
  closeDatabase();
}
