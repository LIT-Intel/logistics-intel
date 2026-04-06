import React from "react";
import AppHeader from "@/layout/lit/AppHeader.jsx";

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen">
      <AppHeader sidebarOpen={true} setSidebarOpen={() => {}} />
      <main className="p-6">{children}</main>
    </div>
  );
}
