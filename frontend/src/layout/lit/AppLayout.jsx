import React, { useState } from "react";
import AppSidebar from "@/layout/lit/AppSidebar.jsx";
import AppHeader from "@/layout/lit/AppHeader.jsx";

export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen flex">
      <AppSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      <div className="min-h-screen flex-1 flex flex-col">
        <AppHeader
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <main className="p-6 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
