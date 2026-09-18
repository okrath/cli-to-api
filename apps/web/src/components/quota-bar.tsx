import { formatRelativeTime } from "../format.js";
import type { RateLimitWindow } from "../api.js";

export function QuotaBar({ window: win }: { window: RateLimitWindow }) {
  const pct = Math.min(Math.max(win.utilization * 100, 0), 100);
  const tone =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-0.5" title={win.name}>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>{win.name}</span>
        <span>
          {pct.toFixed(0)}% · resets {formatRelativeTime(win.resetsAt)}
        </span>
      </div>
      <div className="h-1.5 w-full rounded bg-neutral-200 dark:bg-neutral-800">
        <div className={`h-full rounded ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function QuotaBars({ windows }: { windows: RateLimitWindow[] }) {
  if (windows.length === 0) {
    return <span className="text-xs text-neutral-400">—</span>;
  }
  return (
    <div className="min-w-[140px] space-y-2">
      {windows.map((win) => (
        <QuotaBar key={win.name} window={win} />
      ))}
    </div>
  );
}
