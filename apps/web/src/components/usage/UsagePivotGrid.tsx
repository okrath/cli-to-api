import { useState, useMemo } from "react";
import { Search, ArrowUpDown, Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { PivotRowItem } from "../../lib/api-client.js";

interface UsagePivotGridProps {
  rows: PivotRowItem[];
  dimA: string;
  dimB: string;
  onChangeDimensions: (dimA: string, dimB: string) => void;
  onDrillDown: (dimA: string, valA: string, dimB: string, valB: string) => void;
  loading?: boolean;
}

type SortField =
  | "dimAVal"
  | "dimBVal"
  | "requests"
  | "promptTokens"
  | "reasoningTokens"
  | "completionTokens"
  | "totalTokens"
  | "tokensPerSecond"
  | "errorRate"
  | "estimatedCostUsd";

export function UsagePivotGrid({
  rows = [],
  dimA,
  dimB,
  onChangeDimensions,
  onDrillDown,
  loading = false,
}: UsagePivotGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("totalTokens");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const dimensionPresets = [
    { id: "model-adapter", a: "model", b: "adapter", label: "Model × Provider" },
    { id: "account-model", a: "account", b: "model", label: "Account × Model" },
    { id: "date-model", a: "date", b: "model", label: "Daily Date × Model" },
    { id: "adapter-status", a: "adapter", b: "status", label: "Provider × Status" },
  ];

  const currentPresetId = `${dimA}-${dimB}`;

  // Filter & Sort
  const processedRows = useMemo(() => {
    let list = rows;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) => r.dimAVal.toLowerCase().includes(q) || r.dimBVal.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      let va = a[sortField];
      let vb = b[sortField];
      if (typeof va === "string") {
        return sortAsc ? va.localeCompare(String(vb)) : String(vb).localeCompare(va);
      }
      return sortAsc ? (Number(va) || 0) - (Number(vb) || 0) : (Number(vb) || 0) - (Number(va) || 0);
    });
  }, [rows, searchQuery, sortField, sortAsc]);

  // Pagination
  const totalPages = Math.ceil(processedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return processedRows.slice(start, start + pageSize);
  }, [processedRows, page, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Grand totals
  const grandTotal = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        requests: acc.requests + r.requests,
        promptTokens: acc.promptTokens + r.promptTokens,
        reasoningTokens: acc.reasoningTokens + r.reasoningTokens,
        completionTokens: acc.completionTokens + r.completionTokens,
        totalTokens: acc.totalTokens + r.totalTokens,
        estimatedCostUsd: acc.estimatedCostUsd + r.estimatedCostUsd,
      }),
      {
        requests: 0,
        promptTokens: 0,
        reasoningTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      }
    );
  }, [rows]);

  return (
    <div className="p-5 rounded-xl bg-surface border border-borderSubtle space-y-4 select-none">
      {/* Header & Dimension Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borderSubtle pb-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
            <span>OLAP Cross-Tabulation Matrix</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surfaceHover text-slate-300 border border-borderSubtle">
              {dimA.toUpperCase()} × {dimB.toUpperCase()}
            </span>
          </h3>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
            Multi-dimensional aggregation grid. Click any row to inspect individual execution logs.
          </p>
        </div>

        {/* Dimension Pair Buttons */}
        <div className="flex items-center space-x-1.5 bg-[#0F172A] p-1 rounded-lg border border-borderSubtle">
          {dimensionPresets.map((p) => {
            const isActive = currentPresetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  onChangeDimensions(p.a, p.b);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                  isActive
                    ? "bg-brand text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-surfaceHover"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Bar within Grid */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder={`Search ${dimA} or ${dimB}...`}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full bg-[#0F172A] border border-borderSubtle rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 outline-none focus:border-brand"
          />
        </div>

        <div className="text-xs font-mono text-slate-400">
          Showing {processedRows.length} matrix rows
        </div>
      </div>

      {/* Table Matrix */}
      <div className="overflow-x-auto rounded-lg border border-borderSubtle">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-[#0F172A] text-slate-400 uppercase text-[10px] tracking-wider border-b border-borderSubtle">
            <tr>
              <th
                onClick={() => handleSort("dimAVal")}
                className="py-3 px-3.5 cursor-pointer hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center space-x-1">
                  <span>{dimA}</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th
                onClick={() => handleSort("dimBVal")}
                className="py-3 px-3.5 cursor-pointer hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center space-x-1">
                  <span>{dimB}</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th
                onClick={() => handleSort("requests")}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-200"
              >
                Reqs
              </th>
              <th
                onClick={() => handleSort("promptTokens")}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-200 text-[#06B6D4]"
              >
                Prompt
              </th>
              <th
                onClick={() => handleSort("reasoningTokens")}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-200 text-[#A855F7]"
              >
                Reasoning (CoT)
              </th>
              <th
                onClick={() => handleSort("completionTokens")}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-200 text-[#10B981]"
              >
                Completion
              </th>
              <th
                onClick={() => handleSort("totalTokens")}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-200 text-white font-bold"
              >
                Total
              </th>
              <th
                onClick={() => handleSort("tokensPerSecond")}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-200"
              >
                Tok/s
              </th>
              <th
                onClick={() => handleSort("errorRate")}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-200"
              >
                Err %
              </th>
              <th
                onClick={() => handleSort("estimatedCostUsd")}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-200 text-amber-400"
              >
                Cost ($)
              </th>
              <th className="py-3 px-3 text-center">Drill-Down</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderSubtle bg-surface">
            {loading && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-500 font-mono text-xs">
                  Loading OLAP aggregation data...
                </td>
              </tr>
            )}

            {!loading && paginatedRows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-500 font-mono text-xs">
                  No records matching the filter criteria.
                </td>
              </tr>
            )}

            {!loading &&
              paginatedRows.map((r, idx) => (
                <tr
                  key={`pivot-row-${idx}`}
                  onClick={() => onDrillDown(dimA, r.dimAVal, dimB, r.dimBVal)}
                  className="hover:bg-surfaceHover/80 cursor-pointer transition-colors group"
                >
                  <td className="py-2.5 px-3.5 font-semibold text-slate-100 group-hover:text-cyan-300">
                    {r.dimAVal}
                  </td>
                  <td className="py-2.5 px-3.5 text-slate-300">{r.dimBVal}</td>
                  <td className="py-2.5 px-3 text-right text-slate-200">{r.requests.toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-right text-cyan-400">
                    {r.promptTokens.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right text-purple-400">
                    {r.reasoningTokens.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right text-emerald-400">
                    {r.completionTokens.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-white">
                    {r.totalTokens.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    {r.tokensPerSecond > 0 ? `${r.tokensPerSecond}/s` : "-"}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        r.errorRate > 5
                          ? "bg-rose-950/60 text-rose-400"
                          : r.errorRate > 0
                          ? "bg-amber-950/60 text-amber-400"
                          : "text-slate-400"
                      }`}
                    >
                      {r.errorRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-amber-400">
                    ${r.estimatedCostUsd.toFixed(4)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDrillDown(dimA, r.dimAVal, dimB, r.dimBVal);
                      }}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 transition-colors"
                      title="Inspect Transactions"
                    >
                      <Layers className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

            {/* Grand Total Footer */}
            {!loading && rows.length > 0 && (
              <tr className="bg-[#0F172A] font-bold text-slate-200 border-t-2 border-slate-700">
                <td colSpan={2} className="py-3 px-3.5 text-white uppercase tracking-wider">
                  Grand Total ({rows.length} rows)
                </td>
                <td className="py-3 px-3 text-right">{grandTotal.requests.toLocaleString()}</td>
                <td className="py-3 px-3 text-right text-cyan-400">
                  {grandTotal.promptTokens.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right text-purple-400">
                  {grandTotal.reasoningTokens.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right text-emerald-400">
                  {grandTotal.completionTokens.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right text-white">
                  {grandTotal.totalTokens.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right text-slate-400">-</td>
                <td className="py-3 px-3 text-right text-slate-400">-</td>
                <td className="py-3 px-3 text-right text-amber-400">
                  ${grandTotal.estimatedCostUsd.toFixed(4)}
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-2">
          <div>
            Page {page} of {totalPages}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded bg-surfaceHover border border-borderSubtle text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page === totalPages}
              className="px-2.5 py-1 rounded bg-surfaceHover border border-borderSubtle text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
