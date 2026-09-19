import { useState } from "react";
import { Link } from "react-router-dom";
import { adminFetch, type Group, useQuery } from "../api.js";
import { Dialog } from "../components/dialog.js";
import { DocsLink } from "../components/docs-link.js";
import { Button, Field, InlineError, TextInput } from "../components/field.js";
import { Table } from "../components/table.js";

export function GroupsPage() {
  const groups = useQuery("groups", () => adminFetch<Group[]>("/admin/groups"));
  const [createOpen, setCreateOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function createGroup() {
    setError(null);
    try {
      await adminFetch<Group>("/admin/groups", {
        method: "POST",
        body: JSON.stringify({ slug, name, targets: [] }),
      });
      setCreateOpen(false);
      setSlug("");
      setName("");
      await groups.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function deleteGroup(id: string) {
    if (!window.confirm(`Delete group ${id}?`)) {
      return;
    }
    try {
      await adminFetch(`/admin/groups/${encodeURIComponent(id)}`, { method: "DELETE" });
      await groups.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-semibold">Groups</h1>
          <DocsLink anchor="groups" />
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          New group
        </Button>
      </div>

      <InlineError message={error ?? groups.error} />

      <Table
        rows={groups.data ?? []}
        rowKey={(g) => g.id}
        empty="No groups"
        columns={[
          {
            key: "id",
            header: "Model id",
            render: (g) => (
              <code className="rounded bg-neutral-100 px-1 text-xs dark:bg-neutral-800">{g.id}</code>
            ),
          },
          { key: "name", header: "Name", render: (g) => g.name },
          { key: "targets", header: "Targets", render: (g) => String(g.targets.length) },
          { key: "effort", header: "Effort", render: (g) => g.defaultEffort ?? "—" },
          { key: "cache", header: "Cache TTL", render: (g) => `${g.cacheTtlSec}s` },
          {
            key: "actions",
            header: "",
            render: (g) => (
              <div className="flex gap-1">
                <Link
                  to={`/groups/${encodeURIComponent(g.id)}`}
                  className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Edit
                </Link>
                <Button variant="danger" type="button" onClick={() => void deleteGroup(g.id)}>
                  Delete
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Dialog
        open={createOpen}
        title="New group"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void createGroup()}>
              Create
            </Button>
          </>
        }
      >
        <Field label="Slug" hint="Becomes group:your-slug">
          <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </Field>
        <Field label="Display name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <InlineError message={error} />
      </Dialog>
    </div>
  );
}
