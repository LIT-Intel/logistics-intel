import React from "react";
import AppLayout from "@/layout/lit/AppLayout.jsx";

export default function LITDashboard() {
  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50 p-4 md:p-6 lg:p-8">
        
        {/* HEADER */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">
            Welcome back, Valesco
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Here’s what’s happening with your logistics intelligence
          </p>
        </div>

        {/* KPI GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          
          <div className="bg-white rounded-xl border p-5">
            <div className="text-sm text-gray-500">Saved Companies</div>
            <div className="text-2xl font-semibold mt-2">21</div>
            <div className="text-xs text-green-600 mt-1">+12% this month</div>
          </div>

          <div className="bg-white rounded-xl border p-5">
            <div className="text-sm text-gray-500">Active Campaigns</div>
            <div className="text-2xl font-semibold mt-2">0</div>
            <div className="text-xs text-gray-400 mt-1">No campaigns yet</div>
          </div>

          <div className="bg-white rounded-xl border p-5">
            <div className="text-sm text-gray-500">Open RFPs</div>
            <div className="text-2xl font-semibold mt-2">0</div>
            <div className="text-xs text-gray-400 mt-1">Create your first RFP</div>
          </div>

          <div className="bg-white rounded-xl border p-5">
            <div className="text-sm text-gray-500">Searches Used</div>
            <div className="text-2xl font-semibold mt-2">3</div>
            <div className="text-xs text-gray-500 mt-1">All-time usage</div>
          </div>

        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* CHART AREA */}
          <div className="xl:col-span-2 bg-white rounded-xl border p-5">
            <div className="text-sm font-semibold text-gray-700 mb-4">
              Performance Trends
            </div>

            <div className="h-[300px] flex items-center justify-center text-gray-400">
              Chart goes here (next step)
            </div>
          </div>

          {/* ACTIVITY */}
          <div className="bg-white rounded-xl border p-5">
            <div className="text-sm font-semibold text-gray-700 mb-4">
              Activity Feed
            </div>

            <div className="space-y-3 text-sm text-gray-500">
              <div>Saved company • 2 days ago</div>
              <div>Saved company • 3 days ago</div>
              <div>Search executed • 3 days ago</div>
            </div>
          </div>

        </div>

        {/* LOWER GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">

          <div className="bg-white rounded-xl border p-5">
            <div className="text-sm font-semibold text-gray-700 mb-4">
              Traffic Summary
            </div>

            <div className="h-[260px] flex items-center justify-center text-gray-400">
              Bar chart here
            </div>
          </div>

          <div className="bg-white rounded-xl border p-5">
            <div className="text-sm font-semibold text-gray-700 mb-4">
              Global Trade Map
            </div>

            <div className="h-[260px] flex items-center justify-center text-gray-400">
              Map here
            </div>
          </div>

        </div>

      </div>
    </AppLayout>
  );
}
