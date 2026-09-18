const API_KEY_STORAGE_KEY = "cta_api_key";
const DEFAULT_API_KEY = "sk-cta-dev";

export interface AccountData {
  id: string;
  adapterId: string;
  name: string;
  sandboxDir: string;
  status: "READY" | "BUSY" | "COOLDOWN" | "ERROR";
  activeSlots: number;
  maxSlots: number;
  cooldownSecondsRemaining: number;
  totalRequests: number;
  avgLatencyMs: number;
}

export interface AdapterData {
  id: string;
  name: string;
  version: string;
  executable: string;
  executionMode: "pty" | "pipe";
  resolvedPath?: string | null;
  isInstalled: boolean;
  status: "INSTALLED" | "NOT_INSTALLED" | "DEGRADED";
  detectedVersion?: string | null;
  lastProbedAt?: number | null;
  isCustom?: boolean;
  accountsCount: number;
  hasHealthyAccounts: boolean;
  models: Array<{
    id: string;
    name: string;
    tier: string;
    context_window?: number;
    cost_weight?: number;
  }>;
}

export interface OpenAiModel {
  id: string;
  owned_by: string;
  meta?: {
    is_virtual?: boolean;
    is_group?: boolean;
    default_effort?: string;
    targets_count?: number;
    provider?: string;
    tier?: string;
    context_window?: number;
    cost_weight?: number;
    description?: string;
  };
}

export interface PipelineTargetData {
  id: string;
  pipelineId: string;
  targetKind: "ACCOUNT" | "CLI" | "MODEL";
  priorityTier: number;
  weight: number;
  adapterId: string;
  modelId: string;
  targetAccountId?: string | null;
  effortOverride?: "none" | "low" | "medium" | "high" | "xhigh" | null;
  isEnabled: boolean;
}

export interface RoutingGroupData {
  id: string;
  name: string;
  description?: string | null;
  virtualModelId: string;
  defaultEffortLevel: "none" | "low" | "medium" | "high" | "xhigh";
  fallbackPolicy: "cascade_failover" | "strict_reject";
  maxPipelineDepth: number;
  isEnabled: boolean;
  targets: PipelineTargetData[];
}

export interface CreateRoutingGroupInput {
  id?: string;
  name: string;
  description?: string;
  virtualModelId?: string;
  defaultEffortLevel?: "none" | "low" | "medium" | "high" | "xhigh";
  fallbackPolicy?: "cascade_failover" | "strict_reject";
  maxPipelineDepth?: number;
  targets?: Array<{
    id?: string;
    targetKind: "ACCOUNT" | "CLI" | "MODEL";
    priorityTier: number;
    weight: number;
    adapterId: string;
    modelId: string;
    targetAccountId?: string | null;
    effortOverride?: "none" | "low" | "medium" | "high" | "xhigh" | null;
  }>;
}

export class ApiClient {
  public getApiKey(): string {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || DEFAULT_API_KEY;
  }

  public setApiKey(key: string): void {
    localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
  }

  private getHeaders(): Record<string, string> {
    return {
      "Authorization": `Bearer ${this.getApiKey()}`,
      "Content-Type": "application/json",
    };
  }

  public async getAccounts(): Promise<AccountData[]> {
    const res = await fetch("/api/accounts", {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch accounts: HTTP ${res.status}`);
    }
    const body = await res.json();
    return body.accounts || [];
  }

  public async createAccount(payload: {
    id: string;
    adapterId: string;
    name: string;
    maxSlots?: number;
  }): Promise<{ id: string; sandboxDir: string; status: string }> {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  public async resetCooldown(accountId: string): Promise<void> {
    const res = await fetch(`/api/accounts/${accountId}/reset-cooldown`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      throw new Error(`Failed to reset cooldown: HTTP ${res.status}`);
    }
  }

  public async deleteAccount(accountId: string): Promise<void> {
    const res = await fetch(`/api/accounts/${accountId}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to delete account: HTTP ${res.status}`);
    }
  }

  public async getAdapters(): Promise<AdapterData[]> {
    const res = await fetch("/api/adapters", {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch adapters: HTTP ${res.status}`);
    }
    const body = await res.json();
    return body.adapters || [];
  }

