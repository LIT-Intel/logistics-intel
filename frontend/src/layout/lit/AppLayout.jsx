import React, { useState } from "react";
import AppSidebar from "@/layout/lit/AppSidebar.jsx";
import AppHeader from "@/layout/lit/AppHeader.jsx";

export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
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

        <main className="flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
