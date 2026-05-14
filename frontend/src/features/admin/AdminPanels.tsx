// AdminPanels.tsx — Admin Dashboard panels.
//
// Per the handoff README §6, every panel is wired to a real Supabase
// source. When a source is empty or unwired the panel renders an
// honest empty state instead of fake numbers. Wiring for write actions
// + real-time + CSV export is layered in Phase 3C.

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Cpu,
  Database,
  DatabaseZap,
  Eye,
  FileSearch,
  FlaskConical,
  Mail,
  PieChart,
  Play,
  RefreshCw,
  Rocket,
  ScrollText,
  Send,
  ShieldAlert,
  Shield,
  ShieldCheck,
  Timer,
  TrendingUp,
  Users,
  UserRound,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  ABar,
  ADot,
  AEmpty,
  AHead,
  AIconBtn,
  AInput,
  AKPI,
  APanel,
  APill,
  ARow,
  ASelect,
  ASourceNotConnected,
  ASpark,
  AToggle,
  fontBody,
  fontDisplay,
  fontMono,
} from "./AdminShared";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";
import {
  Banknote,
  DollarSign,
  HeartCrack,
  Pause,
  Play,
  Receipt,
  RotateCcw,
  Sparkles as SparklesIcon,
  Square,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";

const fmt = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US") : "—";

function fmtMoney(dollars: number | null | undefined): string {
  if (typeof dollars !== "number" || !Number.isFinite(dollars)) return "—";
  if (Math.abs(dollars) >= 1000) {
    return `$${(dollars / 1000).toFixed(1)}k`;
  }
  return `$${dollars.toFixed(0)}`;
}

// ─────────────────────────── Revenue KPIs ───────────────────────────
//
// Primary financial snapshot — placed at the top of Overview so the
// founder sees MRR / active subs / trial users / cancellations before
// any other metric. Reads from public.subscriptions joined with
// public.plans (no Stripe round-trip — the webhook keeps the local
// rows in sync).

interface RevenueSnap {
  mrrCents: number | null;
  arrCents: number | null;
  activeSubs: number;
  trialing: number;
  cancellations30d: number;
  newSubs30d: number;
  enterpriseActive: number; // counted separately — plans.price_monthly is null on custom-priced tiers
  perPlan: Array<{ plan: string; active: number; trialing: number; mrrCents: number; price: number | null }>;
}

export function RevenueKPIs() {
  const [snap, setSnap] = useState<RevenueSnap | null>(null);
  useEffect(() => {
    (async () => {
      const thirtyAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [{ data: subs }, { data: plans }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("id, user_id, plan_code, status, billing_interval, current_period_end, updated_at, created_at, cancel_at_period_end, metadata"),
        supabase
          .from("plans")
          .select("code, name, price_monthly, price_yearly")
          .eq("is_active", true),
      ]);
      const planByCode = new Map<string, { name: string; price_monthly: number; price_yearly: number }>();
      for (const p of plans ?? []) {
        planByCode.set(p.code, {
          name: p.name,
          price_monthly: Number(p.price_monthly || 0),
          price_yearly: Number(p.price_yearly || 0),
        });
      }
      const subRows = subs ?? [];
      let mrrCents = 0;
      let active = 0;
      let trialing = 0;
      let cancellations30d = 0;
      let newSubs30d = 0;
      let enterpriseActive = 0;
      const perPlanMap = new Map<string, { active: number; trialing: number; mrrCents: number; price: number | null }>();
      for (const s of subRows) {
        const code = s.plan_code || "free_trial";
        const plan = planByCode.get(code);
        const cell = perPlanMap.get(code) || { active: 0, trialing: 0, mrrCents: 0, price: plan?.price_monthly ?? null };
        if (s.status === "active") {
          active += 1;
          cell.active += 1;
          // Resolution order for active MRR contribution:
          //   1. subscriptions.metadata.monthly_amount_cents (admin
          //      override — primary source for enterprise/custom subs)
          //   2. plans.price_monthly × 100 (or price_yearly/12 × 100
          //      for annual subs)
          //   3. count under enterpriseActive so the tile is honest
          //      when neither price is known
          const override = Number((s.metadata as any)?.monthly_amount_cents);
          if (Number.isFinite(override) && override > 0) {
            mrrCents += override;
            cell.mrrCents += override;
          } else if (plan && plan.price_monthly != null) {
            const monthlyCents =
              s.billing_interval === "year"
                ? Math.round((plan.price_yearly || 0) * 100 / 12)
                : Math.round((plan.price_monthly || 0) * 100);
            mrrCents += monthlyCents;
            cell.mrrCents += monthlyCents;
          } else if (code === "enterprise") {
            enterpriseActive += 1;
          }
        }
        if (s.status === "trialing") {
          trialing += 1;
          cell.trialing += 1;
        }
        if ((s.status === "canceled" || s.status === "expired") && s.updated_at && s.updated_at >= thirtyAgo) {
          cancellations30d += 1;
        }
        if (s.created_at && s.created_at >= thirtyAgo && (s.status === "active" || s.status === "trialing")) {
          newSubs30d += 1;
        }
        perPlanMap.set(code, cell);
      }
      const perPlan = [...perPlanMap.entries()].map(([plan, cell]) => ({ plan, ...cell }))
        .sort((a, b) => b.mrrCents - a.mrrCents);
      setSnap({
        mrrCents, arrCents: mrrCents * 12,
        activeSubs: active, trialing, cancellations30d, newSubs30d, enterpriseActive, perPlan,
      });
    })();
  }, []);

  const mrr = snap ? snap.mrrCents / 100 : null;
  const arr = snap ? (snap.arrCents ?? 0) / 100 : null;
  const mrrSub = snap
    ? `ARR: ${fmtMoney(arr)}${snap.enterpriseActive > 0 ? ` · + ${snap.enterpriseActive} enterprise (custom)` : ""}`
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AKPI label="MRR"               tone="green"  icon={DollarSign} value={fmtMoney(mrr)}        sub={mrrSub} />
        <AKPI label="Active subscribers" tone="blue"   icon={Receipt}    value={snap ? fmt(snap.activeSubs) : "—"} />
        <AKPI label="Trial users"        tone="amber"  icon={SparklesIcon} value={snap ? fmt(snap.trialing) : "—"} />
        <AKPI label="Cancellations · 30d" tone="red"   icon={HeartCrack} value={snap ? fmt(snap.cancellations30d) : "—"} sub={snap ? `${fmt(snap.newSubs30d)} new this month` : undefined} />
      </div>
      <PlanBreakdown perPlan={snap?.perPlan ?? null} />
    </div>
  );
}

