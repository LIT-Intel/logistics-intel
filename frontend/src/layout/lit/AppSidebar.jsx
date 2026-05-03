import React from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Briefcase,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Lock,
  Users,
  Award,
} from "lucide-react";
import { LitAppIcon, PulseIcon } from "@/components/shared/AppIcons";
import { useAuth } from "@/auth/AuthProvider";
import { canAccessFeature, PLAN_LIMITS } from "@/lib/planLimits";
import { useUsageSummary } from "@/hooks/useUsageSummary";

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
    // Account links (Settings / Billing / Affiliate) intentionally
    // removed from the sidebar — they live in the avatar dropdown in
    // the header so the sidebar can stay focused on workspace navigation
    // and not duplicate the same destinations in two places.
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
        "relative hidden md:flex md:flex-col shrink-0 transition-all duration-300",
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
      <div className="flex h-20 items-center justify-center border-b border-white/10 px-5">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* App icon — same slate-950/cyan box, sized to host the LIT
              wordmark right next to it at matching weight. */}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 shadow-lg ring-1 ring-white/10">
            <LitAppIcon className="h-7 w-7" style={{ color: "#00F0FF" }} />
          </div>

          {sidebarOpen && (
            <div
              className="text-[26px] font-bold tracking-[-0.02em] text-white"
              style={{ fontFamily: "Space Grotesk,sans-serif" }}
            >
              LIT
            </div>
          )}
        </div>
      </div>

      {/* Floating boundary toggle — sits half on the sidebar edge / half
          on the main content. Persists via localStorage so the user's
          preference sticks across reloads. Common pattern in Linear /
          Notion / Vercel; replaces the in-header chevron that was easy
          to miss and didn't survive page navigation. */}
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        className="absolute top-[60px] -right-3 z-30 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-slate-200 shadow-[0_4px_12px_rgba(2,6,23,0.45)] transition hover:text-white"
        style={{
          background: "linear-gradient(180deg,#0F172A 0%,#0B1220 100%)",
        }}
      >
        {sidebarOpen ? (
          <PanelLeftClose className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftOpen className="h-3.5 w-3.5" />
        )}
      </button>

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
                  <div key={item.label} className="group/navitem relative">
                    <Link
                      to={item.locked ? "/app/billing" : item.href}
                      title={item.label}
                      className={[
                        "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
                        // Centre the icon when collapsed so there's no
                        // off-balance gap on the right.
                        sidebarOpen ? "" : "justify-center",
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
                    {/* Collapsed-state tooltip — only renders when the
                        sidebar is in icon-only mode. Hover reveals the
                        label so users don't have to expand to know what
                        each icon is. Same dark surface + cyan accent
                        as the rest of the brand. */}
                    {!sidebarOpen && (
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute left-full top-1/2 z-[60] ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] font-semibold text-white opacity-0 shadow-[0_8px_22px_rgba(15,23,42,0.45)] transition-opacity duration-150 group-hover/navitem:opacity-100"
                        style={{
                          background: "linear-gradient(180deg,#0F172A 0%,#0B1220 100%)",
                          fontFamily: "Space Grotesk,sans-serif",
                        }}
                      >
                        {item.label}
                        {item.locked && (
                          <span
                            className="ml-1.5 inline-flex items-center gap-1 rounded border px-1 py-px text-[8.5px] font-bold uppercase tracking-[0.06em]"
                            style={{
                              color: "#00F0FF",
                              borderColor: "rgba(0,240,255,0.35)",
                              background: "rgba(0,240,255,0.08)",
                              fontFamily: "ui-monospace,monospace",
                            }}
                          >
                            Locked
                          </span>
                        )}
                      </div>
                    )}
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

      {/* Live usage chip — replaces the decorative "Pulse · AI lead
          intelligence" anchor with real signal. Plan label, days-left
          in the cycle, and the highest-burn meter so every navigation
          gets a glanceable budget read. Click → Settings → Billing. */}
      <SidebarUsageChip sidebarOpen={sidebarOpen} />
    </aside>
  );
};

