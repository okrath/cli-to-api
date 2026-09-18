import { useState } from "react";
import { Calendar, Download, RefreshCw, ChevronDown, Check } from "lucide-react";

interface UsageFilterToolbarProps {
  activeRange: string;
  onSelectRange: (range: string) => void;
  startDate: string;
  endDate: string;
  onChangeDates: (start: string, end: string) => void;
  compare: boolean;
  onToggleCompare: (compare: boolean) => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: (val: boolean) => void;
  onRefresh: () => void;
  loading: boolean;
  exportUrlCsv: string;
  exportUrlJson: string;
}

export function UsageFilterToolbar({
  activeRange,
  onSelectRange,
  startDate,
  endDate,
  onChangeDates,
  compare,
  onToggleCompare,
  autoRefresh,
  onToggleAutoRefresh,
  onRefresh,
  loading,
  exportUrlCsv,
  exportUrlJson,
}: UsageFilterToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCustomDate, setShowCustomDate] = useState(false);

  const presets = [
    { id: "today", label: "Today (24h)" },
    { id: "yesterday", label: "Yesterday" },
    { id: "7d", label: "Last 7D" },
    { id: "14d", label: "Last 14D" },
    { id: "30d", label: "Last 30D" },
    { id: "month", label: "This Month" },
    { id: "all", label: "All Time" },
  ];

  const handleApplyCustomDates = () => {
    if (startDate && endDate) {
      onSelectRange("custom");
      setShowCustomDate(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-surface border border-borderSubtle select-none">
      {/* Left: Range Presets & Custom Picker */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center bg-[#0F172A] rounded-lg p-1 border border-borderSubtle">
          {presets.map((p) => {
            const isActive = activeRange === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  onSelectRange(p.id);
                  setShowCustomDate(false);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
                  isActive
                    ? "bg-brand text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-surfaceHover"
                }`}
              >
                {p.label}
              </button>
            );
          })}

          <button
            onClick={() => setShowCustomDate(!showCustomDate)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono flex items-center space-x-1.5 transition-all ${
              activeRange === "custom" || showCustomDate
                ? "bg-cyan-950/60 text-cyan-400 border border-cyan-500/40 font-semibold"
                : "text-slate-400 hover:text-slate-200 hover:bg-surfaceHover"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Custom</span>
          </button>
        </div>

        {/* Custom Date Inputs Dropdown/Drawer */}
        {showCustomDate && (
          <div className="flex items-center space-x-2 bg-[#0F172A] p-1.5 rounded-lg border border-cyan-500/30 text-xs font-mono animate-fadeIn">
            <input
              type="date"
              value={startDate}
              onChange={(e) => onChangeDates(e.target.value, endDate)}
              className="bg-surface border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-cyan-400"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onChangeDates(startDate, e.target.value)}
              className="bg-surface border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-cyan-400"
            />
            <button
              onClick={handleApplyCustomDates}
              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold"
            >
              Apply
            </button>
          </div>
        )}

        {/* Compare Checkbox */}
        <label className="flex items-center space-x-2 text-xs font-mono text-slate-300 ml-2 cursor-pointer">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => onToggleCompare(e.target.checked)}
            className="w-4 h-4 rounded bg-surface border-slate-700 text-brand focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <span>Compare vs prev period</span>
        </label>
      </div>

      {/* Right: Auto-Refresh, Refresh, Export Actions */}
      <div className="flex items-center space-x-3">
        {/* Auto Refresh Toggle */}
        <button
          onClick={() => onToggleAutoRefresh(!autoRefresh)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
            autoRefresh
              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/40"
              : "bg-surfaceHover text-slate-400 border-borderSubtle hover:text-slate-200"
          }`}
          title="Toggle 30-second automated polling refresh"
        >
          <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
          <span>Auto-Refresh (30s)</span>
        </button>

        {/* Manual Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-lg bg-surfaceHover border border-borderSubtle text-slate-300 hover:text-white hover:border-slate-600 transition-all disabled:opacity-50"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-cyan-400" : ""}`} />
        </button>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-surfaceHover border border-borderSubtle text-slate-200 hover:text-white hover:border-slate-600 text-xs font-mono transition-all"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showExportMenu && (
            <div
              className="absolute right-0 mt-1.5 w-44 rounded-lg bg-[#0F172A] border border-slate-700 shadow-2xl py-1 z-30 font-mono text-xs animate-fadeIn"
              onMouseLeave={() => setShowExportMenu(false)}
            >
              <div className="px-3 py-1 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                Audit Export (O(1) Stream)
              </div>
              <a
                href={exportUrlCsv}
                download
                onClick={() => setShowExportMenu(false)}
                className="flex items-center space-x-2 px-3 py-2 text-slate-200 hover:bg-slate-800 hover:text-cyan-300 transition-colors"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export CSV (RFC 4180)</span>
              </a>
              <a
                href={exportUrlJson}
                download
                onClick={() => setShowExportMenu(false)}
                className="flex items-center space-x-2 px-3 py-2 text-slate-200 hover:bg-slate-800 hover:text-cyan-300 transition-colors"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export JSON Formatted</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