function PlanBreakdown({ perPlan }: { perPlan: RevenueSnap["perPlan"] | null }) {
  const PLAN_LABELS: Record<string, string> = {
    free_trial: "Free Trial",
    starter: "Starter",
    growth: "Growth",
    scale: "Scale",
    enterprise: "Enterprise",
  };
  const PLAN_TONE: Record<string, any> = {
    free_trial: "slate", starter: "blue", growth: "cyan", scale: "violet", enterprise: "amber",
  };
  return (
    <APanel
      title={<><Banknote className="h-3.5 w-3.5 text-emerald-500" /> Subscriptions by plan</>}
      subtitle="Real MRR contribution per tier · pulled from subscriptions + plans"
      pad={0}
    >
      <AHead cols={[
        { label: "Plan", flex: 1.8 },
        { label: "Active", w: 80, align: "right" },
        { label: "Trialing", w: 80, align: "right" },
        { label: "List price / mo", w: 130, align: "right" },
        { label: "MRR", w: 110, align: "right" },
      ]} />
      {perPlan == null ? (
        <AEmpty title="Loading…" />
      ) : perPlan.length === 0 ? (
        <AEmpty icon={Receipt} title="No subscriptions yet" />
      ) : (
        <div>
          {perPlan.map((row) => (
            <ARow key={row.plan}>
              <div style={{ flex: 1.8 }}>
                <APill tone={PLAN_TONE[row.plan] || "slate"}>{PLAN_LABELS[row.plan] || row.plan}</APill>
              </div>
              <div className="text-right text-[12px] font-semibold text-slate-900" style={{ width: 80, fontFamily: fontMono }}>
                {fmt(row.active)}
              </div>
              <div className="text-right text-[12px] text-amber-700" style={{ width: 80, fontFamily: fontMono }}>
                {fmt(row.trialing)}
              </div>
              <div className="text-right text-[12px] text-slate-500" style={{ width: 130, fontFamily: fontMono }}>
                {row.plan === "enterprise" ? "Custom" : row.price && row.price > 0 ? `$${row.price.toFixed(0)}` : "—"}
              </div>
              <div className="text-right text-[12.5px] font-semibold text-emerald-700" style={{ width: 110, fontFamily: fontDisplay }}>
                {row.plan === "enterprise" && row.mrrCents === 0 ? <span className="text-slate-400">Custom</span> : fmtMoney(row.mrrCents / 100)}
              </div>
            </ARow>
          ))}
        </div>
      )}
    </APanel>
  );
}

// ─────────────────────────── Subscribers (drill-down) ───────────────────────────
//
// Per-subscription rows showing user, plan, status, renewal date, MRR
// contribution. Read-only this phase; suspend/role-change live on the
// User Management panel.

