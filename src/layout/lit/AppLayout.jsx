import React, { useState } from "react";
import AppSidebar from "./AppSidebar.jsx";
import AppHeader from "./AppHeader.jsx";

const AppLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="lit-dashboard-shell flex">
      {/* Sidebar */}
      <AppSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <AppHeader
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        {/* Page Content */}
        <main className="lit-dashboard-page flex-1">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
