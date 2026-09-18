import React from "react";

interface UsageKpiCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  deltaPercent?: number | null;
  deltaLabel?: string;
  icon?: React.ReactNode;
  sparklineData?: number[];
  colorClass?: string;
  isInverseDelta?: boolean; // For metrics where lower is better (e.g. TTFT, Error rate)
}

export function UsageKpiCard({
  title,
  value,
  subValue,
  deltaPercent,
  deltaLabel = "vs prev period",
  icon,
  sparklineData = [],
  colorClass = "text-white",
  isInverseDelta = false,
}: UsageKpiCardProps) {
  // Compute SVG Sparkline points
  const sparklineSvg = React.useMemo(() => {
    if (!sparklineData || sparklineData.length < 2) return null;

    const width = 110;
    const height = 32;
    const padding = 2;

    const min = Math.min(...sparklineData);
    const max = Math.max(...sparklineData);
    const range = max - min || 1;

    const points = sparklineData.map((val, idx) => {
      const x = padding + (idx / (sparklineData.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((val - min) / range) * (height - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const linePath = `M ${points.join(" L ")}`;
    const areaPath = `${linePath} L ${width - padding},${height} L ${padding},${height} Z`;

    return { linePath, areaPath, width, height };
  }, [sparklineData]);

  // Delta Badge color
  const deltaBadge = React.useMemo(() => {
    if (deltaPercent === undefined || deltaPercent === null) return null;

    const isPositive = deltaPercent > 0;
    const isZero = deltaPercent === 0;

    // Determine if the change is "good"
    const isGood = isInverseDelta ? !isPositive : isPositive;

    let badgeClass = "bg-slate-800 text-slate-400 border-slate-700";
    if (!isZero) {
      badgeClass = isGood
        ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
        : "bg-rose-950/60 text-rose-400 border-rose-500/30";
    }

    const symbol = isZero ? "●" : isPositive ? "▲ +" : "▼ ";

    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${badgeClass}`}
      >
        <span>
          {symbol}
          {Math.abs(deltaPercent)}%
        </span>
        <span className="ml-1 text-[9px] opacity-75">{deltaLabel}</span>
      </span>
    );
  }, [deltaPercent, deltaLabel, isInverseDelta]);

  return (
    <div className="p-4 rounded-xl bg-surface border border-borderSubtle flex flex-col justify-between space-y-3 hover:border-slate-700 transition-colors select-none">
      <div className="flex items-center justify-between text-slate-400">
        <span className="text-[11px] font-mono uppercase tracking-wider font-medium">{title}</span>
        {icon && <span className="opacity-80">{icon}</span>}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className={`text-2xl font-bold font-mono tracking-tight ${colorClass}`}>
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
          {subValue && (
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">{subValue}</div>
          )}
        </div>

        {sparklineSvg && (
          <div className="opacity-70 hover:opacity-100 transition-opacity">
            <svg
              width={sparklineSvg.width}
              height={sparklineSvg.height}
              className="overflow-visible"
            >
              <defs>
                <linearGradient id={`spark-grad-${title.replace(/\s+/g, "-")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={sparklineSvg.areaPath}
                fill={`url(#spark-grad-${title.replace(/\s+/g, "-")})`}
              />
              <path
                d={sparklineSvg.linePath}
                fill="none"
                stroke="#06B6D4"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      {deltaBadge && <div className="pt-1">{deltaBadge}</div>}
    </div>
  );
}
