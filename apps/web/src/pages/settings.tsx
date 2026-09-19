import { useEffect, useState } from "react";
import { adminFetch, type Settings, useQuery } from "../api.js";
import { Button, Field, InlineError, NumberInput } from "../components/field.js";

export function SettingsPage() {
  const settings = useQuery("settings", () => adminFetch<Settings>("/admin/settings"));
  const [defaultCooldownSec, setDefaultCooldownSec] = useState(60);
  const [sessionTtlSec, setSessionTtlSec] = useState(3600);
  const [requestTimeoutSec, setRequestTimeoutSec] = useState(300);
  const [queueTimeoutSec, setQueueTimeoutSec] = useState(30);
  const [toolResultTimeoutSec, setToolResultTimeoutSec] = useState(300);
  const [toolMaxTurns, setToolMaxTurns] = useState(25);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings.data) {
      return;
    }
    setDefaultCooldownSec(settings.data.defaultCooldownSec);
    setSessionTtlSec(settings.data.sessionTtlSec);
    setRequestTimeoutSec(settings.data.requestTimeoutSec);
    setQueueTimeoutSec(settings.data.queueTimeoutSec);
    setToolResultTimeoutSec(settings.data.toolResultTimeoutSec);
    setToolMaxTurns(settings.data.toolMaxTurns);
  }, [settings.data]);

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await adminFetch<Settings>("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          defaultCooldownSec,
          sessionTtlSec,
          requestTimeoutSec,
          queueTimeoutSec,
          toolResultTimeoutSec,
          toolMaxTurns,
        }),
      });
      setSaved(true);
      await settings.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <InlineError message={error ?? settings.error} />
      {saved ? <p className="text-sm text-emerald-600">Saved.</p> : null}

      <Field label="Default cooldown (seconds)">
        <NumberInput
          min={1}
          value={defaultCooldownSec}
          onChange={(e) => setDefaultCooldownSec(Number(e.target.value))}
        />
      </Field>
      <Field label="Session TTL (seconds)">
        <NumberInput
          min={1}
          value={sessionTtlSec}
          onChange={(e) => setSessionTtlSec(Number(e.target.value))}
        />
      </Field>
      <Field label="Request timeout (seconds)">
        <NumberInput
          min={1}
          value={requestTimeoutSec}
          onChange={(e) => setRequestTimeoutSec(Number(e.target.value))}
        />
      </Field>
      <Field label="Queue timeout (seconds)">
        <NumberInput
          min={1}
          value={queueTimeoutSec}
          onChange={(e) => setQueueTimeoutSec(Number(e.target.value))}
        />
      </Field>
      <Field label="Tool result timeout (seconds)">
        <NumberInput
          min={1}
          value={toolResultTimeoutSec}
          onChange={(e) => setToolResultTimeoutSec(Number(e.target.value))}
        />
      </Field>
      <Field label="Tool max turns">
        <NumberInput
          min={1}
          value={toolMaxTurns}
          onChange={(e) => setToolMaxTurns(Number(e.target.value))}
        />
      </Field>

      <Button type="button" onClick={() => void save()}>
        Save
      </Button>
    </div>
  );
}
