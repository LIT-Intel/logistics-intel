// frontend/src/components/layout/AppShell.jsx
import React from "react";
import { Link, NavLink } from "react-router-dom";
import { Home, BarChart3, Search, Building2, Mail, Activity, FileText, Package, Settings, CreditCard, Users2, Shield, TrendingUp, Database, Bug } from "lucide-react";

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
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="flex min-h-screen">
        <aside className="w-64 shrink-0 bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 shadow-2xl hidden md:flex md:flex-col">
          <div className="flex items-center px-6 py-6 border-b border-white/10">
            <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-orange-500 rounded-lg flex items-center justify-center mr-3">
              <span className="text-white font-bold text-sm">LIT</span>
            </div>
            <div>
              <div className="text-white font-bold text-lg">Lahomes</div>
              <div className="text-gray-300 text-xs">LIVING LIFE</div>
            </div>
          </div>

          <div className="px-4 py-2 text-gray-400 text-xs font-semibold uppercase tracking-wider">Menu</div>
          <nav className="mb-4">
            <SideLink to="/app/dashboard" icon={BarChart3} label="Analytics" />
            <SideLink to="/app/search" icon={Search} label="Search" />
            <SideLink to="/app/companies" icon={Building2} label="Companies" />
            <SideLink to="/app/campaigns" icon={Mail} label="Campaigns" />
            <SideLink to="/app/transactions" icon={Activity} label="Transactions" />
          </nav>

          <div className="px-4 py-2 text-gray-400 text-xs font-semibold uppercase tracking-wider">Tools</div>
          <nav className="mb-4">
            <SideLink to="/app/rfp-studio" icon={FileText} label="RFP Studio" />
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
          <header className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-200 h-14 flex items-center justify-between px-4">
            <div className="font-medium text-gray-700">{currentPageName}</div>
            <div className="text-sm text-gray-600">Live</div>
          </header>
          <div className="p-4 md:p-6 flex-1 overflow-y-auto min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}