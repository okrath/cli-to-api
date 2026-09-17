import { useEffect, useState } from "react";
import {
  Sparkles,
  Cpu,
  Layers,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Check,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  apiClient,
  OpenAiModel,
  RoutingGroupData,
  AdapterData,
  AccountData,
} from "../lib/api-client.js";
import { RoutingGroupModal } from "../components/routing/RoutingGroupModal.js";

export function ModelCatalogView() {
  const [activeTab, setActiveTab] = useState<"groups" | "catalog">("groups");
  const [models, setModels] = useState<OpenAiModel[]>([]);
  const [groups, setGroups] = useState<RoutingGroupData[]>([]);
  const [adapters, setAdapters] = useState<AdapterData[]>([]);
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<RoutingGroupData | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [modelsList, groupsList, adaptersList, accountsList] = await Promise.all([
        apiClient.getModels().catch(() => []),
        apiClient.getRoutingGroups().catch(() => []),
        apiClient.getAdapters().catch(() => []),
        apiClient.getAccounts().catch(() => []),
      ]);
      setModels(modelsList);
      setGroups(groupsList);
      setAdapters(adaptersList);
      setAccounts(accountsList);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleScanHost = async () => {
    setScanning(true);
    setScanNotice(null);
    try {
      const result = await apiClient.scanAdapters();
      setScanNotice(
        `Host scan complete: ${result.installed} installed CLIs detected, ${result.missing} blueprints missing.`
      );
      await fetchData();
      setTimeout(() => setScanNotice(null), 6000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Scan failed: ${msg}`);
    } finally {
      setScanning(false);
    }
  };

  const handleCreateNew = () => {
    setEditingGroup(null);
    setModalOpen(true);
  };

  const handleEdit = (group: RoutingGroupData) => {
    setEditingGroup(group);
    setModalOpen(true);
  };

  const handleDelete = async (group: RoutingGroupData) => {
    if (confirm(`Are you sure you want to delete routing group '${group.name}'?`)) {
      try {
        await apiClient.deleteRoutingGroup(group.id);
        fetchData();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getTierBadge = (tier?: string) => {
    switch (tier) {
      case "low":
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-cyan-950/40 text-tierLow border border-tierLow/30">LOW TIER</span>;
      case "medium":
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-blue-950/40 text-tierMedium border border-tierMedium/30">MEDIUM TIER</span>;
      case "high":
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-purple-950/40 text-tierHigh border border-tierHigh/30">HIGH TIER</span>;
      case "xhigh":
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-pink-950/40 text-tierXHigh border border-tierXHigh/30">X-HIGH TIER</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-800 text-slate-300">VIRTUAL</span>;
    }
  };

  const getEffortBadge = (effort: string) => {
    switch (effort) {
      case "low":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-500/40">EFFORT: LOW</span>;
      case "medium":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-950/60 text-violet-300 border border-violet-500/40">EFFORT: MED</span>;
      case "high":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/60 text-amber-300 border border-amber-500/40">EFFORT: HIGH</span>;
      case "xhigh":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-pink-950/60 text-pink-300 border border-pink-500/40">EFFORT: MAX</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-400">EFFORT: OFF</span>;
    }
  };

  const namespacedModels = models.filter(
    (m) =>
      !m.meta?.is_virtual &&
      (m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.meta?.provider?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-8 space-y-6 overflow-y-auto h-full font-sans">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
            <Layers className="w-5 h-5 text-brand" />
            <span>Model Catalog & Routing Studio</span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            User-defined routing groups, multi-target fallback chains, and context-aware reasoning effort controls.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleScanHost}
            disabled={scanning}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-surfaceHover hover:bg-borderSubtle border border-borderSubtle rounded-lg transition disabled:opacity-50"
            title="Re-scan system PATH and Windows Registry for newly installed CLIs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand ${scanning ? "animate-spin" : ""}`} />
            <span>{scanning ? "Scanning Host..." : "Scan Host CLIs"}</span>
          </button>

          <button
            onClick={fetchData}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-slate-300 bg-surfaceHover hover:bg-borderSubtle border border-borderSubtle rounded-lg transition"
            title="Refresh groups and catalog"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading && !scanning ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          {activeTab === "groups" && (
            <button
              onClick={handleCreateNew}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-brand hover:bg-brandHover text-white rounded-lg transition shadow-lg shadow-brand/20"
            >
              <Plus className="w-4 h-4" />
              <span>Create Routing Group</span>
            </button>
          )}
        </div>
      </div>

      {scanNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center space-x-2.5 text-xs font-mono text-emerald-300 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{scanNotice}</span>
        </div>
      )}
      {/* Dual Tab Switcher */}
      <div className="flex items-center space-x-1 border-b border-borderSubtle">
        <button
          onClick={() => setActiveTab("groups")}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition ${
            activeTab === "groups"
              ? "border-brand text-white font-bold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <span>User Routing Groups ({groups.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("catalog")}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition ${
            activeTab === "catalog"
              ? "border-brand text-white font-bold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span>Discovered Models & Adapters ({namespacedModels.length})</span>
        </button>
      </div>

      {/* Tab 1: Routing Groups Studio */}
      {activeTab === "groups" && (
        <div className="space-y-4">
          {groups.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-surface/50 border border-borderSubtle border-dashed space-y-3">
              <Layers className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-bold text-white">No custom routing groups defined</div>
              <p className="text-xs text-slate-400 font-mono max-w-md mx-auto">
                Take control over routing! Create your first group to combine specific accounts, CLIs, or models with priority fallback and default reasoning effort.
              </p>
              <button
                onClick={handleCreateNew}
                className="mt-2 px-4 py-2 text-xs font-semibold bg-brand hover:bg-brandHover text-white rounded-lg transition"
              >
                Create Your First Group
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {groups.map((g) => {
                // Group targets by Priority Tier
                const targetsByTier = new Map<number, typeof g.targets>();
                for (const t of g.targets) {
                  const list = targetsByTier.get(t.priorityTier) || [];
                  list.push(t);
                  targetsByTier.set(t.priorityTier, list);
                }
                const sortedTiers = Array.from(targetsByTier.keys()).sort((a, b) => a - b);

                return (
                  <div
                    key={g.id}
                    className="p-5 rounded-2xl bg-surface border border-borderSubtle space-y-4 shadow-sm hover:border-slate-700 transition flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Card Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-base text-white tracking-wide">{g.name}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-brand/10 text-brand border border-brand/20">
                              GROUP
                            </span>
                          </div>
                          <div className="text-xs font-mono text-slate-400 mt-1 flex items-center space-x-2">
                            <code className="text-brand font-semibold">{g.virtualModelId}</code>
                            <button
                              onClick={() => handleCopy(g.virtualModelId, g.id)}
                              className="text-slate-500 hover:text-white transition"
                              title="Copy model ID for API"
                            >
                              {copiedId === g.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          {getEffortBadge(g.defaultEffortLevel)}
                        </div>
                      </div>

                      {/* Description */}
                      {g.description && (
                        <p className="text-xs text-slate-300 font-mono line-clamp-2">
                          {g.description}
                        </p>
                      )}

                      {/* Visual Pipeline Fallback Chain */}
                      <div className="space-y-2 pt-2 border-t border-borderSubtle/60">
                        <div className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Execution Chain</span>
                          <span className="text-[10px] text-slate-500">
                            {g.fallbackPolicy === "cascade_failover" ? "Cascade Failover (150ms Probe)" : "Strict Reject"}
                          </span>
                        </div>

                        <div className="space-y-1.5 font-mono text-xs">
                          {sortedTiers.map((tierNum) => {
                            const tierTargets = targetsByTier.get(tierNum) || [];
                            return (
                              <div
                                key={tierNum}
                                className="p-2.5 rounded-lg bg-[#141721] border border-borderSubtle/60 flex items-center justify-between"
                              >
                                <div className="flex items-center space-x-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    tierNum === 1
                                      ? "bg-emerald-950/60 text-emerald-300 border border-emerald-500/30"
                                      : tierNum === 2
                                      ? "bg-amber-950/60 text-amber-300 border border-amber-500/30"
                                      : "bg-rose-950/60 text-rose-300 border border-rose-500/30"
                                  }`}>
                                    {tierNum === 1 ? "P0 PRIMARY" : tierNum === 2 ? "P1 FALLBACK" : `P${tierNum - 1} RECOVERY`}
                                  </span>

                                  <div className="flex flex-wrap gap-1 items-center text-slate-200">
                                    {tierTargets.map((t, idx) => (
                                      <span key={t.id} className="text-xs">
                                        {idx > 0 && <span className="text-slate-600 mx-1">|</span>}
                                        <span className="font-semibold text-white">
                                          {t.targetKind === "ACCOUNT" ? t.targetAccountId : `${t.adapterId}/${t.modelId}`}
                                        </span>
                                        <span className="text-[10px] text-slate-400 ml-1">({t.weight}%)</span>
                                        {t.effortOverride && (
                                          <span className="text-[9px] text-violet-400 ml-1 font-bold">
                                            [{t.effortOverride}]
                                          </span>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="pt-3 border-t border-borderSubtle flex items-center justify-between text-xs font-mono">
                      <div className="text-slate-500 text-[11px]">
                        Route: <code className="text-slate-300">"model": "{g.virtualModelId}"</code>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEdit(g)}
                          className="flex items-center space-x-1 px-2.5 py-1.5 bg-surfaceHover hover:bg-borderSubtle text-slate-200 rounded-lg transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(g)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition rounded-lg hover:bg-rose-950/30"
                          title="Delete Group"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Discovered Models & Adapters */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models or providers..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface border border-borderSubtle text-xs font-mono text-white placeholder-slate-500 focus:border-brand outline-none"
              />
            </div>
            <span className="text-xs font-mono text-slate-400">
              Showing {namespacedModels.length} models across {adapters.length} CLIs
            </span>
          </div>

          <div className="rounded-xl border border-borderSubtle bg-surface overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#181C26] text-slate-400 border-b border-borderSubtle">
                <tr>
                  <th className="px-5 py-3 font-medium">Model ID</th>
                  <th className="px-5 py-3 font-medium">Provider</th>
                  <th className="px-5 py-3 font-medium">Tier</th>
                  <th className="px-5 py-3 font-medium">Context Window</th>
                  <th className="px-5 py-3 font-medium">Cost Weight</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderSubtle">
                {namespacedModels.map((m) => (
                  <tr key={m.id} className="hover:bg-surfaceHover/50 transition">
                    <td className="px-5 py-3.5 font-bold text-white tracking-wide">{m.id}</td>
                    <td className="px-5 py-3.5 text-brand">{m.meta?.provider}</td>
                    <td className="px-5 py-3.5">{getTierBadge(m.meta?.tier)}</td>
                    <td className="px-5 py-3.5 text-slate-300">
                      {(m.meta?.context_window || 0).toLocaleString()} tokens
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">{m.meta?.cost_weight || 1}x</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleCopy(m.id, m.id)}
                        className="px-2 py-1 text-[11px] bg-surfaceHover hover:bg-borderSubtle text-slate-300 rounded transition font-medium"
                      >
                        {copiedId === m.id ? "Copied" : "Copy ID"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Dialog */}
      <RoutingGroupModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchData}
        initialGroup={editingGroup}
        adapters={adapters}
        accounts={accounts}
      />
    </div>
  );
}
