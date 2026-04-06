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
  { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { label: "Search", href: "/app/search", icon: Search },
  { label: "Command Center", href: "/app/command-center", icon: Briefcase },
  { label: "Campaigns", href: "/app/campaigns", icon: Megaphone },
  { label: "Settings", href: "/app/settings", icon: Settings },
];

const AppSidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <aside
      className={[
        "hidden md:flex md:flex-col border-r bg-white transition-all duration-300",
        sidebarOpen ? "w-[270px]" : "w-[88px]",
      ].join(" ")}
    >
      <div className="flex h-20 items-center justify-between px-5 border-b">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold shrink-0">
            LI
          </div>

          {sidebarOpen && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                Logistic Intel
              </div>
              <div className="truncate text-xs text-gray-500">
                Intelligence Platform
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border"
        >
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <div className="flex-1 px-4 py-5">
        <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
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
                className={[
                  "flex items-center gap-3 rounded-xl px-3 py-2 border text-sm",
                  isActive ? "bg-gray-100 font-semibold" : "hover:bg-gray-50",
                ].join(" ")}
                title={item.label}
              >
                <Icon size={18} />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t">
        <div className="rounded-xl border bg-white p-4">
          {sidebarOpen ? (
            <>
              <div className="text-sm font-semibold">Pro Intelligence</div>
              <div className="mt-1 text-xs text-gray-500 leading-5">
                Track companies, campaigns, and shipment activity in one place.
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center text-xs font-semibold">
              PRO
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
