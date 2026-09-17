import { useEffect, useState } from "react";
import { Shield, Zap, Server, Key, Check } from "lucide-react";
import { apiClient } from "../../lib/api-client.js";

export function Header() {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState(apiClient.getApiKey());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch("/healthz");
        setHealthy(res.ok);
      } catch {
        setHealthy(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    apiClient.setApiKey(apiKey);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setShowKeyModal(false);
    }, 800);
  };

  return (
    <>
      <header className="h-14 border-b border-borderSubtle bg-surface px-6 flex items-center justify-between select-none">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand/10 border border-brand/30 text-brand">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-wide text-white">cli-to-api</span>
            <span className="ml-2 text-xs font-mono text-slate-400">Gateway v1.0</span>
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-slate-400">Daemon:</span>
            <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-borderSubtle">
              <span
                className={`w-2 h-2 rounded-full ${
                  healthy === true
                    ? "bg-statusHealthy animate-pulse"
                    : healthy === false
                    ? "bg-statusDanger"
                    : "bg-statusCooldown"
                }`}
              />
              <span className="text-slate-200">
                {healthy === true ? "ONLINE" : healthy === false ? "OFFLINE" : "CHECKING"}
              </span>
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
            <Server className="w-3.5 h-3.5" />
            <span>Port 8080</span>
          </div>

          <button
            onClick={() => {
              setApiKey(apiClient.getApiKey());
              setShowKeyModal(true);
            }}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-surfaceHover hover:bg-borderSubtle border border-borderSubtle text-xs font-mono text-slate-300 transition"
            title="Configure API Key"
          >
            <Shield className="w-3.5 h-3.5 text-brand" />
            <span>Key: {apiClient.getApiKey().slice(0, 10)}...</span>
          </button>
        </div>
      </header>

      {/* API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <form onSubmit={handleSaveKey} className="w-96 p-6 rounded-2xl bg-surface border border-borderSubtle space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2">
              <Key className="w-4 h-4 text-brand" />
              <h2 className="text-sm font-bold text-white font-mono uppercase">Configure Gateway API Key</h2>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Key sent with Bearer auth for all Web Console API requests.
            </p>

            <div>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-cta-dev"
                className="w-full px-3 py-2 rounded-lg bg-canvas border border-borderSubtle text-xs font-mono text-white focus:border-brand outline-none"
                required
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center space-x-1.5 px-4 py-1.5 text-xs bg-brand hover:bg-brandHover text-white rounded-lg font-medium transition"
              >
                {saved ? <Check className="w-3.5 h-3.5" /> : null}
                <span>{saved ? "Saved!" : "Save Key"}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
