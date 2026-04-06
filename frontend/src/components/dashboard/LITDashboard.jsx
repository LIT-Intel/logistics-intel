import React from "react";
import AppLayout from "@/layout/lit/AppLayout.jsx";

export default function LITDashboard() {
  return (
    <AppLayout>
      <div className="min-h-full bg-slate-100 p-6">
        <div className="mx-auto max-w-[1400px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-3xl font-semibold text-slate-900">
              LIT Dashboard
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Dashboard body render test
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