export function SubscribersTable() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  useEffect(() => {
    (async () => {
      const [{ data: subs }, { data: profiles }, { data: plans }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("id, user_id, plan_code, status, billing_interval, current_period_start, current_period_end, trial_ends_at, cancel_at_period_end, stripe_customer_id, created_at, metadata")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("profiles").select("id, email, full_name, organization_name, company_name"),
        supabase.from("plans").select("code, price_monthly, price_yearly"),
      ]);
      const profileById = new Map<string, any>();
      for (const p of profiles ?? []) profileById.set(p.id, p);
      const planByCode = new Map<string, any>();
      for (const p of plans ?? []) planByCode.set(p.code, p);
      const merged = (subs ?? []).map((s) => ({
        ...s,
        profile: profileById.get(s.user_id) || null,
        plan: planByCode.get(s.plan_code || "free_trial") || null,
      }));
      setRows(merged);
    })();
  }, [refreshKey]);

  const visible = useMemo(() => {
    if (!rows) return [];
    if (filter === "all") return rows;
    if (filter === "active") return rows.filter((r) => r.status === "active");
    if (filter === "trialing") return rows.filter((r) => r.status === "trialing");
    if (filter === "canceled") return rows.filter((r) => r.status === "canceled" || r.status === "expired");
    if (filter === "past_due") return rows.filter((r) => r.status === "past_due");
    return rows.filter((r) => r.plan_code === filter);
  }, [rows, filter]);

  const statusTone = (s: string) =>
    s === "active" ? "green" :
    s === "trialing" ? "amber" :
    s === "past_due" ? "red" :
    s === "canceled" || s === "expired" ? "slate" : "blue";

  async function editAmount(sub: any) {
    const current = Number(sub.metadata?.monthly_amount_cents);
    const currentDollars = Number.isFinite(current) ? (current / 100).toFixed(2) : "";
    const input = window.prompt(
      `Set monthly MRR for ${sub.profile?.email || sub.user_id?.slice(0, 8)} (USD per month).\nLeave blank or 0 to clear.`,
      currentDollars,
    );
    if (input === null) return;
    const trimmed = input.trim();
    const dollars = trimmed === "" ? 0 : Number(trimmed);
    if (!Number.isFinite(dollars) || dollars < 0) {
      toast.error("Enter a non-negative number.");
      return;
    }
    const cents = trimmed === "" || dollars === 0 ? null : Math.round(dollars * 100);
    const { error } = await supabase.rpc("lit_admin_set_subscription_amount", {
      p_subscription_id: sub.id,
      p_monthly_cents: cents,
    });
    if (error) {
      toast.error(error.message || "Failed to set MRR.");
      return;
    }
    toast.success(cents == null ? "MRR override cleared." : `MRR set to $${dollars.toFixed(2)}.`);
    setRefreshKey((k) => k + 1);
  }

  function askChangePlan(sub: any) {
    setConfirm({
      title: `Change plan for ${sub.profile?.email || sub.user_id?.slice(0, 8)}?`,
      body: `Current plan: ${sub.plan_code || "—"}. Pick a new plan in the next prompt. Stripe is not charged from this action; webhooks will reconcile if Stripe says otherwise.`,
      target: sub.profile?.email || sub.user_id,
      action: "admin.subscription.change_plan",
      severity: "warn",
      confirmLabel: "Continue",
      onConfirm: async () => {
        const planCode = window.prompt(
          "New plan code:\n  free_trial · starter · growth · scale · enterprise",
          sub.plan_code || "growth",
        );
        if (!planCode) return;
        const normalized = planCode.trim().toLowerCase();
        if (!["free_trial", "starter", "growth", "scale", "enterprise"].includes(normalized)) {
          throw new Error(`Unknown plan code "${planCode}".`);
        }
        const interval = window.prompt("Billing interval: month or year", sub.billing_interval || "month");
        const reason = window.prompt("Reason (logged to audit trail):", "admin manual change");
        const { error } = await supabase.rpc("lit_admin_change_user_plan", {
          p_user_id: sub.user_id,
          p_plan_code: normalized,
          p_billing_interval: interval === "year" ? "year" : "month",
          p_reason: reason || null,
        });
        if (error) throw new Error(error.message);
        toast.success(`Plan changed to ${normalized}.`);
        setRefreshKey((k) => k + 1);
      },
    });
  }

  return (
    <APanel
      title={<><Receipt className="h-3.5 w-3.5 text-blue-500" /> Subscribers</>}
      subtitle={rows ? `${fmt(rows.length)} rows` : "Loading…"}
      right={
        <ASelect
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          options={[
            { value: "all", label: "All subscriptions" },
            { value: "active", label: "Active" },
            { value: "trialing", label: "Trialing" },
            { value: "past_due", label: "Past due" },
            { value: "canceled", label: "Canceled / expired" },
            { value: "free_trial", label: "Plan: Free Trial" },
            { value: "starter", label: "Plan: Starter" },
            { value: "growth", label: "Plan: Growth" },
            { value: "scale", label: "Plan: Scale" },
            { value: "enterprise", label: "Plan: Enterprise" },
          ]}
          className="w-52"
        />
      }
      pad={0}
    >
      <AHead cols={[
        { label: "Subscriber", flex: 2 },
        { label: "Plan", w: 100 },
        { label: "Status", w: 100 },
        { label: "Cycle", w: 70 },
        { label: "MRR", w: 96, align: "right" },
        { label: "Renews", w: 110 },
        { label: "", w: 72, align: "right" },
      ]} />
      {rows == null ? (
        <AEmpty title="Loading…" />
      ) : visible.length === 0 ? (
        <AEmpty icon={Receipt} title="No subscriptions match" />
      ) : (
        <div>
          {visible.map((s) => {
            const overrideCents = Number(s.metadata?.monthly_amount_cents);
            const hasOverride = Number.isFinite(overrideCents) && overrideCents > 0;
            const monthlyFromPlan = s.plan
              ? s.billing_interval === "year"
                ? Math.round((Number(s.plan.price_yearly) || 0) / 12)
                : Math.round(Number(s.plan.price_monthly) || 0)
              : 0;
            const monthly = hasOverride ? overrideCents / 100 : monthlyFromPlan;
            const isCustom = s.plan_code === "enterprise";
            return (
              <ARow key={s.id || s.user_id + (s.stripe_customer_id || "")}>
                <div className="min-w-0" style={{ flex: 2 }}>
                  <div className="truncate text-[12.5px] font-semibold text-slate-900" style={{ fontFamily: fontDisplay }}>
                    {s.profile?.full_name || s.profile?.email?.split("@")[0] || "(no profile)"}
                  </div>
                  <div className="truncate text-[11px] text-slate-500" style={{ fontFamily: fontBody }}>
                    {s.profile?.email || s.user_id?.slice(0, 8)}{s.profile?.organization_name ? ` · ${s.profile.organization_name}` : ""}
                  </div>
                </div>
                <div style={{ width: 100 }}>
                  <APill tone={s.plan_code === "enterprise" ? "violet" : s.plan_code === "scale" ? "cyan" : s.plan_code === "growth" ? "blue" : "slate"}>
                    {s.plan_code || "free_trial"}
                  </APill>
                </div>
                <div style={{ width: 100 }}>
                  <APill tone={statusTone(s.status) as any} dot>{s.status || "—"}</APill>
                </div>
                <div className="text-[11px] text-slate-500" style={{ width: 70, fontFamily: fontMono }}>
                  {s.billing_interval || "—"}
                </div>
                <div className="text-right" style={{ width: 96, fontFamily: fontMono }}>
                  {monthly > 0 && s.status === "active" ? (
                    <span className="text-[12px] font-semibold text-slate-900">
                      ${monthly.toLocaleString()}
                      {hasOverride ? <span className="ml-1 text-[10px] font-normal text-emerald-600">●</span> : null}
                    </span>
                  ) : isCustom && s.status === "active" ? (
                    <span className="text-[11px] italic text-slate-400">Custom · set →</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500" style={{ width: 110, fontFamily: fontBody }}>
                  {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : s.trial_ends_at ? `trial · ${new Date(s.trial_ends_at).toLocaleDateString()}` : "—"}
                </div>
                <div className="flex shrink-0 justify-end gap-0.5" style={{ width: 72 }}>
                  {isCustom && s.id ? (
                    <AIconBtn icon={DollarSign} tone="green" title="Set monthly MRR" onClick={() => editAmount(s)} />
                  ) : null}
                  <AIconBtn icon={Rocket} tone="blue" title="Change plan" onClick={() => askChangePlan(s)} />
                </div>
              </ARow>
            );
          })}
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(null)} />
    </APanel>
  );
}

// ─────────────────────────── Overview KPI strip ───────────────────────────

interface OverviewSnapshot {
  totalUsers: number | null;
  activeUsers7d: number | null;
  companies: number | null;
  contacts: number | null;
  activeCampaigns: number | null;
  outreachSent24h: number | null;
  errorRate24h: number | null;
  apiLatencyMs: number | null;
}

export function AdminOverview() {
  const [snap, setSnap] = useState<OverviewSnapshot>({
    totalUsers: null, activeUsers7d: null, companies: null, contacts: null,
    activeCampaigns: null, outreachSent24h: null, errorRate24h: null, apiLatencyMs: null,
  });
  const [signupTrend, setSignupTrend] = useState<number[] | null>(null);
  const [outreachTrend, setOutreachTrend] = useState<number[] | null>(null);
  const [errorTrend, setErrorTrend] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();

      const [
        userSnap, companies, contacts,
        activeCampaigns, outreachSends, outreachFails,
        signupHourly, outreachHourly, errorHourly,
      ] = await Promise.all([
        supabase.rpc("lit_admin_user_snapshot"),
        supabase.from("lit_companies").select("id", { count: "exact", head: true }),
        supabase.from("lit_contacts").select("id", { count: "exact", head: true }),
        supabase.from("lit_campaigns").select("id", { count: "exact", head: true }).in("status", ["active", "sending", "paused"]),
        supabase.from("lit_outreach_history").select("id", { count: "exact", head: true }).eq("status", "sent").gte("occurred_at", oneDayAgo),
        supabase.from("lit_outreach_history").select("id", { count: "exact", head: true }).eq("status", "failed").gte("occurred_at", oneDayAgo),
        supabase.rpc("lit_admin_hourly_series", { p_counter: "signups" }),
        supabase.rpc("lit_admin_hourly_series", { p_counter: "outreach_sent" }),
        supabase.rpc("lit_admin_hourly_series", { p_counter: "outreach_failed" }),
      ]);

      if (cancelled) return;

      const sent = outreachSends.count ?? 0;
      const failed = outreachFails.count ?? 0;
      const errPct = sent + failed > 0 ? (failed * 100) / (sent + failed) : 0;
      const userJson = (userSnap.data as any) || {};

      setSnap({
        totalUsers: userJson.total_users ?? 0,
        activeUsers7d: userJson.active_7d ?? 0,
        companies: companies.count ?? 0,
        contacts: contacts.count ?? 0,
        activeCampaigns: activeCampaigns.count ?? 0,
        outreachSent24h: sent,
        errorRate24h: Number(errPct.toFixed(2)),
        apiLatencyMs: null,
      });
      setSignupTrend(seriesToCounts(signupHourly.data));
      setOutreachTrend(seriesToCounts(outreachHourly.data));
      setErrorTrend(seriesToCounts(errorHourly.data));
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <AKPI label="Total users"      tone="blue"   icon={Users}        value={fmt(snap.totalUsers)} sparkline={signupTrend ?? undefined} />
      <AKPI label="Active · 7 days"  tone="cyan"   icon={Activity}     value={fmt(snap.activeUsers7d)} sub="Sign-ins last 7d" />
      <AKPI label="Companies"        tone="violet" icon={Building2}    value={fmt(snap.companies)} />
      <AKPI label="Contacts"         tone="blue"   icon={UserRound}    value={fmt(snap.contacts)} />
      <AKPI label="Active campaigns" tone="amber"  icon={Send}         value={fmt(snap.activeCampaigns)} />
      <AKPI label="Outreach · 24h"   tone="cyan"   icon={Mail}         value={fmt(snap.outreachSent24h)} sparkline={outreachTrend ?? undefined} />
      <AKPI label="Error rate · 24h" tone={snap.errorRate24h != null && snap.errorRate24h > 5 ? "red" : "green"}  icon={ShieldCheck}  value={snap.errorRate24h != null ? snap.errorRate24h.toFixed(2) : "—"} unit="%" sparkline={errorTrend ?? undefined} />
      <AKPI label="API latency · p95" tone="slate" icon={Timer}        value={snap.apiLatencyMs != null ? String(snap.apiLatencyMs) : "—"} unit="ms" sub={snap.apiLatencyMs == null ? "Monitoring not wired" : undefined} />
    </div>
  );
}

function seriesToCounts(series: any): number[] {
  if (!Array.isArray(series)) return [];
  return series.map((s) => Number(s?.count ?? 0));
}

// ─────────────────────────── System Health ───────────────────────────

export function SystemHealth() {
  const [services, setServices] = useState<Array<{ svc: string; status: string; note: string }> | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase.rpc("lit_admin_system_health");
      if (!active) return;
      setServices(Array.isArray(data) ? data : []);
    }
    load();
    const i = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(i); };
  }, []);
  const overall = !services
    ? "slate"
    : services.some((s) => s.status === "fail" || s.status === "down")
      ? "red"
      : services.some((s) => s.status === "warning" || s.status === "stale")
        ? "amber"
        : "green";
  return (
    <APanel
      title={<><ADot tone={overall as any} live /> System health</>}
      subtitle="Derived from real signals · refreshes every 30s"
      right={<APill tone={overall as any} dot>{overall === "green" ? "All systems operational" : overall === "amber" ? "Degraded" : overall === "red" ? "Incident" : "Loading"}</APill>}
      pad={0}
    >
      {services == null ? (
        <AEmpty title="Loading…" />
      ) : (
        <div>
          {services.map((h) => {
            const tone = h.status === "ok" ? "green" : h.status === "warning" || h.status === "stale" ? "amber" : "red";
            return (
              <ARow key={h.svc}>
                <ADot tone={tone as any} live={h.status === "ok"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold text-slate-900" style={{ fontFamily: fontDisplay }}>
                    {h.svc}
                  </div>
                  {h.note ? (
                    <div className={`mt-0.5 truncate text-[11px] ${tone === "amber" ? "text-amber-700" : tone === "red" ? "text-rose-700" : "text-slate-400"}`} style={{ fontFamily: fontBody }}>
                      {h.note}
                    </div>
                  ) : null}
                </div>
                <APill tone={tone as any} dot>{h.status}</APill>
              </ARow>
            );
          })}
        </div>
      )}
    </APanel>
  );
}

