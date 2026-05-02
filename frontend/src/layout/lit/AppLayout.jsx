import React, { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import AppSidebar from "@/layout/lit/AppSidebar.jsx";
import AppHeader from "@/layout/lit/AppHeader.jsx";
import {
  PulseCoachProvider,
  PulseCoachFloating,
} from "@/features/coach/PulseCoachWidget";

export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  // Derive a coarse page-context label so Pulse Coach can prioritize
  // nudges relevant to where the user is (dashboard / company-profile /
  // campaigns / contacts / search).
  const pageContext = useMemo(() => {
    const p = String(location?.pathname || "");
    if (/^\/app\/dashboard/.test(p)) return "dashboard";
    if (/^\/app\/companies\/[^/]+/.test(p)) return "company-profile";
    if (/^\/app\/companies/.test(p)) return "saved-companies";
    if (/^\/app\/campaigns/.test(p)) return "campaigns";
    if (/^\/app\/search/.test(p)) return "search";
    if (/^\/app\/contacts/.test(p)) return "contacts";
    if (/^\/app\/billing/.test(p)) return "billing";
    if (/^\/app\/settings/.test(p)) return "settings";
    return "app";
  }, [location?.pathname]);

  return (
    <PulseCoachProvider pageContext={pageContext}>
      <div className="min-h-screen bg-slate-100 md:flex">
        <AppSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <AppHeader
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          <main className="flex-1 overflow-x-hidden px-[10px] py-4">
            {children}
          </main>
        </div>
      </div>
      {/* Floating Pulse Coach pill — follows the user across every
          AppLayout-wrapped page. Inline render still happens on the
          Dashboard via PulseCoachInline; both share the same provider. */}
      <PulseCoachFloating />
    </PulseCoachProvider>
  );
}
