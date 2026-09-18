import { useState, useMemo } from "react";
import { UsageTimeSeriesItem } from "../../lib/api-client.js";

interface UsageStackedBarChartProps {
  data: UsageTimeSeriesItem[];
  granularity?: "hour" | "day";
  loading?: boolean;
}

export function UsageStackedBarChart({
  data = [],
  granularity = "day",
  loading = false,
}: UsageStackedBarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // SVG Chart Dimensions
  const svgWidth = 1000;
  const svgHeight = 280;
  const paddingLeft = 55;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;
  const baselineY = paddingTop + chartHeight;

  // Compute max value for Y-axis scaling
  const { maxVal, yTicks } = useMemo(() => {
    if (!data.length) return { maxVal: 1000, yTicks: [1000, 750, 500, 250, 0] };
    const highest = Math.max(...data.map((d) => d.totalTokens), 100);
    // Round up to nice number
    const magnitude = Math.pow(10, Math.floor(Math.log10(highest)));
    const maxVal = Math.ceil(highest / magnitude) * magnitude || 1000;
    const yTicks = [maxVal, maxVal * 0.75, maxVal * 0.5, maxVal * 0.25, 0];
    return { maxVal, yTicks };
  }, [data]);

  // Format large numbers for Y axis
  const formatYLabel = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return String(num);
  };

  // Format X axis labels
  const formatXLabel = (bucket: string) => {
    if (granularity === "hour") {
      // e.g. "2026-09-18 14:00" -> "14:00"
      return bucket.slice(11, 16);
    }
    // e.g. "2026-09-18" -> "09-18"
    return bucket.slice(5);
  };

  // Compute Bars
  const bars = useMemo(() => {
    if (!data.length) return [];
    const count = data.length;
    const slotWidth = chartWidth / count;
    const barWidth = Math.max(Math.min(slotWidth * 0.75, 42), 6);

    return data.map((item, idx) => {
      const centerX = paddingLeft + idx * slotWidth + slotWidth / 2;
      const x = centerX - barWidth / 2;

      const promptHeight = (item.promptTokens / maxVal) * chartHeight;
      const reasoningHeight = (item.reasoningTokens / maxVal) * chartHeight;
      const completionHeight = (item.completionTokens / maxVal) * chartHeight;

      // Bottom-up stacking: Prompt at bottom, Reasoning in middle, Completion on top
      const yPrompt = baselineY - promptHeight;
      const yReasoning = yPrompt - reasoningHeight;
      const yCompletion = yReasoning - completionHeight;

      return {
        item,
        idx,
        x,
        barWidth,
        centerX,
        yPrompt,
        promptHeight,
        yReasoning,
        reasoningHeight,
        yCompletion,
        completionHeight,
      };
    });
  }, [data, chartWidth, chartHeight, baselineY, maxVal, paddingLeft]);

  const hoveredItem = hoveredIndex !== null && data[hoveredIndex] ? data[hoveredIndex] : null;
  const hoveredBar = hoveredIndex !== null && bars[hoveredIndex] ? bars[hoveredIndex] : null;

  return (
    <div className="p-5 rounded-xl bg-surface border border-borderSubtle space-y-4 relative select-none">
      {/* Chart Header & Legends */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white flex items-center space-x-2">
            <span>Token Consumption Timeline</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surfaceHover text-slate-300 border border-borderSubtle uppercase">
              {granularity === "hour" ? "Hourly Buckets" : "Daily Buckets"}
            </span>
          </div>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
            Volumetric breakdown across Ingress Prompt, Thinking CoT, and Egress Completion channels.
          </p>
        </div>

        {/* Legend Pills */}
        <div className="flex items-center space-x-4 text-xs font-mono">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#06B6D4]" />
            <span className="text-slate-300">Prompt (Ingress)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#A855F7]" />
            <span className="text-slate-300">Reasoning (CoT)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981]" />
            <span className="text-slate-300">Completion (Egress)</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-surface/70 flex items-center justify-center z-10">
            <div className="text-xs font-mono text-cyan-400 animate-pulse">Loading usage time series...</div>
          </div>
        )}

        {data.length === 0 && !loading && (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 font-mono text-xs">
            <span>No token usage recorded in this time window.</span>
          </div>
        )}

        {data.length > 0 && (
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto overflow-visible"
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <defs>
              <linearGradient id="promptGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#0891B2" stopOpacity="0.85" />
              </linearGradient>
              <linearGradient id="reasoningGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A855F7" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#7E22CE" stopOpacity="0.85" />
              </linearGradient>
              <linearGradient id="completionGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.85" />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines & Y-Axis Labels */}
            {yTicks.map((val) => {
              const y = baselineY - (val / maxVal) * chartHeight;
              return (
                <g key={`ytick-${val}`}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={svgWidth - paddingRight}
                    y2={y}
                    stroke="#1E293B"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {formatYLabel(val)}
                  </text>
                </g>
              );
            })}

            {/* Baseline bottom line */}
            <line
              x1={paddingLeft}
              y1={baselineY}
              x2={svgWidth - paddingRight}
              y2={baselineY}
              stroke="#334155"
              strokeWidth="1.5"
            />

            {/* Stacked Bars */}
            {bars.map((bar) => {
              const isHovered = hoveredIndex === bar.idx;
              return (
                <g
                  key={`bar-${bar.idx}`}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoveredIndex(bar.idx)}
                >
                  {/* Invisible Hitbox area for smooth hovering */}
                  <rect
                    x={bar.centerX - (chartWidth / data.length) / 2}
                    y={paddingTop}
                    width={chartWidth / data.length}
                    height={chartHeight}
                    fill="transparent"
                  />

                  {/* Prompt Bar (Bottom) */}
                  {bar.promptHeight > 0 && (
                    <rect
                      x={bar.x}
                      y={bar.yPrompt}
                      width={bar.barWidth}
                      height={bar.promptHeight}
                      fill="url(#promptGradient)"
                      rx="1"
                      className={isHovered ? "brightness-125" : ""}
                    />
                  )}

                  {/* Reasoning Bar (Middle) */}
                  {bar.reasoningHeight > 0 && (
                    <rect
                      x={bar.x}
                      y={bar.yReasoning}
                      width={bar.barWidth}
                      height={bar.reasoningHeight}
                      fill="url(#reasoningGradient)"
                      rx="1"
                      className={isHovered ? "brightness-125" : ""}
                    />
                  )}

                  {/* Completion Bar (Top) */}
                  {bar.completionHeight > 0 && (
                    <rect
                      x={bar.x}
                      y={bar.yCompletion}
                      width={bar.barWidth}
                      height={bar.completionHeight}
                      fill="url(#completionGradient)"
                      rx="2"
                      className={isHovered ? "brightness-125" : ""}
                    />
                  )}

                  {/* Hover highlight column */}
                  {isHovered && (
                    <line
                      x1={bar.centerX}
                      y1={paddingTop}
                      x2={bar.centerX}
                      y2={baselineY}
                      stroke="#38BDF8"
                      strokeDasharray="2 2"
                      strokeWidth="1"
                      opacity="0.6"
                    />
                  )}

                  {/* X-Axis Label */}
                  <text
                    x={bar.centerX}
                    y={baselineY + 16}
                    textAnchor="middle"
                    fill={isHovered ? "#F8FAFC" : "#64748B"}
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {formatXLabel(bar.item.bucket)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Hover Details Floating Tooltip */}
        {hoveredItem && hoveredBar && (
          <div
            className="absolute z-20 pointer-events-none p-3 rounded-lg bg-[#0F172A] border border-slate-700 shadow-xl text-xs font-mono space-y-1.5 animate-fadeIn"
            style={{
              left: `${Math.min(Math.max(hoveredBar.centerX / svgWidth * 100, 15), 85)}%`,
              top: "10px",
              transform: "translateX(-50%)",
            }}
          >
            <div className="text-white font-semibold flex items-center justify-between space-x-3 border-b border-slate-700 pb-1">
              <span>{hoveredItem.bucket}</span>
              <span className="text-cyan-400 font-bold">{hoveredItem.totalTokens.toLocaleString()} tok</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] pt-0.5">
              <div className="text-cyan-400">Prompt:</div>
              <div className="text-right text-slate-200">{hoveredItem.promptTokens.toLocaleString()}</div>

              <div className="text-purple-400">Reasoning (CoT):</div>
              <div className="text-right text-slate-200">{hoveredItem.reasoningTokens.toLocaleString()}</div>

              <div className="text-emerald-400">Completion:</div>
              <div className="text-right text-slate-200">{hoveredItem.completionTokens.toLocaleString()}</div>

              <div className="text-slate-400">Requests:</div>
              <div className="text-right text-slate-200">{hoveredItem.requests.toLocaleString()} reqs</div>

              <div className="text-slate-400">Est. Cost:</div>
              <div className="text-right text-amber-400 font-semibold">${hoveredItem.estimatedCostUsd.toFixed(4)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
