import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Layers,
  Sparkles,
  AlertCircle,
  Brain,
  ShieldAlert,
} from "lucide-react";
import {
  apiClient,
  RoutingGroupData,
  CreateRoutingGroupInput,
  AdapterData,
  AccountData,
} from "../../lib/api-client.js";

interface RoutingGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialGroup?: RoutingGroupData | null;
  adapters: AdapterData[];
  accounts: AccountData[];
}

interface TargetDraft {
  id: string;
  targetKind: "ACCOUNT" | "CLI" | "MODEL";
  priorityTier: number;
  weight: number;
  adapterId: string;
  modelId: string;
  targetAccountId?: string | null;
  effortOverride?: "none" | "low" | "medium" | "high" | "xhigh" | null;
}

export function RoutingGroupModal({
  isOpen,
  onClose,
  onSaved,
  initialGroup,
  adapters,
  accounts,
}: RoutingGroupModalProps) {
  const [name, setName] = useState("");
  const [virtualModelId, setVirtualModelId] = useState("");
  const [description, setDescription] = useState("");
  const [defaultEffort, setDefaultEffort] = useState<"none" | "low" | "medium" | "high" | "xhigh">("medium");
  const [fallbackPolicy, setFallbackPolicy] = useState<"cascade_failover" | "strict_reject">("cascade_failover");
  const [targets, setTargets] = useState<TargetDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group adapters and accounts by installation and health status
  const installedAdapters = adapters.filter((a) => a.isInstalled);
  const uninstalledAdapters = adapters.filter((a) => !a.isInstalled);
  const activeAccounts = accounts.filter((a) => a.status !== "ERROR");

  // Initialize or reset form
  useEffect(() => {
    if (!isOpen) return;

    if (initialGroup) {
      setName(initialGroup.name);
      setVirtualModelId(initialGroup.virtualModelId);
      setDescription(initialGroup.description || "");
      setDefaultEffort(initialGroup.defaultEffortLevel);
      setFallbackPolicy(initialGroup.fallbackPolicy);
      setTargets(
        initialGroup.targets.map((t) => ({
          id: t.id,
          targetKind: t.targetKind,
          priorityTier: t.priorityTier,
          weight: t.weight,
          adapterId: t.adapterId,
          modelId: t.modelId,
          targetAccountId: t.targetAccountId,
          effortOverride: t.effortOverride,
        }))
      );
    } else {
      setName("");
      setVirtualModelId("group:new-pipeline");
      setDescription("");
      setDefaultEffort("medium");
      setFallbackPolicy("cascade_failover");

      // Pick first installed adapter, or fallback to first adapter
      const defaultAdapter = installedAdapters[0] || adapters[0];
      const defaultModel = defaultAdapter?.models[0]?.id || "default";

      setTargets(
        defaultAdapter
          ? [
              {
                id: `target-${Date.now()}`,
                targetKind: "CLI",
                priorityTier: 1,
                weight: 100,
                adapterId: defaultAdapter.id,
                modelId: defaultModel,
                targetAccountId: null,
                effortOverride: null,
              },
            ]
          : []
      );
    }
    setError(null);
  }, [isOpen, initialGroup, adapters, accounts]);

  // Handle ESC key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-slug virtualModelId when name changes (for new group)
  const handleNameChange = (val: string) => {
    setName(val);
    if (!initialGroup) {
      const slug = val
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setVirtualModelId(slug ? `group:${slug}` : "group:");
    }
  };

  const handleAddTarget = () => {
    const defaultAdapter = installedAdapters[0] || adapters[0];
    if (!defaultAdapter) return;

    setTargets((prev) => [
      ...prev,
      {
        id: `target-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        targetKind: "CLI",
        priorityTier: 1,
        weight: 100,
        adapterId: defaultAdapter.id,
        modelId: defaultAdapter.models[0]?.id || defaultAdapter.id,
        targetAccountId: null,
        effortOverride: null,
      },
    ]);
  };

  const handleRemoveTarget = (id: string) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
  };

  const handleUpdateTarget = (id: string, updates: Partial<TargetDraft>) => {
    setTargets((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...updates };

        // If switching away from ACCOUNT mode, clear targetAccountId
        if (updates.targetKind && updates.targetKind !== "ACCOUNT") {
          next.targetAccountId = null;
        }

        // If switching to ACCOUNT mode, auto-bind to the first ready account of adapter or any account
        if (updates.targetKind === "ACCOUNT" && !next.targetAccountId) {
          const matchAcc = activeAccounts.find((a) => a.adapterId === next.adapterId) || activeAccounts[0];
          if (matchAcc) {
            next.targetAccountId = matchAcc.id;
            next.adapterId = matchAcc.adapterId;
            const adp = adapters.find((a) => a.id === matchAcc.adapterId);
            next.modelId = adp?.models[0]?.id || matchAcc.adapterId;
          }
        }

        // If adapterId changed explicitly, update modelId
        if (updates.adapterId && updates.adapterId !== t.adapterId) {
          const adp = adapters.find((a) => a.id === updates.adapterId);
          next.modelId = adp?.models[0]?.id || updates.adapterId;
          if (next.targetKind === "ACCOUNT") {
            const accs = activeAccounts.filter((a) => a.adapterId === updates.adapterId);
            next.targetAccountId = accs[0]?.id || null;
          } else {
            next.targetAccountId = null;
          }
        }
        return next;
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide a group name.");
      return;
    }
    if (!virtualModelId.trim()) {
      setError("Please provide a virtual model ID.");
      return;
    }
    if (targets.length === 0) {
      setError("At least one target must be added to the routing group.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload: CreateRoutingGroupInput = {
      name: name.trim(),
      virtualModelId: virtualModelId.trim(),
      description: description.trim() || undefined,
      defaultEffortLevel: defaultEffort,
      fallbackPolicy,
      targets: targets.map((t) => ({
        targetKind: t.targetKind,
        priorityTier: Number(t.priorityTier) || 1,
        weight: Number(t.weight) || 100,
        adapterId: t.adapterId,
        modelId: t.modelId,
        targetAccountId: t.targetKind === "ACCOUNT" ? (t.targetAccountId || null) : null,
        effortOverride: t.effortOverride || null,
      })),
    };

    try {
      if (initialGroup) {
        await apiClient.updateRoutingGroup(initialGroup.id, payload);
      } else {
        await apiClient.createRoutingGroup(payload);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-[#141721] border border-slate-700/60 shadow-2xl shadow-black/80 overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderSubtle bg-[#181C26]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-brand/10 border border-brand/30 text-brand">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 id="modal-title" className="text-base font-bold text-white tracking-tight">
                {initialGroup ? "Edit Routing Group" : "Create Routing Group"}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Installed-first CLI targeting, account binding, and reasoning effort controls.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surfaceHover transition focus:outline-none focus:ring-2 focus:ring-brand"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-center space-x-2.5 text-rose-300 font-mono">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Group Identity Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block font-medium text-slate-300 font-mono">
                Group Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Deep Reasoning Pool"
                required
                className="w-full px-3 py-2 rounded-lg bg-[#181C26] border border-borderSubtle text-white focus:border-brand focus:ring-1 focus:ring-brand outline-none transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-medium text-slate-300 font-mono">
                Virtual Model ID <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={virtualModelId}
                onChange={(e) => setVirtualModelId(e.target.value)}
                placeholder="e.g. group:deep-reasoning"
                required
                className="w-full px-3 py-2 rounded-lg bg-[#181C26] border border-borderSubtle text-brand font-mono focus:border-brand focus:ring-1 focus:ring-brand outline-none transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block font-medium text-slate-300 font-mono">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Auto-failover across Claude 3.7 and Codex GPT-5.6 with high reasoning"
              className="w-full px-3 py-2 rounded-lg bg-[#181C26] border border-borderSubtle text-slate-200 placeholder-slate-500 focus:border-brand outline-none transition"
            />
          </div>

          {/* Effort & Fallback Policy Controls */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-[#181C26]/60 border border-borderSubtle/60">
            {/* Default Reasoning Effort */}
            <div className="space-y-2">
              <label className="flex items-center space-x-1.5 font-bold font-mono text-slate-200 uppercase tracking-wide">
                <Brain className="w-4 h-4 text-violet-400" />
                <span>Default Reasoning Effort</span>
              </label>
              <div className="flex items-center space-x-1 p-1 rounded-lg bg-[#0F1117] border border-borderSubtle">
                {(["none", "low", "medium", "high", "xhigh"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setDefaultEffort(lvl)}
                    className={`flex-1 py-1.5 text-center text-[11px] font-mono font-semibold rounded transition ${
                      defaultEffort === lvl
                        ? lvl === "low"
                          ? "bg-cyan-950/80 text-cyan-300 border border-cyan-500/50"
                          : lvl === "medium"
                            ? "bg-violet-950/80 text-violet-300 border border-violet-500/50"
                            : lvl === "high" || lvl === "xhigh"
                              ? "bg-amber-950/80 text-amber-300 border border-amber-500/50"
                              : "bg-slate-800 text-white border border-slate-600"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {lvl.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Applied when client request doesn't specify <code className="text-violet-300">reasoning_effort</code>.
              </p>
            </div>

            {/* Fallback Policy */}
            <div className="space-y-2">
              <label className="flex items-center space-x-1.5 font-bold font-mono text-slate-200 uppercase tracking-wide">
                <ShieldAlert className="w-4 h-4 text-emerald-400" />
                <span>Failover Policy</span>
              </label>
              <select
                value={fallbackPolicy}
                onChange={(e) => setFallbackPolicy(e.target.value as "cascade_failover" | "strict_reject")}
                className="w-full px-3 py-2 rounded-lg bg-[#0F1117] border border-borderSubtle text-white font-mono focus:border-brand outline-none"
              >
                <option value="cascade_failover">Cascade Failover (P0 → P1 → P2 on error/busy)</option>
                <option value="strict_reject">Strict Reject (Fail Fast without secondary retry)</option>
              </select>
              <p className="text-[10px] text-slate-400 font-mono">
                Spawn-probe window (150ms) transparently recovers from 429/crashes.
              </p>
            </div>
          </div>

          {/* Dynamic Target Builder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-brand" />
                <span className="font-bold font-mono text-slate-200 uppercase tracking-wide">
                  Group Targets ({targets.length})
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddTarget}
                className="flex items-center space-x-1 px-3 py-1 text-xs font-semibold bg-brand/20 hover:bg-brand/30 border border-brand/40 text-brand rounded-lg transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Target</span>
              </button>
            </div>

            <div className="space-y-3">
              {targets.map((t, idx) => {
                const adapterObj = adapters.find((a) => a.id === t.adapterId);
                const adapterModels = adapterObj?.models || [];

                return (
                  <div
                    key={t.id}
                    className="p-4 rounded-xl bg-[#181C26] border border-borderSubtle space-y-3 relative group/row hover:border-slate-600 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 font-mono text-xs">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px]">
                          {idx + 1}
                        </span>

                        {/* Priority Tier Selector */}
                        <div className="flex items-center space-x-1 bg-[#0F1117] px-2 py-0.5 rounded border border-borderSubtle text-[11px]">
                          <span className="text-slate-400">Tier:</span>
                          <select
                            value={t.priorityTier}
                            onChange={(e) => handleUpdateTarget(t.id, { priorityTier: Number(e.target.value) })}
                            className="bg-transparent text-white font-bold outline-none cursor-pointer"
                          >
                            <option value={1}>P0 (Primary)</option>
                            <option value={2}>P1 (Fallback)</option>
                            <option value={3}>P2 (Recovery)</option>
                          </select>
                        </div>

                        {/* SWRR Weight */}
                        <div className="flex items-center space-x-1 bg-[#0F1117] px-2 py-0.5 rounded border border-borderSubtle text-[11px]">
                          <span className="text-slate-400">Weight:</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={t.weight}
                            onChange={(e) => handleUpdateTarget(t.id, { weight: Number(e.target.value) || 100 })}
                            className="w-12 bg-transparent text-white font-mono text-center outline-none"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveTarget(t.id)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                        title="Remove target"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Target Configuration Controls (Account-First & Installed-First) */}
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      {/* Selection Mode */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">Targeting Mode</label>
                        <select
                          value={t.targetKind}
                          onChange={(e) =>
                            handleUpdateTarget(t.id, {
                              targetKind: e.target.value as "ACCOUNT" | "CLI" | "MODEL",
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#0F1117] border border-borderSubtle text-slate-200 outline-none"
                        >
                          <option value="ACCOUNT">By Specific Account</option>
                          <option value="CLI">By CLI / Adapter</option>
                          <option value="MODEL">By Specific Model</option>
                        </select>
                      </div>

                      {/* Mode A: By Specific Account (Direct selection of active accounts on machine) */}
                      {t.targetKind === "ACCOUNT" && (
                        <div className="space-y-1 col-span-2">
                          <label className="text-[10px] text-slate-400 flex items-center justify-between">
                            <span>Select Provisioned Account</span>
                            <span className="text-emerald-400 text-[10px]">
                              {activeAccounts.length} account(s) ready
                            </span>
                          </label>
                          <select
                            value={t.targetAccountId || ""}
                            onChange={(e) => {
                              const accId = e.target.value;
                              const acc = activeAccounts.find((a) => a.id === accId);
                              if (acc) {
                                const adp = adapters.find((a) => a.id === acc.adapterId);
                                handleUpdateTarget(t.id, {
                                  targetAccountId: accId,
                                  adapterId: acc.adapterId,
                                  modelId: adp?.models[0]?.id || acc.adapterId,
                                });
                              }
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#0F1117] border border-borderSubtle text-emerald-400 font-semibold outline-none"
                          >
                            {activeAccounts.length === 0 ? (
                              <option value="">No accounts provisioned on host</option>
                            ) : (
                              activeAccounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.name} — {acc.adapterId} ({acc.status}) [ID: {acc.id}]
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      )}

                      {/* Mode B: By CLI / Adapter (Rotates healthy accounts of that CLI) */}
                      {t.targetKind === "CLI" && (
                        <div className="space-y-1 col-span-2">
                          <label className="text-[10px] text-slate-400 flex items-center justify-between">
                            <span>CLI Adapter Pool</span>
                            <span className="text-brand text-[10px]">Installed First</span>
                          </label>
                          <select
                            value={t.adapterId}
                            onChange={(e) => handleUpdateTarget(t.id, { adapterId: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#0F1117] border border-borderSubtle text-brand font-semibold outline-none"
                          >
                            {installedAdapters.length > 0 && (
                              <optgroup label="⚡ Installed & Ready on Host">
                                {installedAdapters.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} ({a.id}) — {a.accountsCount} active account(s)
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {uninstalledAdapters.length > 0 && (
                              <optgroup label="📦 Missing Blueprints (Not Installed on Host)">
                                {uninstalledAdapters.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} ({a.id}) — NOT INSTALLED
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </div>
                      )}

                      {/* Mode C: By Specific Model (Adapter + Model ID) */}
                      {t.targetKind === "MODEL" && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400">CLI Adapter</label>
                            <select
                              value={t.adapterId}
                              onChange={(e) => handleUpdateTarget(t.id, { adapterId: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#0F1117] border border-borderSubtle text-brand font-semibold outline-none"
                            >
                              {installedAdapters.length > 0 && (
                                <optgroup label="⚡ Installed on Host">
                                  {installedAdapters.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {uninstalledAdapters.length > 0 && (
                                <optgroup label="📦 Missing Blueprints">
                                  {uninstalledAdapters.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.name} (Not Installed)
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400">Model ID</label>
                            <select
                              value={t.modelId}
                              onChange={(e) => handleUpdateTarget(t.id, { modelId: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#0F1117] border border-borderSubtle text-white outline-none"
                            >
                              {adapterModels.length === 0 ? (
                                <option value={t.adapterId}>{t.adapterId}</option>
                              ) : (
                                adapterModels.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name} ({m.tier})
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Effort Override for this Target */}
                    <div className="flex items-center justify-between pt-2 border-t border-borderSubtle/50 text-[11px] font-mono">
                      <span className="text-slate-400">Target Effort Override:</span>
                      <select
                        value={t.effortOverride || ""}
                        onChange={(e) =>
                          handleUpdateTarget(t.id, {
                            effortOverride: (e.target.value as "none" | "low" | "medium" | "high" | "xhigh") || null,
                          })
                        }
                        className="px-2 py-1 rounded bg-[#0F1117] border border-borderSubtle text-slate-300 outline-none"
                      >
                        <option value="">Inherit Group Default ({defaultEffort})</option>
                        <option value="none">None (Off)</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="xhigh">X-High</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-borderSubtle flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-surfaceHover hover:bg-borderSubtle rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white bg-brand hover:bg-brandHover disabled:opacity-50 rounded-lg transition shadow-lg shadow-brand/20 flex items-center space-x-1.5"
            >
              {saving && <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
              <span>{initialGroup ? "Save Changes" : "Create Routing Group"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
