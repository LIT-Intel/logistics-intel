// frontend/src/components/layout/AppShell.jsx
import React from "react";
import { Link, NavLink } from "react-router-dom";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block px-3 py-2 rounded-md text-sm ${isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`
      }
    >
      {children}
    </NavLink>
  );
}

export default function AppShell({ currentPageName, children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex min-h-screen">
        <aside className="w-60 bg-white border-r p-4 hidden md:block">
          <Link to="/" className="flex items-center gap-2 mb-6">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a2395cf9b_logisticsintellogo1200x1200px2.png"
              alt="LIT"
              className="w-8 h-8"
            />
            <span className="font-semibold tracking-tight">Logistic Intel</span>
          </Link>
          <nav className="space-y-1">
            <NavItem to="/app/dashboard">Dashboard</NavItem>
            <NavItem to="/app/search">Search</NavItem>
            <NavItem to="/app/companies">Companies</NavItem>
            <NavItem to="/app/campaigns">Campaigns</NavItem>
            <NavItem to="/app/email">Email</NavItem>
            <NavItem to="/app/settings">Settings</NavItem>
          </nav>
        </aside>
        <main className="flex-1">
          <header className="h-14 bg-white border-b flex items-center justify-between px-4">
            <div className="font-medium text-gray-700">{currentPageName}</div>
            <div className="text-sm text-gray-600">Logged in</div>
          </header>
          <div className="p-4">{children}</div>
        </main>
      </div>
    </div>
  );
}