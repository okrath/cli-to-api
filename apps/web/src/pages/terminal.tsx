import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminFetch, type Account, useQuery } from "../api.js";
import { DocsLink } from "../components/docs-link.js";
import { Button, SelectInput } from "../components/field.js";
import { TerminalView } from "../components/terminal-view.js";

export function TerminalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTarget = searchParams.get("target") ?? "host";
  const [target, setTarget] = useState(initialTarget);
  const [reconnectKey, setReconnectKey] = useState(0);

  const accounts = useQuery("terminal-accounts", () => adminFetch<Account[]>("/admin/accounts"));

  const options = useMemo(() => {
    const list = [{ value: "host", label: "Host" }];
    for (const account of accounts.data ?? []) {
      list.push({ value: `account:${account.id}`, label: `${account.name} (${account.adapterId})` });
    }
    return list;
  }, [accounts.data]);

  function onTargetChange(value: string) {
    setTarget(value);
    setSearchParams(value === "host" ? {} : { target: value });
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-semibold">Terminal</h1>
          <DocsLink anchor="accounts" />
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm">
          Target
          <SelectInput
            className="min-w-[220px]"
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
        </label>
        <Button type="button" variant="secondary" onClick={() => setReconnectKey((k) => k + 1)}>
          Reconnect
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <TerminalView target={target} reconnectKey={reconnectKey} />
      </div>
    </div>
  );
}
