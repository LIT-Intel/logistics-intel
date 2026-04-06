import React from "react";
import AppLayout from "@/layout/lit/AppLayout.jsx";

function StatCard({ title, value, note, change, changeClass = "text-green-600" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {title}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <div className="text-3xl font-semibold text-slate-900">{value}</div>
        {change ? <div className={`text-sm font-semibold ${changeClass}`}>{change}</div> : null}
      </div>
      <div className="mt-2 text-sm text-slate-500">{note}</div>
    </div>
  );
}

export default function LITDashboard() {
  return (
    <AppLayout>
      <div className="min-h-full bg-slate-100 p-4 md:p-6 xl:p-8">
        <div className="mx-auto max-w-[1600px] space-y-6">
          <section>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Overview
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Welcome back, Valesco
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              This dashboard is your command center for company intelligence,
              campaign activity, search usage, and product visibility.
            </p>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Saved Companies"
              value="21"
              change="+12%"
              note="vs last month"
            />
            <StatCard
              title="Active Campaigns"
              value="0"
              note="No campaigns yet"
              change=""
            />
            <StatCard
              title="Open RFPs"
              value="0"
              note="Create your first RFP"
              change=""
            />
            <StatCard
              title="Searches Used"
              value="3"
              note="All-time usage"
              change=""
            />
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-800">
                Performance Trends
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Saved companies and campaign activity over time
              </div>

              <div className="mt-4 flex h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
                Chart goes here next
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-800">
                Activity Feed
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Recent actions and updates
              </div>

              <div className="mt-5 space-y-3">
                {[
                  "Saved company • 2 days ago",
                  "Saved company • 3 days ago",
                  "Search executed • 3 days ago",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
