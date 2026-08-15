import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Users, TrendingUp, Megaphone, CreditCard, Wrench, LayoutDashboard,
  Loader2, Search as SearchIcon, ArrowUpRight, Send, Inbox, Shield,
  BarChart3, Truck, Handshake, Settings2,
  Coins, Database, Zap, Percent, Timer, Gauge, Power, AlertTriangle,
  RefreshCw, Check, X, Pencil,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip,
  CartesianGrid, PieChart, Pie, Cell, Legend, AreaChart, Area,
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
  signup_source: string | null;
  signup_landing: string | null;
};

// ── Data-economics / activation types (mirror the RPC return shapes) ──────────
type EconomicsSummary = {
  credits_remaining: number | null;
  balance_updated_at: string | null;
  credits_used_today: number | null;
  credits_used_7d: number | null;
  credits_used_period: number | null;
  cost_usd_today: number | null;
  cost_usd_7d: number | null;
  cost_usd_period: number | null;
  calls_today: number | null;
  cache_hit_rate_7d: number | null;
  active_paid_customers: number | null;
  cost_per_paid_customer_period: number | null;
  avg_daily_burn_7d: number | null;
  days_remaining: number | null;
  projected_exhaustion_date: string | null;
  mrr_usd: number | null;
  mrr_is_complete: boolean | null;
  contribution_margin_pct: number | null;
  is_placeholder_pricing: boolean | null;
  period_start: string | null;
  generated_at?: string | null;
};

type BurnPoint = { day: string; credits_consumed: number; cost_usd: number; calls: number; cache_hits: number };
type UsageRow = {
  operation: string; calls: number; credits_consumed: number; cost_usd: number;
  cache_hits: number; cache_hit_rate: number; distinct_users: number; distinct_orgs: number;
};
type TopConsumer = {
  organization_id: string | null; user_id: string | null; subscription_tier: string | null;
  credits_consumed: number; cost_usd: number; calls: number;
};
type ProviderFlag = { key: string; label: string; enabled: boolean; updated_at: string | null };
type AcqRow = {
  source: string; signups: number; searched: number; saved: number;
  trial_started: number; converted: number; new_mrr: number;
};
type CampaignRow = {
  campaign: string; invited: number; delivered: number; opened: number; clicked: number;
  clicked_resend: number; signed_up: number; trial_started: number; converted: number; revenue_mrr: number;
};
type CohortRow = { cohort: string; cohort_size: number; weeks_since: number; retained: number; retained_pct: number };
// Aggregated activation milestones for the exec strip (from lit_user_activation).
type Activation = { signups: number; searched: number; saved: number; returned_d7: number; trial: number; converted: number };

