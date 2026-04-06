import React from "react";
import AppLayout from "@/layout/lit/AppLayout.jsx";

type StatCardProps = {
  label: string;
  value: string;
  change: string;
  positive?: boolean;
};

function StatCard({ label, value, change, positive = true }: StatCardProps) {
  return (
    <div className="lit-kpi-card">
      <div className="lit-kpi-label">{label}</div>
      <div className="lit-kpi-value">{value}</div>
      <div className={`lit-kpi-change ${positive ? "positive" : "negative"}`}>
        {change}
      </div>
    </div>
  );
}

export default function LITDashboard() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="lit-dashboard-card xl:col-span-7">
            <div className="lit-dashboard-card-body">
              <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr] lg:items-center">
                <div>
                  <div className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--lit-dashboard-muted)]">
                    Overview
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-[var(--lit-dashboard-title)]">
                    Logistic Intel Dashboard
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--lit-dashboard-muted)]">
                    Admin users get the full operating view across products,
                    usage, pipeline, and activity. Standard users should only
                    see the products and modules included in their subscription.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="rounded-xl bg-[var(--lit-dashboard-brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--lit-dashboard-brand-hover)]"
                    >
                      Create Report
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-[var(--lit-dashboard-card-border)] px-4 py-2 text-sm font-semibold text-[var(--lit-dashboard-title)] transition hover:bg-white/50"
                    >
                      Manage Access
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--lit-dashboard-card-border)] bg-[var(--lit-dashboard-brand-soft)] p-5">
                  <div className="text-sm font-semibold text-[var(--lit-dashboard-title)]">
                    Role visibility
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-[var(--lit-dashboard-text)]">
                    <div className="flex items-center justify-between">
                      <span>Admin view</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--lit-dashboard-brand)]">
                        Full platform
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Standard user</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--lit-dashboard-brand)]">
                        Subscribed modules only
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Current state</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-600">
                        UI shell only
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lit-dashboard-card xl:col-span-5">
            <div className="lit-dashboard-card-header">
              <div>
                <div className="lit-dashboard-title">Access Snapshot</div>
                <div className="lit-dashboard-subtitle">
                  What the dashboard should control by role
                </div>
              </div>
            </div>

            <div className="lit-dashboard-card-body">
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--lit-dashboard-card-border)] p-4">
                  <div className="text-sm font-semibold text-[var(--lit-dashboard-title)]">
                    Admin
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[var(--lit-dashboard-muted)]">
                    Full KPI stack, campaign analytics, user management, audit
                    logs, billing controls, and product-level usage visibility.
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--lit-dashboard-card-border)] p-4">
                  <div className="text-sm font-semibold text-[var(--lit-dashboard-title)]">
                    Standard User
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[var(--lit-dashboard-muted)]">
                    Only dashboards, widgets, and actions tied to active
                    subscriptions and plan entitlements.
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--lit-dashboard-card-border)] p-4">
                  <div className="text-sm font-semibold text-[var(--lit-dashboard-title)]">
                    Next Implementation
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[var(--lit-dashboard-muted)]">
                    Replace placeholders with live Supabase metrics and role
                    gating.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Tracked Companies"
            value="1,284"
            change="+12.4% this month"
            positive={true}
          />
          <StatCard
            label="Saved Companies"
            value="342"
            change="+8.1% this month"
            positive={true}
          />
          <StatCard
            label="Active Campaigns"
            value="27"
            change="+3.2% this week"
            positive={true}
          />
          <StatCard
            label="Open Opportunities"
            value="89"
            change="-2.4% vs last week"
            positive={false}
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="lit-dashboard-card xl:col-span-8">
            <div className="lit-dashboard-card-header">
              <div>
                <div className="lit-dashboard-title">Platform Activity</div>
                <div className="lit-dashboard-subtitle">
                  Tabler-inspired KPI and chart zone for the admin view
                </div>
              </div>
            </div>

            <div className="lit-dashboard-card-body">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-[var(--lit-dashboard-card-border)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--lit-dashboard-muted)]">
                    Shipment trend
                  </div>
                  <div className="mt-3 h-28 rounded-xl bg-[var(--lit-dashboard-brand-soft)]" />
                </div>

                <div className="rounded-xl border border-[var(--lit-dashboard-card-border)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--lit-dashboard-muted)]">
                    CRM growth
                  </div>
                  <div className="mt-3 h-28 rounded-xl bg-[var(--lit-dashboard-brand-soft)]" />
                </div>

                <div className="rounded-xl border border-[var(--lit-dashboard-card-border)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--lit-dashboard-muted)]">
                    Campaign output
                  </div>
                  <div className="mt-3 h-28 rounded-xl bg-[var(--lit-dashboard-brand-soft)]" />
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-dashed border-[var(--lit-dashboard-card-border)] p-4 text-sm text-[var(--lit-dashboard-muted)]">
                Chart placeholders only for now. We will wire these to real LIT
                metrics after the layout compiles cleanly.
              </div>
            </div>
          </div>

          <div className="lit-dashboard-card xl:col-span-4">
            <div className="lit-dashboard-card-header">
              <div>
                <div className="lit-dashboard-title">Top Lanes</div>
                <div className="lit-dashboard-subtitle">
                  Most active trade routes
                </div>
              </div>
            </div>

            <div className="lit-dashboard-card-body">
              <div className="space-y-4">
                {[
                  ["China → USA", "1,240"],
                  ["Germany → USA", "860"],
                  ["Vietnam → USA", "640"],
                  ["India → USA", "510"],
                  ["Mexico → USA", "402"],
                ].map(([lane, value]) => (
                  <div
                    key={lane}
                    className="flex items-center justify-between rounded-xl border border-[var(--lit-dashboard-card-border)] px-4 py-3"
                  >
                    <span className="text-sm text-[var(--lit-dashboard-text)]">
                      {lane}
                    </span>
                    <span className="text-sm font-semibold text-[var(--lit-dashboard-title)]">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="lit-dashboard-card xl:col-span-7">
            <div className="lit-dashboard-card-header">
              <div>
                <div className="lit-dashboard-title">Recent Activity</div>
                <div className="lit-dashboard-subtitle">
                  Latest actions across the platform
                </div>
              </div>
            </div>

            <div className="lit-dashboard-card-body">
              <table className="lit-section-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Action</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Walmart Inc.</td>
                    <td>Added to CRM</td>
                    <td>Apr 5, 2026</td>
                    <td>Active</td>
                  </tr>
                  <tr>
                    <td>Rivian Automotive</td>
                    <td>Campaign Started</td>
                    <td>Apr 4, 2026</td>
                    <td>Running</td>
                  </tr>
                  <tr>
                    <td>Samsung Electronics</td>
                    <td>Enrichment Completed</td>
                    <td>Apr 3, 2026</td>
                    <td>Done</td>
                  </tr>
                  <tr>
                    <td>Porsche AG</td>
                    <td>Saved to Command Center</td>
                    <td>Apr 2, 2026</td>
                    <td>Active</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="lit-dashboard-card xl:col-span-5">
            <div className="lit-dashboard-card-header">
              <div>
                <div className="lit-dashboard-title">Tasks & Notes</div>
                <div className="lit-dashboard-subtitle">
                  Admin-only operating items
                </div>
              </div>
            </div>

            <div className="lit-dashboard-card-body">
              <div className="space-y-3">
                {[
                  "Finalize dashboard role gating",
                  "Connect live metrics from Supabase",
                  "Add user management summary cards",
                  "Wire billing visibility by subscription",
                ].map((item) => (
                  <label
                    key={item}
                    className="flex items-start gap-3 rounded-xl border border-[var(--lit-dashboard-card-border)] px-4 py-3"
                  >
                    <input type="checkbox" className="mt-1" />
                    <span className="text-sm text-[var(--lit-dashboard-text)]">
                      {item}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
