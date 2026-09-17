interface StatusBadgeProps {
  status: "READY" | "BUSY" | "COOLDOWN" | "ERROR" | "INSTALLED" | "NOT_INSTALLED" | "DEGRADED" | "UNPROVISIONED" | string;
  cooldownRemaining?: number;
  label?: string;
}

export function StatusBadge({ status, cooldownRemaining, label }: StatusBadgeProps) {
  if (status === "COOLDOWN") {
    const mins = Math.floor((cooldownRemaining || 0) / 60);
    const secs = (cooldownRemaining || 0) % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-amber-950/50 text-amber-300 border border-amber-500/40 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        <span>COOLDOWN ({timeStr})</span>
      </span>
    );
  }

  if (status === "READY" || status === "INSTALLED") {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-950/50 text-emerald-300 border border-emerald-500/40 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span>{label || (status === "INSTALLED" ? "INSTALLED" : "READY")}</span>
      </span>
    );
  }

  if (status === "BUSY") {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-blue-950/50 text-blue-300 border border-blue-500/40 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
        <span>STREAMING</span>
      </span>
    );
  }

  if (status === "NOT_INSTALLED") {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-900/80 text-slate-400 border border-slate-700/60 border-dashed">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        <span>NOT INSTALLED</span>
      </span>
    );
  }

  if (status === "UNPROVISIONED") {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-amber-950/40 text-amber-300 border border-amber-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        <span>NEEDS ACCOUNT</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-rose-950/50 text-rose-300 border border-rose-500/40 shadow-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
      <span>{label || (status === "DEGRADED" ? "DEGRADED" : "ERROR")}</span>
    </span>
  );
}
