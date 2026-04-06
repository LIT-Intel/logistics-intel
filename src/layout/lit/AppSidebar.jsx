import React from "react";
import {
  LayoutDashboard,
  Search,
  Briefcase,
  Megaphone,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Search", href: "/search", icon: Search },
  { label: "Command Center", href: "/command-center", icon: Briefcase },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "Settings", href: "/settings", icon: Settings },
];

const AppSidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <aside
      className={[
        "lit-sidebar-shell min-h-screen transition-all duration-300 ease-in-out",
        "hidden md:flex md:flex-col",
        sidebarOpen ? "w-[270px]" : "w-[88px]",
      ].join(" ")}
    >
      <div className="flex h-20 items-center justify-between px-5 border-b border-[var(--lit-sidebar-border)]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--lit-dashboard-brand-soft)] text-[var(--lit-dashboard-brand)] font-bold text-sm shrink-0">
            LI
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--lit-dashboard-title)] truncate">
                Logistic Intel
              </div>
              <div className="text-xs text-[var(--lit-dashboard-muted)] truncate">
                Intelligence Platform
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--lit-sidebar-border)] bg-white text-[var(--lit-sidebar-text)] hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5"
        >
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <div className="flex-1 px-4 py-5">
        <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--lit-sidebar-muted)]">
          {sidebarOpen ? "Navigation" : "Menu"}
        </div>

        <nav className="flex flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              currentPath === item.href ||
              (item.href !== "/" && currentPath.startsWith(item.href));

            return (
              <a
                key={item.label}
                href={item.href}
                className={`lit-sidebar-link ${isActive ? "active" : ""}`}
                title={item.label}
              >
                <Icon size={18} className="shrink-0" />
                {sidebarOpen && (
                  <span className="text-sm font-medium truncate">
                    {item.label}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-[var(--lit-sidebar-border)]">
        <div className="lit-dashboard-card">
          <div className="lit-dashboard-card-body">
            {sidebarOpen ? (
              <>
                <div className="text-sm font-semibold text-[var(--lit-dashboard-title)]">
                  Pro Intelligence
                </div>
                <div className="mt-1 text-xs text-[var(--lit-dashboard-muted)] leading-5">
                  Track companies, campaigns, and shipment activity in one place.
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center text-[var(--lit-dashboard-brand)] font-semibold text-xs">
                PRO
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