// ─────────────────────────── Plan Distribution ───────────────────────────

export function PlanDistribution() {
  const [rows, setRows] = useState<Array<{ plan: string; count: number; color: string }>>([]);
  const [loading, setLoading] = useState(true);
  const colorByPlan: Record<string, string> = {
    free_trial: "#64748B", starter: "#3B82F6", growth: "#06B6D4",
    scale: "#8B5CF6", enterprise: "#0F172A",
  };
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("plan_code")
        .order("plan_code");
      if (!data) { setLoading(false); return; }
      const counts = new Map<string, number>();
      for (const row of data) {
        const k = row.plan_code || "free_trial";
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      setRows([...counts.entries()].map(([plan, count]) => ({
        plan: plan.charAt(0).toUpperCase() + plan.slice(1).replace("_", " "),
        count,
        color: colorByPlan[plan] || "#94a3b8",
      })));
      setLoading(false);
    })();
  }, []);
  const total = rows.reduce((a, b) => a + b.count, 0);
  return (
    <APanel
      title={<><PieChart className="h-3.5 w-3.5 text-blue-500" /> Plan distribution</>}
      subtitle={total > 0 ? `${fmt(total)} subscriptions` : "Pulling from subscriptions table"}
    >
      {loading ? (
        <AEmpty title="Loading…" sub="Reading the subscriptions table." />
      ) : rows.length === 0 ? (
        <AEmpty title="No subscriptions yet" sub="Plan distribution will populate as users upgrade." />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.plan} className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded" style={{ background: r.color }} />
              <div className="flex flex-1 items-center justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-slate-900" style={{ fontFamily: fontDisplay }}>
                  {r.plan}
                </span>
                <span className="text-[11.5px] text-slate-500" style={{ fontFamily: fontMono }}>
                  {r.count} · {((r.count * 100) / total).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </APanel>
  );
}

// ─────────────────────────── Queue Monitor ───────────────────────────

export function QueueMonitor() {
  const [counts, setCounts] = useState<{ pending: number; queued: number; failed: number; completed: number } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    (async () => {
      const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();
      const [pending, queued, failed, completed] = await Promise.all([
        supabase.from("lit_campaign_contacts").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("lit_campaign_contacts").select("id", { count: "exact", head: true }).eq("status", "queued"),
        supabase.from("lit_campaign_contacts").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", oneDayAgo),
        supabase.from("lit_outreach_history").select("id", { count: "exact", head: true }).eq("status", "sent").gte("occurred_at", oneDayAgo),
      ]);
      setCounts({
        pending: pending.count ?? 0,
        queued: queued.count ?? 0,
        failed: failed.count ?? 0,
        completed: completed.count ?? 0,
      });
    })();
  }, [tick]);
  // Poll every 10s (operators expect this to feel live). Realtime on
  // lit_campaign_contacts works too but the channel chatters because
  // every dispatcher tick updates statuses across many rows, so we
  // prefer a steady poll.
  useEffect(() => {
    const i = window.setInterval(() => setTick((t) => t + 1), 10_000);
    return () => window.clearInterval(i);
  }, []);
  return (
    <APanel
      title={<><Cpu className="h-3.5 w-3.5 text-blue-500" /> Outreach queue</>}
      subtitle="lit_campaign_contacts · live"
      right={<APill tone="green" dot>live</APill>}
    >
      <div className="grid grid-cols-2 gap-2.5">
        <QMini label="Scheduled"   value={counts ? fmt(counts.pending) : "—"} tone="blue"  icon={Timer} />
        <QMini label="In progress" value={counts ? fmt(counts.queued) : "—"}  tone="cyan"  icon={RefreshCw} live />
        <QMini label="Failed · 24h" value={counts ? fmt(counts.failed) : "—"}  tone="red"   icon={XCircle} />
        <QMini label="Completed · 24h" value={counts ? fmt(counts.completed) : "—"} tone="amber" icon={CheckCircle2} />
      </div>
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11.5px] text-slate-500" style={{ fontFamily: fontBody }}>
        <span className="font-semibold text-slate-700">Throughput chart</span> ships with phase 3C when the dispatcher writes per-minute aggregates.
      </div>
    </APanel>
  );
}

