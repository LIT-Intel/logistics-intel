"use client";

/**
 * Lead-CRM shell — the standalone workspace chrome for `/app/leads`.
 *
 * Attio-style app layout: a persistent LEFT SIDEBAR (brand wordmark + vertical
 * nav + back-to-app + user/logout) and a FULL-WIDTH content area with a thin
 * top bar (section title + theme toggle + Add affordance). NOT AdminCommandDeck
 * and NOT the full app AppShell — a sales rep gets a focused, dense CRM.
 *
 * The route gate (`RequireLeadCrm`) still calls `lit_my_lead_crm_access()` and
 * renders the workspace only for members. Everything is wrapped in
 * `LeadCrmThemeProvider` so every child reads light/dark tokens from context.
 *
 * Responsive: below ~880px the sidebar collapses into a top bar with a slide-in
 * drawer (hamburger), keeping the workspace fully usable on mobile.
 */
import React, { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Users, KanbanSquare, ListChecks, BarChart3, UserCog, Loader2, LogOut, Search,
  ArrowLeft, Sun, Moon, Menu,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { logout } from "@/auth/supabaseAuthClient";
import { useLeadCrmAccess } from "@/hooks/useLeadCrmAccess";
import { FONT_HEAD, FONT_BODY, initials, avatarColor } from "./leadCrmFormat";
import { LeadCrmThemeProvider, useLeadCrmTheme } from "./LeadCrmTheme";

/**
 * Route gate. Calls `lit_my_lead_crm_access()` via the hook and renders the
 * workspace only when `is_member`. Non-members get a friendly screen.
 */
export function RequireLeadCrm({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isMember, loading } = useLeadCrmAccess();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div style={centerScreen}>
        <Loader2 style={{ width: 22, height: 22, color: "#64748b", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (!isMember) {
    return (
      <div style={centerScreen}>
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 18,
            padding: "32px 28px",
            textAlign: "center",
            boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "#F1F5F9",
              marginBottom: 16,
            }}
          >
            <Users style={{ width: 22, height: 22, color: "#94a3b8" }} />
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 700, color: "#0F172A" }}>
            You don't have Lead CRM access
          </div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 13.5, lineHeight: 1.6, color: "#64748b", marginTop: 8 }}>
            The Lead CRM is a shared sales workspace. Ask a Logistics Intel
            admin to add you as a rep, then reload this page.
          </div>
          <button
            onClick={() => navigate(user ? "/app/search" : "/login")}
            style={{
              marginTop: 20,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 16px",
              borderRadius: 10,
              border: "1px solid #E5E7EB",
              background: "#F8FAFC",
              color: "#475569",
              fontFamily: FONT_HEAD,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            {user ? "Back to app" : "Sign in"}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Nav item descriptor. */
type NavItem = { to: string; end?: boolean; icon: React.ReactNode; label: string };

/** Human title per route for the top bar. */
const SECTION_TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p.endsWith("/find"), title: "Find leads" },
  { match: (p) => p.endsWith("/pipeline"), title: "Pipeline" },
  { match: (p) => p.endsWith("/tasks"), title: "Tasks" },
  { match: (p) => p.endsWith("/reports"), title: "Reports" },
  { match: (p) => p.endsWith("/team"), title: "Team" },
  { match: () => true, title: "Leads" },
];

/** Outer: provide the theme, then render the shell. */
export default function LeadCrmLayout() {
  return (
    <LeadCrmThemeProvider>
      <LeadCrmShell />
    </LeadCrmThemeProvider>
  );
}

