import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Users, TrendingUp, Megaphone, CreditCard, Wrench, LayoutDashboard,
  Loader2, Search as SearchIcon, ArrowUpRight, Send, Inbox, Shield,
  BarChart3, Truck, Handshake, Settings2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";

/**
 * Admin Command Deck — Phase 3 of the enterprise admin build. One shell,
 * six sections, dashboard visual language (per CLAUDE.md, the dashboard
 * is the design source of truth: Space Grotesk display, DM Sans body,
 * slate/blue palette, rounded-2xl cards).
 *
 *  Overview      — live KPIs computed from the Users 360 RPC + demo funnel
 *  Users & Orgs  — the 360 table (org, role, plan, engagement, consumption)
 *  Sales Funnel  — demo invites + inbound demo requests
 *  Marketing     — analytics + broadcasts
 *  Revenue       — subscribers / plans / Stripe state
 *  Operations    — FMCSA, partners, provider settings, legacy dashboard
 *
 * Detail pages keep their existing routes; the deck is the single front
 * door that replaces eight sidebar entries.
 */

type User360 = {
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  org_name: string | null;
  org_role: string | null;
  plan_code: string | null;
  sub_status: string | null;
  activity_30d: number;
  enrichments_total: number;
  profile_views_total: number;
};

const SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users & Orgs", icon: Users },
  { id: "funnel", label: "Sales Funnel", icon: TrendingUp },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "revenue", label: "Revenue", icon: CreditCard },
  { id: "ops", label: "Operations", icon: Wrench },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const KPI_TONES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  cyan: "bg-cyan-50 text-cyan-600",
  emerald: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  slate: "bg-slate-100 text-slate-500",
};

function KpiCard({ label, value, hint, icon: Icon, tone = "blue" }: {
  label: string; value: string | number; hint?: string; icon?: any; tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${KPI_TONES[tone] || KPI_TONES.blue}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div>
          <div className="font-mono text-[20px] font-bold leading-none text-slate-900">{value}</div>
          <div className="font-display mt-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">
            {label}
          </div>
          {hint && <div className="font-body mt-0.5 text-[10.5px] text-slate-400">{hint}</div>}
        </div>
      </div>
    </div>
  );
}

const PLAN_COLORS: Record<string, string> = {
  free_trial: "#94A3B8",
  starter: "#38BDF8",
  growth: "#2563EB",
  scale: "#7C3AED",
  enterprise: "#059669",
  none: "#E2E8F0",
};

function LinkCard({ to, icon: Icon, title, blurb }: { to: string; icon: any; title: string; blurb: string }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Icon className="h-4 w-4" />
        </span>
        <span className="font-display text-[14px] font-bold text-slate-900 group-hover:text-blue-700">
          {title}
        </span>
        <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-slate-300 group-hover:text-blue-500" />
      </div>
      <p className="font-body mt-2 text-[12.5px] leading-relaxed text-slate-500">{blurb}</p>
    </Link>
  );
}

