import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { UsageSummaryRow } from "../api.js";

interface ChartPoint {
  bucket: string;
  input: number;
  cachedInput: number;
  output: number;
  reasoning: number;
}

function aggregateByBucket(rows: UsageSummaryRow[]): ChartPoint[] {
  const map = new Map<string, ChartPoint>();
  for (const row of rows) {
    const existing = map.get(row.bucket) ?? {
      bucket: row.bucket,
      input: 0,
      cachedInput: 0,
      output: 0,
      reasoning: 0,
    };
    existing.input += row.input;
    existing.cachedInput += row.cachedInput;
    existing.output += row.output;
    existing.reasoning += row.reasoning;
    map.set(row.bucket, existing);
  }
  return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export function UsageChart({ rows }: { rows: UsageSummaryRow[] }) {
  const data = aggregateByBucket(rows);
  if (data.length === 0) {
    return <p className="text-sm text-neutral-500">No usage in this range.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-800" />
          <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="input" stackId="a" fill="#3b82f6" name="Input" />
          <Bar dataKey="cachedInput" stackId="a" fill="#06b6d4" name="Cached input" />
          <Bar dataKey="output" stackId="a" fill="#10b981" name="Output" />
          <Bar dataKey="reasoning" stackId="a" fill="#a855f7" name="Reasoning" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
