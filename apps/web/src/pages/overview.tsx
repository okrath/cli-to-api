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
import { DocsLink } from "../components/docs-link.js";
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
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <DocsLink anchor="how-routing-works" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Adapters"
          value={String(installed.length)}
          sub={installed.map((a) => `${a.id}${a.version ? ` v${a.version}` : ""}`).join(", ") || undefined}
        />
        <Card
          title="Accounts"
          value={`${ready} ready · ${busy} busy · ${cooling} cooling`}
          sub="busy = all slots taken · cooling = skipped by routing"
        />
        <Card title="In flight" value={String((live.data ?? []).length)} />
        <Card
          title="Today"
          value={`${formatTokens(todayTotals.input)} in · ${formatTokens(todayTotals.cachedInput)} cached · ${formatTokens(todayTotals.output)} out`}
          sub={formatCost(todayTotals.cost)}
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Adapters</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(adapters.data ?? []).map((adapter) => (
            <AdapterCard key={adapter.id} adapter={adapter} />
          ))}
        </div>
      </section>

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
              key: "state",
              header: "State",
              render: (r) => <LiveStateBadge state={r.state ?? "running"} />,
            },
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

const WAITING_TOOL_TOOLTIP =
  "Parked: waiting for the client to return a tool result; holds an account slot until Tool result timeout.";

function LiveStateBadge({ state }: { state: "running" | "waiting_tool_result" }) {
  if (state === "waiting_tool_result") {
    return (
      <span
        title={WAITING_TOOL_TOOLTIP}
        className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      >
        waiting_tool_result
      </span>
    );
  }
  return (
    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      running
    </span>
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

function hostLoginLine(adapter: AdapterInfo): string {
  const { hostLogin } = adapter;
  if (hostLogin.status === "logged_in") {
    return hostLogin.label ? `Host login: logged in as ${hostLogin.label}` : "Host login: logged in";
  }
  if (hostLogin.status === "logged_out") {
    return "Host login: not logged in";
  }
  return "Host login: unknown";
}

function AdapterCard({ adapter }: { adapter: AdapterInfo }) {
  return (
    <div className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">{adapter.id}</div>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            adapter.installed
              ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"
          }`}
        >
          {adapter.installed ? "installed" : "missing"}
        </span>
      </div>
      <div className="mt-1 text-xs text-neutral-500">
        {adapter.version ? `v${adapter.version}` : adapter.executable}
      </div>
      <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{hostLoginLine(adapter)}</div>
    </div>
  );
}
