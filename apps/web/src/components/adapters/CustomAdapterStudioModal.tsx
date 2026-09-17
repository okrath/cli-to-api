import { useState } from "react";
import { X, Play, Save, CheckCircle2, AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { apiClient } from "../../lib/api-client.js";

interface CustomAdapterStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PRESET_PIPE = `id: "custom-cli"
name: "Custom AI CLI"
version: "1.0.0"
executable: "mycli"
execution_mode: "pipe"

invocation:
  args_template:
    - "--print"
    - "{prompt}"
  prompt_transport: "auto"
  timeout_seconds: 300

# models: (Không bắt buộc - tự động tạo model mặc định theo tên CLI)
`;

const PRESET_PTY = `id: "interactive-cli"
name: "Interactive AI CLI"
version: "1.0.0"
executable: "mycli"
execution_mode: "pty"

invocation:
  args_template:
    - "{prompt}"
  prompt_transport: "auto"
  timeout_seconds: 600

# models: (Không bắt buộc - tự động tạo model mặc định theo tên CLI)
`;

export function CustomAdapterStudioModal({ isOpen, onClose, onSuccess }: CustomAdapterStudioModalProps) {
  const [yamlContent, setYamlContent] = useState(PRESET_PIPE);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{
    valid: boolean;
    isInstalled: boolean;
    resolvedPath: string | null;
    detectedVersion: string | null;
    latencyMs: number;
    error?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: "pipe" | "pty") => {
    setYamlContent(preset === "pipe" ? PRESET_PIPE : PRESET_PTY);
    setProbeResult(null);
    setErrorBanner(null);
  };

  const handleProbe = async () => {
    setProbing(true);
    setErrorBanner(null);
    try {
      const result = await apiClient.probeAdapter(yamlContent);
      setProbeResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(`Probe failed: ${msg}`);
      setProbeResult(null);
    } finally {
      setProbing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorBanner(null);
    try {
      await apiClient.createCustomAdapter(yamlContent);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-surface border border-borderSubtle rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderSubtle bg-surface">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-brand/20 border border-brand/40 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-brand" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Manual CLI Input & Adapter Studio</h2>
              <p className="text-xs text-slate-400 font-mono">
                Đăng ký CLI tùy ý nhanh chóng với cờ cơ bản (danh sách models là tùy chọn).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-surfaceHover transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 font-mono text-xs">
          {/* Preset Buttons */}
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Scaffold Preset Archetypes:</span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleApplyPreset("pipe")}
                className="px-3 py-1.5 rounded-lg bg-canvas border border-borderSubtle hover:border-brand text-slate-300 hover:text-white transition"
              >
                Piped Subcommand (e.g. node/cli)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset("pty")}
                className="px-3 py-1.5 rounded-lg bg-canvas border border-borderSubtle hover:border-brand text-slate-300 hover:text-white transition"
              >
                Interactive PTY (e.g. agent)
              </button>
            </div>
          </div>

          {/* YAML Editor */}
          <div className="space-y-1">
            <label className="block text-slate-400">Declarative Adapter Specification (YAML):</label>
            <textarea
              value={yamlContent}
              onChange={(e) => setYamlContent(e.target.value)}
              rows={12}
              className="w-full px-4 py-3 rounded-xl bg-canvas border border-borderSubtle text-slate-200 focus:border-brand focus:ring-1 focus:ring-brand outline-none font-mono text-xs leading-relaxed resize-none"
              spellCheck={false}
            />
          </div>

          {/* Error Banner */}
          {errorBanner && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorBanner}</span>
            </div>
          )}

          {/* Probe Telemetry Box */}
          {probeResult && (
            <div
              className={`p-4 rounded-xl border ${
                probeResult.isInstalled
                  ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                  : "bg-amber-950/20 border-amber-500/30 text-amber-300"
              } space-y-2`}
            >
              <div className="flex items-center justify-between font-bold">
                <div className="flex items-center space-x-2">
                  {probeResult.isInstalled ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  )}
                  <span>
                    {probeResult.isInstalled ? "Binary Verified on Host" : "Binary Not Found on PATH"}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Latency: {probeResult.latencyMs}ms
                </span>
              </div>
              <div className="text-[11px] font-mono space-y-1 text-slate-300">
                {probeResult.resolvedPath && (
                  <div>Path: <span className="text-white">{probeResult.resolvedPath}</span></div>
                )}
                {probeResult.detectedVersion && (
                  <div>Version: <span className="text-white">{probeResult.detectedVersion}</span></div>
                )}
                {probeResult.error && (
                  <div className="text-rose-400">Error: {probeResult.error}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-borderSubtle bg-surface flex items-center justify-between">
          <button
            type="button"
            onClick={handleProbe}
            disabled={probing}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-surfaceHover hover:bg-borderSubtle text-white font-medium border border-borderSubtle transition disabled:opacity-50"
          >
            {probing ? <Loader2 className="w-4 h-4 animate-spin text-brand" /> : <Play className="w-4 h-4 text-emerald-400" />}
            <span>Run Test Probe</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center space-x-2 px-5 py-2 text-xs font-semibold bg-brand hover:bg-brandHover text-white rounded-lg transition shadow-lg shadow-brand/20 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save & Register</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
