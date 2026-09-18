export function formatTokens(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(value);
}

export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) {
    return "—";
  }
  return `$${usd.toFixed(4)}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) {
    return "—";
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  const sec = ms / 1000;
  if (sec < 60) {
    return `${sec.toFixed(1)} s`;
  }
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}m ${rem}s`;
}

export function formatRelativeTime(epochMs: number | null | undefined): string {
  if (epochMs == null || !Number.isFinite(epochMs)) {
    return "—";
  }
  const diff = epochMs - Date.now();
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  if (sec < 60) {
    return diff >= 0 ? `in ${sec}s` : `${sec}s ago`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return diff >= 0 ? `in ${min}m` : `${min}m ago`;
  }
  const hr = Math.round(min / 60);
  if (hr < 48) {
    return diff >= 0 ? `in ${hr}h` : `${hr}h ago`;
  }
  return new Date(epochMs).toLocaleString();
}

export function formatDateTime(epochMs: number | null | undefined): string {
  if (epochMs == null || !Number.isFinite(epochMs)) {
    return "—";
  }
  return new Date(epochMs).toLocaleString();
}

export function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
