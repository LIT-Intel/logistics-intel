import React from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Briefcase,
  Megaphone,
  Settings,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Shield,
  Lock,
  Users,
} from "lucide-react";
import { LitAppIcon, PulseIcon } from "@/components/shared/AppIcons";
import { useAuth } from "@/auth/AuthProvider";
import { canAccessFeature } from "@/lib/planLimits";

const iconClass = "h-[18px] w-[18px] shrink-0";

const AppSidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  const {
    plan: userPlan,
    isSuperAdmin,
    isOrgAdmin,
    canAccessAdmin,
  } = useAuth();

  const plan = userPlan || "free_trial";
  // Platform admin section (Admin Dashboard, CMS, Debug Agent) = superadmin only
  const showAdminSection = Boolean(isSuperAdmin);
  // Feature locks bypass for superadmins only (not org owners)
  const isAdmin = Boolean(isSuperAdmin);

  const canUseCampaigns = isAdmin || canAccessFeature(plan, "campaign_builder");
  const canUsePulse = isAdmin || canAccessFeature(plan, "pulse");
  const canUseLeadProspecting = isAdmin || canAccessFeature(plan, "lead_prospecting");

  // Show the Command Center submenu only when the user is already
  // navigating inside its territory (saved companies, contacts,
  // company profile pages). Keeps the rest of the sidebar uncluttered.
  const inCommandCenter =
    currentPath.startsWith("/app/command-center") ||
    currentPath.startsWith("/app/companies") ||
    currentPath.startsWith("/app/contacts");

  const sections = [
    {
      title: "Menu",
      items: [
        { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
        { label: "Search", href: "/app/search", icon: Search },
        {
          label: "Command Center",
          href: "/app/command-center",
          icon: Briefcase,
          children: inCommandCenter
            ? [
                {
                  label: "Saved Companies",
                  href: "/app/command-center",
                  icon: Briefcase,
                },
                {
                  label: "Contacts",
                  href: "/app/contacts",
                  icon: Users,
                },
              ]
            : null,
        },
        {
          label: "Campaigns",
          href: "/app/campaigns",
          icon: Megaphone,
          locked: !canUseCampaigns,
        },
        {
          label: "Pulse",
          href: "/app/prospecting",
          icon: PulseIcon,
          locked: !canUsePulse && !canUseLeadProspecting,
        },
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
    ...(showAdminSection
      ? [
          {
            title: "Admin",
            items: [
              { label: "Admin Dashboard", href: "/app/admin", icon: Shield },
              { label: "Partner program", href: "/app/admin/partner-program", icon: Users },
              { label: "Team", href: "/app/settings?tab=team", icon: Users },
            ],
          },
        ]
      : []),
  ];

  return (
    <aside
      className={[
        "hidden md:flex md:flex-col shrink-0 transition-all duration-300",
        "text-white border-r border-white/10",
        sidebarOpen ? "w-[270px]" : "w-[92px]",
      ].join(" ")}
      // Pulse Coach gradient — same exact tokens as the Profile-page
      // quota cards, Settings Account Snapshot, and Billing modals so
      // the chrome reads as one consistent brand surface.
      style={{
        background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
        boxShadow: "inset -1px 0 0 rgba(0,240,255,0.18)",
      }}
    >
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 shadow-lg ring-1 ring-white/10">
            <LitAppIcon className="h-7 w-7" style={{ color: "#00F0FF" }} />
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
                  <div key={item.label}>
                    <Link
                      to={item.locked ? "/app/billing" : item.href}
                      title={item.label}
                      className={[
                        "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
                        isActive && !item.locked
                          ? "bg-white/10 text-white font-semibold"
                          : item.locked
                          ? "text-slate-500 hover:bg-white/5 hover:text-slate-300"
                          : "text-slate-200 hover:bg-white/5 hover:text-white",
                      ].join(" ")}
                    >
                      <Icon
                        className={`${iconClass} ${
                          item.label === "Pulse"
                            ? isActive
                              ? "pulse-sidebar-active"
                              : ""
                            : ""
                        }`}
                        style={
                          item.label === "Pulse"
                            ? { color: "#00F0FF", opacity: isActive ? 1 : 0.85 }
                            : undefined
                        }
                      />
                      {sidebarOpen && (
                        <span className="flex flex-1 items-center gap-2 truncate">
                          <span className="truncate">{item.label}</span>
                          {item.locked && (
                            <Lock className="ml-auto h-3 w-3 shrink-0 text-slate-500" />
                          )}
                        </span>
                      )}
                    </Link>
                    {/* Contextual submenu: only renders when the
                        parent surfaces children (e.g. Command Center
                        when the user is navigating inside it). */}
                    {sidebarOpen && item.children && item.children.length > 0 && (
                      <div className="mt-1 ml-5 flex flex-col gap-0.5 border-l border-white/10 pl-3">
                        {item.children.map((child) => {
                          const ChildIcon = child.icon;
                          const childActive =
                            currentPath === child.href ||
                            (child.href !== "/app/command-center" &&
                              currentPath.startsWith(child.href));
                          return (
                            <Link
                              key={child.label}
                              to={child.href}
                              title={child.label}
                              className={[
                                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
                                childActive
                                  ? "bg-white/10 text-white font-semibold"
                                  : "text-slate-400 hover:bg-white/5 hover:text-white",
                              ].join(" ")}
                            >
                              {ChildIcon ? (
                                <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                              ) : null}
                              <span className="truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-4">
        <div
          className="rounded-2xl border border-white/10 px-4 py-3"
          style={{
            background: "rgba(0,240,255,0.05)",
            boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
          }}
        >
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 ring-1 ring-white/10">
                <PulseIcon className="h-[18px] w-[18px]" style={{ color: "#00F0FF" }} />
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
              <PulseIcon className="h-[18px] w-[18px]" style={{ color: "#00F0FF" }} />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