function PlanPill({ plan, status }: { plan: string | null; status: string | null }) {
  const paid = status === "active" && plan && plan !== "free_trial";
  const trial = status === "trialing";
  const tone = paid
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : trial
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-slate-200 bg-slate-50 text-slate-500";
  return (
    <span className={`font-display inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}>
      {plan ? plan.replace("_", " ") : "—"}{status && status !== "active" && status !== "trialing" ? ` · ${status}` : ""}
    </span>
  );
}

export default function AdminCommandDeck() {
  const [params, setParams] = useSearchParams();
  const section = (params.get("section") as SectionId) || "overview";
  const [users, setUsers] = useState<User360[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [u, di] = await Promise.all([
        supabase.rpc("lit_admin_users_360"),
        supabase.from("lit_demo_invites").select("status, opened_at, signed_up_at, upgraded_at").limit(1000),
      ]);
      setUsers(((u.data as User360[]) || []).map((r) => ({
        ...r,
        activity_30d: Number(r.activity_30d) || 0,
        enrichments_total: Number(r.enrichments_total) || 0,
        profile_views_total: Number(r.profile_views_total) || 0,
      })));
      setInvites((di.data as any[]) || []);
      setLoading(false);
    })();
  }, []);

  const kpis = useMemo(() => {
    const now = Date.now();
    const wk = 7 * 24 * 3600 * 1000;
    const total = users.length;
    const new7d = users.filter((u) => now - new Date(u.created_at).getTime() < wk).length;
    const active7d = users.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < wk).length;
    const trialing = users.filter((u) => u.sub_status === "trialing").length;
    const paid = users.filter((u) => u.sub_status === "active" && u.plan_code && u.plan_code !== "free_trial").length;
    const invited = invites.length;
    const invOpened = invites.filter((i) => i.opened_at).length;
    const invSigned = invites.filter((i) => i.signed_up_at).length;
    const invPaid = invites.filter((i) => i.upgraded_at).length;
    return { total, new7d, active7d, trialing, paid, invited, invOpened, invSigned, invPaid };
  }, [users, invites]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.org_name || "").toLowerCase().includes(q) ||
        (u.plan_code || "").toLowerCase().includes(q),
    );
  }, [users, query]);

  const setSection = (id: SectionId) => setParams(id === "overview" ? {} : { section: id });

  // Chart data — computed client-side from the loaded rows.
  const charts = useMemo(() => {
    const now = new Date();
    // Signups per week, last 8 weeks.
    const weeks: { label: string; signups: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const start = new Date(now.getTime() - (w + 1) * 7 * 24 * 3600 * 1000);
      const end = new Date(now.getTime() - w * 7 * 24 * 3600 * 1000);
      weeks.push({
        label: `${end.getMonth() + 1}/${end.getDate()}`,
        signups: users.filter((u) => {
          const t = new Date(u.created_at).getTime();
          return t >= start.getTime() && t < end.getTime();
        }).length,
      });
    }
    // Plan distribution.
    const planCounts = new Map<string, number>();
    for (const u of users) {
      const key = u.plan_code || "none";
      planCounts.set(key, (planCounts.get(key) || 0) + 1);
    }
    const plans = Array.from(planCounts.entries())
      .map(([name, value]) => ({ name: name === "none" ? "no plan" : name.replace("_", " "), key: name, value }))
      .sort((a, b) => b.value - a.value);
    // Engagement split.
    const nowMs = now.getTime();
    const wk = 7 * 24 * 3600 * 1000;
    const active7 = users.filter((u) => u.last_sign_in_at && nowMs - new Date(u.last_sign_in_at).getTime() < wk).length;
    const active30 = users.filter((u) => {
      if (!u.last_sign_in_at) return false;
      const age = nowMs - new Date(u.last_sign_in_at).getTime();
      return age >= wk && age < 30 * 24 * 3600 * 1000;
    }).length;
    const dormant = users.length - active7 - active30;
    const engagement = [
      { name: "Active (7d)", value: active7, color: "#2563EB" },
      { name: "Active (30d)", value: active30, color: "#38BDF8" },
      { name: "Dormant", value: dormant, color: "#CBD5E1" },
    ].filter((e) => e.value > 0);
    return { weeks, plans, engagement };
  }, [users]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm">
            <Shield className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="font-display text-[19px] font-bold leading-tight text-slate-900">
              Admin Control Panel
            </h1>
            <p className="font-body text-[12px] text-slate-500">
              Users, funnel, marketing, and revenue in one place.
            </p>
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={[
              "font-display inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition",
              section === s.id
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
            ].join(" ")}
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-body text-[13px]">Loading…</span>
        </div>
      ) : (
        <>
          {section === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <KpiCard label="Total users" value={kpis.total} icon={Users} tone="blue" />
                <KpiCard label="New (7d)" value={kpis.new7d} icon={ArrowUpRight} tone="cyan" />
                <KpiCard label="Active (7d)" value={kpis.active7d} icon={TrendingUp} tone="violet" />
                <KpiCard label="Trialing" value={kpis.trialing} icon={LayoutDashboard} tone="amber" />
                <KpiCard label="Paying" value={kpis.paid} icon={CreditCard} tone="emerald" />
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
                  <div className="font-display mb-3 text-[13px] font-bold text-slate-900">
                    Signups per week
                  </div>
                  <div style={{ width: "100%", height: 190 }}>
                    <ResponsiveContainer>
                      <BarChart data={charts.weeks} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <ChartTooltip
                          cursor={{ fill: "rgba(37,99,235,0.06)" }}
                          contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12 }}
                        />
                        <Bar dataKey="signups" fill="#2563EB" radius={[5, 5, 0, 0]} maxBarSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="font-display mb-1 text-[13px] font-bold text-slate-900">
                    Plan distribution
                  </div>
                  <div style={{ width: "100%", height: 200 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={charts.plans}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={2}
                          strokeWidth={2}
                        >
                          {charts.plans.map((p) => (
                            <Cell key={p.key} fill={PLAN_COLORS[p.key] || "#94A3B8"} />
                          ))}
                        </Pie>
                        <ChartTooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12 }} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="font-display mb-1 text-[13px] font-bold text-slate-900">
                    Engagement
                  </div>
                  <div style={{ width: "100%", height: 200 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={charts.engagement}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={2}
                          strokeWidth={2}
                        >
                          {charts.engagement.map((e) => (
                            <Cell key={e.name} fill={e.color} />
                          ))}
                        </Pie>
                        <ChartTooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12 }} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="font-display mb-3 text-[13px] font-bold text-slate-900">
                  Demo-invite funnel
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard label="Invited" value={kpis.invited} />
                  <KpiCard label="Opened" value={kpis.invOpened} hint={kpis.invited ? `${Math.round((kpis.invOpened / kpis.invited) * 100)}%` : undefined} />
                  <KpiCard label="Signed up" value={kpis.invSigned} hint={kpis.invited ? `${Math.round((kpis.invSigned / kpis.invited) * 100)}%` : undefined} />
                  <KpiCard label="Upgraded" value={kpis.invPaid} />
                </div>
                <Link to="/app/demo-invites" className="font-display mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-700 hover:underline">
                  Open demo invitations <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}

          {section === "users" && (
            <div className="space-y-4">
              <div className="relative max-w-sm">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search email, name, org, plan…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] shadow-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[880px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      {["User", "Org / Role", "Plan", "Last seen", "Activity 30d", "Unlocks", "Enrichments"].map((h) => (
                        <th key={h} className="font-display px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.user_id} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50">
                        <td className="px-4 py-2.5">
                          <div className="font-display text-[13px] font-semibold text-slate-900">
                            {u.full_name || u.email.split("@")[0]}
                          </div>
                          <div className="font-body text-[11px] text-slate-500">
                            {u.email}
                            {!u.email_confirmed && (
                              <span className="ml-1.5 rounded bg-amber-50 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-600">
                                unconfirmed
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-body text-[12px] text-slate-700">{u.org_name || "—"}</div>
                          <div className="font-body text-[10.5px] capitalize text-slate-400">{u.org_role || ""}</div>
                        </td>
                        <td className="px-4 py-2.5"><PlanPill plan={u.plan_code} status={u.sub_status} /></td>
                        <td className="font-mono px-4 py-2.5 text-[11px] text-slate-500">
                          {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "never"}
                        </td>
                        <td className="font-mono px-4 py-2.5 text-[12px] text-slate-700">{u.activity_30d}</td>
                        <td className="font-mono px-4 py-2.5 text-[12px] text-slate-700">{u.profile_views_total}</td>
                        <td className="font-mono px-4 py-2.5 text-[12px] text-slate-700">{u.enrichments_total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="font-body text-[11.5px] text-slate-400">
                {filteredUsers.length} of {users.length} users · plan changes and suspensions live in{" "}
                <Link to="/app/admin/subscribers" className="text-blue-600 hover:underline">Subscribers</Link> for now.
              </p>
            </div>
          )}

          {section === "funnel" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <LinkCard to="/app/demo-invites" icon={Send} title="Demo invitations"
                blurb="Send personal demo invites and track every prospect: delivered, opened, signed up, upgraded — per sender." />
              <LinkCard to="/app/admin/demo-requests" icon={Inbox} title="Inbound demo requests"
                blurb="Marketing-site demo form submissions with status tracking and reply workflow." />
            </div>
          )}

          {section === "marketing" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <LinkCard to="/app/admin/marketing-analytics" icon={BarChart3} title="Marketing analytics"
                blurb="Site traffic, lead capture, attribution, and campaign performance." />
              <LinkCard to="/app/admin/marketing-broadcasts" icon={Megaphone} title="Broadcasts"
                blurb="One-off email sends to leads and subscriber segments." />
            </div>
          )}

          {section === "revenue" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <LinkCard to="/app/admin/subscribers" icon={CreditCard} title="Subscribers"
                blurb="Every subscription with Stripe state — change plans, comp accounts, suspend users." />
              <LinkCard to="/app/billing" icon={TrendingUp} title="Plans & pricing"
                blurb="The live plan matrix as customers see it." />
            </div>
          )}

          {section === "ops" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <LinkCard to="/app/admin/fmcsa-import" icon={Truck} title="FMCSA import"
                blurb="Carrier and broker registry data imports." />
              <LinkCard to="/app/admin/partner-program" icon={Handshake} title="Partner program"
                blurb="Affiliate applications, tiers, referrals, and payouts." />
              <LinkCard to="/app/admin/settings" icon={Settings2} title="Provider settings"
                blurb="API credentials and integration configuration." />
              <LinkCard to="/app/settings?tab=team" icon={Users} title="Workspace team"
                blurb="Your org's members, roles, page permissions, and invites." />
              <LinkCard to="/app/admin/legacy" icon={LayoutDashboard} title="Legacy dashboard"
                blurb="The previous admin dashboard, kept during the transition." />
            </div>
          )}
        </>
      )}
    </div>
  );
}
