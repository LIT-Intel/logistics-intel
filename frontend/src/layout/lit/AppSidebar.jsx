import React from "react";
import {
  LayoutDashboard,
  Search,
  Briefcase,
  Megaphone,
  Settings,
  ChevronLeft,
  ChevronRight,
  Blocks,
  CreditCard,
  Shield,
  Database,
  Bug,
} from "lucide-react";
import { LitAppIcon, PulseIcon } from "@/components/shared/AppIcons";

const sections = [
  {
    title: "Menu",
    items: [
      { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
      { label: "Search", href: "/app/search", icon: Search },
      { label: "Command Center", href: "/app/command-center", icon: Briefcase },
      { label: "Campaigns", href: "/app/campaigns", icon: Megaphone },
      { label: "Pulse", href: "/app/prospecting", icon: PulseIcon },
    ],
  },
  {
    title: "Tools",
    items: [
      { label: "RFP Studio", href: "/app/rfp", icon: Blocks },
      { label: "Widgets", href: "/app/widgets", icon: Blocks },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Settings", href: "/app/settings", icon: Settings },
      { label: "Billing", href: "/app/billing", icon: CreditCard },
      { label: "Affiliate", href: "/app/affiliate", icon: Shield },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Admin Dashboard", href: "/app/admin", icon: Shield },
      { label: "CMS", href: "/app/cms", icon: Database },
      { label: "Debug Agent", href: "/app/agent", icon: Bug },
    ],
  },
];

const iconClass = "h-[18px] w-[18px] shrink-0";

const AppSidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <aside
      className={[
        "hidden md:flex md:flex-col shrink-0 transition-all duration-300",
        "bg-gradient-to-b from-slate-800 via-slate-800 to-slate-900 text-white border-r border-white/10",
        sidebarOpen ? "w-[270px]" : "w-[92px]",
      ].join(" ")}
    >
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 shadow-lg ring-1 ring-white/10">
            <LitAppIcon className="h-7 w-7 text-cyan-300" />
          </div>

          {sidebarOpen && (
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-white">
                Trade Intelligence
              </div>
              <div className="truncate text-xs text-slate-300">
                Logistics Intel
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
        >
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        {sections.map((section) => (
          <div key={section.title} className="mb-6">
            {sidebarOpen && (
              <div className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                {section.title}
              </div>
            )}

            <nav className="space-y-1.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  currentPath === item.href ||
                  (item.href !== "/" && currentPath.startsWith(item.href));

                return (
                  <a
                    key={item.label}
                    href={item.href}
                    title={item.label}
                    className={[
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
                      isActive
                        ? "bg-white/10 text-white font-semibold"
                        : "text-slate-200 hover:bg-white/5 hover:text-white",
                    ].join(" ")}
                  >
                    <Icon
                      className={`${iconClass} ${
                        item.label === "Pulse"
                          ? isActive
                            ? "text-cyan-300 pulse-sidebar-active"
                            : "text-cyan-200/90"
                          : ""
                      }`}
                    />
                    {sidebarOpen && <span className="truncate">{item.label}</span>}
                  </a>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 ring-1 ring-white/10">
                <PulseIcon className="h-[18px] w-[18px] text-cyan-300" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">Pulse</div>
                <div className="truncate text-xs text-slate-300">
                  AI lead intelligence
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <PulseIcon className="h-[18px] w-[18px] text-cyan-300" />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
