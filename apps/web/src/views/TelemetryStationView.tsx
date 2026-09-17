import { useState, useEffect, useMemo } from "react";
import {
  Radar,
  Activity,
  Zap,
  Cpu,
  Square,
  Search,
  Play,
  RotateCw,
  Layers,
  ArrowRight,
  Timer,
  Hash,
} from "lucide-react";
import {
  apiClient,
  ActiveStreamItem,
  TelemetrySummary,
  TelemetryBreakdown,
  LedgerRecord,
  AccountData,
} from "../lib/api-client.js";

export function TelemetryStationView() {
  // State for live streams & SSE
  const [activeStreams, setActiveStreams] = useState<ActiveStreamItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [recentFailovers, setRecentFailovers] = useState<
    Array<{
      requestId: string;
      fromAccountId: string;
      toAccountId: string;
      reason: string;
      latencyMs: number;
      timestamp: number;
    }>
  >([]);

  // State for historical ledger & aggregations
  const [timeWindow, setTimeWindow] = useState<"5m" | "1h" | "24h" | "all">("all");
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [, setBreakdown] = useState<TelemetryBreakdown | null>(null);
  const [ledgerRecords, setLedgerRecords] = useState<LedgerRecord[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Diagnostic probe trigger state
  const [probeLoading, setProbeLoading] = useState<string | null>(null);
  const [probeToast, setProbeToast] = useState<string | null>(null);
  const [abortingId, setAbortingId] = useState<string | null>(null);

  // Periodic ticker for smooth elapsed seconds updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(timer);
  }, []);

  // Fetch summary & breakdown
  const fetchAggregates = async () => {
    try {
      const sum = await apiClient.getTelemetrySummary(timeWindow === "all" ? undefined : timeWindow);
      const bd = await apiClient.getTelemetryBreakdown(timeWindow === "all" ? undefined : timeWindow);
      setSummary(sum);
      setBreakdown(bd);
    } catch (err) {
      console.error("[TelemetryStation] Failed to fetch aggregates:", err);
    }
  };

  // Fetch ledger records
  const fetchLedger = async (page = 1) => {
    setLoadingLedger(true);
    try {
      const limit = 25;
      const offset = (page - 1) * limit;
      const res = await apiClient.getTelemetryLedger({
        limit,
        offset,
        search: searchQuery || undefined,
        window: timeWindow === "all" ? undefined : timeWindow,
      });
      setLedgerRecords(res.records || []);
      setLedgerTotal(res.total || 0);
      setLedgerPage(page);
    } catch (err) {
      console.error("[TelemetryStation] Failed to fetch ledger:", err);
    } finally {
      setLoadingLedger(false);
    }
  };

  // Fetch accounts for saturation matrix
  const fetchAccounts = async () => {
    try {
      const list = await apiClient.getAccounts();
      setAccounts(list);
    } catch {}
  };

  useEffect(() => {
    fetchAggregates();
    fetchLedger(1);
    fetchAccounts();
    const interval = setInterval(() => {
      fetchAggregates();
      fetchAccounts();
    }, 5000);
    return () => clearInterval(interval);
  }, [timeWindow, searchQuery]);

  // Setup Server-Sent Events (SSE) listener
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/admin/events");

      es.onopen = () => {
        setConnected(true);
      };

      es.onerror = () => {
        setConnected(false);
      };

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { type, data } = payload;

          if (type === "radar:snapshot" && data) {
            if (Array.isArray(data.activeStreams)) {
              setActiveStreams(data.activeStreams);
            }
            if (Array.isArray(data.accounts)) {
              setAccounts(data.accounts);
            }
          } else if (type === "telemetry:pulse" && data) {
            if (Array.isArray(data.activeStreams)) {
              setActiveStreams(data.activeStreams);
            }
          } else if (type === "telemetry:request:start" && data) {
            setActiveStreams((prev) => {
              const exists = prev.some((x) => x.requestId === data.id);
              if (exists) return prev;
              const newItem: ActiveStreamItem = {
                requestId: data.id,
                pid: data.pid ?? null,
                status: "PRE_FLIGHT",
                adapterId: data.provider || "cli",
                modelRequested: data.model || "",
                modelExecuted: data.model || "",
                accountId: data.accountId || "",
                promptTokens: data.promptTokens || 0,
                reasoningTokens: 0,
                completionTokens: 0,
                totalTokens: data.promptTokens || 0,
                currentVelocity: 0,
                elapsedMs: 0,
                failoverTrail: [],
              };
              return [newItem, ...prev];
            });
          } else if (type === "request:complete" && data) {
            setActiveStreams((prev) => prev.filter((x) => x.requestId !== data.id));
            fetchAggregates();
            fetchLedger(ledgerPage);
          } else if (type === "telemetry:failover" && data) {
            setRecentFailovers((prev) => [
              {
                requestId: data.requestId,
                fromAccountId: data.fromAccountId,
                toAccountId: data.toAccountId,
                reason: data.reason,
                latencyMs: data.latencyMs,
                timestamp: Date.now(),
              },
              ...prev.slice(0, 4),
            ]);
          } else if (type === "telemetry:process:killed" && data) {
            setActiveStreams((prev) => prev.filter((x) => x.requestId !== data.requestId));
          }
        } catch {}
      };
    } catch {
      setConnected(false);
    }

    return () => {
      if (es) es.close();
    };
  }, [ledgerPage]);

  // Emergency kill action
  const handleKill = async (requestId: string) => {
    setAbortingId(requestId);
    try {
      const res = await apiClient.abortExecution(requestId);
      if (res.killed) {
        setProbeToast(`Terminated process tree (PID: ${res.pid})`);
      } else {
        setProbeToast(`Aborted execution '${requestId}'`);
      }
      setActiveStreams((prev) => prev.filter((x) => x.requestId !== requestId));
      setTimeout(() => setProbeToast(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setProbeToast(`Kill failed: ${msg}`);
      setTimeout(() => setProbeToast(null), 3500);
    } finally {
      setAbortingId(null);
    }
  };

  // Diagnostic probe trigger
  const handleTriggerProbe = async (type: "ping" | "code" | "cot") => {
    setProbeLoading(type);
    try {
      // Trigger probe on gateway
      const probeRes = await apiClient.triggerDiagnosticProbe(type);

      // Submit synthetic completion through /v1/chat/completions to populate radar
      fetch("/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-cta-admin-token",
        },
        body: JSON.stringify({
          model: "auto",
          stream: true,
          messages: [{ role: "user", content: probeRes.promptText }],
        }),
      }).catch(() => {});

      setProbeToast(`Probe triggered: ${type.toUpperCase()}`);
      setTimeout(() => setProbeToast(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setProbeToast(`Probe error: ${msg}`);
      setTimeout(() => setProbeToast(null), 3000);
    } finally {
      setProbeLoading(null);
    }
  };

  // Group accounts by adapter for Saturation Matrix
  const adapterGroups = useMemo(() => {
    const map = new Map<string, { totalSlots: number; activeSlots: number; accounts: AccountData[] }>();
    for (const acc of accounts) {
      const key = acc.adapterId || "unknown";
      const cur = map.get(key) || { totalSlots: 0, activeSlots: 0, accounts: [] };
      cur.totalSlots += acc.maxSlots;
      cur.activeSlots += acc.activeSlots;
      cur.accounts.push(acc);
      map.set(key, cur);
    }
    return Array.from(map.entries()).map(([adapterId, data]) => ({
      adapterId,
      ...data,
      percent: data.totalSlots > 0 ? Math.round((data.activeSlots / data.totalSlots) * 100) : 0,
    }));
  }, [accounts]);

  // Aggregate current fleet velocity
  const fleetVelocity = useMemo(() => {
    return activeStreams.reduce((sum, s) => sum + (s.currentVelocity || 0), 0);
  }, [activeStreams]);

  return (
    <div className="p-8 space-y-6 overflow-y-auto h-full bg-[#090B0F] text-slate-100 font-sans select-none">
      {/* Top Banner / Mission Control Header */}
      <div className="flex items-center justify-between border-b border-borderSubtle/60 pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2.5">
              <Radar className="w-5 h-5 text-cyan-400 animate-pulse" />
              <span>Obsidian Fleet Radar & Telemetry Station</span>
            </h1>
            <span
              className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${
                connected
                  ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                  : "bg-amber-950/60 text-amber-400 border-amber-500/30"
              }`}
            >
              {connected ? "TELEMETRY BUS: LIVE" : "RECONNECTING..."}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Real-time CLI token streaming velocity, in-flight process containment, and multi-model accounting ledger.
          </p>
        </div>

        {/* Global Toast Message */}
        {probeToast && (
          <div className="px-3.5 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono animate-fadeIn">
            {probeToast}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ZONE 1: TOP HUD STATUS CARDS & DIAGNOSTIC PROBE HARNESS                   */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-5 gap-4">
        {/* Card 1: Ingress Tokens */}
        <div className="p-4 rounded-xl bg-surface border border-borderSubtle space-y-1.5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Ingress Tokens</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {(summary?.total_prompt_tokens ?? 0).toLocaleString()}
          </div>
          <div className="text-[10px] font-mono text-cyan-400">Prompt payload volume</div>
        </div>

        {/* Card 2: Egress Tokens */}
        <div className="p-4 rounded-xl bg-surface border border-borderSubtle space-y-1.5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Egress Tokens</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {(summary?.total_completion_tokens ?? 0).toLocaleString()}
          </div>
          <div className="text-[10px] font-mono text-slate-400">Completion generation</div>
        </div>

        {/* Card 3: Reasoning Tokens */}
        <div className="p-4 rounded-xl bg-surface border border-borderSubtle space-y-1.5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Reasoning CoT</span>
            <Cpu className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-violet-300">
            {(summary?.total_reasoning_tokens ?? 0).toLocaleString()}
          </div>
          <div className="text-[10px] font-mono text-violet-400">Internal thinking tokens</div>
        </div>

        {/* Card 4: Fleet Velocity */}
        <div className="p-4 rounded-xl bg-surface border border-borderSubtle space-y-1.5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Fleet Velocity</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {fleetVelocity.toFixed(1)}{" "}
            <span className="text-xs font-normal text-slate-400">tok/s</span>
          </div>
          <div className="text-[10px] font-mono text-emerald-400">
            {activeStreams.length} active in-flight stream{activeStreams.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* Card 5: Diagnostic Probe Harness */}
        <div className="p-4 rounded-xl bg-surface border border-borderSubtle space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Diagnostic Probes</span>
            <Play className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => handleTriggerProbe("ping")}
              disabled={probeLoading !== null}
              className="px-2 py-1.5 rounded bg-surfaceHover border border-borderSubtle text-[10px] font-mono text-slate-300 hover:text-white hover:border-cyan-500/50 transition disabled:opacity-50"
            >
              {probeLoading === "ping" ? "..." : "Ping"}
            </button>
            <button
              onClick={() => handleTriggerProbe("code")}
              disabled={probeLoading !== null}
              className="px-2 py-1.5 rounded bg-surfaceHover border border-borderSubtle text-[10px] font-mono text-slate-300 hover:text-white hover:border-cyan-500/50 transition disabled:opacity-50"
            >
              {probeLoading === "code" ? "..." : "Code"}
            </button>
            <button
              onClick={() => handleTriggerProbe("cot")}
              disabled={probeLoading !== null}
              className="px-2 py-1.5 rounded bg-surfaceHover border border-borderSubtle text-[10px] font-mono text-slate-300 hover:text-white hover:border-violet-500/50 transition disabled:opacity-50"
            >
              {probeLoading === "cot" ? "..." : "CoT"}
            </button>
          </div>
          <div className="text-[9px] font-mono text-slate-500 truncate">1-click benchmark harness</div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ZONE 2: PROVIDER SLOT SATURATION & CONCURRENCY MATRIX                     */}
      {/* ========================================================================= */}
      <div className="p-5 rounded-xl bg-surface border border-borderSubtle space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-bold tracking-wider uppercase font-mono text-slate-200">
              Provider Slot Saturation & Concurrency Matrix
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Real-time capacity allocations across CLI worker pools
          </span>
        </div>

        {adapterGroups.length === 0 ? (
          <div className="text-center py-4 text-xs font-mono text-slate-500">
            No CLI adapters configured. Add an adapter in Accounts to monitor slots.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {adapterGroups.map((group) => {
              const isSaturated = group.percent >= 100;
              const isHigh = group.percent >= 70 && !isSaturated;
              return (
                <div
                  key={group.adapterId}
                  className={`p-3.5 rounded-lg border bg-surface/50 space-y-2.5 transition ${
                    isSaturated
                      ? "border-rose-500/60 bg-rose-950/20"
                      : isHigh
                      ? "border-amber-500/40 bg-amber-950/10"
                      : "border-borderSubtle hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-white">{group.adapterId}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        isSaturated
                          ? "bg-rose-900/60 text-rose-300 border border-rose-500/50 animate-pulse"
                          : isHigh
                          ? "bg-amber-900/60 text-amber-300 border border-amber-500/40"
                          : "bg-surfaceHover text-emerald-400"
                      }`}
                    >
                      {group.activeSlots} / {group.totalSlots} ({group.percent}%)
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        isSaturated ? "bg-rose-500 animate-pulse" : isHigh ? "bg-amber-400" : "bg-emerald-400"
                      }`}
                      style={{ width: `${Math.min(group.percent, 100)}%` }}
                    />
                  </div>

                  {/* Child Accounts Badges */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {group.accounts.map((acc) => (
                      <span
                        key={acc.id}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border flex items-center space-x-1 ${
                          acc.status === "COOLDOWN"
                            ? "bg-amber-950/40 text-amber-300 border-amber-500/40"
                            : acc.status === "BUSY"
                            ? "bg-cyan-950/40 text-cyan-300 border-cyan-500/40"
                            : "bg-surfaceHover text-slate-400 border-borderSubtle"
                        }`}
                      >
                        <span>{acc.name}</span>
                        {acc.cooldownSecondsRemaining ? (
                          <span className="text-amber-400">({acc.cooldownSecondsRemaining}s)</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ZONE 3: PLANE 1 - LIVE EXECUTION RADAR (ACTIVE IN-FLIGHT PROCESSES)       */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold tracking-wider uppercase font-mono text-slate-200">
              Plane 1: Live Execution Radar (In-Flight Subprocesses)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            {activeStreams.length} subprocess{activeStreams.length === 1 ? "" : "es"} active
          </span>
        </div>

        {/* Failover Trail Strip */}
        {recentFailovers.length > 0 && (
          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-950/20 text-xs font-mono space-y-1">
            <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Zap className="w-3 h-3" />
              <span>Recent Dynamic Failover Breadcrumbs</span>
            </div>
            <div className="space-y-1">
              {recentFailovers.map((f, idx) => (
                <div key={idx} className="flex items-center space-x-2 text-slate-300 text-[11px]">
                  <span className="text-amber-400 font-bold">[{f.fromAccountId}]</span>
                  <span className="text-rose-400">({f.reason} +{f.latencyMs}ms)</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-emerald-400 font-bold">[{f.toAccountId}]</span>
                  <span className="text-slate-500">({new Date(f.timestamp).toLocaleTimeString()})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live In-Flight Grid */}
        {activeStreams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-borderSubtle bg-surface/40 p-8 text-center space-y-1.5">
            <Activity className="w-6 h-6 text-slate-600 mx-auto animate-pulse" />
            <div className="text-xs font-mono text-slate-400">All worker slots are idle. No active streams running.</div>
            <div className="text-[11px] font-mono text-slate-600">
              Trigger a probe above or invoke /v1/chat/completions from Cursor, Cline, or cURL.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeStreams.map((s) => (
              <div
                key={s.requestId}
                className="p-4 rounded-xl bg-surface border border-borderSubtle space-y-3 shadow-lg hover:border-slate-700 transition font-mono"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded bg-brand/20 text-brand text-[11px] font-semibold border border-brand/30">
                        {s.adapterId}
                      </span>
                      <span className="text-xs font-bold text-white">{s.modelExecuted || s.modelRequested}</span>
                      {s.pid && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 flex items-center space-x-1">
                          <Hash className="w-2.5 h-2.5 text-cyan-400" />
                          <span>{s.pid}</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate max-w-sm">
                      Req: <span className="text-slate-200">{s.requestId.slice(0, 16)}...</span> • Acc:{" "}
                      <span className="text-slate-200">{s.accountId}</span>
                    </div>
                  </div>

                  {/* Status & Kill Switch */}
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                        s.status === "REASONING"
                          ? "bg-violet-950/60 text-violet-300 border-violet-500/50 animate-pulse"
                          : s.status === "STREAMING"
                          ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40"
                          : "bg-surfaceHover text-slate-400 border-borderSubtle"
                      }`}
                    >
                      {s.status}
                    </span>

                    <button
                      onClick={() => handleKill(s.requestId)}
                      disabled={abortingId === s.requestId}
                      className="px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-500/40 hover:bg-rose-900/80 hover:text-white text-[10px] flex items-center space-x-1 transition disabled:opacity-50"
                      title="Emergency Kill Process Tree"
                    >
                      <Square className="w-2.5 h-2.5 fill-current" />
                      <span>{abortingId === s.requestId ? "..." : "KILL"}</span>
                    </button>
                  </div>
                </div>

                {/* Speedometer & Timing */}
                <div className="grid grid-cols-3 gap-2 py-2 border-y border-borderSubtle text-center text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Velocity</div>
                    <div className="font-bold text-emerald-400">
                      {(s.currentVelocity || 0).toFixed(1)}{" "}
                      <span className="text-[10px] font-normal text-slate-400">tok/s</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">TTFT / TTFR</div>
                    <div className="font-bold text-cyan-400">
                      {s.ttftMs ? `${s.ttftMs}ms` : s.ttfrMs ? `${s.ttfrMs}ms (CoT)` : "..."}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Elapsed</div>
                    <div className="font-bold text-slate-200">
                      {s.elapsedMs ? `${(s.elapsedMs / 1000).toFixed(1)}s` : `${((Date.now() - (s.startedAt || Date.now())) / 1000).toFixed(1)}s`}
                    </div>
                  </div>
                </div>

                {/* Tokens Triple Split */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                  <span>
                    In: <strong className="text-slate-200">{s.promptTokens}</strong>
                  </span>
                  <span>
                    CoT: <strong className="text-violet-400">{s.reasoningTokens}</strong>
                  </span>
                  <span>
                    Out: <strong className="text-emerald-400">{s.completionTokens}</strong>
                  </span>
                  <span>
                    Total: <strong className="text-white">{s.totalTokens}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ZONE 4: PLANE 2 - TOKEN ACCOUNTING MATRIX & AUDIT LEDGER                  */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Timer className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-bold tracking-wider uppercase font-mono text-slate-200">
              Plane 2: Token Accounting Matrix & Historical Audit Ledger
            </h2>
          </div>

          {/* Time Window Tabs & Search */}
          <div className="flex items-center space-x-3 text-xs font-mono">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search req-id or error..."
                className="pl-8 pr-3 py-1 rounded-lg bg-surface border border-borderSubtle text-slate-200 text-xs focus:outline-none focus:border-brand"
              />
            </div>

            <div className="flex bg-surface p-0.5 rounded-lg border border-borderSubtle text-[11px]">
              {(["5m", "1h", "24h", "all"] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setTimeWindow(w)}
                  className={`px-2.5 py-1 rounded font-medium transition ${
                    timeWindow === w
                      ? "bg-brand text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {w.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                fetchAggregates();
                fetchLedger(ledgerPage);
              }}
              className="p-1.5 rounded bg-surface border border-borderSubtle text-slate-400 hover:text-white transition"
              title="Refresh Ledger"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="rounded-xl border border-borderSubtle bg-surface overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#141822] text-slate-400 border-b border-borderSubtle">
              <tr>
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Request Identifier</th>
                <th className="px-4 py-3 font-medium">Provider & Model</th>
                <th className="px-4 py-3 font-medium text-right">Prompt Tok</th>
                <th className="px-4 py-3 font-medium text-right">CoT Tok</th>
                <th className="px-4 py-3 font-medium text-right">Out Tok</th>
                <th className="px-4 py-3 font-medium text-right">TTFT</th>
                <th className="px-4 py-3 font-medium text-right">Duration</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderSubtle/60">
              {ledgerRecords.map((r) => (
                <tr key={r.id} className="hover:bg-surfaceHover/50 transition">
                  <td className="px-4 py-2.5 text-slate-400">
                    {new Date(r.created_at * 1000).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2.5 text-slate-200 font-bold truncate max-w-[140px]" title={r.request_id}>
                    {r.request_id}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-brand font-bold">{r.adapter_id || "cli"}</span>
                    <span className="text-slate-400"> / {r.model_executed || r.model_requested}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-300 font-semibold">{r.prompt_tokens}</td>
                  <td className="px-4 py-2.5 text-right text-violet-400 font-semibold">
                    {r.reasoning_tokens || 0}
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-400 font-semibold">
                    {r.completion_tokens}
                  </td>
                  <td className="px-4 py-2.5 text-right text-cyan-400">
                    {r.ttft_ms ? `${r.ttft_ms}ms` : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{r.total_duration_ms}ms</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                        r.status_code === 200
                          ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                          : r.status_code === 429
                          ? "bg-amber-950/60 text-amber-400 border-amber-500/30"
                          : "bg-rose-950/60 text-rose-400 border-rose-500/30"
                      }`}
                    >
                      {r.status_code} {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {ledgerRecords.length === 0 && !loadingLedger && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500 font-mono text-xs">
                    No historical requests found matching the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination Footer */}
          <div className="px-4 py-3 bg-[#141822] border-t border-borderSubtle flex items-center justify-between text-xs font-mono text-slate-400">
            <div>
              Showing {ledgerRecords.length} of {ledgerTotal} total records
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => fetchLedger(Math.max(1, ledgerPage - 1))}
                disabled={ledgerPage <= 1 || loadingLedger}
                className="px-2.5 py-1 rounded bg-surface border border-borderSubtle hover:text-white transition disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-white font-bold">Page {ledgerPage}</span>
              <button
                onClick={() => fetchLedger(ledgerPage + 1)}
                disabled={ledgerRecords.length < 25 || loadingLedger}
                className="px-2.5 py-1 rounded bg-surface border border-borderSubtle hover:text-white transition disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default TelemetryStationView;
