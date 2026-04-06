import React from "react";
import AppLayout from "@/layout/lit/AppLayout.jsx";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const trendData = [
  { month: "Jan", companies: 6, contacts: 3 },
  { month: "Feb", companies: 8, contacts: 4 },
  { month: "Mar", companies: 7, contacts: 3 },
  { month: "Apr", companies: 11, contacts: 7 },
  { month: "May", companies: 13, contacts: 8 },
  { month: "Jun", companies: 12, contacts: 7 },
];

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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    Performance Trends
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Saved companies and enriched contacts over time
                  </div>
                </div>

                <div className="flex gap-6 text-sm">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Companies
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">28</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Contacts
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">13</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 h-[320px] rounded-xl border border-slate-100 bg-slate-50 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="companies"
                      radius={[6, 6, 0, 0]}
                      fill="#3b82f6"
                    />
                    <Bar
                      dataKey="contacts"
                      radius={[6, 6, 0, 0]}
                      fill="#6366f1"
                    />
                  </BarChart>
                </ResponsiveContainer>
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
