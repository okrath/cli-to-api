import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3,
  Activity,
  Layers,
  Zap,
  Clock,
  AlertTriangle,
  Coins,
  Brain,
  MessageSquare,
} from "lucide-react";
import {
  apiClient,
  ComparativeSummaryResult,
  UsageTimeSeriesItem,
  PivotRowItem,
} from "../lib/api-client.js";
import { UsageKpiCard } from "../components/usage/UsageKpiCard.js";
import { UsageStackedBarChart } from "../components/usage/UsageStackedBarChart.js";
import { UsageFilterToolbar } from "../components/usage/UsageFilterToolbar.js";
import { UsagePivotGrid } from "../components/usage/UsagePivotGrid.js";
import { UsageLedgerDrawer } from "../components/usage/UsageLedgerDrawer.js";

export function UsageAnalyticsView() {
  // Filter States
  const [activeRange, setActiveRange] = useState<string>("7d");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [compare, setCompare] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  // Dimension States for Pivot
  const [dimA, setDimA] = useState<string>("model");
  const [dimB, setDimB] = useState<string>("adapter");

  // Data States
  const [summaryData, setSummaryData] = useState<ComparativeSummaryResult | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<UsageTimeSeriesItem[]>([]);
  const [pivotRows, setPivotRows] = useState<PivotRowItem[]>([]);
  const [timeSeriesGranularity, setTimeSeriesGranularity] = useState<"hour" | "day">("day");

  // Loading States
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Drill-Down Drawer States
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drillSelection, setDrillSelection] = useState<{
    dimA: string;
    valA: string;
    dimB?: string;
    valB?: string;
  } | null>(null);

  // Compute query parameters object
  const queryParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      range: activeRange,
      compare,
    };
    if (activeRange === "custom" && startDate && endDate) {
      params.startDate = startDate;
      params.endDate = endDate;
    }
    return params;
  }, [activeRange, startDate, endDate, compare]);

  // Fetch all analytics data in parallel
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, tsRes, pvRes] = await Promise.all([
        apiClient.getUsageSummary(queryParams),
        apiClient.getUsageTimeSeries({
          range: activeRange,
          startDate: activeRange === "custom" ? startDate : undefined,
          endDate: activeRange === "custom" ? endDate : undefined,
        }),
        apiClient.getUsagePivot({
          dimA,
          dimB,
          range: activeRange,
          startDate: activeRange === "custom" ? startDate : undefined,
          endDate: activeRange === "custom" ? endDate : undefined,
        }),
      ]);

      setSummaryData(sumRes);
      setTimeSeriesData(tsRes.items || []);
      setTimeSeriesGranularity((tsRes.granularity as "hour" | "day") || "day");
      setPivotRows(pvRes.rows || []);
      setErrorMessage(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, [queryParams, activeRange, startDate, endDate, dimA, dimB]);

  // Initial & Dependency-Triggered Fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-Refresh Polling Timer (30s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Sparkline data generation from timeSeriesData
  const tokenSparkline = useMemo(
    () => timeSeriesData.map((d) => d.totalTokens),
    [timeSeriesData]
  );
  const costSparkline = useMemo(
    () => timeSeriesData.map((d) => d.estimatedCostUsd),
    [timeSeriesData]
  );

  // Drilldown handler
  const handleDrillDown = (dA: string, vA: string, dB: string, vB: string) => {
    setDrillSelection({ dimA: dA, valA: vA, dimB: dB, valB: vB });
    setDrawerOpen(true);
  };

  // Export URLs
  const exportUrlCsv = useMemo(() => {
    return apiClient.getUsageExportUrl({
      format: "csv",
      range: activeRange,
      startDate: activeRange === "custom" ? startDate : undefined,
      endDate: activeRange === "custom" ? endDate : undefined,
    });
  }, [activeRange, startDate, endDate]);

  const exportUrlJson = useMemo(() => {
    return apiClient.getUsageExportUrl({
      format: "json",
      range: activeRange,
      startDate: activeRange === "custom" ? startDate : undefined,
      endDate: activeRange === "custom" ? endDate : undefined,
    });
  }, [activeRange, startDate, endDate]);

  const cur = summaryData?.current;
  const delta = summaryData?.delta;

  return (
    <div className="p-8 space-y-6 overflow-y-auto h-full bg-[#090B0F] text-slate-100 font-sans select-none">
      {/* Top Banner / Mission Control Header */}
      <div className="flex items-center justify-between border-b border-borderSubtle/60 pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2.5">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              <span>Usage & Token Consumption Analytics</span>
            </h1>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full border bg-emerald-950/60 text-emerald-400 border-emerald-500/30">
              LEDGER: ACTIVE WAL
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Historical token accounting, financial cost estimations, multi-axis OLAP intelligence, and streaming audit export.
          </p>
        </div>

        {/* Range Badge */}
        <div className="text-xs font-mono px-3 py-1 rounded-lg bg-surface border border-borderSubtle text-slate-300">
          FILTER: <strong className="text-cyan-400 uppercase">{activeRange}</strong>
        </div>
      </div>

      {/* Error Alert Message */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 flex items-center space-x-3 text-xs font-mono text-rose-300">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Error loading usage analytics: {errorMessage}. Check gateway connection.</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ZONE 1: FILTER & TIME-RANGE TOOLBAR                                       */}
      {/* ========================================================================= */}
      <UsageFilterToolbar
        activeRange={activeRange}
        onSelectRange={setActiveRange}
        startDate={startDate}
        endDate={endDate}
        onChangeDates={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        compare={compare}
        onToggleCompare={setCompare}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={setAutoRefresh}
        onRefresh={fetchData}
        loading={loading}
        exportUrlCsv={exportUrlCsv}
        exportUrlJson={exportUrlJson}
      />

      {/* ========================================================================= */}
      {/* ZONE 2: COMPARATIVE KPI CARDS HUD (8 CARDS IN 2 ROWS)                     */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        {/* Row 1: Token Volume KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {/* Card 1: Total Tokens */}
          <UsageKpiCard
            title="Total Tokens"
            value={cur?.totalTokens ?? 0}
            subValue="Combined volumetric load"
            deltaPercent={delta?.totalTokensPercent}
            sparklineData={tokenSparkline}
            icon={<Layers className="w-4 h-4 text-white" />}
            colorClass="text-white"
          />

          {/* Card 2: Prompt Tokens (Ingress) */}
          <UsageKpiCard
            title="Prompt Tokens (Input)"
            value={cur?.promptTokens ?? 0}
            subValue={`${cur?.totalTokens ? Math.round(((cur.promptTokens || 0) / cur.totalTokens) * 100) : 0}% of total volume`}
            deltaPercent={delta?.promptTokensPercent}
            icon={<MessageSquare className="w-4 h-4 text-cyan-400" />}
            colorClass="text-cyan-400"
          />

          {/* Card 3: Reasoning Tokens (CoT) */}
          <UsageKpiCard
            title="Reasoning Tokens (CoT)"
            value={cur?.reasoningTokens ?? 0}
            subValue={`${cur?.totalTokens ? Math.round(((cur.reasoningTokens || 0) / cur.totalTokens) * 100) : 0}% thinking overhead`}
            deltaPercent={delta?.reasoningTokensPercent}
            icon={<Brain className="w-4 h-4 text-purple-400" />}
            colorClass="text-purple-400"
          />

          {/* Card 4: Completion Tokens (Output) */}
          <UsageKpiCard
            title="Completion Tokens (Output)"
            value={cur?.completionTokens ?? 0}
            subValue={`${cur?.totalTokens ? Math.round(((cur.completionTokens || 0) / cur.totalTokens) * 100) : 0}% generation payload`}
            deltaPercent={delta?.completionTokensPercent}
            icon={<Zap className="w-4 h-4 text-emerald-400" />}
            colorClass="text-emerald-400"
          />
        </div>

        {/* Row 2: Cost, Latency & Reliability KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {/* Card 5: Estimated Cost ($ USD) */}
          <UsageKpiCard
            title="Estimated Spend ($ USD)"
            value={`$${(cur?.estimatedCostUsd ?? 0).toFixed(4)}`}
            subValue="Benchmark model pricing"
            deltaPercent={delta?.costPercent}
            sparklineData={costSparkline}
            icon={<Coins className="w-4 h-4 text-amber-400" />}
            colorClass="text-amber-400"
          />

          {/* Card 6: Total Requests */}
          <UsageKpiCard
            title="API Invocations"
            value={cur?.requests ?? 0}
            subValue={`${cur?.successCount ?? 0} ok / ${cur?.rateLimitCount ?? 0} rate-limited`}
            deltaPercent={delta?.requestsPercent}
            icon={<Activity className="w-4 h-4 text-blue-400" />}
            colorClass="text-blue-400"
          />

          {/* Card 7: Average TTFT (Time to First Token) */}
          <UsageKpiCard
            title="Average Latency (TTFT)"
            value={`${cur?.avgTtftMs ?? 0} ms`}
            subValue="Socket to first token"
            deltaPercent={delta?.avgTtftPercent}
            isInverseDelta={true}
            icon={<Clock className="w-4 h-4 text-slate-300" />}
            colorClass="text-slate-200"
          />

          {/* Card 8: Error Rate */}
          <UsageKpiCard
            title="Error Rate (%)"
            value={`${(cur?.errorRate ?? 0).toFixed(2)}%`}
            subValue={`${cur?.errorCount ?? 0} total failure events`}
            isInverseDelta={true}
            icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
            colorClass={cur && cur.errorRate > 0 ? "text-rose-400" : "text-emerald-400"}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ZONE 3: VOLUMETRIC TIME-SERIES STACKED BAR CHART                          */}
      {/* ========================================================================= */}
      <UsageStackedBarChart
        data={timeSeriesData}
        granularity={timeSeriesGranularity}
        loading={loading}
      />

      {/* ========================================================================= */}
      {/* ZONE 4: OLAP CROSS-TABULATION MATRIX & DRILL-DOWN                         */}
      {/* ========================================================================= */}
      <UsagePivotGrid
        rows={pivotRows}
        dimA={dimA}
        dimB={dimB}
        onChangeDimensions={(a, b) => {
          setDimA(a);
          setDimB(b);
        }}
        onDrillDown={handleDrillDown}
        loading={loading}
      />

      {/* ========================================================================= */}
      {/* ZONE 5: SLIDE-OUT DRILL-DOWN TRANSACTION DRAWER                           */}
      {/* ========================================================================= */}
      {drillSelection && (
        <UsageLedgerDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          dimA={drillSelection.dimA}
          valA={drillSelection.valA}
          dimB={drillSelection.dimB}
          valB={drillSelection.valB}
          startDate={activeRange === "custom" ? startDate : undefined}
          endDate={activeRange === "custom" ? endDate : undefined}
          range={activeRange}
        />
      )}
    </div>
  );
}
