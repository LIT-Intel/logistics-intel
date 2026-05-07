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
  Inbox,
} from "lucide-react";
import { LitAppIcon, PulseIcon } from "@/components/shared/AppIcons";
import { useAuth } from "@/auth/AuthProvider";
import { canAccessFeature } from "@/lib/planLimits";
import SidebarUsageChip from "@/components/shared/SidebarUsageChip";
import "./litLogo.css";

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
              { label: "Demo requests", href: "/app/admin/demo-requests", icon: Inbox },
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
        // 200ms transition — was 300ms which felt sluggish. Matches the
        // snappier collapse cadence on Linear / Vercel.
        "relative hidden md:flex md:flex-col shrink-0 transition-all duration-200",
        "text-white border-r border-white/10",
        // Standard sizing: 240px expanded matches Linear/Stripe/Notion;
        // 72px collapsed feels like a true icon rail (was 92 — too wide
        // to read as a deliberate rail mode, too narrow to fit labels).
        sidebarOpen ? "w-[240px]" : "w-[72px]",
      ].join(" ")}
      // Pulse Coach gradient — same exact tokens as the Profile-page
      // quota cards, Settings Account Snapshot, and Billing modals so
      // the chrome reads as one consistent brand surface.
      style={{
        background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
        boxShadow: "inset -1px 0 0 rgba(0,240,255,0.18)",
      }}
    >
      {/* Header — h-16 (64px) tighter than the previous h-20 since we
          dropped the two-line subtitle. Logo lockup is icon (36px) +
          gap (10px) + "LIT" (22px Space Grotesk extrabold). 1.6× ratio
          between icon-box and wordmark feels balanced. */}
      <div
        className={[
          "flex h-16 shrink-0 items-center border-b border-white/10",
          sidebarOpen ? "justify-start px-4" : "justify-center px-2",
        ].join(" ")}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div
            className="lit-logo-alive flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 ring-1 ring-white/10"
          >
            <LitAppIcon className="h-6 w-6" style={{ color: "#00F0FF" }} />
          </div>

          {sidebarOpen && (
            <div
              className="text-[22px] font-extrabold tracking-[-0.03em] text-white"
              style={{ fontFamily: "Space Grotesk,sans-serif" }}
            >
              LIT
            </div>
          )}
        </div>
      </div>

      {/* Floating boundary toggle — anchored to the bottom edge of the
          header so it never drifts if header height changes. Position
          biases more toward the page when collapsed so it reads as a
          clear "click to expand" affordance instead of a vestigial nub. */}
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        className={[
          "absolute z-30 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-slate-200 shadow-[0_4px_12px_rgba(2,6,23,0.45)] transition hover:text-white",
          // top-12 == 48px — anchored just below the 64px header divider.
          "top-12",
          sidebarOpen ? "-right-3" : "-right-4",
        ].join(" ")}
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
                    {/* Cyan left-edge accent strip — only renders for the
                        active item. In collapsed mode this is the primary
                        wayfinding signal since labels are hidden. In
                        expanded mode it sits flush with the rounded
                        background for a polished selected state. */}
                    {isActive && !item.locked && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                        style={{
                          background: "#00F0FF",
                          boxShadow: "0 0 8px rgba(0,240,255,0.5)",
                        }}
                      />
                    )}
                    <Link
                      to={item.locked ? "/app/billing" : item.href}
                      title={item.label}
                      className={[
                        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
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
                      <span className="relative inline-flex">
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
                        {/* Locked overlay — small lock pip on the icon
                            so collapsed-mode users see the gate state
                            without hovering for the tooltip. */}
                        {item.locked && !sidebarOpen && (
                          <span
                            aria-hidden
                            className="absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full border border-slate-900 bg-slate-700"
                          >
                            <Lock className="h-2 w-2 text-slate-300" />
                          </span>
                        )}
                      </span>
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

      {/* Live usage chip — same component the mobile menu footer renders
          so both surfaces share signal + brand voice. Real plan, real
          days-left, real hottest meter. Click → Settings → Billing. */}
      <div className="border-t border-white/10 p-3">
        <SidebarUsageChip variant={sidebarOpen ? "open" : "collapsed"} />
      </div>
    </aside>
  );
};

export default AppSidebar;