  public async scanAdapters(): Promise<{
    success: boolean;
    scanned: number;
    installed: number;
    missing: number;
    purgedAccounts: string[];
    restoredAccounts: string[];
  }> {
    const res = await fetch("/api/adapters/scan", {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      throw new Error(`Failed to scan host adapters: HTTP ${res.status}`);
    }
    return res.json();
  }

  public async probeAdapter(payload: unknown): Promise<{
    valid: boolean;
    isInstalled: boolean;
    resolvedPath: string | null;
    detectedVersion: string | null;
    latencyMs: number;
    error?: string;
  }> {
    const res = await fetch("/api/adapters/probe", {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  public async createCustomAdapter(payload: unknown): Promise<{
    success: boolean;
    adapterId: string;
    filePath: string;
    isInstalled: boolean;
  }> {
    const res = await fetch("/api/adapters", {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  public async cleanupOrphans(): Promise<{
    success: boolean;
    purged: string[];
    preserved: string[];
  }> {
    const res = await fetch("/api/adapters/cleanup-orphans", {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      throw new Error(`Failed to clean up orphans: HTTP ${res.status}`);
    }
    return res.json();
  }

  public async getTerminalTicket(
    mode: "host" | "sandbox",
    adapterId?: string,
    accountId?: string
  ): Promise<{ ticket: string; mode: string; expiresIn: number }> {
    const res = await fetch("/api/terminal/ticket", {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ mode, adapterId, accountId }),
    });
    if (!res.ok) {
      throw new Error(`Failed to get terminal ticket: HTTP ${res.status}`);
    }
    return res.json();
  }

  public async getModels(): Promise<OpenAiModel[]> {
    const res = await fetch("/v1/models", {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch models: HTTP ${res.status}`);
    }
    const body = await res.json();
    return body.data || [];
  }

  public async sendChatCompletion(payload: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream?: boolean;
    reasoning_effort?: string;
  }, signal?: AbortSignal): Promise<Response> {
    return fetch("/v1/chat/completions", {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      signal,
    });
  }

  public async getRoutingGroups(): Promise<RoutingGroupData[]> {
    const res = await fetch("/api/routing-groups", {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch routing groups: HTTP ${res.status}`);
    }
    const body = await res.json();
    return body.groups || [];
  }

  public async getRoutingGroup(id: string): Promise<RoutingGroupData> {
    const res = await fetch(`/api/routing-groups/${encodeURIComponent(id)}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch routing group '${id}': HTTP ${res.status}`);
    }
    const body = await res.json();
    return body.group;
  }

  public async createRoutingGroup(input: CreateRoutingGroupInput): Promise<RoutingGroupData> {
    const res = await fetch("/api/routing-groups", {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Failed to create routing group: HTTP ${res.status}`);
    }
    const body = await res.json();
    return body.group;
  }

  public async updateRoutingGroup(id: string, input: Partial<CreateRoutingGroupInput>): Promise<RoutingGroupData> {
    const res = await fetch(`/api/routing-groups/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Failed to update routing group: HTTP ${res.status}`);
    }
    const body = await res.json();
    return body.group;
  }

  public async deleteRoutingGroup(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/routing-groups/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to delete routing group '${id}': HTTP ${res.status}`);
    }
    return res.json();
  }

  // --- Telemetry & Fleet Radar APIs ---

  public async getTelemetryActive(): Promise<{ activeStreams: ActiveStreamItem[]; count: number }> {
    const res = await fetch("/api/admin/telemetry/active", { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch active telemetry: HTTP ${res.status}`);
    return res.json();
  }

  public async getTelemetrySummary(window?: string): Promise<TelemetrySummary> {
    const query = window ? `?window=${encodeURIComponent(window)}` : "";
    const res = await fetch(`/api/admin/telemetry/summary${query}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch telemetry summary: HTTP ${res.status}`);
    return res.json();
  }

  public async getTelemetryBreakdown(window?: string): Promise<TelemetryBreakdown> {
    const query = window ? `?window=${encodeURIComponent(window)}` : "";
    const res = await fetch(`/api/admin/telemetry/breakdown${query}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch telemetry breakdown: HTTP ${res.status}`);
    return res.json();
  }

  public async getTelemetryLedger(params: Record<string, string | number | undefined> = {}): Promise<LedgerResult> {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") sp.append(k, String(v));
    }
    const query = sp.toString() ? `?${sp.toString()}` : "";
    const res = await fetch(`/api/admin/telemetry/ledger${query}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch telemetry ledger: HTTP ${res.status}`);
    return res.json();
  }

  public async abortExecution(requestId: string): Promise<{ success: boolean; pid: number | null; killed: boolean }> {
    const res = await fetch(`/api/admin/telemetry/abort/${encodeURIComponent(requestId)}`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to abort execution '${requestId}': HTTP ${res.status}`);
    return res.json();
  }

  public async triggerDiagnosticProbe(type: "ping" | "code" | "cot", model?: string): Promise<{ success: boolean; probeType: string; promptText: string }> {
    const res = await fetch("/api/admin/telemetry/probe", {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ type, model }),
    });
    if (!res.ok) throw new Error(`Failed to trigger probe: HTTP ${res.status}`);
    return res.json();
  }

  // --- Usage & Token Analytics APIs ---

  public async getUsageSummary(params: Record<string, string | number | boolean | undefined> = {}): Promise<ComparativeSummaryResult> {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") sp.append(k, String(v));
    }
    const query = sp.toString() ? `?${sp.toString()}` : "";
    const res = await fetch(`/api/admin/usage/summary${query}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch usage summary: HTTP ${res.status}`);
    return res.json();
  }

  public async getUsageTimeSeries(params: Record<string, string | number | undefined> = {}): Promise<{
    items: UsageTimeSeriesItem[];
    count: number;
    granularity: string;
    start: number;
    end: number;
  }> {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") sp.append(k, String(v));
    }
    const query = sp.toString() ? `?${sp.toString()}` : "";
    const res = await fetch(`/api/admin/usage/timeseries${query}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch usage time series: HTTP ${res.status}`);
    return res.json();
  }

  public async getUsagePivot(params: Record<string, string | number | undefined> = {}): Promise<{
    rows: PivotRowItem[];
    totalRows: number;
    dimA: string;
    dimB: string;
    start: number;
    end: number;
  }> {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") sp.append(k, String(v));
    }
    const query = sp.toString() ? `?${sp.toString()}` : "";
    const res = await fetch(`/api/admin/usage/pivot${query}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch usage pivot: HTTP ${res.status}`);
    return res.json();
  }

  public async getUsageRecords(params: Record<string, string | number | undefined> = {}): Promise<{
    records: Array<{
      id: string;
      requestId: string;
      adapterId: string | null;
      accountId: string | null;
      modelRequested: string;
      modelExecuted: string | null;
      promptTokens: number;
      reasoningTokens: number;
      completionTokens: number;
      totalTokens: number;
      ttftMs: number | null;
      totalDurationMs: number;
      statusCode: number;
      status: string;
      errorMessage: string | null;
      createdAt: number;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") sp.append(k, String(v));
    }
    const query = sp.toString() ? `?${sp.toString()}` : "";
    const res = await fetch(`/api/admin/usage/records${query}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch usage records: HTTP ${res.status}`);
    return res.json();
  }

  public async getUsageFilters(): Promise<FilterOptionsResult> {
    const res = await fetch("/api/admin/usage/filters", { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch usage filters: HTTP ${res.status}`);
    return res.json();
  }

  public getUsageExportUrl(params: Record<string, string | number | undefined> = {}): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") sp.append(k, String(v));
    }
    const query = sp.toString() ? `?${sp.toString()}` : "";
    return `/api/admin/usage/export${query}`;
  }
}

export interface ActiveStreamItem {
  requestId: string;
  pid: number | null;
  status: "PRE_FLIGHT" | "REASONING" | "STREAMING" | "COMPLETED" | "ERROR" | "ABORTED" | "TERMINATED";
  adapterId: string;
  modelRequested: string;
  modelExecuted: string;
  accountId: string;
  sandboxDir?: string;
  promptTokens: number;
  reasoningTokens: number;
  completionTokens: number;
  totalTokens: number;
  currentVelocity: number;
  elapsedMs: number;
  startedAt?: number;
  ttftMs?: number;
  ttfrMs?: number;
  failoverTrail?: Array<{
    attempt?: number;
    fromAccountId: string;
    toAccountId: string;
    reason: string;
    latencyMs: number;
  }>;
}

export interface TelemetrySummary {
  total_requests: number;
  successful_requests: number;
  rate_limited_requests: number;
  failed_requests: number;
  total_prompt_tokens: number;
  total_reasoning_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  avg_ttft_ms: number;
  avg_duration_ms: number;
}

export interface TelemetryBreakdown {
  byProvider: Array<{
    adapter_id: string;
    call_count: number;
    prompt_tokens: number;
    reasoning_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }>;
  byModel: Array<{
    model: string;
    adapter_id: string;
    call_count: number;
    prompt_tokens: number;
    reasoning_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    avg_ttft_ms: number;
  }>;
}

export interface LedgerRecord {
  id: string;
  request_id: string;
  adapter_id: string | null;
  account_id: string | null;
  model_requested: string;
  model_executed: string | null;
  prompt_tokens: number;
  reasoning_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  ttft_ms: number | null;
  total_duration_ms: number;
  status_code: number;
  status: string;
  error_message: string | null;
  created_at: number;
}

export interface LedgerResult {
  records: LedgerRecord[];
  total: number;
  limit: number;
  offset: number;
}
export const apiClient = new ApiClient();

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
