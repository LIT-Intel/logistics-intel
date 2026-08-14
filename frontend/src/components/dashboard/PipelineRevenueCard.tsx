// Pipeline & Revenue — dashboard CRM snapshot (CEO overhaul 2026-08-14).
//
// A high-level pipeline view in the dashboard visual language, mounted on the
// Workspace Overview page below the trade-lanes map. Four sections, each
// linking into Command Center:
//   • Headline: weighted forecast $ + open pipeline $  → Pipeline tab
//   • By-stage mini funnel (name, count, $)            → Pipeline tab
//   • Needs attention (stale deals + overdue tasks)    → Tasks tab
//   • Recent wins (company + $)                        → Reports tab
//
// Command Center tabs are NOT URL-addressable (CommandCenter.tsx holds `view`
// in plain useState with no searchParams sync), so every link resolves to the
// real route `/app/command-center`. A harmless `?tab=` hint is appended so the
// links stay meaningful if tab-addressing is added later.
//
// Data is org-scoped via RLS through loadDashboardCrm() (dashboardCrm.ts),
// which wraps the security-definer RPC lit_pipeline_summary(). Graceful empty
// state when the org has no deals yet.
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  KanbanSquare,
  Trophy,
} from "lucide-react";

import { loadDashboardCrm, type DashboardCrm } from "@/api/dashboardCrm";
import ViewAsFilter from "@/features/crm/ViewAsFilter";

const CC = "/app/command-center";
const CC_PIPELINE = `${CC}?tab=pipeline`;
const CC_TASKS = `${CC}?tab=tasks`;
const CC_REPORTS = `${CC}?tab=reports`;

