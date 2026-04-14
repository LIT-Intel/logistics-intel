import React, { useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Search,
  Building2,
  Mail,
  FileText,
  Box,
  Settings,
  CreditCard,
  Users2,
  Shield,
  TrendingUp,
  Database,
  Bug,
  Lock,
  ChevronLeft,
  Menu,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { canAccessFeature } from "@/lib/planLimits";
import { logout } from "@/auth/supabaseAuthClient";

function SideLink({ to, icon: Icon, label, locked = false, onClick = null }) {
  const baseClass =
    "flex items-center justify-between px-4 py-3 mx-2 rounded-xl transition-all duration-200";

  if (locked) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} w-[calc(100%-1rem)] text-gray-400 hover:bg-white/5 hover:text-white`}
      >
        <span className="flex items-center text-sm font-medium">
          <Icon size={18} className="mr-3 shrink-0" />
          {label}
        </span>
        <Lock size={14} className="opacity-80" />
      </button>
    );
  }

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `${baseClass} ${
          isActive
            ? "bg-white/10 text-white shadow-sm"
            : "text-gray-300 hover:bg-white/5 hover:text-white"
        }`
      }
    >
      <span className="flex items-center text-sm font-medium">
        <Icon size={18} className="mr-3 shrink-0" />
        {label}
      </span>
    </NavLink>
  );
}

function SectionLabel({ collapsed, children }) {
  if (collapsed) return null;

  return (
    <div className="px-4 py-2 text-gray-400 text-xs font-semibold uppercase tracking-wider">
      {children}
    </div>
  );
}

function getDisplayName(user, fullName) {
  return (
    fullName ||
    user?.displayName ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.display_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "User"
  );
}

function getInitials(name, email) {
  const source = (name || email || "U").trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export default function AppShell({ currentPageName, children }) {
  const {
    user,
    fullName,
    plan,
    canAccessAdmin,
    isOrgAdmin,
    isSuperAdmin,
  } = useAuth();

  const displayName = useMemo(() => getDisplayName(user, fullName), [user, fullName]);
  const avatarInitials = useMemo(
    () => getInitials(displayName, user?.email),
    [displayName, user?.email]
  );

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const showCampaigns = canAccessFeature(plan, "campaign_builder");
  const showPulse = canAccessFeature(plan, "pulse");
  const showRfp = true;
  const showAdminSection = Boolean(canAccessAdmin || isOrgAdmin || isSuperAdmin);

  const breadcrumbs = useMemo(() => {
    const path = location.pathname.replace(/^\/+|\/+$|\?.*$/g, "");
    const parts = path.split("/").filter(Boolean);
    const nice = (s) => s.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

    const items = [];
    let acc = "";

    for (let i = 0; i < parts.length; i++) {
      acc += "/" + parts[i];
      items.push({ label: nice(parts[i]), href: acc });
    }

    return items;
  }, [location.pathname]);

  const lockedClick = () => {
    window.location.href = "/app/billing";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="flex min-h-screen">
        <aside
          className={`${
            collapsed ? "w-16" : "w-64"
          } transition-all duration-200 shrink-0 bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 shadow-2xl hidden md:flex md:flex-col`}
        >
          <div
            className={`flex items-center ${
              collapsed ? "justify-center" : ""
            } px-3 py-4 border-b border-white/10`}
          >
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mr-0">
              <span className="text-white font-bold text-sm">LIT</span>
            </div>

            {!collapsed && (
              <>
                <div className="ml-3">
                  <div className="text-white font-bold text-lg">Trade Intelligence</div>
                  <div className="text-gray-300 text-xs">Logistic Intel</div>
                </div>

                <button
                  className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-white/80 hover:bg-white/5 hover:text-white"
                  onClick={() => setCollapsed(true)}
                  aria-label="Collapse menu"
                >
                  <ChevronLeft size={16} />
                </button>
              </>
            )}
          </div>

          <SectionLabel collapsed={collapsed}>Menu</SectionLabel>
          <nav className="mb-4">
            <SideLink to="/app/dashboard" icon={BarChart3} label={collapsed ? "" : "Dashboard"} />
            <SideLink to="/app/search" icon={Search} label={collapsed ? "" : "Search"} />
            <SideLink
              to="/app/command-center"
              icon={Building2}
              label={collapsed ? "" : "Command Center"}
            />
            {showCampaigns ? (
              <SideLink
                to="/app/campaigns"
                icon={Mail}
                label={collapsed ? "" : "Campaigns"}
              />
            ) : (
              !collapsed && (
                <SideLink
                  to="#"
                  icon={Mail}
                  label="Campaigns"
                  locked
                  onClick={lockedClick}
                />
              )
            )}
            {showPulse && (
              <SideLink
                to="/app/prospecting"
                icon={TrendingUp}
                label={collapsed ? "" : "Pulse"}
              />
            )}
          </nav>

          <SectionLabel collapsed={collapsed}>Tools</SectionLabel>
          <nav className="mb-4">
            {showRfp ? (
              <SideLink to="/app/rfp" icon={FileText} label={collapsed ? "" : "RFP Studio"} />
            ) : (
              !collapsed && (
                <SideLink
                  to="#"
                  icon={FileText}
                  label="RFP Studio"
                  locked
                  onClick={lockedClick}
                />
              )
            )}
            <SideLink to="/app/widgets" icon={Box} label={collapsed ? "" : "Widgets"} />
          </nav>

          <SectionLabel collapsed={collapsed}>Account</SectionLabel>
          <nav className="mb-4">
            <SideLink to="/app/settings" icon={Settings} label={collapsed ? "" : "Settings"} />
            <SideLink to="/app/billing" icon={CreditCard} label={collapsed ? "" : "Billing"} />
            <SideLink to="/app/affiliate" icon={Users2} label={collapsed ? "" : "Affiliate"} />
          </nav>

          {showAdminSection && (
            <>
              <SectionLabel collapsed={collapsed}>Admin</SectionLabel>
              <nav className="mb-6">
                <SideLink to="/app/admin" icon={Shield} label={collapsed ? "" : "Admin Dashboard"} />
                <SideLink to="/app/cms" icon={Database} label={collapsed ? "" : "CMS"} />
                <SideLink to="/app/diagnostic" icon={Bug} label={collapsed ? "" : "Debug Agent"} />
              </nav>
            </>
          )}
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 h-14 flex items-center justify-between px-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                className="hidden md:inline-flex p-2 rounded-lg border text-gray-600"
                onClick={() => setCollapsed((c) => !c)}
                aria-label="Toggle menu"
              >
                {collapsed ? <Menu size={16} /> : "≡"}
              </button>

              <button
                className="md:hidden p-2 rounded-lg border text-gray-600"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                ☰
              </button>

              <nav className="hidden sm:flex items-center gap-2 text-sm text-gray-600 truncate">
                {breadcrumbs.slice(0, 1).map((b, idx) => (
                  <span key={idx} className="truncate">
                    {b.label}
                  </span>
                ))}
                {breadcrumbs.length > 1 && <span className="text-gray-400">›</span>}
                {breadcrumbs.slice(1).map((b, idx) => (
                  <span
                    key={idx}
                    className={`truncate ${
                      idx === breadcrumbs.length - 2 ? "font-medium text-gray-900" : ""
                    }`}
                  >
                    {b.label}
                  </span>
                ))}
              </nav>

              <div className="sm:hidden font-medium text-gray-700 truncate">{currentPageName}</div>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="hidden sm:inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 max-w-[220px]"
                onClick={() => {
                  window.location.href = "/app/settings";
                }}
                title={displayName}
              >
                <span className="truncate">{displayName}</span>
              </button>

              <button
                className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                onClick={async () => {
                  try {
                    await logout();
                  } finally {
                    window.location.href = "/login";
                  }
                }}
              >
                Logout
              </button>

              <div
                className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white flex items-center justify-center text-xs font-bold"
                title={displayName}
              >
                {avatarInitials}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto min-w-0 w-full flex gap-[5px] pl-[5px] pr-[5px]">
            <div className="flex-1 min-w-0 max-w-none">{children}</div>
          </div>
        </main>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 left-0 h-full w-72 bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 shadow-2xl p-4 text-white">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold">Menu</span>
              <button
                className="p-2 rounded-lg border border-white/20"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <nav className="space-y-1">
              <SideLink to="/app/dashboard" icon={BarChart3} label="Dashboard" />
              <SideLink to="/app/search" icon={Search} label="Search" />
              <SideLink to="/app/command-center" icon={Building2} label="Command Center" />
              {showCampaigns ? (
                <SideLink to="/app/campaigns" icon={Mail} label="Campaigns" />
              ) : (
                <SideLink to="#" icon={Mail} label="Campaigns" locked onClick={lockedClick} />
              )}
              {showPulse && (
                <SideLink to="/app/prospecting" icon={TrendingUp} label="Pulse" />
              )}
              <SideLink to="/app/rfp" icon={FileText} label="RFP Studio" />
              <SideLink to="/app/widgets" icon={Box} label="Widgets" />
              <SideLink to="/app/settings" icon={Settings} label="Settings" />
              <SideLink to="/app/billing" icon={CreditCard} label="Billing" />
              <SideLink to="/app/affiliate" icon={Users2} label="Affiliate" />
              {showAdminSection && (
                <>
                  <SideLink to="/app/admin" icon={Shield} label="Admin Dashboard" />
                  <SideLink to="/app/cms" icon={Database} label="CMS" />
                  <SideLink to="/app/diagnostic" icon={Bug} label="Debug Agent" />
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
