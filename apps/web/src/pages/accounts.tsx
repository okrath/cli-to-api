import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  adminFetch,
  type Account,
  type AdapterInfo,
  type QuotaEntry,
  useQuery,
} from "../api.js";
import { Dialog } from "../components/dialog.js";
import { Button, Field, InlineError, NumberInput, SelectInput, TextInput } from "../components/field.js";
import { QuotaBars } from "../components/quota-bar.js";
import { Table } from "../components/table.js";
import { formatTokens } from "../format.js";

function accountStatus(account: Account, quota?: QuotaEntry): string {
  if (!account.enabled) {
    return "disabled";
  }
  const cooldown = quota?.cooldownUntil ?? account.cooldownUntil;
  const reason = quota?.cooldownReason ?? account.cooldownReason;
  if (cooldown && cooldown > Date.now()) {
    return `cooldown until ${new Date(cooldown).toLocaleTimeString()} (${reason ?? "unknown"})`;
  }
  if (account.active > 0) {
    return `busy ${account.active}/${account.maxConcurrent}`;
  }
  return "ready";
}

export function AccountsPage() {
  const navigate = useNavigate();
  const accounts = useQuery("accounts", () => adminFetch<Account[]>("/admin/accounts"), {
    pollMs: 5000,
  });
  const adapters = useQuery("accounts-adapters", () => adminFetch<AdapterInfo[]>("/admin/adapters"));
  const quota = useQuery("accounts-quota", () => adminFetch<QuotaEntry[]>("/admin/usage/quota"), {
    pollMs: 5000,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [purgeSandbox, setPurgeSandbox] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [adapterId, setAdapterId] = useState("");
  const [name, setName] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState(1);

  const installed = (adapters.data ?? []).filter((a) => a.installed);
  const quotaByAccount = new Map((quota.data ?? []).map((q) => [q.accountId, q]));

  async function createAccount() {
    setFormError(null);
    try {
      const created = await adminFetch<Account>("/admin/accounts", {
        method: "POST",
        body: JSON.stringify({ adapterId, name, maxConcurrent }),
      });
      setCreateOpen(false);
      setCreatedId(created.id);
      setName("");
      await accounts.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function patchAccount(id: string, patch: Record<string, unknown>) {
    setActionError(null);
    try {
      await adminFetch(`/admin/accounts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await accounts.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function resetCooldown(id: string) {
    setActionError(null);
    try {
      await adminFetch(`/admin/accounts/${encodeURIComponent(id)}/reset-cooldown`, {
        method: "POST",
      });
      await accounts.refresh();
      await quota.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Reset failed");
    }
  }

  async function deleteAccount() {
    if (!deleteTarget) {
      return;
    }
    setActionError(null);
    try {
      const qs = purgeSandbox ? "?purge=1" : "";
      await adminFetch(`/admin/accounts/${encodeURIComponent(deleteTarget.id)}${qs}`, {
        method: "DELETE",
      });
      setDeleteTarget(null);
      setPurgeSandbox(false);
      await accounts.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          New account
        </Button>
      </div>

      <InlineError message={actionError ?? accounts.error} />

      <Table
        rows={accounts.data ?? []}
        rowKey={(a) => a.id}
        empty="No accounts"
        columns={[
          { key: "adapter", header: "Adapter", render: (a) => a.adapterId },
          { key: "name", header: "Name", render: (a) => a.name },
          {
            key: "status",
            header: "Status",
            render: (a) => accountStatus(a, quotaByAccount.get(a.id)),
          },
          {
            key: "quota",
            header: "Quota",
            render: (a) => (
              <QuotaBars windows={quotaByAccount.get(a.id)?.windows ?? a.rateLimits} />
            ),
          },
          {
            key: "today",
            header: "Today",
            render: (a) => formatTokens(quotaByAccount.get(a.id)?.todayTokens ?? 0),
          },
          {
            key: "actions",
            header: "Actions",
            render: (a) => (
              <div className="flex flex-wrap gap-1">
                <Link
                  to={`/terminal?target=account:${encodeURIComponent(a.id)}`}
                  className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Terminal
                </Link>
                <Button variant="secondary" type="button" onClick={() => void resetCooldown(a.id)}>
                  Reset cooldown
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => void patchAccount(a.id, { enabled: !a.enabled })}
                >
                  {a.enabled ? "Disable" : "Enable"}
                </Button>
                <Button variant="danger" type="button" onClick={() => setDeleteTarget(a)}>
                  Delete
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Dialog
        open={createOpen}
        title="New account"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void createAccount()}>
              Create
            </Button>
          </>
        }
      >
        <Field label="Adapter">
          <SelectInput value={adapterId} onChange={(e) => setAdapterId(e.target.value)} required>
            <option value="">Select…</option>
            {installed.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Max concurrent">
          <NumberInput
            min={1}
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(Number(e.target.value))}
          />
        </Field>
        <InlineError message={formError} />
      </Dialog>

      <Dialog
        open={createdId != null}
        title="Account created"
        onClose={() => setCreatedId(null)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setCreatedId(null)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                navigate(`/terminal?target=account:${encodeURIComponent(createdId!)}`);
                setCreatedId(null);
              }}
            >
              Open terminal to log in
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Account <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{createdId}</code>{" "}
          is ready. Open its sandbox terminal and run the CLI login command.
        </p>
      </Dialog>

      <Dialog
        open={deleteTarget != null}
        title="Delete account"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" type="button" onClick={() => void deleteAccount()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Delete account <strong>{deleteTarget?.name}</strong>? Group targets referencing it will
          become &quot;Any account&quot;.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={purgeSandbox}
            onChange={(e) => setPurgeSandbox(e.target.checked)}
          />
          Also delete sandbox files
        </label>
      </Dialog>
    </div>
  );
}