function QMini({ label, value, tone, icon: Icon, live }: { label: string; value: string; tone: any; icon: any; live?: boolean }) {
  const bg = {
    blue: "bg-blue-50", cyan: "bg-cyan-50", red: "bg-rose-50",
    amber: "bg-amber-50", green: "bg-emerald-50",
  }[tone as keyof Record<string, string>];
  const color = {
    blue: "#3B82F6", cyan: "#06B6D4", red: "#EF4444",
    amber: "#F59E0B", green: "#10B981",
  }[tone as keyof Record<string, string>];
  return (
    <div className={`rounded-lg border border-slate-200 ${bg} p-3`}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500" style={{ fontFamily: fontDisplay }}>
        <Icon className="h-2.5 w-2.5" style={{ color, animation: live ? "spin 2s linear infinite" : "none" }} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-[22px] font-bold leading-[1.1] tracking-[-0.02em]" style={{ fontFamily: fontDisplay, color }}>
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────── Error Log ───────────────────────────

export function ErrorLog() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("lit_job_errors")
        .select("id, provider, code, message, campaign_id, attempts, created_at")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(50);
      setRows(data || []);
    })();
  }, [refreshKey]);
  // Realtime: any insert/update on lit_job_errors refreshes the list.
  // Fallback poll every 15s.
  useEffect(() => {
    const ch = supabase
      .channel("admin-job-errors")
      .on("postgres_changes", { event: "*", schema: "public", table: "lit_job_errors" }, () => setRefreshKey((k) => k + 1))
      .subscribe();
    const i = window.setInterval(() => setRefreshKey((k) => k + 1), 15_000);
    return () => { supabase.removeChannel(ch); window.clearInterval(i); };
  }, []);

  function askRetry(e: any) {
    setConfirm({
      title: "Retry this job?",
      body: `Re-queues the recipient (if attached) and marks the error resolved. Useful after fixing a token / quota / config issue.`,
      target: e.code,
      action: "admin.job_error.retry",
      severity: "info",
      confirmLabel: "Retry now",
      onConfirm: async () => {
        const { error } = await supabase.rpc("lit_admin_resolve_job_error", { p_error: e.id });
        if (error) throw new Error(error.message);
        toast.success("Job error retried.");
        setRefreshKey((k) => k + 1);
      },
    });
  }
  return (
    <APanel
      title={<><AlertOctagon className="h-3.5 w-3.5 text-rose-500" /> Provider errors · failed jobs</>}
      subtitle={rows ? `${rows.length} unresolved` : "Loading…"}
      pad={0}
    >
      {rows == null ? (
        <AEmpty title="Loading…" />
      ) : rows.length === 0 ? (
        <AEmpty
          icon={ShieldCheck}
          title="No unresolved errors"
          sub="Job errors land here as the dispatcher hits provider failures. Empty = healthy."
        />
      ) : (
        <div>
          {rows.map((e) => (
            <ARow key={e.id}>
              <div className="w-20 shrink-0">
                <APill tone="slate">{e.provider}</APill>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11.5px] font-semibold text-rose-700" style={{ fontFamily: fontMono }}>
                    {e.code}
                  </span>
                  {e.campaign_id ? (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-[11px] text-slate-400" style={{ fontFamily: fontMono }}>
                        {String(e.campaign_id).slice(0, 8)}
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-slate-600" style={{ fontFamily: fontBody }}>
                  {e.message || "—"}
                </div>
              </div>
              <div className="w-16 text-right text-[10.5px] text-slate-400" style={{ fontFamily: fontMono }}>
                try {e.attempts}
              </div>
              <AIconBtn icon={RotateCcw} tone="blue" title="Retry now" onClick={() => askRetry(e)} />
            </ARow>
          ))}
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(null)} />
    </APanel>
  );
}

// ─────────────────────────── User Management ───────────────────────────

export function UserManagement() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    (async () => {
      // profiles has email + global_role + status + company; subscriptions
      // is the plan source of truth. Joining at the client (separate
      // queries) keeps RLS straightforward — both reads are admin-scoped.
      const [{ data: profiles }, { data: subs }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, full_name, global_role, status, organization_name, company_name, created_at, updated_at")
          .order("created_at", { ascending: false })
          .limit(80),
        supabase
          .from("subscriptions")
          .select("user_id, plan_code, status, current_period_end"),
      ]);
      const subByUser = new Map<string, any>();
      for (const s of subs ?? []) subByUser.set(s.user_id, s);
      const merged = (profiles ?? []).map((p) => ({
        ...p,
        plan: subByUser.get(p.id)?.plan_code || "free_trial",
        sub_status: subByUser.get(p.id)?.status || null,
      }));
      setRows(merged);
    })();
  }, [refreshKey]);
  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        (r.email || "").toLowerCase().includes(needle) ||
        (r.full_name || "").toLowerCase().includes(needle) ||
        (r.organization_name || r.company_name || "").toLowerCase().includes(needle),
    );
  }, [rows, q]);

  function askSuspend(u: any) {
    const isSuspended = u.status === "suspended";
    setConfirm({
      title: isSuspended ? "Reactivate user?" : "Suspend user?",
      body: isSuspended
        ? `Restoring access for ${u.email}. They'll be able to sign in immediately.`
        : `Suspending ${u.email} blocks new sessions on their next request. Their plan and data are unchanged.`,
      target: u.email || u.id,
      action: isSuspended ? "admin.user.reactivate" : "admin.user.suspend",
      severity: isSuspended ? "info" : "warn",
      confirmLabel: isSuspended ? "Reactivate" : "Suspend",
      onConfirm: async () => {
        const { error } = await supabase.rpc("lit_admin_suspend_user", {
          p_user: u.id,
          p_suspend: !isSuspended,
        });
        if (error) throw new Error(error.message);
        toast.success(isSuspended ? "User reactivated." : "User suspended.");
        setRefreshKey((k) => k + 1);
      },
    });
  }

  return (
    <APanel
      title={<><Users className="h-3.5 w-3.5 text-blue-500" /> User management</>}
      subtitle={rows ? `${fmt(rows.length)} users · last 80` : "Loading…"}
      right={<AInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, name, org…" className="w-64" />}
      pad={0}
    >
      <AHead cols={[
        { label: "User", flex: 2.2 },
        { label: "Org", flex: 1.4 },
        { label: "Role", w: 92 },
        { label: "Plan", w: 96 },
        { label: "Joined", w: 110 },
        { label: "", w: 56, align: "right" },
      ]} />
      {rows == null ? (
        <AEmpty title="Loading…" />
      ) : filtered.length === 0 ? (
        <AEmpty
          icon={Users}
          title={q ? "No matches" : "No users yet"}
          sub={q ? "Adjust search to see more." : "Profiles populate as users sign up."}
        />
      ) : (
        <div className="overflow-x-auto">
          {filtered.map((u) => {
            const role = u.global_role || "user";
            const roleTone = role === "superadmin" ? "violet" : role === "admin" ? "blue" : "slate";
            const planTone = u.plan === "enterprise" ? "violet" : u.plan === "scale" ? "cyan" : u.plan === "growth" ? "blue" : "slate";
            return (
              <ARow key={u.id}>
                <div className="flex min-w-0 items-center gap-2.5" style={{ flex: 2.2 }}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-[10.5px] font-bold text-blue-700" style={{ fontFamily: fontDisplay }}>
                    {(u.full_name || u.email || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold text-slate-900" style={{ fontFamily: fontDisplay }}>
                      {u.full_name || u.email?.split("@")[0] || "(no name)"}
                    </div>
                    <div className="truncate text-[11px] text-slate-500" style={{ fontFamily: fontBody }}>
                      {u.email || "(no email)"}
                    </div>
                  </div>
                </div>
                <div className="truncate text-[12px] text-slate-700" style={{ flex: 1.4, fontFamily: fontBody }}>
                  {u.organization_name || u.company_name || "—"}
                </div>
                <div style={{ width: 92 }}>
                  <APill tone={roleTone as any} dot>{role}</APill>
                </div>
                <div style={{ width: 96 }}>
                  <APill tone={planTone as any}>{u.plan}</APill>
                </div>
                <div className="text-[11px] text-slate-500" style={{ width: 110, fontFamily: fontBody }}>
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </div>
                <div className="flex shrink-0 justify-end" style={{ width: 56 }}>
                  <AIconBtn
                    icon={u.status === "suspended" ? UserCheck : UserX}
                    tone={u.status === "suspended" ? "green" : "red"}
                    title={u.status === "suspended" ? "Reactivate" : "Suspend"}
                    onClick={() => askSuspend(u)}
                  />
                </div>
              </ARow>
            );
          })}
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(null)} />
    </APanel>
  );
}

// ─────────────────────────── Campaign Monitoring ───────────────────────────

export function CampaignMonitoring() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("lit_campaigns")
        .select("id, name, status, metrics, created_at, updated_at, user_id")
        .order("updated_at", { ascending: false })
        .limit(20);
      setRows(data || []);
    })();
  }, [refreshKey]);

  function askStatusChange(c: any, nextStatus: "paused" | "active" | "completed") {
    const action =
      nextStatus === "paused" ? "Pause campaign" :
      nextStatus === "active" ? "Resume campaign" :
      "Force-stop campaign";
    const isDestructive = nextStatus === "completed";
    setConfirm({
      title: `${action}?`,
      body: isDestructive
        ? `Force-stopping ${c.name || c.id} halts every queued recipient and cannot be undone.`
        : nextStatus === "paused"
          ? `Pausing ${c.name || c.id}. Pending recipients won't be picked up by the dispatcher until you resume.`
          : `Resuming ${c.name || c.id}. The dispatcher will re-pick eligible recipients on its next tick.`,
      target: c.name || c.id,
      action: `admin.campaign.${nextStatus === "completed" ? "force_stop" : nextStatus === "paused" ? "pause" : "resume"}`,
      severity: isDestructive ? "danger" : "warn",
      confirmLabel: action,
      requireType: isDestructive ? (c.name || c.id) : undefined,
      onConfirm: async () => {
        const { error } = await supabase.rpc("lit_admin_set_campaign_status", {
          p_campaign: c.id, p_status: nextStatus,
        });
        if (error) throw new Error(error.message);
        toast.success(`${action} complete.`);
        setRefreshKey((k) => k + 1);
      },
    });
  }

  return (
    <APanel
      title={<><Send className="h-3.5 w-3.5 text-blue-500" /> Campaign monitoring</>}
      subtitle={rows ? `${rows.length} campaigns` : "Loading…"}
      pad={0}
    >
      <AHead cols={[
        { label: "Campaign", flex: 2.4 },
        { label: "Status", w: 100 },
        { label: "Updated", w: 130 },
        { label: "", w: 96, align: "right" },
      ]} />
      {rows == null ? (
        <AEmpty title="Loading…" />
      ) : rows.length === 0 ? (
        <AEmpty icon={Send} title="No campaigns yet" sub="Campaigns appear here as users create them." />
      ) : (
        <div>
          {rows.map((c) => {
            const tone = c.status === "active" || c.status === "sending" ? "green" :
                         c.status === "paused" ? "amber" :
                         c.status === "failed" ? "red" : "slate";
            return (
              <ARow key={c.id}>
                <div className="min-w-0" style={{ flex: 2.4 }}>
                  <div className="truncate text-[12.5px] font-semibold text-slate-900" style={{ fontFamily: fontDisplay }}>
                    {c.name || "(untitled)"}
                  </div>
                  <div className="text-[10.5px] text-slate-400" style={{ fontFamily: fontMono }}>
                    {String(c.id).slice(0, 8)}
                  </div>
                </div>
                <div style={{ width: 100 }}>
                  <APill tone={tone as any} dot>{c.status}</APill>
                </div>
                <div className="text-[11px] text-slate-500" style={{ width: 130, fontFamily: fontBody }}>
                  {c.updated_at ? new Date(c.updated_at).toLocaleString() : "—"}
                </div>
                <div className="flex shrink-0 justify-end gap-1" style={{ width: 96 }}>
                  {c.status === "paused" ? (
                    <AIconBtn icon={Play} tone="green" title="Resume" onClick={() => askStatusChange(c, "active")} />
                  ) : c.status !== "completed" ? (
                    <AIconBtn icon={Pause} tone="amber" title="Pause" onClick={() => askStatusChange(c, "paused")} />
                  ) : null}
                  {c.status !== "completed" ? (
                    <AIconBtn icon={Square} tone="red" title="Force stop" onClick={() => askStatusChange(c, "completed")} />
                  ) : null}
                </div>
              </ARow>
            );
          })}
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(null)} />
    </APanel>
  );
}

