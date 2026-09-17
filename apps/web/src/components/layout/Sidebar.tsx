import React from "react";
import { LayoutDashboard, Layers, Users, Terminal, Radar, Activity } from "lucide-react";

export type NavTab = "dashboard" | "models" | "accounts" | "webshell" | "radar" | "inspector";

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export function Sidebar({ activeTab, onSelectTab }: SidebarProps) {
  const items: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: "dashboard", label: "Fleet Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "models", label: "Model Catalog & Tiers", icon: <Layers className="w-4 h-4" /> },
    { id: "accounts", label: "Accounts & Sandboxes", icon: <Users className="w-4 h-4" /> },
    { id: "webshell", label: "WebShell Terminal", icon: <Terminal className="w-4 h-4" /> },
    { id: "radar", label: "Fleet Radar & Ledger", icon: <Radar className="w-4 h-4 text-cyan-400" /> },
    { id: "inspector", label: "Live SSE Inspector", icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-64 border-r border-borderSubtle bg-surface flex flex-col justify-between select-none">
      <div className="p-4 space-y-1">
        <div className="px-3 py-2 text-[11px] font-mono tracking-wider uppercase text-slate-400">
          Control Plane
        </div>
        {items.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-brand text-white shadow-lg shadow-brand/20 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-surfaceHover"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-borderSubtle text-xs font-mono text-slate-400 space-y-1">
        <div>Engine: Fastify + node-pty</div>
        <div>Containment: Win32 Job Objects</div>
      </div>
    </aside>
  );
}