function LeadCrmShell() {
  const { user, fullName } = useAuth();
  const { isPlatformAdmin, role } = useLeadCrmAccess();
  const { theme, mode, toggle } = useLeadCrmTheme();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const displayName =
    fullName ||
    (user as any)?.displayName ||
    (user?.email ? user.email.split("@")[0] : "Rep");

  const roleLabel = role === "manager" ? "Manager" : role === "rep" ? "Sales rep" : "Member";

  const navItems: NavItem[] = [
    { to: "/app/leads", end: true, icon: <Users style={navIco} />, label: "Leads" },
    { to: "/app/leads/find", icon: <Search style={navIco} />, label: "Find leads" },
    { to: "/app/leads/pipeline", icon: <KanbanSquare style={navIco} />, label: "Pipeline" },
    { to: "/app/leads/tasks", icon: <ListChecks style={navIco} />, label: "Tasks" },
    { to: "/app/leads/reports", icon: <BarChart3 style={navIco} />, label: "Reports" },
    ...(isPlatformAdmin ? [{ to: "/app/leads/team", icon: <UserCog style={navIco} />, label: "Team" } as NavItem] : []),
  ];

  const sectionTitle = SECTION_TITLES.find((s) => s.match(location.pathname))?.title ?? "Leads";

  const sidebarInner = (
    <SidebarContent
      navItems={navItems}
      displayName={displayName}
      roleLabel={roleLabel}
      onNavigate={() => setMobileNavOpen(false)}
    />
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        height: "100vh",
        background: theme.bg,
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Desktop sidebar (persistent, ≥md). Hidden on mobile via CSS class. */}
      <aside
        className="hidden md:flex"
        style={{
          width: 220,
          flexShrink: 0,
          flexDirection: "column",
          background: theme.sidebar,
          borderRight: `1px solid ${theme.sidebarBorder}`,
        }}
      >
        {sidebarInner}
      </aside>

      {/* Mobile slide-in drawer */}
      {mobileNavOpen ? (
        <div className="md:hidden" style={{ position: "fixed", inset: 0, zIndex: 80 }}>
          <div onClick={() => setMobileNavOpen(false)} style={{ position: "absolute", inset: 0, background: theme.overlay }} />
          <aside
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 240,
              display: "flex",
              flexDirection: "column",
              background: theme.sidebar,
              borderRight: `1px solid ${theme.sidebarBorder}`,
              boxShadow: `8px 0 24px ${theme.shadow}`,
            }}
          >
            {sidebarInner}
          </aside>
        </div>
      ) : null}

      {/* Content column — full remaining width */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <header
          style={{
            height: 52,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "0 16px",
            background: theme.panel,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <button
              type="button"
              className="md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 9, border: `1px solid ${theme.border}`,
                background: theme.panel, color: theme.textMuted, cursor: "pointer", flexShrink: 0,
              }}
            >
              <Menu style={{ width: 16, height: 16 }} />
            </button>
            <span
              style={{
                fontFamily: FONT_HEAD,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: theme.heading,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {sectionTitle}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={toggle}
              title={mode === "dark" ? "Switch to light" : "Switch to dark"}
              aria-label="Toggle theme"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 9, border: `1px solid ${theme.border}`,
                background: theme.panelAlt, color: theme.textMuted, cursor: "pointer",
              }}
            >
              {mode === "dark" ? <Sun style={{ width: 16, height: 16 }} /> : <Moon style={{ width: 16, height: 16 }} />}
            </button>
          </div>
        </header>

        <main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** The sidebar contents (shared by the desktop rail + the mobile drawer). */
function SidebarContent({
  navItems,
  displayName,
  roleLabel,
  onNavigate,
}: {
  navItems: NavItem[];
  displayName: string;
  roleLabel: string;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const { theme } = useLeadCrmTheme();

  return (
    <>
      {/* Brand */}
      <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${theme.sidebarBorder}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: FONT_HEAD,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#FFFFFF",
              whiteSpace: "nowrap",
            }}
          >
            Logistics Intel
          </span>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            marginTop: 8,
            padding: "2px 9px",
            borderRadius: 999,
            background: "rgba(59,130,246,0.18)",
            border: "1px solid rgba(59,130,246,0.35)",
            color: "#93C5FD",
            fontFamily: FONT_HEAD,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Lead CRM
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 11px",
              borderRadius: 9,
              textDecoration: "none",
              fontFamily: FONT_HEAD,
              fontSize: 13.5,
              fontWeight: 600,
              color: isActive ? theme.sidebarActiveText : theme.sidebarMuted,
              background: isActive ? theme.sidebarActiveBg : "transparent",
            })}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer: back to app + user + logout */}
      <div style={{ padding: "10px", borderTop: `1px solid ${theme.sidebarBorder}`, display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          type="button"
          onClick={() => navigate("/app")}
          title="Back to Logistics Intel"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "8px 11px",
            borderRadius: 9,
            border: "none",
            background: "transparent",
            color: theme.sidebarMuted,
            fontFamily: FONT_HEAD,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <ArrowLeft style={navIco} />
          Back to Logistics Intel
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 8px 0", minWidth: 0 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: avatarColor(displayName),
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONT_HEAD,
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initials(displayName)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontFamily: FONT_HEAD,
                fontSize: 12.5,
                fontWeight: 600,
                color: theme.sidebarText,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayName}
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 10, color: theme.sidebarMuted }}>{roleLabel}</div>
          </div>
          <button
            onClick={async () => {
              try {
                await logout();
              } finally {
                window.location.href = "/login";
              }
            }}
            title="Log out"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `1px solid ${theme.sidebarBorder}`,
              background: "transparent",
              color: theme.sidebarMuted,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <LogOut style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>
    </>
  );
}

const navIco: React.CSSProperties = { width: 16, height: 16, flexShrink: 0 };

const centerScreen: React.CSSProperties = {
  minHeight: "100vh",
  background: "#F8FAFC",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};
