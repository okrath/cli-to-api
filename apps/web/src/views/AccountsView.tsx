import React, { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Trash2,
  Terminal,
  RefreshCw,
  AlertCircle,
  Check,
  Copy,
  Layers,
  Sparkles,
} from "lucide-react";
import { apiClient, AccountData, AdapterData } from "../lib/api-client.js";
import { StatusBadge } from "../components/layout/StatusBadge.js";
import { CustomAdapterStudioModal } from "../components/adapters/CustomAdapterStudioModal.js";

const INSTALL_COMMANDS: Record<string, string> = {
  "claude-code": "npm i -g @anthropic-ai/claude-code",
  "codex-cli": "npm i -g @openai/codex",
  "omp-cli": "npm i -g @omp/cli",
  "devin-cli": "npm i -g @cognition/devin",
  "grok-cli": "npm i -g @xai/grok",
  "opencode-cli": "npm i -g opencode-ai",
};

interface AccountsViewProps {
  onOpenTerminal: (adapterId: string, accountId: string) => void;
}

export function AccountsView({ onOpenTerminal }: AccountsViewProps) {
  const [activeTab, setActiveTab] = useState<"accounts" | "catalog">("accounts");
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [adapters, setAdapters] = useState<AdapterData[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStudioModal, setShowStudioModal] = useState(false);
  const [newAcc, setNewAcc] = useState({ id: "", adapterId: "", name: "" });
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [accList, adpList] = await Promise.all([
        apiClient.getAccounts(),
        apiClient.getAdapters().catch(() => []),
      ]);
      setAccounts(accList);
      setAdapters(adpList);
      setErrorBanner(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenAddModal = (targetAdapterId?: string) => {
    const fallbackAdapter = adapters.find((a) => a.isInstalled)?.id || adapters[0]?.id || "claude-code";
    setNewAcc({
      id: "",
      adapterId: targetAdapterId || fallbackAdapter,
      name: "",
    });
    setShowAddModal(true);
  };

  const handleScanHost = async () => {
    setScanning(true);
    setScanNotice(null);
    try {
      const result = await apiClient.scanAdapters();
      setScanNotice(`Scan complete: ${result.installed} installed, ${result.missing} missing.`);
      await fetchData();
      setTimeout(() => setScanNotice(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Scan failed: ${msg}`);
    } finally {
      setScanning(false);
    }
  };

  const handleCleanupOrphans = async () => {
    try {
      const res = await apiClient.cleanupOrphans();
      alert(`Purged ${res.purged.length} orphaned accounts.`);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Cleanup failed: ${msg}`);
    }
  };

  const handleResetCooldown = async (id: string) => {
    try {
      await apiClient.resetCooldown(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm(`Delete account ${id} and purge its sandbox?`)) {
      try {
        await apiClient.deleteAccount(id);
        fetchData();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAcc.id || !newAcc.name || !newAcc.adapterId) return;

    try {
      await apiClient.createAccount(newAcc);
      setShowAddModal(false);
      setNewAcc({ id: "", adapterId: "", name: "" });
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const orphanCount = accounts.filter((a) => a.status === "ERROR").length;
  const activeAccounts = accounts.filter((a) => a.status !== "ERROR");

  return (
    <div className="p-8 space-y-6 overflow-y-auto h-full font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
            <Users className="w-5 h-5 text-brand" />
            <span>Fleet & Sandboxes Management</span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Dynamic host CLI discovery, multi-tenant directory jails, and interactive WebShell auth.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleScanHost}
            disabled={scanning}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-surfaceHover hover:bg-borderSubtle text-slate-200 border border-borderSubtle rounded-lg transition disabled:opacity-50"
            title="Re-scan system PATH and Windows Registry for newly installed CLIs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand ${scanning ? "animate-spin" : ""}`} />
            <span>{scanning ? "Scanning Host..." : "Scan Host CLIs"}</span>
          </button>

          <button
            onClick={() => setShowStudioModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-surfaceHover hover:bg-borderSubtle text-slate-200 border border-borderSubtle rounded-lg transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Register Custom CLI</span>
          </button>

          <button
            onClick={() => handleOpenAddModal()}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-brand hover:bg-brandHover text-white rounded-lg transition shadow-lg shadow-brand/20"
          >
            <Plus className="w-4 h-4" />
            <span>Provision Account</span>
          </button>
        </div>
      </div>

      {/* Notifications & Banners */}
      {scanNotice && (
        <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center space-x-2 text-xs font-mono text-emerald-300">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{scanNotice}</span>
        </div>
      )}

      {errorBanner && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 flex items-center space-x-3 text-xs font-mono text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {orphanCount > 0 && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 flex items-center justify-between text-xs font-mono text-amber-300">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{orphanCount} orphaned account(s) detected for missing host CLIs.</span>
          </div>
          <button
            onClick={handleCleanupOrphans}
            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-amber-200 font-semibold transition"
          >
            Clean Up Orphaned Sandboxes
          </button>
        </div>
      )}

      {/* Dual Tab Switcher */}
      <div className="flex items-center space-x-1 border-b border-borderSubtle">
        <button
          onClick={() => setActiveTab("accounts")}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition ${
            activeTab === "accounts"
              ? "border-brand text-white font-bold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Active Accounts ({activeAccounts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("catalog")}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition ${
            activeTab === "catalog"
              ? "border-brand text-white font-bold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Available CLI Catalog ({adapters.length})</span>
        </button>
      </div>

      {/* Tab 1: Active Accounts */}
      {activeTab === "accounts" && (
        <div>
          {activeAccounts.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-surface/50 border border-borderSubtle border-dashed space-y-3">
              <Users className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-bold text-white">No active accounts provisioned</div>
              <p className="text-xs text-slate-400 font-mono max-w-sm mx-auto">
                Scan your host to detect installed CLIs or provision an account from the Available Catalog tab.
              </p>
              <button
                onClick={() => setActiveTab("catalog")}
                className="mt-2 px-4 py-1.5 text-xs font-semibold bg-brand hover:bg-brandHover text-white rounded-lg transition"
              >
                Browse CLI Catalog
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {activeAccounts.map((acc) => (
                <div key={acc.id} className="p-5 rounded-xl bg-surface border border-borderSubtle space-y-4 shadow-sm hover:border-slate-700 transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-white">{acc.name}</span>
                      <span className="ml-2 text-xs font-mono text-brand">({acc.adapterId})</span>
                    </div>
                    <StatusBadge status={acc.status} cooldownRemaining={acc.cooldownSecondsRemaining} />
                  </div>

                  <div className="space-y-1 text-xs font-mono text-slate-400">
                    <div className="text-[11px] text-slate-500">ID: {acc.id}</div>
                    <div className="truncate text-slate-300">Jail: {acc.sandboxDir}</div>
                    <div>Slots: {acc.activeSlots} / {acc.maxSlots} active</div>
                  </div>

                  <div className="pt-2 border-t border-borderSubtle flex items-center justify-between">
                    <button
                      onClick={() => onOpenTerminal(acc.adapterId, acc.id)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-brand/10 hover:bg-brand/20 border border-brand/30 text-indigo-200 rounded-md transition font-medium"
                    >
                      <Terminal className="w-3.5 h-3.5 text-brand" />
                      <span>Launch WebShell</span>
                    </button>

                    <div className="flex items-center space-x-2">
                      {acc.status === "COOLDOWN" && (
                        <button
                          onClick={() => handleResetCooldown(acc.id)}
                          className="flex items-center space-x-1 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-950/40 rounded border border-amber-500/30 transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Clear Cooldown</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(acc.id)}
                        className="p-1.5 text-slate-500 hover:text-statusDanger transition"
                        title="Delete Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Available Catalog */}
      {activeTab === "catalog" && (
        <div className="grid grid-cols-2 gap-4">
          {adapters.map((adp) => {
            const installCmd = INSTALL_COMMANDS[adp.id] || `npm i -g ${adp.executable}`;
            const isInstalled = adp.isInstalled;

            return (
              <div key={adp.id} className="p-5 rounded-xl bg-surface border border-borderSubtle space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-white">{adp.name}</span>
                    <span className="ml-2 text-xs font-mono text-slate-500">({adp.id})</span>
                  </div>
                  <StatusBadge status={isInstalled ? "INSTALLED" : "NOT_INSTALLED"} />
                </div>

                <div className="space-y-1 text-xs font-mono text-slate-400">
                  <div>Executable: <span className="text-slate-200">{adp.executable}</span> ({adp.executionMode})</div>
                  <div className="truncate text-slate-400">
                    Path: {adp.resolvedPath ? <span className="text-emerald-400">{adp.resolvedPath}</span> : <span className="text-slate-600">Not found in PATH</span>}
                  </div>
                  <div>Models: <span className="text-brand">{adp.models.length} declared</span></div>
                </div>

                <div className="pt-3 border-t border-borderSubtle flex items-center justify-between">
                  {isInstalled ? (
                    <button
                      onClick={() => handleOpenAddModal(adp.id)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 rounded-md transition font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Provision Account</span>
                    </button>
                  ) : (
                    <div className="flex items-center space-x-2 w-full justify-between">
                      <code className="text-[11px] font-mono text-slate-400 bg-canvas px-2.5 py-1 rounded border border-borderSubtle truncate max-w-[240px]">
                        {installCmd}
                      </code>
                      <button
                        onClick={() => copyToClipboard(installCmd, adp.id)}
                        className="flex items-center space-x-1 px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-surfaceHover hover:bg-borderSubtle rounded border border-borderSubtle transition"
                        title="Copy install command"
                      >
                        {copiedCmd === adp.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCmd === adp.id ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Provision Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <form onSubmit={handleCreate} className="w-96 p-6 rounded-2xl bg-surface border border-borderSubtle space-y-4">
            <h2 className="text-base font-bold text-white">Provision New Account</h2>
            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="block text-slate-400 mb-1">Account ID</label>
                <input
                  value={newAcc.id}
                  onChange={(e) => setNewAcc((prev) => ({ ...prev, id: e.target.value }))}
                  placeholder="e.g. codex-acc-2"
                  className="w-full px-3 py-2 rounded-lg bg-canvas border border-borderSubtle text-white focus:border-brand outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">CLI Adapter</label>
                <select
                  value={newAcc.adapterId}
                  onChange={(e) => setNewAcc((prev) => ({ ...prev, adapterId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-canvas border border-borderSubtle text-white focus:border-brand outline-none"
                  required
                >
                  {adapters.map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.isInstalled}>
                      {a.name} ({a.id}) {!a.isInstalled ? "(NOT INSTALLED)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Display Name</label>
                <input
                  value={newAcc.name}
                  onChange={(e) => setNewAcc((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Codex Secondary"
                  className="w-full px-3 py-2 rounded-lg bg-canvas border border-borderSubtle text-white focus:border-brand outline-none"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs bg-brand hover:bg-brandHover text-white rounded-lg font-medium"
              >
                Create Sandbox
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Custom Adapter Studio Modal */}
      <CustomAdapterStudioModal
        isOpen={showStudioModal}
        onClose={() => setShowStudioModal(false)}
        onSuccess={() => {
          fetchData();
        }}
      />
    </div>
  );
}
