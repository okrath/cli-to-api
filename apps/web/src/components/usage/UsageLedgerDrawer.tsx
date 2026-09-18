import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { apiClient } from "../../lib/api-client.js";

interface UsageLedgerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  dimA: string;
  valA: string;
  dimB?: string;
  valB?: string;
  startDate?: string;
  endDate?: string;
  range?: string;
}

interface RecordItem {
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
}

export function UsageLedgerDrawer({
  isOpen,
  onClose,
  dimA,
  valA,
  dimB,
  valB,
  startDate,
  endDate,
  range,
}: UsageLedgerDrawerProps) {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    if (!isOpen) return;

    const fetchRecords = async () => {
      setLoading(true);
      try {
        const res = await apiClient.getUsageRecords({
          dimA,
          valA,
          dimB,
          valB,
          startDate,
          endDate,
          range,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        });
        setRecords(res.records);
        setTotal(res.total);
      } catch (err) {
        console.error("Failed to load drilldown records:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [isOpen, dimA, valA, dimB, valB, startDate, endDate, range, page]);

  // Reset page when selection changes
  useEffect(() => {
    setPage(1);
  }, [dimA, valA, dimB, valB]);

  if (!isOpen) return null;

  const totalPages = Math.ceil(total / pageSize) || 1;

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end select-none animate-fadeIn">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-2xl bg-[#090B0F] border-l border-borderSubtle h-full flex flex-col shadow-2xl z-10">
        {/* Drawer Header */}
        <div className="p-5 border-b border-borderSubtle flex items-center justify-between bg-surface">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-white">Execution Drill-Down Ledger</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                {total} Records
              </span>
            </div>
            <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 mt-1">
              <span>Filter:</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">
                {dimA}: <strong className="text-cyan-400">{valA}</strong>
              </span>
              {dimB && valB && (
                <>
                  <span>×</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">
                    {dimB}: <strong className="text-purple-400">{valB}</strong>
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-surfaceHover text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="h-64 flex items-center justify-center text-xs font-mono text-cyan-400 animate-pulse">
              Loading individual transactions...
            </div>
          ) : records.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs font-mono text-slate-500">
              No transactions found for this slice.
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3 rounded-lg bg-surface border border-borderSubtle hover:border-slate-700 transition-colors space-y-2 font-mono text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-400 text-[10px]">{formatTime(rec.createdAt)}</span>
                      <span className="font-bold text-white truncate max-w-[180px]">
                        {rec.requestId}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                          rec.statusCode === 200
                            ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                            : rec.statusCode === 429
                            ? "bg-amber-950/60 text-amber-400 border-amber-500/30"
                            : "bg-rose-950/60 text-rose-400 border-rose-500/30"
                        }`}
                      >
                        {rec.statusCode} {rec.status}
                      </span>
                    </div>
                  </div>

                  {/* Metadata line */}
                  <div className="grid grid-cols-4 gap-2 text-[11px] pt-1 border-t border-slate-800 text-slate-300">
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">Model</span>
                      <span className="text-cyan-300 truncate block">
                        {rec.modelExecuted || rec.modelRequested}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">Adapter</span>
                      <span className="text-slate-300 truncate block">{rec.adapterId || "-"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">Tokens</span>
                      <span className="font-bold text-white">
                        {rec.totalTokens.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">TTFT / Total</span>
                      <span className="text-slate-300">
                        {rec.ttftMs ? `${rec.ttftMs}ms` : "-"} / {(rec.totalDurationMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                  </div>

                  {/* Token details pills */}
                  <div className="flex items-center space-x-3 text-[10px] text-slate-400">
                    <span>Prompt: <strong className="text-cyan-400">{rec.promptTokens}</strong></span>
                    <span>Reasoning: <strong className="text-purple-400">{rec.reasoningTokens}</strong></span>
                    <span>Completion: <strong className="text-emerald-400">{rec.completionTokens}</strong></span>
                  </div>

                  {rec.errorMessage && (
                    <div className="p-2 rounded bg-rose-950/30 border border-rose-500/30 text-[10px] text-rose-300 flex items-center space-x-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                      <span className="truncate">{rec.errorMessage}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Footer (Pagination) */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-borderSubtle flex items-center justify-between bg-surface font-mono text-xs text-slate-400">
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
    </div>
  );
}
