import { useState } from "react";
import { Header } from "./components/layout/Header.js";
import { Sidebar, NavTab } from "./components/layout/Sidebar.js";
import { DashboardView } from "./views/DashboardView.js";
import { ModelCatalogView } from "./views/ModelCatalogView.js";
import { AccountsView } from "./views/AccountsView.js";
import { WebShellView } from "./views/WebShellView.js";
import { TelemetryStationView } from "./views/TelemetryStationView.js";
import { LiveInspectorView } from "./views/LiveInspectorView.js";

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [targetAccount, setTargetAccount] = useState<{ adapterId: string; accountId: string } | null>(null);

  const handleOpenTerminal = (adapterId: string, accountId: string) => {
    setTargetAccount({ adapterId, accountId });
    setActiveTab("webshell");
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas text-slate-100">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />
        <main className="flex-1 overflow-hidden bg-canvas">
          {activeTab === "dashboard" && <DashboardView />}
          {activeTab === "models" && <ModelCatalogView />}
          {activeTab === "accounts" && <AccountsView onOpenTerminal={handleOpenTerminal} />}
          {activeTab === "webshell" && (
            <WebShellView
              initialAdapterId={targetAccount?.adapterId}
              initialAccountId={targetAccount?.accountId}
            />
          )}
          {activeTab === "radar" && <TelemetryStationView />}
          {activeTab === "inspector" && <LiveInspectorView />}
        </main>
      </div>
    </div>
  );
}
export default App;
