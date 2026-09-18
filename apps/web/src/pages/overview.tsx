import { Link } from "react-router-dom";
import {
  adminFetch,
  type Account,
  type AdapterInfo,
  type LiveEntry,
  type RequestLogEntry,
  type UsageSummaryRow,
  useQuery,
} from "../api.js";
import { Button } from "../components/field.js";
import { Table } from "../components/table.js";
import { formatCost, formatDateTime, formatDuration, formatTokens, todayIso } from "../format.js";

export function OverviewPage() {
  const adapters = useQuery("overview-adapters", () => adminFetch<AdapterInfo[]>("/admin/adapters"));
  const accounts = useQuery("overview-accounts", () => adminFetch<Account[]>("/admin/accounts"), {
    pollMs: 5000,
  });
  const live = useQuery("overview-live", () => adminFetch<LiveEntry[]>("/admin/live"), {
    pollMs: 5000,
  });
  const recent = useQuery("overview-recent", () =>
    adminFetch<RequestLogEntry[]>("/admin/requests?limit=20"),
  );
  const usage = useQuery("overview-usage", () =>
    adminFetch<UsageSummaryRow[]>(
      `/admin/usage/summary?from=${encodeURIComponent(todayIso())}&bucket=day&by=api_key`,
    ),
  );

  const installed = (adapters.data ?? []).filter((a) => a.installed);
  const accountRows = accounts.data ?? [];
  const ready = accountRows.filter(
    (a) => a.enabled && !(a.cooldownUntil && a.cooldownUntil > Date.now()) && a.active === 0,
  ).length;
  const cooling = accountRows.filter(
    (a) => a.cooldownUntil && a.cooldownUntil > Date.now(),
  ).length;
  const busy = accountRows.filter((a) => a.active > 0).length;

  const todayTotals = (usage.data ?? []).reduce(
    (acc, row) => ({
      input: acc.input + row.input,
      cachedInput: acc.cachedInput + row.cachedInput,
      output: acc.output + row.output,
      cost: acc.cost + row.costUsd,
    }),
    { input: 0, cachedInput: 0, output: 0, cost: 0 },
  );

  async function abortRequest(requestId: string) {
    await adminFetch(`/admin/live/${encodeURIComponent(requestId)}/abort`, { method: "POST" });
    await live.refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Adapters"
          value={String(installed.length)}
          sub={installed.map((a) => `${a.id}${a.version ? ` v${a.version}` : ""}`).join(", ") || undefined}
        />
        <Card title="Accounts" value={`${ready} ready · ${busy} busy · ${cooling} cooling`} />
        <Card title="In flight" value={String((live.data ?? []).length)} />
        <Card
          title="Today"
          value={`${formatTokens(todayTotals.input)} in · ${formatTokens(todayTotals.cachedInput)} cached · ${formatTokens(todayTotals.output)} out`}
          sub={formatCost(todayTotals.cost)}
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">In flight</h2>
        <Table
          rows={live.data ?? []}
          rowKey={(r) => r.requestId}
          empty="No requests running"
          columns={[
            { key: "id", header: "Request", render: (r) => r.requestId.slice(0, 8) },
            { key: "key", header: "Key", render: (r) => r.apiKeyId.slice(0, 8) },
            { key: "model", header: "Model", render: (r) => r.model },
            { key: "account", header: "Account", render: (r) => r.accountId ?? "—" },
            {
              key: "elapsed",
              header: "Elapsed",
              render: (r) => formatDuration(Date.now() - r.startedAt),
            },
            { key: "out", header: "Tokens out", render: (r) => formatTokens(r.tokensOut) },
            {
              key: "abort",
              header: "",
              render: (r) => (
                <Button variant="danger" type="button" onClick={() => void abortRequest(r.requestId)}>
                  Abort
                </Button>
              ),
            },
          ]}
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent requests</h2>
          <Link to="/usage" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            View all
          </Link>
        </div>
        <Table
          rows={recent.data ?? []}
          rowKey={(r) => r.id}
          empty="No requests yet"
          columns={[
            { key: "time", header: "Time", render: (r) => formatDateTime(r.createdAt) },
            { key: "key", header: "Key", render: (r) => r.apiKeyId.slice(0, 8) },
            { key: "model", header: "Model", render: (r) => r.modelExecuted ?? r.modelRequested },
            { key: "account", header: "Account", render: (r) => r.accountId ?? "—" },
            { key: "status", header: "Status", render: (r) => r.status },
            {
              key: "tokens",
              header: "Out",
              render: (r) => formatTokens(r.outputTokens),
            },
          ]}
        />
      </section>
    </div>
  );
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{title}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-neutral-500">{sub}</div> : null}
    </div>
  );
}
