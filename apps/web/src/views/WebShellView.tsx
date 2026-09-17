import { useState, useEffect } from "react";
import { TerminalView } from "../components/webshell/TerminalView.js";
import { Terminal as TerminalIcon, ShieldAlert, Lock } from "lucide-react";
import { apiClient, AccountData } from "../lib/api-client.js";

interface WebShellViewProps {
  initialAdapterId?: string;
  initialAccountId?: string;
}

export function WebShellView({ initialAdapterId = "codex-cli", initialAccountId }: WebShellViewProps) {
  const [terminalPlane, setTerminalPlane] = useState<"host" | "sandbox">("host");
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [selectedAdapter, setSelectedAdapter] = useState(initialAdapterId);
  const [selectedAccount, setSelectedAccount] = useState(initialAccountId || "");

  useEffect(() => {
    const fetchAccs = async () => {
      try {
        const list = await apiClient.getAccounts();
        setAccounts(list);
        if (!selectedAccount && list.length > 0) {
          setSelectedAccount(list[0].id);
          setSelectedAdapter(list[0].adapterId);
        }
      } catch {}
    };
    fetchAccs();
  }, []);

  const handleAccountChange = (accId: string) => {
    setSelectedAccount(accId);
    const found = accounts.find(a => a.id === accId);
    if (found) {
      setSelectedAdapter(found.adapterId);
    }
  };

  return (
    <div className="p-8 flex flex-col h-full space-y-4 font-sans">
      {/* Header & Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
            <TerminalIcon className="w-5 h-5 text-brand" />
            <span>Dual-Plane WebShell</span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Switch between unconfined Host Server Terminal for package installation and isolated Sandbox Jails for OAuth login.
          </p>
        </div>

        {/* Plane Switcher & Account Selector */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center p-1 bg-surface rounded-lg border border-borderSubtle">
            <button
              onClick={() => setTerminalPlane("host")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition ${
                terminalPlane === "host"
                  ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>⚡ Host Terminal</span>
            </button>

            <button
              onClick={() => setTerminalPlane("sandbox")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition ${
                terminalPlane === "sandbox"
                  ? "bg-brand/20 text-indigo-300 font-bold border border-brand/40 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-brand" />
              <span>🔒 Sandbox Jail</span>
            </button>
          </div>

          {terminalPlane === "sandbox" && (
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Account:</span>
              <select
                value={selectedAccount}
                onChange={(e) => handleAccountChange(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-surface border border-borderSubtle text-white focus:border-brand outline-none"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.adapterId})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="flex-1 min-h-0">
        {terminalPlane === "host" ? (
          <TerminalView key="host-terminal" mode="host" />
        ) : selectedAccount ? (
          <TerminalView
            key={`sandbox-${selectedAccount}`}
            mode="sandbox"
            adapterId={selectedAdapter}
            accountId={selectedAccount}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500 font-mono text-xs rounded-xl border border-borderSubtle border-dashed">
            No accounts provisioned. Create an account in the Accounts tab to launch a sandbox jail.
          </div>
        )}
      </div>
    </div>
  );
}
