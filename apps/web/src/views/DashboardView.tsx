import { useEffect, useState } from "react";
import { Activity, Zap, Clock, ShieldCheck, AlertTriangle } from "lucide-react";
import { StatusBadge } from "../components/layout/StatusBadge.js";
import { apiClient, AccountData } from "../lib/api-client.js";

export function DashboardView() {
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchAccounts = async () => {
    try {
      const list = await apiClient.getAccounts();
      setAccounts(list);
      setErrorMessage(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    const interval = setInterval(fetchAccounts, 3000);
    return () => clearInterval(interval);
  }, []);

  const totalSlots = accounts.reduce((acc, a) => acc + a.maxSlots, 0);
  const activeSlots = accounts.reduce((acc, a) => acc + a.activeSlots, 0);
  const healthyAccounts = accounts.filter(a => a.status === "READY" || a.status === "BUSY").length;
  const inCooldown = accounts.filter(a => a.status === "COOLDOWN").length;

  return (
    <div className="p-8 space-y-8 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Fleet Overview & Telemetry</h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Real-time daemon state, concurrency slots, and healthy worker pools.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 flex items-center space-x-3 text-xs font-mono text-rose-300">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Gateway Connection Error: {errorMessage}. Check your API Key in the top header.</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-surface border border-borderSubtle space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono uppercase tracking-wider">Active Concurrency</span>
            <Activity className="w-4 h-4 text-brand" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {activeSlots} <span className="text-sm font-normal text-slate-400">/ {totalSlots} slots</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            {totalSlots > 0 ? Math.round((activeSlots / totalSlots) * 100) : 0}% capacity utilization
          </div>
        </div>

        <div className="p-5 rounded-xl bg-surface border border-borderSubtle space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono uppercase tracking-wider">Account Pool Health</span>
            <ShieldCheck className="w-4 h-4 text-statusHealthy" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {healthyAccounts} <span className="text-sm font-normal text-slate-400">/ {accounts.length} online</span>
          </div>
          <div className="text-[11px] font-mono text-statusHealthy">
            {inCooldown > 0 ? `${inCooldown} accounts in cooldown backoff` : "All accounts healthy"}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-surface border border-borderSubtle space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono uppercase tracking-wider">Total Handled Requests</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {accounts.reduce((acc, a) => acc + a.totalRequests, 0)}
          </div>
          <div className="text-[11px] font-mono text-slate-400">Cumulative across all CLI workers</div>
        </div>

        <div className="p-5 rounded-xl bg-surface border border-borderSubtle space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono uppercase tracking-wider">Average Latency</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {accounts.length > 0
              ? Math.round(accounts.reduce((acc, a) => acc + a.avgLatencyMs, 0) / accounts.length)
              : 0} ms
          </div>
          <div className="text-[11px] font-mono text-slate-400">Exponential moving average</div>
        </div>
      </div>

      {/* Account Matrix Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-wide uppercase font-mono text-slate-300">
            Live Account Health Matrix
          </h2>
          <span className="text-xs font-mono text-slate-400">Auto-refreshing every 3s</span>
        </div>

        <div className="rounded-xl border border-borderSubtle bg-surface overflow-hidden">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#181C26] text-slate-400 border-b border-borderSubtle">
              <tr>
                <th className="px-5 py-3 font-medium">Account Identifier</th>
                <th className="px-5 py-3 font-medium">CLI Provider</th>
                <th className="px-5 py-3 font-medium">Concurrency</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Total Calls</th>
                <th className="px-5 py-3 font-medium">Avg Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderSubtle">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-surfaceHover/50 transition">
                  <td className="px-5 py-3.5 font-semibold text-white">{acc.name}</td>
                  <td className="px-5 py-3.5 text-brand">{acc.adapterId}</td>
                  <td className="px-5 py-3.5 text-slate-200">
                    {acc.activeSlots} / {acc.maxSlots}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge
                      status={acc.status}
                      cooldownRemaining={acc.cooldownSecondsRemaining}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-slate-400">{acc.totalRequests}</td>
                  <td className="px-5 py-3.5 text-slate-400">{acc.avgLatencyMs} ms</td>
                </tr>
              ))}
              {accounts.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500 font-mono text-xs">
                    No CLI accounts registered yet. Go to Accounts to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