// ─────────────────────────── Ingestion Status ───────────────────────────

export function IngestionStatus() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    (async () => {
      // Pull lit_ingestion_runs + the underlying source tables in
      // parallel. Whichever has the more recent timestamp wins so the
      // panel reflects reality even when no cron writes to the runs
      // table yet. Add new sources here as pipelines come online.
      const [{ data: runRows }, importYetiLast, contactsLast, companiesLast] = await Promise.all([
        supabase.from("lit_ingestion_runs").select("*"),
        supabase.from("lit_importyeti_company_snapshot")
          .select("updated_at")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("lit_contacts")
          .select("updated_at")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("lit_companies")
          .select("updated_at")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const overrides: Record<string, { last: string | null; tone?: "ok" | "warning" | "stale" }> = {
        "ImportYeti · BOL feed": { last: (importYetiLast.data as any)?.updated_at ?? null },
        "Apollo enrichment · contacts": { last: (contactsLast.data as any)?.updated_at ?? null },
        "Clay enrichment · companies": { last: (companiesLast.data as any)?.updated_at ?? null },
      };

      const merged = (runRows || []).map((r) => {
        const o = overrides[r.pipeline_name];
        if (!o || !o.last) return r;
        const storedTs = r.last_run_at ? new Date(r.last_run_at).getTime() : 0;
        const sourceTs = new Date(o.last).getTime();
        const ageHours = (Date.now() - sourceTs) / 3_600_000;
        const status = ageHours < 24 ? "ok" : ageHours < 168 ? "warning" : "stale";
        if (sourceTs > storedTs) {
          return { ...r, last_run_at: o.last, status, note: r.note?.startsWith("awaiting") ? "live · derived from source" : r.note };
        }
        return r;
      });

      merged.sort((a: any, b: any) => {
        const ta = a.last_run_at ? new Date(a.last_run_at).getTime() : 0;
        const tb = b.last_run_at ? new Date(b.last_run_at).getTime() : 0;
        return tb - ta;
      });

      setRows(merged);
    })();
  }, []);
  return (
    <APanel
      title={<><DatabaseZap className="h-3.5 w-3.5 text-blue-500" /> Data & ingestion</>}
      subtitle="Pipeline runs"
      pad={0}
    >
      {rows == null ? (
        <AEmpty title="Loading…" />
      ) : rows.length === 0 ? (
        <AEmpty icon={DatabaseZap} title="No pipelines registered" sub="Seed pipelines via the migration." />
      ) : (
        <div>
          {rows.map((r) => {
            const tone = r.status === "ok" ? "green" :
                         r.status === "warning" || r.status === "stale" ? "amber" :
                         r.status === "fail" ? "red" : "slate";
            return (
              <ARow key={r.id}>
                <ADot tone={tone as any} live={r.status === "ok"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold text-slate-900" style={{ fontFamily: fontDisplay }}>
                    {r.pipeline_name}
                  </div>
                  {r.note ? (
                    <div className={`mt-0.5 truncate text-[11px] ${tone === "amber" ? "text-amber-700" : "text-slate-400"}`} style={{ fontFamily: fontBody }}>
                      {r.note}
                    </div>
                  ) : null}
                </div>
                <div className="hidden w-28 text-right text-[11px] text-slate-500 md:block" style={{ fontFamily: fontMono }}>
                  {r.records_label || "—"}
                </div>
                <div className="hidden w-24 text-right text-[11px] text-slate-500 md:block" style={{ fontFamily: fontBody }}>
                  {r.last_run_at ? new Date(r.last_run_at).toLocaleString() : "Never"}
                </div>
                <APill tone={tone as any} dot>{r.status}</APill>
              </ARow>
            );
          })}
        </div>
      )}
    </APanel>
  );
}

