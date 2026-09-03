import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap, Users, BarChart3, Clock, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useEntitlements } from "@/hooks/useEntitlements";
import { fetchCreditUsageReport } from "@/api/entitlements";
import PurchaseCreditsModal from "@/components/billing/PurchaseCreditsModal";

const FEATURE_LABELS: Record<string, string> = {
  company_unlock: "Company Unlocks",
  company_export: "Exports",
  email_reveal: "Email Reveals",
  phone_reveal: "Phone Reveals",
  contact_enrichment: "Contact Intelligence",
  company_enrichment: "Company Intelligence",
  pulse_search: "Pulse Search",
  pulse_brief: "Pulse Briefs",
  confidence_refresh: "Confidence Score",
  harvey_research: "Harvey Research",
  harvey_email: "Harvey Emails",
  harvey_sequence: "Harvey Sequences",
  benchmark_lookup: "Benchmark",
  tariff_lookup: "Tariff",
  other: "Other",
};
const labelFor = (k?: string | null) => FEATURE_LABELS[k || "other"] || (k || "Other");
const BAR = ["#06B6D4", "#6366F1", "#8B5CF6", "#0EA5E9", "#10B981", "#F59E0B", "#94A3B8"];

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

type TabKey = "users" | "features" | "activity";

export default function CreditUsage() {
  const { entitlements, creditBalance, isAdmin } = useEntitlements();
  const orgId = (entitlements?.org_id as string | undefined) ?? creditBalance?.org_id ?? null;
  const [tab, setTab] = useState<TabKey>("features");
  const [showPurchase, setShowPurchase] = useState(false);

  const { data: report, isLoading } = useQuery({
    queryKey: ["credit-usage-report", orgId],
    queryFn: () => (orgId ? fetchCreditUsageReport(orgId) : Promise.resolve(null)),
    enabled: Boolean(orgId),
    staleTime: 30_000,
  });

  const bal = report?.balance ?? creditBalance ?? null;
  const unlimited = Boolean(bal?.unlimited);
  const quota = bal?.included_quota ?? 0;
  const used = bal?.included_used ?? 0;
  const remaining = bal?.included_remaining ?? 0;
  const purchased = bal?.purchased_remaining ?? 0;
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  const totalFeatureCredits = useMemo(
    () => (report?.by_feature ?? []).reduce((s, f) => s + f.credits, 0),
    [report],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Link to="/app/billing" className="mb-3 inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft size={14} /> Billing
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold tracking-tight text-slate-900">Credit Usage</h1>
          <p className="font-body text-[13px] text-slate-500">See how your organization is using LIT Credits.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPurchase(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-slate-800"
        >
          <Zap size={14} className="text-cyan-300" /> Purchase Credits
        </button>
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Monthly Credits", value: unlimited ? "∞" : quota.toLocaleString() },
          { label: "Used This Period", value: unlimited ? used.toLocaleString() : used.toLocaleString() },
          { label: "Monthly Remaining", value: unlimited ? "∞" : remaining.toLocaleString() },
          { label: "Purchased Credits", value: purchased.toLocaleString() },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="font-display text-[22px] font-bold text-slate-900">{c.value}</div>
            <div className="font-body mt-0.5 text-[11.5px] font-medium uppercase tracking-wide text-slate-400">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Progress + plan */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-display text-[13px] font-semibold capitalize text-slate-700">
            {bal?.plan ? `${bal.plan} plan` : "Plan"}
          </div>
          <div className="font-mono text-[12px] text-slate-500">
            {unlimited ? "Unlimited usage" : `${used.toLocaleString()} / ${quota.toLocaleString()} this cycle`}
          </div>
        </div>
        {!unlimited ? (
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: pct >= 90 ? "#EF4444" : pct >= 75 ? "#F59E0B" : "#06B6D4" }}
            />
          </div>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        {([
          { k: "features", label: "Features", icon: BarChart3 },
          { k: "users", label: "Users", icon: Users },
          { k: "activity", label: "Activity", icon: Clock },
        ] as const).map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition",
              tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        {isLoading ? (
          <div className="p-10 text-center font-body text-[13px] text-slate-400">Loading usage…</div>
        ) : tab === "features" ? (
          (report?.by_feature ?? []).length === 0 ? (
            <Empty text="No credit usage yet this billing period." />
          ) : (
            <div className="divide-y divide-slate-100">
              {report!.by_feature.map((f, i) => {
                const p = totalFeatureCredits > 0 ? Math.round((f.credits / totalFeatureCredits) * 100) : 0;
                return (
                  <div key={f.feature} className="px-4 py-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-display text-[13px] font-semibold text-slate-800">{labelFor(f.feature)}</span>
                      <span className="font-mono text-[12px] text-slate-500">
                        {f.credits.toLocaleString()} <span className="text-slate-400">· {p}%</span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${p}%`, background: BAR[i % BAR.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : tab === "users" ? (
          !report?.is_admin && (report?.by_user ?? []).length <= 1 ? (
            (report?.by_user ?? []).length === 0 ? (
              <Empty text="No usage recorded for you yet this period." />
            ) : (
              <UserTable rows={report!.by_user} />
            )
          ) : (report?.by_user ?? []).length === 0 ? (
            <Empty text="No team usage yet this billing period." />
          ) : (
            <UserTable rows={report!.by_user} />
          )
        ) : (report?.activity ?? []).length === 0 ? (
          <Empty text="No credit activity yet." />
        ) : (
          <div className="divide-y divide-slate-100">
            {report!.activity.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-display text-[13px] font-semibold text-slate-800">
                    {labelFor(a.feature)}
                    {a.transaction_type === "REFUND" ? <span className="ml-1.5 text-[11px] font-medium text-emerald-600">refund</span> : null}
                    {a.transaction_type === "PURCHASE" ? <span className="ml-1.5 text-[11px] font-medium text-indigo-600">purchase</span> : null}
                  </div>
                  <div className="font-body mt-0.5 truncate text-[11.5px] text-slate-500">
                    {a.user_email || "—"}{a.entity_id ? ` · ${a.entity_id}` : ""} · {fmtDate(a.created_at)}
                  </div>
                </div>
                <div className={["font-mono text-[13px] font-semibold", a.credits < 0 ? "text-emerald-600" : "text-slate-700"].join(" ")}>
                  {a.credits < 0 ? "+" : "−"}{Math.abs(a.credits)} <span className="text-[10px] font-normal text-slate-400">cr</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPurchase ? <PurchaseCreditsModal onClose={() => setShowPurchase(false)} /> : null}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-10 text-center font-body text-[13px] text-slate-400">{text}</div>;
}

function UserTable({ rows }: { rows: { user_id: string; user_email: string | null; credits: number }[] }) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((u) => (
        <div key={u.user_id} className="flex items-center justify-between px-4 py-3">
          <span className="font-display truncate text-[13px] font-semibold text-slate-800">{u.user_email || u.user_id}</span>
          <span className="font-mono text-[12.5px] text-slate-600">{u.credits.toLocaleString()} <span className="text-[10px] text-slate-400">cr</span></span>
        </div>
      ))}
    </div>
  );
}
