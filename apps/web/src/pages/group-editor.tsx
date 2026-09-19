import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  adminFetch,
  type Account,
  type AdapterInfo,
  type Group,
  type GroupTarget,
  useQuery,
} from "../api.js";
import { DocsLink } from "../components/docs-link.js";
import {
  Button,
  Field,
  FieldWarning,
  InlineError,
  NumberInput,
  SelectInput,
  TextInput,
} from "../components/field.js";
import { Table } from "../components/table.js";

type EditableTarget = Omit<GroupTarget, "id"> & { id?: string };

const effortOptions = ["none", "low", "medium", "high", "xhigh"];

export function GroupEditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const groups = useQuery("group-editor-list", () => adminFetch<Group[]>("/admin/groups"));
  const adapters = useQuery("group-editor-adapters", () => adminFetch<AdapterInfo[]>("/admin/adapters"));
  const accounts = useQuery("group-editor-accounts", () => adminFetch<Account[]>("/admin/accounts"));

  const group = (groups.data ?? []).find((g) => g.id === id);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultEffort, setDefaultEffort] = useState("");
  const [cacheTtlSec, setCacheTtlSec] = useState(0);
  const [allowTools, setAllowTools] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [targets, setTargets] = useState<EditableTarget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!group) {
      return;
    }
    setName(group.name);
    setDescription(group.description ?? "");
    setDefaultEffort(group.defaultEffort ?? "");
    setCacheTtlSec(group.cacheTtlSec);
    setAllowTools(group.allowTools);
    setEnabled(group.enabled);
    setTargets(group.targets.map((t) => ({ ...t })));
  }, [group]);

  const adapterModels = (adapterId: string) =>
    (adapters.data ?? []).find((a) => a.id === adapterId)?.models ?? [];

  function moveTarget(index: number, dir: -1 | 1) {
    const next = [...targets];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) {
      return;
    }
    [next[index], next[swap]] = [next[swap], next[index]];
    setTargets(next);
  }

  function updateTarget(index: number, patch: Partial<EditableTarget>) {
    setTargets((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function addTarget() {
    const firstAdapter = (adapters.data ?? [])[0]?.id ?? "claude-code";
    setTargets((prev) => [
      ...prev,
      {
        tier: prev.length + 1,
        accountId: null,
        adapterId: firstAdapter,
        modelId: adapterModels(firstAdapter)[0]?.id ?? "",
        effortOverride: null,
        enabled: true,
      },
    ]);
  }

  function removeTarget(index: number) {
    setTargets((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    if (!group) {
      return;
    }
    setError(null);
    setSaved(false);
    try {
      await adminFetch(`/admin/groups/${encodeURIComponent(group.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          description: description || null,
          defaultEffort: defaultEffort || null,
          cacheTtlSec,
          allowTools,
          enabled,
          targets: targets.map(({ id: _id, ...t }) => t),
        }),
      });
      setSaved(true);
      await groups.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  if (groups.loading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  if (!group) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">Group not found.</p>
        <Link to="/groups" className="text-sm text-blue-600 hover:underline">
          Back to groups
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/groups" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            ← Groups
          </Link>
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-2xl font-semibold">{group.name}</h1>
            <DocsLink anchor="groups" />
          </div>
          <p className="text-sm text-neutral-500">
            Client model id:{" "}
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{group.id}</code>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" type="button" onClick={() => navigate("/groups")}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>

      <InlineError message={error} />
      {saved ? <p className="text-sm text-emerald-600">Saved.</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="Default effort"
          hint="Reasoning effort when the client sends none. Claude/Codex honour it; agy clamps xhigh to high; Cursor ignores it (effort is in the model id)."
        >
          <SelectInput value={defaultEffort} onChange={(e) => setDefaultEffort(e.target.value)}>
            <option value="">—</option>
            {effortOptions.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Description">
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field
          label="Cache TTL (seconds)"
          hint="Exact-match response cache. 0 = off (recommended for coding/agent use — prompts never repeat and stale answers confuse tools). Stores the full answer text in the database. Never used for requests with tools."
        >
          <NumberInput min={0} value={cacheTtlSec} onChange={(e) => setCacheTtlSec(Number(e.target.value))} />
        </Field>
      </div>

      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allowTools} onChange={(e) => setAllowTools(e.target.checked)} />
          Allow tools
        </label>
        <p className="text-xs text-neutral-500">
          Lets the CLI use its OWN built-in tools (shell, file edits) with permission prompts
          bypassed, for requests that carry no client tools. Not needed for client tool calling (omp,
          SDK `tools`).
        </p>
        {allowTools ? (
          <FieldWarning message="Bypasses CLI safety prompts. With a host-profile account the CLI acts as your user. Only Codex client-tool bridging requires this." />
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enabled
      </label>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Targets</h2>
            <p className="text-xs text-neutral-500">
              Requests with client tools are routed only to targets whose adapter can bridge them
              (Claude Code; Codex when Allow tools is on). Cursor agent and agy targets are skipped
              for those requests.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={addTarget}>
            Add target
          </Button>
        </div>
        <Table
          rows={targets.map((t, index) => ({ ...t, index }))}
          rowKey={(r) => String(r.index)}
          empty="No targets"
          columns={[
            {
              key: "tier",
              header: "Tier",
              headerHint:
                "Lowest available tier is tried first; higher tiers are failover. Accounts that should SHARE load must be on the SAME tier — load balancing only happens within a tier.",
              render: (r) => (
                <NumberInput
                  className="w-16"
                  min={1}
                  value={r.tier}
                  onChange={(e) => updateTarget(r.index, { tier: Number(e.target.value) })}
                />
              ),
            },
            {
              key: "adapter",
              header: "Adapter",
              render: (r) => (
                <SelectInput
                  value={r.adapterId}
                  onChange={(e) => {
                    const adapterId = e.target.value;
                    const models = adapterModels(adapterId);
                    updateTarget(r.index, {
                      adapterId,
                      modelId: models[0]?.id ?? r.modelId,
                    });
                  }}
                >
                  {(adapters.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id}
                    </option>
                  ))}
                </SelectInput>
              ),
            },
            {
              key: "model",
              header: "Model",
              render: (r) => (
                <div className="space-y-1">
                  <SelectInput
                    value={adapterModels(r.adapterId).some((m) => m.id === r.modelId) ? r.modelId : ""}
                    onChange={(e) => updateTarget(r.index, { modelId: e.target.value })}
                  >
                    <option value="">Custom…</option>
                    {adapterModels(r.adapterId).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label ?? m.id}
                      </option>
                    ))}
                  </SelectInput>
                  <TextInput
                    placeholder="Model id"
                    value={r.modelId}
                    onChange={(e) => updateTarget(r.index, { modelId: e.target.value })}
                  />
                </div>
              ),
            },
            {
              key: "account",
              header: "Account",
              headerHint:
                "Pin to one account, or leave empty for any enabled account of this adapter.",
              render: (r) => (
                <SelectInput
                  value={r.accountId ?? ""}
                  onChange={(e) =>
                    updateTarget(r.index, { accountId: e.target.value || null })
                  }
                >
                  <option value="">Any</option>
                  {(accounts.data ?? [])
                    .filter((a) => a.adapterId === r.adapterId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </SelectInput>
              ),
            },
            {
              key: "effort",
              header: "Effort",
              headerHint: "Overrides the group default for this target.",
              render: (r) => (
                <SelectInput
                  value={r.effortOverride ?? ""}
                  onChange={(e) =>
                    updateTarget(r.index, { effortOverride: e.target.value || null })
                  }
                >
                  <option value="">Default</option>
                  {effortOptions.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </SelectInput>
              ),
            },
            {
              key: "enabled",
              header: "On",
              render: (r) => (
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => updateTarget(r.index, { enabled: e.target.checked })}
                />
              ),
            },
            {
              key: "order",
              header: "",
              render: (r) => (
                <div className="flex gap-1">
                  <Button variant="secondary" type="button" onClick={() => moveTarget(r.index, -1)}>
                    ↑
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => moveTarget(r.index, 1)}>
                    ↓
                  </Button>
                  <Button variant="danger" type="button" onClick={() => removeTarget(r.index)}>
                    ×
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
