import React from "react";
import AppLayout from "@/layout/lit/AppLayout.jsx";

export default function LITDashboard() {
  return (
    <AppLayout>
      <div className="p-6">
        <div className="rounded-xl border p-6">
          <h1 className="text-2xl font-semibold">LITDashboard layout test</h1>
          <p className="mt-2 text-sm text-gray-500">
            This tests whether AppLayout and its imports compile cleanly.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
