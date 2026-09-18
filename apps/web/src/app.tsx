import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { getToken } from "./api.js";
import { AccountsPage } from "./pages/accounts.js";
import { ApiKeysPage } from "./pages/api-keys.js";
import { GroupEditorPage } from "./pages/group-editor.js";
import { GroupsPage } from "./pages/groups.js";
import { LoginPage } from "./pages/login.js";
import { OverviewPage } from "./pages/overview.js";
import { SettingsPage } from "./pages/settings.js";
import { TerminalPage } from "./pages/terminal.js";
import { UsagePage } from "./pages/usage.js";

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/accounts", label: "Accounts" },
  { to: "/groups", label: "Groups" },
  { to: "/api-keys", label: "API keys" },
  { to: "/usage", label: "Usage" },
  { to: "/terminal", label: "Terminal" },
  { to: "/settings", label: "Settings" },
];

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-48 shrink-0 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="px-4 py-4 text-sm font-semibold tracking-tight">cli-to-api</div>
        <nav className="space-y-0.5 px-2 pb-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded px-2 py-1.5 text-sm ${
                  isActive
                    ? "bg-neutral-200 font-medium dark:bg-neutral-800"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/60"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-[1400px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="groups/:id" element={<GroupEditorPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="terminal" element={<TerminalPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
