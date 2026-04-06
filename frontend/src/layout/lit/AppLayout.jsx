import React from "react";

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen p-6">
      {children}
    </div>
  );
}
