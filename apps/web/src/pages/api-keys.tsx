import { useState } from "react";
import {
  adminFetch,
  type ApiKey,
  type ApiKeyCreated,
  type ApiKeyRetention,
  clientBaseUrls,
  useQuery,
} from "../api.js";
import { Dialog } from "../components/dialog.js";
import { DocsLink } from "../components/docs-link.js";
import { Button, Field, InlineError, SelectInput, TextInput } from "../components/field.js";
import { Table } from "../components/table.js";
import { formatDateTime } from "../format.js";

export function ApiKeysPage() {
  const keys = useQuery("api-keys", () => adminFetch<ApiKey[]>("/admin/api-keys"));
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [retention, setRetention] = useState<ApiKeyRetention>("standard");
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteErrorById, setDeleteErrorById] = useState<Record<string, string>>({});

  async function createKey() {
    setError(null);
    try {
      const row = await adminFetch<ApiKeyCreated>("/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ name, retention }),
      });
      setCreateOpen(false);
      setName("");
      setRetention("standard");
      setCreated(row);
      await keys.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function toggleKey(id: string, enabled: boolean) {
    setError(null);
    try {
      await adminFetch(`/admin/api-keys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      await keys.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function deleteKey(id: string) {
    if (!window.confirm("Delete this API key?")) {
      return;
    }
    setError(null);
    setDeleteErrorById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await adminFetch(`/admin/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      await keys.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      setDeleteErrorById((prev) => ({ ...prev, [id]: message }));
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  const bases = clientBaseUrls();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-semibold">API keys</h1>
          <DocsLink anchor="api-keys" />
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          New key
        </Button>
      </div>

      <InlineError message={error ?? keys.error} />

      <Table
        rows={keys.data ?? []}
        rowKey={(k) => k.id}
        empty="No API keys"
        columns={[
          { key: "name", header: "Name", render: (k) => k.name },
          { key: "prefix", header: "Prefix", render: (k) => k.prefix },
          {
            key: "retention",
            header: "Retention",
            render: (k) =>
              k.retention === "ephemeral" ? "ephemeral — no history kept" : "standard",
          },
          { key: "enabled", header: "Enabled", render: (k) => (k.enabled ? "yes" : "no") },
          { key: "last", header: "Last used", render: (k) => formatDateTime(k.lastUsedAt) },
          { key: "created", header: "Created", render: (k) => formatDateTime(k.createdAt) },
          {
            key: "actions",
            header: "",
            render: (k) => (
              <div className="space-y-1">
                <div className="flex gap-1">
                  <Button variant="secondary" type="button" onClick={() => void toggleKey(k.id, !k.enabled)}>
                    {k.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button variant="danger" type="button" onClick={() => void deleteKey(k.id)}>
                    Delete
                  </Button>
                </div>
                {deleteErrorById[k.id] ? (
                  <p className="text-xs text-red-600 dark:text-red-400">{deleteErrorById[k.id]}</p>
                ) : null}
              </div>
            ),
          },
        ]}
      />

      <Dialog
        open={createOpen}
        title="New API key"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void createKey()}>
              Create
            </Button>
          </>
        }
      >
        <Field label="Name" hint="Label shown in usage reports.">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field
          label="Retention"
          hint="standard: sessions are reused; transcripts are deleted when the session expires. ephemeral: no session reuse, no cache, the run's transcript is deleted right after each response — safest for sensitive content, costs more tokens."
        >
          <SelectInput
            value={retention}
            onChange={(e) => setRetention(e.target.value as ApiKeyRetention)}
          >
            <option value="standard">standard</option>
            <option value="ephemeral">ephemeral — no history kept</option>
          </SelectInput>
        </Field>
        <InlineError message={error} />
      </Dialog>

      <Dialog
        open={created != null}
        title="API key created"
        onClose={() => setCreated(null)}
        footer={
          <Button type="button" onClick={() => setCreated(null)}>
            Done
          </Button>
        }
      >
        {created ? (
          <div className="space-y-3 text-sm">
            <p>Copy this key now — it will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-800">
                {created.plaintext}
              </code>
              <Button type="button" variant="secondary" onClick={() => void copyText(created.plaintext)}>
                Copy
              </Button>
            </div>
            <div>
              <div className="mb-1 font-medium">OpenAI-compatible</div>
              <pre className="overflow-x-auto rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-800">{`base_url = "${bases.openai}"
api_key = "${created.plaintext}"`}</pre>
            </div>
            <div>
              <div className="mb-1 font-medium">Anthropic-compatible</div>
              <pre className="overflow-x-auto rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-800">{`base_url = "${bases.anthropic}"
api_key = "${created.plaintext}"`}</pre>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