const num = (v: any): number => (v === null || v === undefined ? 0 : Number(v) || 0);
const usd = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const int = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : Math.round(Number(v)).toLocaleString();
const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}%`;

const SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users & Orgs", icon: Users },
  { id: "funnel", label: "Sales Funnel", icon: TrendingUp },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "revenue", label: "Data Economics", icon: CreditCard },
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

function KpiCard({ label, value, hint, icon: Icon, tone = "blue", tooltip, badge }: {
  label: string; value: string | number; hint?: string; icon?: any; tone?: string;
  tooltip?: string; badge?: string;
}) {
  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm" title={tooltip}>
      {badge && (
        <span className="absolute right-2 top-2 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.04em] text-amber-600">
          {badge}
        </span>
      )}
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

// Section-card wrapper matching the deck's rounded-2xl / shadow-sm cards.
function DeckCard({ title, subtitle, right, children, className = "" }: {
  title?: string; subtitle?: string; right?: any; children: any; className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <div className="font-display text-[13px] font-bold text-slate-900">{title}</div>}
            {subtitle && <div className="font-body mt-0.5 text-[11.5px] text-slate-400">{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
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

  // ── Data-economics + activation/attribution state ──────────────────────────
  const [econ, setEcon] = useState<EconomicsSummary | null>(null);
  const [burn, setBurn] = useState<BurnPoint[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [topConsumers, setTopConsumers] = useState<TopConsumer[]>([]);
  const [flags, setFlags] = useState<ProviderFlag[]>([]);
  const [pricing, setPricing] = useState<any[]>([]);
  const [acq, setAcq] = useState<AcqRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [activation, setActivation] = useState<Activation>({ signups: 0, searched: 0, saved: 0, returned_d7: 0, trial: 0, converted: 0 });
  const [econBusy, setEconBusy] = useState(false);

  // Reusable loader for the economics + attribution surfaces (also the Refresh button).
  const loadEconomics = useCallback(async () => {
    setEconBusy(true);
    const [e, b, ub, tc, fl, pr, ac, cf, ch, actRows] = await Promise.all([
      supabase.rpc("lit_admin_provider_economics_summary"),
      supabase.rpc("lit_admin_provider_burn_series", { p_days: 30 }),
      supabase.rpc("lit_admin_provider_usage_breakdown", { p_days: 7 }),
      supabase.rpc("lit_admin_provider_top_consumers", { p_days: 30, p_limit: 15 }),
      supabase.rpc("lit_admin_get_provider_flags"),
      supabase.from("provider_pricing").select("provider, operation, credit_cost, usd_cost_per_credit, active").eq("active", true).order("provider").order("operation"),
      supabase.rpc("lit_admin_acquisition_funnel"),
      supabase.rpc("lit_admin_campaign_funnel"),
      supabase.rpc("lit_admin_retention_cohorts", { p_grain: "week" }),
      supabase.from("lit_user_activation").select("first_search_at, first_save_at, returned_d7_at, trial_started_at, converted_paid_at").limit(5000),
    ]);
    setEcon((e.data as EconomicsSummary) || null);
    setBurn(((b.data as BurnPoint[]) || []).map((r) => ({
      day: r.day, credits_consumed: num(r.credits_consumed), cost_usd: num(r.cost_usd), calls: num(r.calls), cache_hits: num(r.cache_hits),
    })));
    setUsage(((ub.data as UsageRow[]) || []).map((r) => ({
      ...r, calls: num(r.calls), credits_consumed: num(r.credits_consumed), cost_usd: num(r.cost_usd),
      cache_hits: num(r.cache_hits), cache_hit_rate: num(r.cache_hit_rate), distinct_users: num(r.distinct_users), distinct_orgs: num(r.distinct_orgs),
    })));
    setTopConsumers(((tc.data as TopConsumer[]) || []).map((r) => ({
      ...r, credits_consumed: num(r.credits_consumed), cost_usd: num(r.cost_usd), calls: num(r.calls),
    })));
    setFlags((fl.data as ProviderFlag[]) || []);
    setPricing((pr.data as any[]) || []);
    setAcq(((ac.data as AcqRow[]) || []).map((r) => ({
      source: r.source, signups: num(r.signups), searched: num(r.searched), saved: num(r.saved),
      trial_started: num(r.trial_started), converted: num(r.converted), new_mrr: num(r.new_mrr),
    })));
    setCampaigns(((cf.data as CampaignRow[]) || []).map((r) => ({
      campaign: r.campaign, invited: num(r.invited), delivered: num(r.delivered), opened: num(r.opened),
      clicked: num(r.clicked), clicked_resend: num(r.clicked_resend), signed_up: num(r.signed_up),
      trial_started: num(r.trial_started), converted: num(r.converted), revenue_mrr: num(r.revenue_mrr),
    })));
    setCohorts(((ch.data as CohortRow[]) || []).map((r) => ({
      cohort: r.cohort, cohort_size: num(r.cohort_size), weeks_since: num(r.weeks_since),
      retained: num(r.retained), retained_pct: num(r.retained_pct),
    })));
    const rows = (actRows.data as any[]) || [];
    setActivation({
      signups: rows.length,
      searched: rows.filter((r) => r.first_search_at).length,
      saved: rows.filter((r) => r.first_save_at).length,
      returned_d7: rows.filter((r) => r.returned_d7_at).length,
      trial: rows.filter((r) => r.trial_started_at).length,
      converted: rows.filter((r) => r.converted_paid_at).length,
    });
    setEconBusy(false);
  }, []);

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
      // Economics/attribution loads in parallel; failures degrade to empty states.
      loadEconomics().catch(() => setEconBusy(false));
    })();
  }, [loadEconomics]);

  // New MRR for the exec strip = sum of per-source acquisition MRR.
  const newMrr = useMemo(() => acq.reduce((s, r) => s + num(r.new_mrr), 0), [acq]);

  // Kill-switch toggle: confirm before flipping (pauses live spend), optimistic UI.
  const [pendingFlag, setPendingFlag] = useState<{ key: string; label: string; next: boolean } | null>(null);
  const [flagBusy, setFlagBusy] = useState<string | null>(null);

  const requestFlagToggle = (f: ProviderFlag) => setPendingFlag({ key: f.key, label: f.label, next: !f.enabled });

  const confirmFlagToggle = async () => {
    if (!pendingFlag) return;
    const { key, next } = pendingFlag;
    setPendingFlag(null);
    setFlagBusy(key);
    // Optimistic.
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: next } : f)));
    const { data, error } = await supabase.rpc("lit_admin_set_provider_flag", { p_key: key, p_enabled: next });
    if (error) {
      // Revert on failure.
      setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: !next } : f)));
    } else {
      const row = ((data as ProviderFlag[]) || [])[0];
      if (row) setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, ...row } : f)));
    }
    setFlagBusy(null);
  };

  // $/credit inline editor.
  const [priceEdit, setPriceEdit] = useState<{ provider: string; operation: string } | null>(null);
  const [priceVal, setPriceVal] = useState<string>("");
  const [priceBusy, setPriceBusy] = useState(false);

  const startPriceEdit = (row: any) => {
    setPriceEdit({ provider: row.provider, operation: row.operation });
    setPriceVal(String(row.usd_cost_per_credit ?? ""));
  };

  const savePrice = async () => {
    if (!priceEdit) return;
    const v = Number(priceVal);
    if (!Number.isFinite(v) || v < 0) return;
    setPriceBusy(true);
    const { data, error } = await supabase.rpc("lit_admin_set_provider_price", {
      p_provider: priceEdit.provider, p_operation: priceEdit.operation, p_usd_cost_per_credit: v,
    });
    if (!error) {
      const row = ((data as any[]) || [])[0];
      if (row) {
        setPricing((prev) => prev.map((p) =>
          p.provider === row.provider && p.operation === row.operation ? { ...p, usd_cost_per_credit: row.usd_cost_per_credit } : p));
      }
      setPriceEdit(null);
      // Cost/margin cards depend on pricing — refresh the summary so the placeholder badge clears.
      loadEconomics().catch(() => {});
    }
    setPriceBusy(false);
  };

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

  // Activation funnel steps (from lit_user_activation aggregate) for horizontal bars.
  const funnelSteps = useMemo(() => {
    const base = activation.signups || 0;
    const steps = [
      { key: "signup", label: "Signup", value: activation.signups, color: "#2563EB" },
      { key: "search", label: "Searched", value: activation.searched, color: "#38BDF8" },
      { key: "save", label: "Saved", value: activation.saved, color: "#7C3AED" },
      { key: "d7", label: "Returned D7", value: activation.returned_d7, color: "#F59E0B" },
      { key: "trial", label: "Trial", value: activation.trial, color: "#0EA5E9" },
      { key: "paid", label: "Converted", value: activation.converted, color: "#059669" },
    ];
    return steps.map((s) => ({ ...s, pct: base ? Math.round((s.value / base) * 100) : 0 }));
  }, [activation]);

  // Retention cohort matrix: pivot rows into cohort × weeks-since grid.
  const cohortMatrix = useMemo(() => {
    const cohortsSet = Array.from(new Set(cohorts.map((c) => c.cohort))).sort();
    const maxWeek = cohorts.reduce((m, c) => Math.max(m, c.weeks_since), 0);
    const weeks = Array.from({ length: maxWeek + 1 }, (_, i) => i);
    const sizeByCohort = new Map<string, number>();
    const cell = new Map<string, number>(); // `${cohort}|${week}` -> pct
    for (const c of cohorts) {
      sizeByCohort.set(c.cohort, c.cohort_size);
      cell.set(`${c.cohort}|${c.weeks_since}`, c.retained_pct);
    }
    return { cohortsSet, weeks, sizeByCohort, cell };
  }, [cohorts]);

  const heat = (p: number | undefined): string => {
    if (p === undefined) return "bg-slate-50 text-slate-300";
    if (p >= 75) return "bg-emerald-600 text-white";
    if (p >= 50) return "bg-emerald-400 text-white";
    if (p >= 25) return "bg-emerald-200 text-emerald-900";
    if (p > 0) return "bg-emerald-50 text-emerald-700";
    return "bg-slate-50 text-slate-400";
  };

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
              {/* ── Executive strip: activation (Row A) + data economics (Row B) ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Gauge className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Activation
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                  <KpiCard label="Signups" value={int(activation.signups)} icon={Users} tone="blue" />
                  <KpiCard label="Searched" value={int(activation.searched)} icon={SearchIcon} tone="cyan"
                    hint={activation.signups ? `${Math.round((activation.searched / activation.signups) * 100)}% of signups` : undefined} />
                  <KpiCard label="Saved" value={int(activation.saved)} icon={Inbox} tone="violet"
                    hint={activation.signups ? `${Math.round((activation.saved / activation.signups) * 100)}%` : undefined} />
                  <KpiCard label="Returned D7" value={int(activation.returned_d7)} icon={RefreshCw} tone="amber"
                    hint={activation.signups ? `${Math.round((activation.returned_d7 / activation.signups) * 100)}%` : undefined} />
                  <KpiCard label="Converted" value={int(activation.converted)} icon={CreditCard} tone="emerald"
                    hint={`${int(activation.trial)} trials`} />
                  <KpiCard label="New MRR" value={econBusy && !acq.length ? "…" : usd(newMrr)} icon={TrendingUp} tone="emerald"
                    tooltip="Monthly recurring revenue from newly converted users (attributed by acquisition source)." />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Coins className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Data economics · this period
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                  <KpiCard label="Credits used" value={int(econ?.credits_used_period)} icon={Database} tone="blue" />
                  <KpiCard label="Data cost" value={usd(econ?.cost_usd_period)} icon={Coins} tone="cyan"
                    badge={econ?.is_placeholder_pricing ? "set $/credit" : undefined} />
                  <KpiCard label="Cost / paid cust." value={usd(econ?.cost_per_paid_customer_period)} icon={Users} tone="violet"
                    badge={econ?.is_placeholder_pricing ? "set $/credit" : undefined}
                    tooltip={econ && econ.cost_per_paid_customer_period === null ? "No paid customers yet — n/a." : undefined} />
                  <KpiCard label="Contribution margin"
                    value={econ?.contribution_margin_pct === null || econ?.contribution_margin_pct === undefined ? "n/a" : pct(econ.contribution_margin_pct)}
                    icon={Percent} tone={num(econ?.contribution_margin_pct) >= 0 ? "emerald" : "amber"}
                    badge={econ?.is_placeholder_pricing ? "set $/credit" : undefined}
                    tooltip={econ && (econ.contribution_margin_pct === null) ? "Margin needs complete MRR and > $0 revenue — n/a until then." : undefined} />
                  <KpiCard label="Credits remaining"
                    value={econ?.credits_remaining === null || econ?.credits_remaining === undefined ? "—" : int(econ.credits_remaining)}
                    icon={Zap} tone="amber"
                    tooltip={econ && econ.credits_remaining === null ? "Provider balance not yet synced." : undefined} />
                  <KpiCard label="Days remaining"
                    value={econ?.days_remaining === null || econ?.days_remaining === undefined ? "—" : int(econ.days_remaining)}
                    icon={Timer} tone={num(econ?.days_remaining) > 0 && num(econ?.days_remaining) < 14 ? "amber" : "slate"}
                    tooltip="Projected days until credit exhaustion at the 7-day average burn. '—' when burn is zero." />
                </div>
              </div>

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
                      {["User", "Org / Role", "Plan", "Source", "Last seen", "Activity 30d", "Unlocks", "Enrichments"].map((h) => (
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
                        <td className="px-4 py-2.5">
                          <div className="font-body text-[12px] text-slate-700">{u.signup_source || "—"}</div>
                          {u.signup_landing && (
                            <div className="font-mono max-w-[140px] truncate text-[10px] text-slate-400" title={u.signup_landing}>{u.signup_landing}</div>
                          )}
                        </td>
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
            <div className="space-y-4">
              {/* Activation funnel */}
              <DeckCard title="Activation funnel" subtitle="Signup → search → save → returned D7 → trial → paid (all users)">
                {activation.signups === 0 ? (
                  <div className="font-body py-6 text-center text-[12px] text-slate-400">No activation data yet.</div>
                ) : (
                  <div className="space-y-2">
                    {funnelSteps.map((s) => (
                      <div key={s.key} className="flex items-center gap-3">
                        <div className="font-display w-24 shrink-0 text-right text-[11px] font-semibold text-slate-500">{s.label}</div>
                        <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
                          <div className="flex h-full items-center rounded-lg pl-2.5 transition-all"
                            style={{ width: `${Math.max(s.pct, s.value > 0 ? 4 : 0)}%`, background: s.color, minWidth: s.value > 0 ? 34 : 0 }}>
                            <span className="font-mono text-[11px] font-bold text-white">{int(s.value)}</span>
                          </div>
                        </div>
                        <div className="font-mono w-12 shrink-0 text-right text-[11px] text-slate-400">{s.pct}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </DeckCard>

              {/* Retention cohorts + acquisition by source */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <DeckCard title="Retention cohorts" subtitle="Weekly signup cohort × weeks since signup (% retained)">
                  {cohortMatrix.cohortsSet.length === 0 ? (
                    <div className="font-body py-6 text-center text-[12px] text-slate-400">No cohort data yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="font-display px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">Cohort</th>
                            <th className="font-display px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">n</th>
                            {cohortMatrix.weeks.map((w) => (
                              <th key={w} className="font-display px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">W{w}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cohortMatrix.cohortsSet.map((co) => (
                            <tr key={co}>
                              <td className="font-mono whitespace-nowrap px-2 py-1 text-[10.5px] text-slate-600">{co}</td>
                              <td className="font-mono px-2 py-1 text-[10.5px] text-slate-400">{cohortMatrix.sizeByCohort.get(co) ?? 0}</td>
                              {cohortMatrix.weeks.map((w) => {
                                const p = cohortMatrix.cell.get(`${co}|${w}`);
                                return (
                                  <td key={w} className="px-0.5 py-0.5">
                                    <div className={`flex h-6 items-center justify-center rounded font-mono text-[10px] font-semibold ${heat(p)}`}
                                      title={p === undefined ? "" : `${pct(p)} retained`}>
                                      {p === undefined ? "" : `${Math.round(p)}`}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </DeckCard>

                <DeckCard title="Acquisition by source" subtitle="Signups → paid + new MRR, by signup source">
                  {acq.length === 0 ? (
                    <div className="font-body py-6 text-center text-[12px] text-slate-400">No acquisition data yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-100">
                            {["Source", "Signups", "Searched", "Saved", "Trial", "Paid", "New MRR"].map((h) => (
                              <th key={h} className="font-display px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400 last:text-right">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {acq.map((r) => (
                            <tr key={r.source} className="border-b border-slate-50 last:border-b-0">
                              <td className="font-body px-2 py-1.5 text-[11.5px] text-slate-700">{r.source}</td>
                              <td className="font-mono px-2 py-1.5 text-[11.5px] text-slate-700">{int(r.signups)}</td>
                              <td className="font-mono px-2 py-1.5 text-[11.5px] text-slate-500">{int(r.searched)}</td>
                              <td className="font-mono px-2 py-1.5 text-[11.5px] text-slate-500">{int(r.saved)}</td>
                              <td className="font-mono px-2 py-1.5 text-[11.5px] text-slate-500">{int(r.trial_started)}</td>
                              <td className="font-mono px-2 py-1.5 text-[11.5px] text-emerald-700">{int(r.converted)}</td>
                              <td className="font-mono px-2 py-1.5 text-right text-[11.5px] font-semibold text-slate-900">{usd(r.new_mrr)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </DeckCard>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <LinkCard to="/app/demo-invites" icon={Send} title="Demo invitations"
                  blurb="Send personal demo invites and track every prospect: delivered, opened, signed up, upgraded — per sender." />
                <LinkCard to="/app/admin/demo-requests" icon={Inbox} title="Inbound demo requests"
                  blurb="Marketing-site demo form submissions with status tracking and reply workflow." />
              </div>
            </div>
          )}

          {section === "marketing" && (
            <div className="space-y-4">
              <DeckCard title="Campaign funnel" subtitle="Invited → delivered → opened → clicked → signed up → trial → converted, with attributed MRR">
                {campaigns.length === 0 ? (
                  <div className="font-body py-6 text-center text-[12px] text-slate-400">No campaign activity yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px]">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          {["Campaign", "Invited", "Delivered", "Opened", "Clicked", "Signed up", "Trial", "Converted", "MRR"].map((h) => (
                            <th key={h} className="font-display px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400 last:text-right">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((c) => (
                          <tr key={c.campaign} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50">
                            <td className="font-display px-3 py-2 text-[12px] font-semibold text-slate-900">{c.campaign}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-700">{int(c.invited)}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-500">{int(c.delivered)}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-500">{int(c.opened)}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-500">
                              {int(c.clicked)}
                              {c.clicked_resend > c.clicked && (
                                <span className="ml-1 text-[10px] text-slate-400" title="Clicks detected via Resend/webhook events">(+{int(c.clicked_resend - c.clicked)})</span>
                              )}
                            </td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-700">{int(c.signed_up)}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-500">{int(c.trial_started)}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-emerald-700">{int(c.converted)}</td>
                            <td className="font-mono px-3 py-2 text-right text-[12px] font-semibold text-slate-900">{usd(c.revenue_mrr)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </DeckCard>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <LinkCard to="/app/admin/marketing-analytics" icon={BarChart3} title="Marketing analytics"
                  blurb="Site traffic, lead capture, attribution, and campaign performance." />
                <LinkCard to="/app/admin/marketing-broadcasts" icon={Megaphone} title="Broadcasts"
                  blurb="One-off email sends to leads and subscriber segments." />
              </div>
            </div>
          )}

          {section === "revenue" && (
            <div className="space-y-4">
              {/* Header row: title + refresh + placeholder-pricing notice */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-[15px] font-bold text-slate-900">Data economics</h2>
                  <p className="font-body text-[11.5px] text-slate-500">
                    ImportYeti credit consumption, cost, margin, and live kill switches.
                    {econ?.is_placeholder_pricing && (
                      <span className="ml-1.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-600">
                        placeholder $/credit — set real cost below
                      </span>
                    )}
                  </p>
                </div>
                <button type="button" onClick={() => loadEconomics()} disabled={econBusy}
                  className="font-display inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${econBusy ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {/* Economics summary cards */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <KpiCard label="Credits · today" value={int(econ?.credits_used_today)} icon={Database} tone="blue" />
                <KpiCard label="Credits · 7d" value={int(econ?.credits_used_7d)} icon={Database} tone="cyan" />
                <KpiCard label="Cost · today" value={usd(econ?.cost_usd_today)} icon={Coins} tone="violet"
                  badge={econ?.is_placeholder_pricing ? "est." : undefined} />
                <KpiCard label="Cost · 7d" value={usd(econ?.cost_usd_7d)} icon={Coins} tone="amber"
                  badge={econ?.is_placeholder_pricing ? "est." : undefined} />
                <KpiCard label="Cache hit · 7d"
                  value={econ?.cache_hit_rate_7d === null || econ?.cache_hit_rate_7d === undefined ? "—" : `${Math.round(num(econ.cache_hit_rate_7d) * 100)}%`}
                  icon={Zap} tone="emerald" />
                <KpiCard label="Calls · today" value={int(econ?.calls_today)} icon={Gauge} tone="slate" />
              </div>

              {/* Burn chart + balance/exhaustion panel */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <DeckCard title="Credit burn · 30 days" subtitle="Daily credits consumed" className="lg:col-span-2">
                  {burn.every((d) => d.credits_consumed === 0) ? (
                    <div className="font-body flex h-[190px] items-center justify-center text-[12px] text-slate-400">
                      No credits consumed in the last 30 days.
                    </div>
                  ) : (
                    <div style={{ width: "100%", height: 200 }}>
                      <ResponsiveContainer>
                        <AreaChart data={burn} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                          <defs>
                            <linearGradient id="burnFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2563EB" stopOpacity={0.25} />
                              <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                          <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false}
                            tickFormatter={(d: string) => { const p = String(d).split("-"); return p.length === 3 ? `${p[1]}/${p[2]}` : d; }}
                            minTickGap={24} />
                          <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <ChartTooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12 }} />
                          <Area type="monotone" dataKey="credits_consumed" stroke="#2563EB" strokeWidth={2} fill="url(#burnFill)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </DeckCard>

                <DeckCard title="Balance & exhaustion" subtitle="ImportYeti credit runway">
                  <div className="space-y-3">
                    <div>
                      <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">Credits remaining</div>
                      <div className="font-mono text-[22px] font-bold text-slate-900">
                        {econ?.credits_remaining === null || econ?.credits_remaining === undefined ? "—" : int(econ.credits_remaining)}
                      </div>
                      {econ?.balance_updated_at && (
                        <div className="font-body text-[10px] text-slate-400">synced {new Date(econ.balance_updated_at).toLocaleDateString()}</div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">Avg daily burn</div>
                        <div className="font-mono text-[15px] font-bold text-slate-800">{int(econ?.avg_daily_burn_7d)}</div>
                        <div className="font-body text-[10px] text-slate-400">7-day avg</div>
                      </div>
                      <div>
                        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">Days left</div>
                        <div className={`font-mono text-[15px] font-bold ${num(econ?.days_remaining) > 0 && num(econ?.days_remaining) < 14 ? "text-amber-600" : "text-slate-800"}`}>
                          {econ?.days_remaining === null || econ?.days_remaining === undefined ? "—" : int(econ.days_remaining)}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">Projected exhaustion</div>
                      <div className="font-mono text-[13px] font-bold text-slate-800">
                        {econ?.projected_exhaustion_date ? new Date(econ.projected_exhaustion_date).toLocaleDateString() : "—"}
                      </div>
                      {!econ?.projected_exhaustion_date && (
                        <div className="font-body text-[10px] text-slate-400">n/a at zero burn</div>
                      )}
                    </div>
                  </div>
                </DeckCard>
              </div>

              {/* Kill switches */}
              <DeckCard title="Provider kill switches" subtitle="Pause live ImportYeti spend. Changes take effect immediately.">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {flags.length === 0 ? (
                    <div className="font-body col-span-full py-3 text-center text-[12px] text-slate-400">Flags unavailable.</div>
                  ) : flags.map((f) => (
                    <div key={f.key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${f.enabled ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                          <Power className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="font-display text-[12.5px] font-bold text-slate-900">{f.label}</div>
                          <div className="font-mono text-[10px] text-slate-400">{f.key}</div>
                        </div>
                      </div>
                      <button type="button" onClick={() => requestFlagToggle(f)} disabled={flagBusy === f.key}
                        role="switch" aria-checked={f.enabled}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${f.enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${f.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </DeckCard>

              {/* Usage breakdown ("where credits go") */}
              <DeckCard title="Where credits go · 7 days" subtitle="Per-operation credits, cost, cache efficiency">
                {usage.length === 0 ? (
                  <div className="font-body py-6 text-center text-[12px] text-slate-400">No provider usage in the last 7 days.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          {["Operation", "Calls", "Credits", "Cost", "Cache hit", "Users", "Orgs"].map((h) => (
                            <th key={h} className="font-display px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {usage.map((u) => (
                          <tr key={u.operation} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50">
                            <td className="font-display px-3 py-2 text-[12px] font-semibold text-slate-800">{u.operation}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-700">{int(u.calls)}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-700">{int(u.credits_consumed)}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-900">{usd(u.cost_usd)}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-500">{Math.round(num(u.cache_hit_rate) * 100)}%</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-500">{int(u.distinct_users)}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-500">{int(u.distinct_orgs)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </DeckCard>

              {/* Top consumers */}
              <DeckCard title="Top consumers · 30 days" subtitle="Highest credit spend by org / user">
                {topConsumers.length === 0 ? (
                  <div className="font-body py-6 text-center text-[12px] text-slate-400">No consumers in the last 30 days.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px]">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          {["Org", "User", "Tier", "Credits", "Cost", "Calls"].map((h) => (
                            <th key={h} className="font-display px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {topConsumers.map((c, i) => (
                          <tr key={`${c.organization_id}-${c.user_id}-${i}`} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50">
                            <td className="font-mono px-3 py-2 text-[11px] text-slate-600" title={c.organization_id || ""}>
                              {c.organization_id ? c.organization_id.slice(0, 8) : "—"}
                            </td>
                            <td className="font-mono px-3 py-2 text-[11px] text-slate-600" title={c.user_id || ""}>
                              {c.user_id ? c.user_id.slice(0, 8) : "—"}
                            </td>
                            <td className="px-3 py-2"><PlanPill plan={c.subscription_tier} status={null} /></td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-700">{int(c.credits_consumed)}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-900">{usd(c.cost_usd)}</td>
                            <td className="font-mono px-3 py-2 text-[12px] text-slate-500">{int(c.calls)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </DeckCard>

              {/* $/credit pricing editor */}
              <DeckCard title="Provider pricing" subtitle="Set the real $/credit per operation. 0.02 is the placeholder default.">
                {pricing.length === 0 ? (
                  <div className="font-body py-6 text-center text-[12px] text-slate-400">No active pricing rows.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px]">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          {["Provider", "Operation", "Credit cost", "$/credit", ""].map((h) => (
                            <th key={h} className="font-display px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pricing.map((p) => {
                          const editing = priceEdit?.provider === p.provider && priceEdit?.operation === p.operation;
                          const isPlaceholder = Number(p.usd_cost_per_credit) === 0.02;
                          return (
                            <tr key={`${p.provider}-${p.operation}`} className="border-b border-slate-50 last:border-b-0">
                              <td className="font-body px-3 py-2 text-[12px] text-slate-700">{p.provider}</td>
                              <td className="font-display px-3 py-2 text-[12px] font-semibold text-slate-800">{p.operation}</td>
                              <td className="font-mono px-3 py-2 text-[12px] text-slate-500">{p.credit_cost}</td>
                              <td className="px-3 py-2">
                                {editing ? (
                                  <input type="number" min="0" step="0.001" value={priceVal} autoFocus
                                    onChange={(e) => setPriceVal(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") savePrice(); if (e.key === "Escape") setPriceEdit(null); }}
                                    className="w-24 rounded-lg border border-blue-300 bg-white px-2 py-1 font-mono text-[12px] outline-none focus:border-blue-500" />
                                ) : (
                                  <span className="font-mono text-[12px] text-slate-900">
                                    ${Number(p.usd_cost_per_credit).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                    {isPlaceholder && (
                                      <span className="ml-1.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8.5px] font-bold uppercase text-amber-600">placeholder</span>
                                    )}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {editing ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button type="button" onClick={savePrice} disabled={priceBusy}
                                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50">
                                      {priceBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                    </button>
                                    <button type="button" onClick={() => setPriceEdit(null)}
                                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button type="button" onClick={() => startPriceEdit(p)}
                                    className="font-display inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:border-blue-300 hover:text-blue-600">
                                    <Pencil className="h-3 w-3" /> Set
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </DeckCard>

              {/* Cross-links to the billing surfaces */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <LinkCard to="/app/admin/subscribers" icon={CreditCard} title="Subscribers"
                  blurb="Every subscription with Stripe state — change plans, comp accounts, suspend users." />
                <LinkCard to="/app/billing" icon={TrendingUp} title="Plans & pricing"
                  blurb="The live plan matrix as customers see it." />
              </div>
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

      {/* Kill-switch confirm dialog — flipping pauses/resumes live provider spend. */}
      {pendingFlag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setPendingFlag(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${pendingFlag.next ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                <AlertTriangle className="h-4.5 w-4.5" />
              </span>
              <div className="font-display text-[14px] font-bold text-slate-900">
                {pendingFlag.next ? "Enable" : "Disable"} provider?
              </div>
            </div>
            <p className="font-body mt-3 text-[12.5px] leading-relaxed text-slate-600">
              You're about to <span className="font-semibold">{pendingFlag.next ? "enable" : "disable"}</span>{" "}
              <span className="font-semibold">{pendingFlag.label}</span>.{" "}
              {pendingFlag.next
                ? "This resumes live ImportYeti spend."
                : "This immediately pauses live ImportYeti spend for this operation."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingFlag(null)}
                className="font-display rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 hover:border-slate-300">
                Cancel
              </button>
              <button type="button" onClick={confirmFlagToggle}
                className={`font-display rounded-xl px-3.5 py-2 text-[12.5px] font-semibold text-white ${pendingFlag.next ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`}>
                {pendingFlag.next ? "Enable" : "Disable"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
