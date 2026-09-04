import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import AppSidebar from "@/layout/lit/AppSidebar.jsx";
import AppHeader from "@/layout/lit/AppHeader.jsx";
import {
  PulseCoachProvider,
  PulseCoachFloating,
} from "@/features/coach/PulseCoachWidget";

const SIDEBAR_STORAGE_KEY = "lit:sidebarOpen";

function readPersistedSidebarOpen() {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return true;
}

export default function AppLayout({ children }) {
  // Persist the user's collapse preference across page reloads — the
  // previous in-header chevron lost state on every navigation, which
  // made the collapse feature feel broken.
  const [sidebarOpen, setSidebarOpenState] = useState(readPersistedSidebarOpen);

  const setSidebarOpen = (next) => {
    const value = typeof next === "function" ? next(sidebarOpen) : next;
    setSidebarOpenState(value);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, value ? "1" : "0");
    } catch {
      /* swallow — UI still works without persistence */
    }
  };

  // Sync across tabs — when the user toggles in one tab, the other
  // updates without needing a refresh.
  useEffect(() => {
    function handleStorage(event) {
      if (event.key !== SIDEBAR_STORAGE_KEY || event.newValue == null) return;
      setSidebarOpenState(event.newValue === "1");
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

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

          <main className="flex-1 min-h-0 overflow-x-hidden px-[10px] py-4">
            {children}
          </main>
        </div>
      </div>
      {/* Floating Pulse Coach pill — the single Coach surface. Follows
          the user across every AppLayout-wrapped page and hovers over
          the dashboard's trade-lane map. (The old inline dashboard
          panel was removed 2026-08-13 — CEO: Coach appeared twice.)
          HIDDEN on /app/search: that page has its own contextual
          "Ask Harvey" panel grounded in the current results, so the
          global pill would be a duplicate Harvey (owner-flagged). */}
      {pageContext !== "search" ? <PulseCoachFloating /> : null}
    </PulseCoachProvider>
  );
}