// ─────────────────────────── Feature Flags ───────────────────────────

export function FeatureFlags() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("lit_feature_flags")
        .select("*")
        .order("scope", { ascending: true })
        .order("key", { ascending: true });
      setRows(data || []);
    })();
  }, [refreshKey]);

  async function setField(key: string, field: string, value: any) {
    const { error } = await supabase.rpc("lit_admin_set_flag", {
      p_key: key, p_field: field, p_value: String(value),
    });
    if (error) {
      toast.error(error.message || "Flag update failed.");
      return;
    }
    toast.success(`${key} · ${field} updated.`);
    setRefreshKey((k) => k + 1);
  }

  return (
    <APanel
      title={<><FlaskConical className="h-3.5 w-3.5 text-violet-500" /> Feature flags · plan matrix</>}
      subtitle="Per-plan entitlement + global kill-switches · every change is audited"
      right={<APill tone="violet" icon={ShieldAlert}>Superadmin only</APill>}
      pad={0}
    >
      <AHead cols={[
        { label: "Flag", flex: 2.4 },
        { label: "Scope", w: 88 },
        { label: "Free", w: 60, align: "center" },
        { label: "Growth", w: 68, align: "center" },
        { label: "Scale", w: 62, align: "center" },
        { label: "Enterprise", w: 88, align: "center" },
        { label: "Rollout", flex: 1 },
        { label: "Owner", w: 110 },
      ]} />
      {rows == null ? (
        <AEmpty title="Loading flags…" />
      ) : rows.length === 0 ? (
        <AEmpty icon={FlaskConical} title="No flags configured" sub="Seed via the migration." />
      ) : (
        <div className="overflow-x-auto">
          {rows.map((f) => (
            <ARow key={f.key}>
              <div className="min-w-0" style={{ flex: 2.4 }}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold text-slate-900" style={{ fontFamily: fontDisplay }}>{f.label}</span>
                  <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-600" style={{ fontFamily: fontMono }}>{f.key}</span>
                  {f.global_kill ? <APill tone="red" dot>killed</APill> : null}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500" style={{ fontFamily: fontBody }}>{f.description}</div>
              </div>
              <div style={{ width: 88 }}>
                <APill tone={f.scope === "global" ? "amber" : "slate"}>{f.scope}</APill>
              </div>
              {(["free","growth","scale","enterprise"] as const).map((plan, i) => {
                const w = [60, 68, 62, 88][i];
                const v = f[plan];
                return (
                  <div key={plan} className="flex justify-center" style={{ width: w }}>
                    {v === null ? (
                      <span className="text-[11px] text-slate-300" style={{ fontFamily: fontMono }}>—</span>
                    ) : (
                      <AToggle checked={!!v} onChange={(next) => setField(f.key, plan, next)} />
                    )}
                  </div>
                );
              })}
              <div className="flex min-w-[120px] items-center gap-2" style={{ flex: 1 }}>
                <ABar value={f.rollout || 0} max={100} tone={f.rollout === 100 ? "green" : f.rollout > 50 ? "blue" : "amber"} />
                <span className="min-w-[36px] text-right text-[10.5px] text-slate-500" style={{ fontFamily: fontMono }}>{f.rollout}%</span>
              </div>
              <div style={{ width: 110, fontFamily: fontMono }}>
                <div className="text-[10.5px] text-slate-600">{f.owner || "—"}</div>
                <div className="text-[10px] text-slate-400" style={{ fontFamily: fontBody }}>
                  {f.updated_at ? new Date(f.updated_at).toLocaleDateString() : "—"}
                </div>
              </div>
            </ARow>
          ))}
        </div>
      )}
    </APanel>
  );
}