/**
 * Live usage chip rendered in the sidebar footer. Two modes:
 *   - sidebarOpen=true  → 3-line card with plan badge, days-left chip,
 *     hottest meter (label + used/limit + thin progress bar).
 *   - sidebarOpen=false → compact circle showing plan initial + a
 *     single ring whose color reflects the hottest meter's burn.
 *
 * Click anywhere routes to the Billing surface in Settings so users
 * can act on what they see. Pulse Coach styling so it slots into the
 * sidebar's brand surface without competing with it.
 */
function SidebarUsageChip({ sidebarOpen }) {
  const { plan, periodEnd, rows, loading } = useUsageSummary();
  const planConfig = PLAN_LIMITS[plan];
  const planLabel = planConfig?.label || "Free Trial";
  const planInitial = (planLabel[0] || "F").toUpperCase();

  const now = new Date();
  const end = periodEnd ? new Date(periodEnd) : null;
  const daysLeft = end
    ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  // Pick the row with the highest used/limit ratio so the chip surfaces
  // the user's most-pressing budget signal rather than the first one
  // alphabetically.
  const hottest = (() => {
    const limited = rows.filter((r) => r.limit != null && r.limit > 0);
    if (!limited.length) return null;
    return limited
      .map((r) => ({ ...r, pct: Math.min(100, Math.round((r.used / r.limit) * 100)) }))
      .sort((a, b) => b.pct - a.pct)[0];
  })();

  const burnColor =
    hottest == null
      ? "#475569"
      : hottest.pct >= 90
      ? "#F97316"
      : hottest.pct >= 70
      ? "#FACC15"
      : "#00F0FF";

  return (
    <div className="border-t border-white/10 p-4">
      <Link
        to="/app/settings?tab=billing"
        className="block rounded-2xl border border-white/10 px-3 py-3 transition hover:border-white/20"
        style={{
          background: "rgba(0,240,255,0.05)",
          boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
        }}
      >
        {sidebarOpen ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="font-display inline-flex items-center rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em]"
                  style={{
                    color: "#00F0FF",
                    borderColor: "rgba(0,240,255,0.35)",
                    background: "rgba(0,240,255,0.08)",
                    fontFamily: "ui-monospace,monospace",
                  }}
                >
                  {planLabel}
                </span>
                {daysLeft != null && (
                  <span
                    className="text-[10.5px] text-slate-300"
                    style={{ fontFamily: "DM Sans,sans-serif" }}
                  >
                    {daysLeft}d left
                  </span>
                )}
              </div>
              <PulseIcon className="h-3.5 w-3.5 shrink-0" style={{ color: "#00F0FF" }} />
            </div>
            <div className="min-w-0">
              <div
                className="truncate text-[11.5px] font-semibold text-white"
                style={{ fontFamily: "Space Grotesk,sans-serif" }}
              >
                {hottest
                  ? hottest.label
                  : loading
                  ? "Loading usage…"
                  : "Manage plan"}
              </div>
              {hottest && (
                <div
                  className="mt-1 flex items-center gap-1.5"
                  style={{ fontFamily: "ui-monospace,monospace" }}
                >
                  <span className="text-[10.5px] tabular-nums text-slate-300">
                    {hottest.used.toLocaleString()} / {hottest.limit?.toLocaleString()}
                  </span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(2, hottest.pct)}%`,
                        background: burnColor,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full ring-2"
              style={{
                background: "#0F172A",
                color: "#00F0FF",
                boxShadow: hottest ? `0 0 0 2px ${burnColor}40` : undefined,
                border: `2px solid ${burnColor}`,
              }}
            >
              <span
                className="text-[12px] font-bold"
                style={{ fontFamily: "Space Grotesk,sans-serif" }}
              >
                {planInitial}
              </span>
            </div>
            {hottest && (
              <span
                className="text-[9px] font-bold tabular-nums"
                style={{
                  color: burnColor,
                  fontFamily: "ui-monospace,monospace",
                }}
              >
                {hottest.pct}%
              </span>
            )}
          </div>
        )}
      </Link>
    </div>
  );
}

export default AppSidebar;
