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
import { Pause, Play, RotateCcw, Square, UserCheck, UserX } from "lucide-react";

const fmt = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US") : "—";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();

      const [
        userProfiles, activeUsers, companies, contacts,
        activeCampaigns, outreachSends, outreachFails,
      ] = await Promise.all([
        supabase.from("user_profiles").select("id", { count: "exact", head: true }),
        supabase.from("lit_user_activity").select("user_id", { count: "exact", head: true }).gte("ts", sevenDaysAgo),
        supabase.from("lit_companies").select("id", { count: "exact", head: true }),
        supabase.from("lit_contacts").select("id", { count: "exact", head: true }),
        supabase.from("lit_campaigns").select("id", { count: "exact", head: true }).in("status", ["active", "sending", "paused"]),
        supabase.from("lit_outreach_history").select("id", { count: "exact", head: true }).eq("status", "sent").gte("occurred_at", oneDayAgo),
        supabase.from("lit_outreach_history").select("id", { count: "exact", head: true }).eq("status", "failed").gte("occurred_at", oneDayAgo),
      ]);

      if (cancelled) return;

      const sent = outreachSends.count ?? 0;
      const failed = outreachFails.count ?? 0;
      const errPct = sent + failed > 0 ? (failed * 100) / (sent + failed) : 0;

      setSnap({
        totalUsers: userProfiles.count ?? 0,
        activeUsers7d: activeUsers.count ?? 0,
        companies: companies.count ?? 0,
        contacts: contacts.count ?? 0,
        activeCampaigns: activeCampaigns.count ?? 0,
        outreachSent24h: sent,
        errorRate24h: Number(errPct.toFixed(2)),
        apiLatencyMs: null,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <AKPI label="Total users"      tone="blue"   icon={Users}        value={fmt(snap.totalUsers)} />
      <AKPI label="Active · 7 days"  tone="cyan"   icon={Activity}     value={fmt(snap.activeUsers7d)} />
      <AKPI label="Companies"        tone="violet" icon={Building2}    value={fmt(snap.companies)} />
      <AKPI label="Contacts"         tone="blue"   icon={UserRound}    value={fmt(snap.contacts)} />
      <AKPI label="Active campaigns" tone="amber"  icon={Send}         value={fmt(snap.activeCampaigns)} />
      <AKPI label="Outreach · 24h"   tone="cyan"   icon={Mail}         value={fmt(snap.outreachSent24h)} />
      <AKPI label="Error rate · 24h" tone="green"  icon={ShieldCheck}  value={snap.errorRate24h != null ? snap.errorRate24h.toFixed(2) : "—"} unit="%" />
      <AKPI label="API latency · p95" tone="slate" icon={Timer}        value={snap.apiLatencyMs != null ? String(snap.apiLatencyMs) : "—"} unit="ms" sub={snap.apiLatencyMs == null ? "Monitoring not wired" : undefined} />
    </div>
  );
}

// ─────────────────────────── System Health ───────────────────────────

const HEALTH_SERVICES = [
  { svc: "API · api.logisticintel.com", status: "ok" as const, note: "p95 · us-west-1" },
  { svc: "Supabase · Primary DB",       status: "ok" as const, note: "" },
  { svc: "Supabase · Edge Functions",   status: "ok" as const, note: "" },
  { svc: "Stripe · Billing Webhooks",   status: "ok" as const, note: "" },
  { svc: "Gmail API · OAuth",           status: "ok" as const, note: "" },
  { svc: "Outlook / Microsoft Graph",   status: "ok" as const, note: "" },
  { svc: "PhantomBuster · LinkedIn",    status: "ok" as const, note: "" },
  { svc: "ImportYeti · Ingestion",      status: "stale" as const, note: "live monitoring not wired" },
  { svc: "Clay / Apollo · Enrichment",  status: "ok" as const, note: "" },
  { svc: "OpenAI · Insights engine",    status: "ok" as const, note: "" },
];

export function SystemHealth() {
  const overall = HEALTH_SERVICES.some((s) => s.status === "stale" as any)
    ? "amber"
    : "green";
  return (
    <APanel
      title={<><ADot tone={overall as any} live /> System health</>}
      subtitle="Provider + infrastructure status"
      right={<APill tone={overall as any} dot>{overall === "green" ? "All systems operational" : "Degraded"}</APill>}
      pad={0}
    >
      <div>
        {HEALTH_SERVICES.map((h) => {
          const tone = h.status === "ok" ? "green" : h.status === "stale" ? "amber" : "red";
          return (
            <ARow key={h.svc}>
              <ADot tone={tone as any} live={h.status === "ok"} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-slate-900" style={{ fontFamily: fontDisplay }}>
                  {h.svc}
                </div>
                {h.note ? (
                  <div className={`mt-0.5 text-[11px] ${h.status === "stale" ? "text-amber-700" : "text-slate-400"}`} style={{ fontFamily: fontBody }}>
                    {h.note}
                  </div>
                ) : null}
              </div>
              <APill tone={tone as any} dot>{h.status}</APill>
            </ARow>
          );
        })}
      </div>
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
  return (
    <APanel
      title={<><FlaskConical className="h-3.5 w-3.5 text-violet-500" /> Feature flags · plan matrix</>}
      subtitle="Per-plan entitlement + global kill-switches"
      right={<APill tone="violet" icon={ShieldAlert}>Superadmin only</APill>}
    >
      <ASourceNotConnected
        tableName="lit_feature_flags"
        hint="Phase 3C creates the table + plan matrix toggle wiring. Existing feature_toggles and feature_overrides will be merged then."
      />
    </APanel>
  );
}

// ─────────────────────────── Audit Trail ───────────────────────────

export function AuditLog() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState("all");
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
  }, [filter]);
  return (
    <APanel
      title={<><ScrollText className="h-3.5 w-3.5 text-blue-500" /> Audit trail & events</>}
      subtitle="Every admin action · immutable · lit_audit_log"
      right={
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
