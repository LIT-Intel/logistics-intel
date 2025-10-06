// frontend/src/components/layout/AppShell.jsx
import React, { useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Home, BarChart3, Search, Building2, Mail, Activity, FileText, Package, Settings, CreditCard, Users2, Shield, TrendingUp, Database, Bug } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { checkFeatureAccess } from "@/components/utils/planLimits";
import { logout } from "@/auth/firebaseClient";

function SideLink({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center justify-between px-4 py-3 mx-2 rounded-lg transition-all duration-200 ${
          isActive ? "bg-white/10 text-white" : "text-gray-300 hover:bg-white/5 hover:text-white"
        }`
      }
    >
      <span className="flex items-center text-sm font-medium">
        <Icon size={18} className="mr-3" />
        {label}
      </span>
    </NavLink>
  );
}

export default function AppShell({ currentPageName, children }) {
  const { user } = useAuth();
  const isAdmin = !!(user && (user.role === 'admin' || user.email === 'vraymond@sparkfusiondigital.com' || user.email === 'support@logisticintel.com'));
  const canViewPro = isAdmin || checkFeatureAccess(user?.plan, 'pro');
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const breadcrumbs = useMemo(() => {
    const path = location.pathname.replace(/^\/+|\/+$/g, "");
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
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="flex min-h-screen">
        <aside className="w-64 shrink-0 bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 shadow-2xl hidden md:flex md:flex-col">
          <div className="flex items-center px-6 py-6 border-b border-white/10">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mr-3">
              <span className="text-white font-bold text-sm">LIT</span>
            </div>
            <div>
              <div className="text-white font-bold text-lg">Trade Intelligence</div>
              <div className="text-gray-300 text-xs">Logistic Intel</div>
            </div>
          </div>

          <div className="px-4 py-2 text-gray-400 text-xs font-semibold uppercase tracking-wider">Menu</div>
          <nav className="mb-4">
            <SideLink to="/app/dashboard" icon={BarChart3} label="Dashboard" />
            <SideLink to="/app/search" icon={Search} label="Search" />
            <SideLink to="/app/companies" icon={Building2} label="Command Center" />
            <SideLink to="/app/campaigns" icon={Mail} label="Campaigns" />
          </nav>

          <div className="px-4 py-2 text-gray-400 text-xs font-semibold uppercase tracking-wider">Tools</div>
          <nav className="mb-4">
            <SideLink to="/app/rfp" icon={FileText} label="RFP Studio" />
            <SideLink to="/app/widgets" icon={Package} label="Widgets" />
          </nav>

          <div className="px-4 py-2 text-gray-400 text-xs font-semibold uppercase tracking-wider">Account</div>
          <nav className="mb-4">
            <SideLink to="/app/settings" icon={Settings} label="Settings" />
            <SideLink to="/app/billing" icon={CreditCard} label="Billing" />
            <SideLink to="/app/affiliate" icon={Users2} label="Affiliate" />
          </nav>

          <div className="px-4 py-2 text-gray-400 text-xs font-semibold uppercase tracking-wider">Admin</div>
          <nav className="mb-6">
            <SideLink to="/app/admin" icon={Shield} label="Admin Dashboard" />
            <SideLink to="/app/prospecting" icon={TrendingUp} label="Lead Prospecting" />
            <SideLink to="/app/cms" icon={Database} label="CMS" />
            <SideLink to="/app/diagnostic" icon={Bug} label="Debug Agent" />
          </nav>
        </aside>
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 h-14 flex items-center justify-between px-4">
            <div className="flex items-center gap-3 min-w-0">
              <button className="md:hidden p-2 rounded-lg border text-gray-600" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                ☰
              </button>
              <nav className="hidden sm:flex items-center gap-2 text-sm text-gray-600 truncate">
                {breadcrumbs.slice(0, 1).map((b, idx) => (
                  <span key={idx} className="truncate">{b.label}</span>
                ))}
                {breadcrumbs.length > 1 && <span className="text-gray-400">›</span>}
                {breadcrumbs.slice(1).map((b, idx) => (
                  <span key={idx} className={`truncate ${idx === breadcrumbs.length - 2 ? "font-medium text-gray-900" : ""}`}>{b.label}</span>
                ))}
              </nav>
              <div className="sm:hidden font-medium text-gray-700 truncate">{currentPageName}</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="hidden sm:inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                onClick={() => window.location.href = "/app/settings"}
              >
                Profile
              </button>
              <button
                className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                onClick={async () => { try { await logout(); } finally { window.location.href = "/login"; } }}
              >
                Logout
              </button>
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white flex items-center justify-center text-xs font-bold">
                U
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto min-w-0 w-full flex gap-[5px] pl-[5px] pr-[5px]">
            <div className="flex-1 min-w-0 max-w-none">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 left-0 h-full w-72 bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 shadow-2xl p-4 text-white">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold">Menu</span>
              <button className="p-2 rounded-lg border border-white/20" onClick={() => setMobileOpen(false)} aria-label="Close menu">✕</button>
            </div>
            <nav className="space-y-1">
              <SideLink to="/app/dashboard" icon={BarChart3} label="Dashboard" />
              <SideLink to="/app/search" icon={Search} label="Search" />
              <SideLink to="/app/companies" icon={Building2} label="Command Center" />
              <SideLink to="/app/campaigns" icon={Mail} label="Campaigns" />
              <SideLink to="/app/rfp" icon={FileText} label="RFP Studio" />
              <SideLink to="/app/widgets" icon={Package} label="Widgets" />
              <SideLink to="/app/settings" icon={Settings} label="Settings" />
              <SideLink to="/app/billing" icon={CreditCard} label="Billing" />
              <SideLink to="/app/affiliate" icon={Users2} label="Affiliate" />
              <SideLink to="/app/admin" icon={Shield} label="Admin Dashboard" />
              <SideLink to="/app/prospecting" icon={TrendingUp} label="Lead Prospecting" />
              <SideLink to="/app/cms" icon={Database} label="CMS" />
              <SideLink to="/app/diagnostic" icon={Bug} label="Debug Agent" />
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}