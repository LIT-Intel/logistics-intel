import React from "react";
import AppLayout from "../../layout/lit/AppLayout.jsx";

export default function LITDashboard() {
  return (
    <AppLayout>
      <div className="lit-dashboard-grid">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <div className="lit-kpi-card">
            <div className="lit-kpi-label">Companies Tracked</div>
            <div className="lit-kpi-value">1,284</div>
            <div className="lit-kpi-change positive">+12.4%</div>
          </div>

          <div className="lit-kpi-card">
            <div className="lit-kpi-label">Saved Companies</div>
            <div className="lit-kpi-value">342</div>
            <div className="lit-kpi-change positive">+8.1%</div>
          </div>

          <div className="lit-kpi-card">
            <div className="lit-kpi-label">Active Campaigns</div>
            <div className="lit-kpi-value">27</div>
            <div className="lit-kpi-change positive">+3.2%</div>
          </div>

          <div className="lit-kpi-card">
            <div className="lit-kpi-label">Opportunities</div>
            <div className="lit-kpi-value">89</div>
            <div className="lit-kpi-change negative">-2.4%</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="lit-dashboard-card xl:col-span-2">
            <div className="lit-dashboard-card-header">
              <div>
                <div className="lit-dashboard-title">Shipment Activity</div>
                <div className="lit-dashboard-subtitle">Monthly shipment trends</div>
              </div>
            </div>

            <div className="lit-dashboard-card-body">
              <div className="flex h-[300px] items-center justify-center text-[var(--lit-dashboard-muted)]">
                Chart coming next step
              </div>
            </div>
          </div>

          <div className="lit-dashboard-card">
            <div className="lit-dashboard-card-header">
              <div>
                <div className="lit-dashboard-title">Top Lanes</div>
                <div className="lit-dashboard-subtitle">Most active trade routes</div>
              </div>
            </div>

            <div className="lit-dashboard-card-body">
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>China → USA</span>
                  <span className="font-semibold">1,240</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Germany → USA</span>
                  <span className="font-semibold">860</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Vietnam → USA</span>
                  <span className="font-semibold">640</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>India → USA</span>
                  <span className="font-semibold">510</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lit-dashboard-card">
          <div className="lit-dashboard-card-header">
            <div>
              <div className="lit-dashboard-title">Recent Activity</div>
              <div className="lit-dashboard-subtitle">Latest actions across the platform</div>
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
      </div>
    </AppLayout>
  );
}
