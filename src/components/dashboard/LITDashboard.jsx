import React from "react";
import AppLayout from "@/layout/lit/AppLayout";

export default function LITDashboard() {
  return (
    <AppLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Dashboard
          </h1>
          <p className="text-sm text-gray-500">
            Overview of your logistics intelligence
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          
          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-sm text-gray-500">Total Shipments</p>
            <h2 className="text-2xl font-semibold mt-2">12,483</h2>
          </div>

          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-sm text-gray-500">Active Companies</p>
            <h2 className="text-2xl font-semibold mt-2">1,284</h2>
          </div>

          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-sm text-gray-500">TEUs (12m)</p>
            <h2 className="text-2xl font-semibold mt-2">89,320</h2>
          </div>

          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-sm text-gray-500">Estimated Spend</p>
            <h2 className="text-2xl font-semibold mt-2">$24.3M</h2>
          </div>

        </div>

        {/* Placeholder Chart Section */}
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-medium mb-4">Shipment Activity</h3>
          <div className="h-64 flex items-center justify-center text-gray-400">
            Chart coming next step
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
