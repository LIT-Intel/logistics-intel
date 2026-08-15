"use client";

/**
 * Lead-CRM minimal shell — the standalone workspace chrome for `/app/leads`.
 *
 * Deliberately NOT AdminCommandDeck and NOT the full app AppShell: a SALES REP
 * gets a focused, brand-consistent workspace with just its own header + nav
 * (Leads · Pipeline · Team) and NOTHING else from the admin deck. The route
 * gate (`RequireLeadCrm`) lives here too so every child renders only for
 * lead-CRM members; a non-member sees the friendly "no access" card.
 *
 * Brand: same slate wordmark + Space Grotesk / DM Sans type as AppShell, so it
 * reads as part of Logistics Intel without pulling in the app's sidebar.
 */
import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Users, KanbanSquare, UserCog, Loader2, LogOut, ArrowLeft } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { logout } from "@/auth/supabaseAuthClient";
import { useLeadCrmAccess } from "@/hooks/useLeadCrmAccess";
import { FONT_HEAD, FONT_BODY, initials, avatarColor } from "./leadCrmFormat";

/**
 * Route gate. Calls `lit_my_lead_crm_access()` via the hook and renders the
 * workspace only when `is_member`. A non-platform-admin REP is admitted purely
 * on membership — no admin, no plan checks. Non-members get a friendly screen
 * (never a redirect loop).
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

/** The shell chrome — header + nav tabs + the routed child page. */
export default function LeadCrmLayout() {
  const { user, fullName } = useAuth();
  const { isPlatformAdmin, role } = useLeadCrmAccess();

  const displayName =
    fullName ||
    (user as any)?.displayName ||
    (user?.email ? user.email.split("@")[0] : "Rep");

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", display: "flex", flexDirection: "column" }}>
      {/* Header — slate bar, brand wordmark + workspace label + identity. */}
      <header
        style={{
          background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "0 20px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span
            style={{
              fontFamily: FONT_HEAD,
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#FFFFFF",
              whiteSpace: "nowrap",
            }}
          >
            Logistics Intel
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 9px",
              borderRadius: 999,
              background: "rgba(59,130,246,0.18)",
              border: "1px solid rgba(59,130,246,0.35)",
              color: "#93C5FD",
              fontFamily: FONT_HEAD,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Lead CRM
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div
              style={{
                width: 28,
                height: 28,
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
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: FONT_HEAD,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#E2E8F0",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 160,
                }}
              >
                {displayName}
              </div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 10, color: "#94A3B8", textTransform: "capitalize" }}>
                {role === "manager" ? "Manager" : role === "rep" ? "Sales rep" : "Member"}
              </div>
            </div>
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
              gap: 5,
              padding: "6px 11px",
              borderRadius: 9,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.04)",
              color: "#CBD5E1",
              fontFamily: FONT_HEAD,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <LogOut style={{ width: 13, height: 13 }} />
            Logout
          </button>
        </div>
      </header>

      {/* Nav tabs — Leads · Pipeline (phase 2) · Team (platform admin only). */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "0 16px",
          background: "#FFFFFF",
          borderBottom: "1px solid #E5E7EB",
          flexShrink: 0,
        }}
      >
        <ShellTab to="/app/leads" end icon={<Users style={{ width: 14, height: 14 }} />} label="Leads" />
        <ShellTab
          to="/app/leads/pipeline"
          icon={<KanbanSquare style={{ width: 14, height: 14 }} />}
          label="Pipeline"
          badge="Soon"
        />
        {isPlatformAdmin ? (
          <ShellTab to="/app/leads/team" icon={<UserCog style={{ width: 14, height: 14 }} />} label="Team" />
        ) : null}
      </nav>

      <main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Outlet />
      </main>
    </div>
  );
}

function ShellTab({
  to,
  end,
  icon,
  label,
  badge,
}: {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "12px 14px",
        border: "none",
        borderBottom: `2px solid ${isActive ? "#3B82F6" : "transparent"}`,
        background: "transparent",
        color: isActive ? "#1D4ED8" : "#64748b",
        fontFamily: FONT_HEAD,
        fontSize: 13,
        fontWeight: 700,
        textDecoration: "none",
        marginBottom: -1,
      })}
    >
      {icon}
      {label}
      {badge ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "1px 6px",
            borderRadius: 999,
            background: "#F1F5F9",
            color: "#94A3B8",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

const centerScreen: React.CSSProperties = {
  minHeight: "100vh",
  background: "#F8FAFC",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};
