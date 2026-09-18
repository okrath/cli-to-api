import { useCallback, useEffect, useRef, useState } from "react";

const TOKEN_KEY = "cta-admin-token";

export interface ApiError {
  message: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class AdminApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    throw new AdminApiError("Unauthorized");
  }
  if (!res.ok) {
    const body = await parseJson<{ error?: ApiError }>(res).catch(() => null);
    throw new AdminApiError(body?.error?.message ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return parseJson<T>(res);
}

export async function login(password: string): Promise<{ token: string; expiresAt: number }> {
  const res = await fetch("/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await parseJson<{ error?: ApiError }>(res).catch(() => null);
    throw new AdminApiError(body?.error?.message ?? "Login failed");
  }
  return parseJson(res);
}

export interface HostLoginInfo {
  status: "logged_in" | "logged_out" | "unknown";
  label?: string;
}

export interface AdapterInfo {
  id: string;
  executable: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  models: Array<{ id: string; label: string }>;
  hostLogin: HostLoginInfo;
}

export interface RateLimitWindow {
  name: string;
  utilization: number;
  resetsAt: number;
  observedAt: number;
}

export interface Account {
  id: string;
  adapterId: string;
  name: string;
  sandboxDir: string;
  maxConcurrent: number;
  cooldownUntil: number | null;
  cooldownReason: string | null;
  enabled: boolean;
  useHostProfile: boolean;
  createdAt: number;
  active: number;
  rateLimits: RateLimitWindow[];
}

export interface GroupTarget {
  id: string;
  tier: number;
  accountId: string | null;
  adapterId: string;
  modelId: string;
  effortOverride: string | null;
  enabled: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  defaultEffort: string | null;
  allowTools: boolean;
  cacheTtlSec: number;
  enabled: boolean;
  targets: GroupTarget[];
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  enabled: boolean;
  lastUsedAt: number | null;
  createdAt: number;
}

export interface ApiKeyCreated extends ApiKey {
  plaintext: string;
}

export interface RequestLogEntry {
  id: string;
  apiKeyId: string;
  dialect: string;
  modelRequested: string;
  groupId: string | null;
  accountId: string | null;
  adapterId: string | null;
  modelExecuted: string | null;
  status: string;
  errorKind: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  costUsd: number | null;
  ttftMs: number | null;
  durationMs: number | null;
  sessionReused: boolean | null;
  failoverCount: number | null;
  createdAt: number;
}

export interface UsageSummaryRow {
  bucket: string;
  key: string;
  label: string;
  requests: number;
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
  costUsd: number;
}

export interface QuotaEntry {
  accountId: string;
  accountName: string;
  adapterId: string;
  cooldownUntil: number | null;
  cooldownReason: string | null;
  windows: RateLimitWindow[];
  todayTokens: number;
}

export interface LiveEntry {
  requestId: string;
  startedAt: number;
  apiKeyId: string;
  model: string;
  accountId?: string;
  pid?: number;
  tokensOut: number;
}

export interface Settings {
  defaultCooldownSec: number;
  sessionTtlSec: number;
  requestTimeoutSec: number;
  queueTimeoutSec: number;
}

export interface UseQueryResult<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { pollMs?: number; enabled?: boolean },
): UseQueryResult<T> {
  const enabled = options?.enabled ?? true;
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
    if (!options?.pollMs) {
      return;
    }
    const id = window.setInterval(() => void refresh(), options.pollMs);
    return () => window.clearInterval(id);
  }, [enabled, key, options?.pollMs, refresh]);

  return { data, error, loading, refresh };
}

export function terminalWsUrl(target: string, cols: number, rows: number): string {
  const token = getToken();
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const params = new URLSearchParams({
    token: token ?? "",
    target,
    cols: String(cols),
    rows: String(rows),
  });
  return `${proto}//${host}/admin/ws/terminal?${params}`;
}

export function clientBaseUrls(): { openai: string; anthropic: string } {
  const origin = window.location.origin.replace(/\/$/, "");
  return { openai: `${origin}/v1`, anthropic: origin };
}