function money(n: number): string {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

export default function PipelineRevenueCard() {
  const [data, setData] = useState<DashboardCrm | null>(null);
  const [loading, setLoading] = useState(true);
  // Owner/admin "view as [member]" filter. "" = All members (whole org). The
  // ViewAsFilter control renders nothing for regular members, so this stays ""
  // for them and the card shows their own RLS-scoped pipeline.
  const [viewAsUserId, setViewAsUserId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const d = await loadDashboardCrm(viewAsUserId || null);
        if (!cancelled) setData(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewAsUserId]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div>
          <div className="font-display text-[12px] font-bold text-slate-900">
            Pipeline &amp; Revenue
          </div>
          <div className="font-body text-[10.5px] text-slate-500">
            Your workspace CRM at a glance
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Owner/admin "view as [member]" filter — hidden for members. */}
          <ViewAsFilter value={viewAsUserId} onChange={setViewAsUserId} />
          <a
            href={CC}
            className="font-display inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
          >
            Open Command Center
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </div>

      {loading ? (
        <div className="font-body px-6 py-10 text-center text-[12px] text-slate-500">
          Loading pipeline…
        </div>
      ) : !data || !data.hasData ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-0 divide-y divide-slate-100">
          {/* Headline */}
          <a
            href={CC_PIPELINE}
            className="group grid grid-cols-2 gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50"
          >
            <Headline
              label="Weighted forecast"
              value={money(data.weightedForecast)}
              hint="Open deals × stage win %"
              tone="indigo"
            />
            <Headline
              label="Open pipeline"
              value={money(data.openValue)}
              hint={`${data.openDealCount.toLocaleString()} open ${
                data.openDealCount === 1 ? "deal" : "deals"
              }`}
              tone="blue"
            />
          </a>

          {/* By-stage mini funnel */}
          <a
            href={CC_PIPELINE}
            className="group block px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <SectionLabel icon={KanbanSquare} label="By stage" toneClass="text-slate-500" />
            <MiniFunnel stages={data.stages} />
          </a>

          {/* Needs attention */}
          <a
            href={CC_TASKS}
            className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <div>
              <SectionLabel
                icon={AlertTriangle}
                label="Needs attention"
                toneClass={
                  data.staleCount + data.overdueTaskCount > 0
                    ? "text-amber-600"
                    : "text-slate-500"
                }
              />
              <div className="font-body mt-1 text-[11px] text-slate-600">
                {data.staleCount + data.overdueTaskCount > 0 ? (
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>
                      <strong className="font-mono font-semibold text-slate-900">
                        {data.staleCount}
                      </strong>{" "}
                      stale {data.staleCount === 1 ? "deal" : "deals"}
                    </span>
                    <span>
                      <strong className="font-mono font-semibold text-slate-900">
                        {data.overdueTaskCount}
                      </strong>{" "}
                      overdue {data.overdueTaskCount === 1 ? "task" : "tasks"}
                    </span>
                  </span>
                ) : (
                  <span className="text-emerald-600">All caught up — nothing overdue.</span>
                )}
              </div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-500" />
          </a>

          {/* Recent wins */}
          <a
            href={CC_REPORTS}
            className="group block px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2">
              <SectionLabel icon={Trophy} label="Recent wins" toneClass="text-emerald-600" />
              <span className="font-body text-[10px] text-slate-400">
                {money(data.wonMtdValue)} won MTD
              </span>
            </div>
            {data.recentWins.length > 0 ? (
              <ul className="mt-1.5 flex flex-col gap-1">
                {data.recentWins.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-2 text-[11.5px]"
                  >
                    <span className="min-w-0 truncate text-slate-700">
                      <span className="font-semibold text-slate-900">
                        {w.companyName || w.title}
                      </span>
                      {w.companyName ? (
                        <span className="text-slate-400"> · {w.title}</span>
                      ) : null}
                    </span>
                    <span className="font-mono shrink-0 font-semibold text-emerald-600">
                      {money(w.value)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="font-body mt-1 text-[11px] text-slate-500">
                No closed-won deals yet.
              </div>
            )}
          </a>
        </div>
      )}
    </div>
  );
}

const HEADLINE_TONES: Record<string, string> = {
  indigo: "bg-indigo-50 text-indigo-600",
  blue: "bg-blue-50 text-blue-600",
};

function Headline({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "indigo" | "blue";
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          HEADLINE_TONES[tone] || HEADLINE_TONES.blue,
        ].join(" ")}
      >
        <CircleDollarSign className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <div className="font-mono truncate text-[20px] font-bold leading-none tracking-tight text-slate-900">
          {value}
        </div>
        <div className="font-display mt-1 truncate text-[9.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">
          {label}
        </div>
        <div className="font-body mt-0.5 truncate text-[10px] text-slate-400">{hint}</div>
      </div>
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  label,
  toneClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  toneClass: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={["h-3.5 w-3.5", toneClass].join(" ")} />
      <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500">
        {label}
      </span>
    </div>
  );
}

function MiniFunnel({
  stages,
}: {
  stages: DashboardCrm["stages"];
}) {
  const active = stages.filter((s) => s.openCount > 0);
  if (active.length === 0) {
    return (
      <div className="font-body mt-1 text-[11px] text-slate-500">
        No open deals in the pipeline.
      </div>
    );
  }
  const maxVal = Math.max(...active.map((s) => s.openValue), 1);
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {active.map((s) => (
        <div key={s.stage} className="flex items-center gap-2">
          <div className="w-24 shrink-0 truncate text-[11px] font-semibold text-slate-700">
            {s.stage}
          </div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-500"
              style={{ width: `${Math.max(6, (s.openValue / maxVal) * 100)}%` }}
            />
          </div>
          <div className="font-mono w-9 shrink-0 text-right text-[10.5px] text-slate-400">
            {s.openCount}
          </div>
          <div className="font-mono w-14 shrink-0 text-right text-[11px] font-semibold text-slate-700">
            {money(s.openValue)}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-10 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
        <KanbanSquare className="h-5 w-5" />
      </span>
      <p className="font-display mt-3 text-[13px] font-semibold text-slate-800">
        No deals yet
      </p>
      <p className="font-body mx-auto mt-1 max-w-xs text-[11.5px] text-slate-500">
        Add a company to your pipeline to start tracking forecast, revenue, and wins.
      </p>
      <a
        href={CC}
        className="font-display mt-3 inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_1px_3px_rgba(59,130,246,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]"
      >
        Open Command Center
        <ArrowRight className="h-3 w-3" />
      </a>
    </div>
  );
}
