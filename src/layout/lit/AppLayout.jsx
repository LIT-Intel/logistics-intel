import React, { useState } from "react";
import AppSidebar from "@/layout/lit/AppSidebar.jsx";
import AppHeader from "@/layout/lit/AppHeader.jsx";

type AppLayoutProps = {
  children: React.ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="lit-dashboard-shell flex min-h-screen">
      <AppSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <main className="lit-dashboard-page flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
