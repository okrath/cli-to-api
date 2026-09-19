import { useMemo, useState } from "react";
import {
  adminFetch,
  type RequestLogEntry,
  type UsageSummaryRow,
  useQuery,
} from "../api.js";
import { DocsLink } from "../components/docs-link.js";
import { Button, SelectInput } from "../components/field.js";
import { Table } from "../components/table.js";
import { UsageChart } from "../components/usage-chart.js";
import {
  daysAgoIso,
  formatCost,
  formatDateTime,
  formatDuration,
  formatTokens,
  todayIso,
} from "../format.js";

type RangePreset = "today" | "7d" | "30d" | "custom";
type Bucket = "day" | "hour";
type By = "api_key" | "account" | "model" | "group";

export function UsagePage() {
  const [range, setRange] = useState<RangePreset>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [bucket, setBucket] = useState<Bucket>("day");
  const [by, setBy] = useState<By>("api_key");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { from, to } = useMemo(() => {
    const now = new Date().toISOString();
    if (range === "today") {
      return { from: todayIso(), to: now };
    }
    if (range === "7d") {
      return { from: daysAgoIso(7), to: now };
    }
    if (range === "30d") {
      return { from: daysAgoIso(30), to: now };
    }
    return {
      from: customFrom ? new Date(customFrom).toISOString() : daysAgoIso(7),
      to: customTo ? new Date(customTo).toISOString() : now,
    };
  }, [range, customFrom, customTo]);

  const summaryKey = `usage-summary-${from}-${to}-${bucket}-${by}`;
  const summary = useQuery(summaryKey, () =>
    adminFetch<UsageSummaryRow[]>(
      `/admin/usage/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&bucket=${bucket}&by=${by}`,
    ),
  );

  const requestsKey = `usage-requests-${offset}`;
  const requests = useQuery(requestsKey, () =>
    adminFetch<RequestLogEntry[]>(`/admin/requests?limit=${limit}&offset=${offset}`),
  );

  const tableRows = summary.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-2xl font-semibold">Usage</h1>
        <DocsLink anchor="how-routing-works" />
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-1">
          Range
          <SelectInput value={range} onChange={(e) => setRange(e.target.value as RangePreset)}>
            <option value="today">Today</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="custom">Custom</option>
          </SelectInput>
        </label>
        {range === "custom" ? (
          <>
            <label className="flex items-center gap-1">
              From
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className="flex items-center gap-1">
              To
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </>
        ) : null}
        <label className="flex items-center gap-1">
          Bucket
          <SelectInput value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)}>
            <option value="day">Day</option>
            <option value="hour">Hour</option>
          </SelectInput>
        </label>
        <label className="flex items-center gap-1">
          By
          <SelectInput value={by} onChange={(e) => setBy(e.target.value as By)}>
            <option value="api_key">Key</option>
            <option value="account">Account</option>
            <option value="model">Model</option>
            <option value="group">Group</option>
          </SelectInput>
        </label>
      </div>

      <UsageChart rows={tableRows} />

      <Table
        rows={tableRows}
        rowKey={(r) => `${r.bucket}-${r.key}`}
        empty="No usage data"
        columns={[
          { key: "bucket", header: "Bucket", render: (r) => r.bucket },
          { key: "label", header: "Label", render: (r) => r.label || r.key || "—" },
          { key: "in", header: "Input", render: (r) => formatTokens(r.input) },
          { key: "cached", header: "Cached", render: (r) => formatTokens(r.cachedInput) },
          { key: "out", header: "Output", render: (r) => formatTokens(r.output) },
          { key: "reason", header: "Reasoning", render: (r) => formatTokens(r.reasoning) },
          { key: "cost", header: "Cost", render: (r) => formatCost(r.costUsd) },
        ]}
      />

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Requests</h2>
        <Table
          rows={requests.data ?? []}
          rowKey={(r) => r.id}
          empty="No requests"
          columns={[
            { key: "time", header: "Time", render: (r) => formatDateTime(r.createdAt) },
            { key: "key", header: "Key", render: (r) => r.apiKeyId.slice(0, 8) },
            {
              key: "model",
              header: "Model → executed",
              render: (r) => `${r.modelRequested} → ${r.modelExecuted ?? "—"}`,
            },
            { key: "account", header: "Account", render: (r) => r.accountId ?? "—" },
            { key: "status", header: "Status", render: (r) => r.status },
            {
              key: "tokens",
              header: "In / cached / out / reasoning",
              render: (r) =>
                `${formatTokens(r.inputTokens)} / ${formatTokens(r.cachedInputTokens)} / ${formatTokens(r.outputTokens)} / ${formatTokens(r.reasoningTokens)}`,
            },
            { key: "ttft", header: "TTFT", render: (r) => formatDuration(r.ttftMs) },
            { key: "dur", header: "Duration", render: (r) => formatDuration(r.durationMs) },
            {
              key: "session",
              header: "Session",
              render: (r) => (r.sessionReused ? "reused" : "new"),
            },
            { key: "fail", header: "Failovers", render: (r) => String(r.failoverCount ?? 0) },
            { key: "cache", header: "Cache", render: (r) => formatTokens(r.cacheWriteTokens) },
          ]}
        />
        <div className="flex gap-2">
          <Button
            variant="secondary"
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </Button>
          <Button variant="secondary" type="button" onClick={() => setOffset(offset + limit)}>
            Next
          </Button>
        </div>
      </section>
    </div>
  );
}