// ─────────────────────────── Audit Trail ───────────────────────────

export function AuditLog() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    (async () => {
      let q = supabase
        .from("lit_audit_log")
        .select("id, created_at, actor_id, actor_role, action, target, severity, source")
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter === "critical") q = q.in("severity", ["warn", "error"]);
      else if (filter !== "all") q = q.eq("source", filter);
      const { data } = await q;
      setRows(data || []);
    })();
  }, [filter, tick]);
  // Realtime: new audit rows trigger an immediate refresh. Fallback
  // poll every 20s in case the channel drops or the table isn't on
  // the realtime publication yet.
  useEffect(() => {
    const ch = supabase
      .channel("admin-audit-log")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lit_audit_log" },
        () => setTick((t) => t + 1),
      )
      .subscribe();
    const i = window.setInterval(() => setTick((t) => t + 1), 20_000);
    return () => { supabase.removeChannel(ch); window.clearInterval(i); };
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Sign in expired — refresh and try again.");
        return;
      }
      const params = new URLSearchParams();
      if (filter === "critical") params.set("severity", "warn");
      else if (filter !== "all") params.set("source", filter);
      const url = `${(supabase as any).supabaseUrl || ""}/functions/v1/admin-audit-export?${params}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) {
        toast.error(`Export failed: ${resp.status}`);
        return;
      }
      const blob = await resp.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `lit-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Audit log exported.");
    } catch (e: any) {
      toast.error(e?.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <APanel
      title={<><ScrollText className="h-3.5 w-3.5 text-blue-500" /> Audit trail & events</>}
      subtitle="Every admin action · immutable · lit_audit_log"
      right={
        <>
          <ASelect
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            options={[
              { value: "all", label: "All events" },
              { value: "critical", label: "Critical only" },
              { value: "admin", label: "Admin actions" },
              { value: "webhook", label: "Webhooks" },
              { value: "job", label: "System jobs" },
              { value: "sec", label: "Security" },
            ]}
            className="w-40"
          />
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            style={{ fontFamily: fontDisplay }}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </>
      }
      pad={0}
    >
      {rows == null ? (
        <AEmpty title="Loading…" />
      ) : rows.length === 0 ? (
        <AEmpty
          icon={ScrollText}
          title="No audit events yet"
          sub="Every admin mutation writes a row here via the lit_audit_write() helper. Empty until the first action runs."
        />
      ) : (
        <div className="max-h-[480px] overflow-y-auto">
          {rows.map((a) => {
            const sevTone = a.severity === "error" ? "red" : a.severity === "warn" ? "amber" : "slate";
            return (
              <ARow key={a.id}>
                <div className="hidden w-20 shrink-0 text-[10.5px] text-slate-400 md:block" style={{ fontFamily: fontMono }}>
                  {new Date(a.created_at).toLocaleTimeString()}
                </div>
                <div className="w-32 min-w-0">
                  <div className="truncate text-[12px] font-semibold text-slate-900" style={{ fontFamily: fontDisplay }}>
                    {a.actor_id ? String(a.actor_id).slice(0, 8) : "system"}
                  </div>
                  <div className="text-[10.5px] text-slate-400">{a.actor_role}</div>
                </div>
                <div className="w-40 shrink-0 text-[11.5px] font-semibold text-blue-700" style={{ fontFamily: fontMono }}>
                  {a.action}
                </div>
                <div className="min-w-0 flex-1 truncate text-[12px] text-slate-600" style={{ fontFamily: fontBody }}>
                  {a.target || "—"}
                </div>
                <APill tone={sevTone as any}>{a.severity}</APill>
                <APill tone="slate">{a.source}</APill>
              </ARow>
            );
          })}
        </div>
      )}
    </APanel>
  );
}
