import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Building2,
  CreditCard,
  ShieldCheck,
  BarChart3,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

// ── helpers ──────────────────────────────────────────────────────────────────

async function callAdminApi(action, params = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("No active session");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/admin-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ action, params }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

const PLAN_LABELS = {
  free_trial: "Free Trial",
  standard: "Standard",
  growth: "Growth",
  pro: "Pro",
  enterprise: "Enterprise",
  unlimited: "Unlimited",
};

const PLAN_COLORS = {
  free_trial: "bg-slate-100 text-slate-600",
  standard: "bg-blue-50 text-blue-700",
  growth: "bg-indigo-50 text-indigo-700",
  pro: "bg-violet-50 text-violet-700",
  enterprise: "bg-emerald-50 text-emerald-700",
  unlimited: "bg-amber-50 text-amber-700",
};

function Badge({ plan }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        PLAN_COLORS[plan] || "bg-slate-100 text-slate-600"
      }`}
    >
      {PLAN_LABELS[plan] || plan}
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon, color = "indigo" }) {
  const colorMap = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        {Icon && (
          <div className={`rounded-xl p-3 ${colorMap[color] || colorMap.indigo}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function OverviewTab() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callAdminApi("get_kpis");
      setKpis(res.kpis);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-12 text-center text-slate-400">Loading KPIs…</div>;
  if (error) return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!kpis) return null;

  const totalActive = Object.values(kpis.planBreakdown).reduce((a, b) => a + b, 0);
  const inviteTotal = Object.values(kpis.inviteFunnel).reduce((a, b) => a + b, 0);
  const inviteAcceptRate =
    inviteTotal > 0
      ? Math.round((kpis.inviteFunnel.accepted / inviteTotal) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Users"
          value={kpis.totalUsers.toLocaleString()}
          sub="unique across all orgs"
          icon={Users}
          color="indigo"
        />
        <StatCard
          label="Organizations"
          value={kpis.totalOrgs.toLocaleString()}
          icon={Building2}
          color="emerald"
        />
        <StatCard
          label="Active Subscriptions"
          value={totalActive.toLocaleString()}
          icon={CreditCard}
          color="violet"
        />
        <StatCard
          label="Invite Accept Rate"
          value={`${inviteAcceptRate}%`}
          sub={`${kpis.inviteFunnel.accepted} accepted / ${inviteTotal} sent`}
          icon={ShieldCheck}
          color="amber"
        />
      </div>

      {/* Plan breakdown */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-slate-900">Plan Breakdown</h3>
        <div className="space-y-3">
          {Object.entries(kpis.planBreakdown).map(([plan, count]) => {
            const pct = totalActive > 0 ? Math.round((count / totalActive) * 100) : 0;
            return (
              <div key={plan} className="flex items-center gap-4">
                <div className="w-24 shrink-0">
                  <Badge plan={plan} />
                </div>
                <div className="flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-2.5 rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-semibold text-slate-700">
                  {count}
                </span>
              </div>
            );
          })}
          {Object.keys(kpis.planBreakdown).length === 0 && (
            <p className="text-sm text-slate-400">No active subscriptions yet.</p>
          )}
        </div>
      </div>

      {/* Invite funnel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-slate-900">Invite Funnel</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          {Object.entries(kpis.inviteFunnel).map(([status, count]) => (
            <div key={status} className="rounded-xl bg-slate-50 p-4">
              <p className="text-2xl font-bold text-slate-900">{count}</p>
              <p className="mt-1 text-xs font-medium capitalize text-slate-500">{status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callAdminApi("get_users", { page, perPage: 25 });
      setUsers(res.users || []);
      setTotal(res.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{total} total users</p>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {loading && <div className="py-12 text-center text-slate-400">Loading…</div>}
      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">User</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Organization</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Role</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Plan</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {users.map((u) => (
                <tr key={u.userId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{u.fullName || "—"}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{u.orgName || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="capitalize text-slate-700">{u.orgRole}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge plan={u.plan} />
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {total > 25 && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page} of {Math.ceil(total / 25)}
          </span>
          <button
            disabled={page >= Math.ceil(total / 25)}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function OrgsTab() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingPlan, setUpdatingPlan] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callAdminApi("get_orgs");
      setOrgs(res.orgs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changePlan(orgId, plan) {
    setUpdatingPlan(orgId);
    try {
      await callAdminApi("update_org_plan", { orgId, plan });
      setOrgs((prev) =>
        prev.map((o) => (o.id === orgId ? { ...o, plan } : o))
      );
    } catch (e) {
      alert(e.message);
    } finally {
      setUpdatingPlan(null);
    }
  }

  if (loading) return <div className="py-12 text-center text-slate-400">Loading…</div>;
  if (error) return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="px-4 py-3 font-semibold text-slate-600">Organization</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Members</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Plan</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Created</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Change Plan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {orgs.map((org) => (
            <tr key={org.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{org.name}</td>
              <td className="px-4 py-3 text-slate-600">{org.memberCount}</td>
              <td className="px-4 py-3">
                <Badge plan={org.plan} />
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    org.subscriptionStatus === "active"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {org.subscriptionStatus || "—"}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-400">
                {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : "—"}
              </td>
              <td className="px-4 py-3">
                <select
                  value={org.plan}
                  disabled={updatingPlan === org.id}
                  onChange={(e) => changePlan(org.id, e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none"
                >
                  {Object.entries(PLAN_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
          {orgs.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                No organizations found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MembershipsTab() {
  const [orgs, setOrgs] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    callAdminApi("get_orgs")
      .then((res) => setOrgs(res.orgs || []))
      .catch(() => {});
  }, []);

  async function loadMembers(orgId) {
    setSelectedOrg(orgId);
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await callAdminApi("get_org_members", { orgId });
      setMembers(res.members || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function changeRole(memberId, role) {
    setActionLoading(memberId + ":role");
    try {
      await callAdminApi("update_member_role", { memberId, role });
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    } catch (e) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function removeMember(memberId) {
    if (!confirm("Remove this member from the organization?")) return;
    setActionLoading(memberId + ":remove");
    try {
      await callAdminApi("remove_member", { memberId });
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (e) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Select Organization:</label>
        <select
          value={selectedOrg}
          onChange={(e) => loadMembers(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">— choose org —</option>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="py-8 text-center text-slate-400">Loading members…</div>}
      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!loading && !error && selectedOrg && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Member</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Role</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Joined</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{m.fullName || "—"}</div>
                    <div className="text-xs text-slate-400">{m.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={m.role}
                      disabled={actionLoading === m.id + ":role"}
                      onChange={(e) => changeRole(m.id, e.target.value)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-500 capitalize">{m.status}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {m.role !== "owner" && (
                      <button
                        disabled={!!actionLoading}
                        onClick={() => removeMember(m.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No members found for this organization.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BillingTab() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingPlan, setUpdatingPlan] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callAdminApi("get_orgs");
      setOrgs(res.orgs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changePlan(orgId, plan) {
    setUpdatingPlan(orgId);
    try {
      await callAdminApi("update_org_plan", { orgId, plan });
      setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, plan } : o)));
    } catch (e) {
      alert(e.message);
    } finally {
      setUpdatingPlan(null);
    }
  }

  if (loading) return <div className="py-12 text-center text-slate-400">Loading…</div>;
  if (error) return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Manually override plan assignments per organization. Changes take effect immediately.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold text-slate-600">Organization</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Current Plan</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Sub Status</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Members</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Override Plan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {orgs.map((org) => (
              <tr key={org.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{org.name}</td>
                <td className="px-4 py-3">
                  <Badge plan={org.plan} />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`capitalize text-xs font-semibold ${
                      org.subscriptionStatus === "active"
                        ? "text-emerald-600"
                        : "text-slate-400"
                    }`}
                  >
                    {org.subscriptionStatus || "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{org.memberCount}</td>
                <td className="px-4 py-3">
                  <select
                    value={org.plan}
                    disabled={updatingPlan === org.id}
                    onChange={(e) => changePlan(org.id, e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                  >
                    {Object.entries(PLAN_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No organizations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "users", label: "Users", icon: Users },
  { id: "orgs", label: "Organizations", icon: Building2 },
  { id: "memberships", label: "Memberships", icon: ShieldCheck },
  { id: "billing", label: "Billing", icon: CreditCard },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!loading && !isSuperAdmin) {
      navigate("/app/dashboard", { replace: true });
    }
  }, [isSuperAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-indigo-600">
            <ShieldCheck className="h-3.5 w-3.5" /> Superadmin
          </div>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Admin Control Center</h1>
          <p className="mt-1 text-sm text-slate-500">
            Platform-level overview, user management, and billing controls.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-200">
          <nav className="-mb-px flex gap-6 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "flex shrink-0 items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors",
                    isActive
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-slate-500 hover:text-slate-700",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab content */}
        <div>
          {activeTab === "overview" && <OverviewTab />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "orgs" && <OrgsTab />}
          {activeTab === "memberships" && <MembershipsTab />}
          {activeTab === "billing" && <BillingTab />}
        </div>
      </div>
    </div>
  );
}
