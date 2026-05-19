/**
 * /app/admin/marketing-analytics — Resend email-marketing dashboard for
 * Logistic Intel platform admins. Constant-Contact-flavoured: KPI strip
 * across the top, sequence + template tables in the middle, daily-volume
 * sparkline, recent activity feed in a side rail.
 *
 * Data source: public.lit_resend_events (populated by the Resend webhook
 * receiver at marketing/app/api/webhooks/resend/route.ts). RLS gates
 * SELECTs to platform admins (public.is_admin_caller()); the route is
 * additionally guarded by <RequireSuperAdmin> in App.jsx.
 */

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Mail,
  MailCheck,
  MailOpen,
  MailWarning,
  MousePointerClick,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import {
  fetchRecentEmailEvents,
  computeKpis,
  computeTemplatePerformance,
  computeSequencePerformance,
  computeDailyVolume,
  SEQUENCE_LABELS,
  type EmailEvent,
  type KpiSummary,
  type SequencePerformance,
  type TemplatePerformance,
} from "@/api/marketingAnalytics";

type RangeKey = "7d" | "30d" | "90d";

const RANGE_OPTS: Array<{ id: RangeKey; label: string; days: number }> = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
];

function fmtPct(n: number): string {
  if (!isFinite(n) || n === 0) return "0%";
  if (n >= 0.1) return `${(n * 100).toFixed(1)}%`;
  return `${(n * 100).toFixed(2)}%`;
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const EVENT_TONE: Record<string, { bg: string; text: string; dot: string }> = {
  sent: { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" },
  delivered: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  opened: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  clicked: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  bounced: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  complained: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  failed: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
};

export default function AdminMarketingAnalytics() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const days = RANGE_OPTS.find((r) => r.id === range)?.days ?? 30;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    fetchRecentEmailEvents(since, 10_000)
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Failed to load email events");
        setEvents([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, refreshKey]);

  const kpis = useMemo<KpiSummary>(() => computeKpis(events), [events]);
  const sequenceRows = useMemo<SequencePerformance[]>(
    () => computeSequencePerformance(events),
    [events],
  );
  const templateRows = useMemo<TemplatePerformance[]>(
    () => computeTemplatePerformance(events),
    [events],
  );
  const daily = useMemo(() => computeDailyVolume(events), [events]);

  // The activity feed is the most recent 50 events across the whole window.
  const recent = useMemo(() => events.slice(0, 50), [events]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600">
            <BarChart3 className="h-4 w-4" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
              Marketing analytics
            </span>
          </div>
          <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.02em] text-slate-900">
            Email performance
          </h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
            Live Resend-webhook ingestion. Drip sequences, transactional sends, and
            lifecycle events across logisticintel.com.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white p-1">
            {RANGE_OPTS.map((r) => {
              const active = r.id === range;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  className={[
                    "h-7 rounded px-3 text-[12.5px] font-semibold transition",
                    active
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {err && (
        <div
          className="mt-6 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{err}</span>
        </div>
      )}

      {/* KPI strip */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard
          label="Sent"
          value={fmtInt(kpis.sent)}
          icon={Mail}
          tone="slate"
        />
        <KpiCard
          label="Delivered"
          value={fmtInt(kpis.delivered)}
          sub={`${fmtPct(kpis.sent ? kpis.delivered / kpis.sent : 0)} of sent`}
          icon={MailCheck}
          tone="blue"
        />
        <KpiCard
          label="Open rate"
          value={fmtPct(kpis.openRate)}
          sub={`${fmtInt(kpis.uniqueOpens)} unique opens`}
          icon={MailOpen}
          tone="emerald"
        />
        <KpiCard
          label="Click rate"
          value={fmtPct(kpis.clickRate)}
          sub={`${fmtInt(kpis.uniqueClicks)} unique clicks`}
          icon={MousePointerClick}
          tone="indigo"
        />
        <KpiCard
          label="Bounce / complaints"
          value={fmtPct(kpis.bounceRate)}
          sub={`${fmtInt(kpis.bounced)} bounced · ${fmtInt(kpis.complained)} complaints`}
          icon={MailWarning}
          tone={kpis.bounceRate > 0.03 ? "rose" : "amber"}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          <SequenceTable rows={sequenceRows} loading={loading} />
          <TemplateTable rows={templateRows} loading={loading} />
          <DailyVolumeChart data={daily} loading={loading} />
        </div>

        {/* Side rail: recent activity */}
        <aside className="lg:col-span-1">
          <RecentActivityFeed events={recent} loading={loading} />
        </aside>
      </div>
    </div>
  );
}

// ────────────────────────── KPI card ──────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "slate" | "blue" | "emerald" | "indigo" | "rose" | "amber";
}) {
  const toneRing: Record<typeof tone, string> = {
    slate: "border-slate-200",
    blue: "border-blue-200",
    emerald: "border-emerald-200",
    indigo: "border-indigo-200",
    rose: "border-rose-200",
    amber: "border-amber-200",
  };
  const toneIcon: Record<typeof tone, string> = {
    slate: "text-slate-500",
    blue: "text-blue-600",
    emerald: "text-emerald-600",
    indigo: "text-indigo-600",
    rose: "text-rose-600",
    amber: "text-amber-600",
  };
  return (
    <div
      className={`rounded-xl border bg-white px-4 py-3.5 sm:px-5 sm:py-4 ${toneRing[tone]}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          {label}
        </div>
        <Icon className={`h-4 w-4 ${toneIcon[tone]}`} aria-hidden />
      </div>
      <div className="mt-1.5 font-mono text-[24px] font-bold tracking-[-0.02em] text-slate-900">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[11.5px] text-slate-500">{sub}</div>
      )}
    </div>
  );
}

// ────────────────────────── Sequence table ──────────────────────────

function SequenceTable({
  rows,
  loading,
}: {
  rows: SequencePerformance[];
  loading: boolean;
}) {
  return (
    <Card title="Sequence performance" subtitle="Per drip-campaign rollup">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <Th>Sequence</Th>
            <Th align="right">Steps</Th>
            <Th align="right">Sent</Th>
            <Th align="right">Delivered</Th>
            <Th align="right">Open rate</Th>
            <Th align="right">Click rate</Th>
          </thead>
          <tbody>
            {loading && rows.every((r) => r.sent === 0) ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.sequenceKey}
                  className="border-t border-slate-100 hover:bg-slate-50/60"
                >
                  <Td>
                    <span className="font-semibold text-slate-800">
                      {r.label}
                    </span>
                  </Td>
                  <Td align="right">{r.steps}</Td>
                  <Td align="right">{fmtInt(r.sent)}</Td>
                  <Td align="right">{fmtInt(r.delivered)}</Td>
                  <Td align="right">{fmtPct(r.openRate)}</Td>
                  <Td align="right">{fmtPct(r.clickRate)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ────────────────────────── Template table ──────────────────────────

function TemplateTable({
  rows,
  loading,
}: {
  rows: TemplatePerformance[];
  loading: boolean;
}) {
  return (
    <Card
      title="Template performance"
      subtitle="Per-template engagement across all sends"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <Th>Template</Th>
            <Th>Sequence</Th>
            <Th align="right">Sent</Th>
            <Th align="right">Open rate</Th>
            <Th align="right">Click rate</Th>
            <Th align="right">Bounced</Th>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No template-tagged sends in this window.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.templateId}
                  className="border-t border-slate-100 hover:bg-slate-50/60"
                >
                  <Td>
                    <div
                      className="max-w-[280px] truncate font-medium text-slate-800"
                      title={r.templateLabel}
                    >
                      {r.templateLabel}
                    </div>
                    <div
                      className="max-w-[280px] truncate font-mono text-[10.5px] text-slate-400"
                      title={r.templateId}
                    >
                      {r.templateId}
                    </div>
                  </Td>
                  <Td>
                    <span className="text-[11.5px] text-slate-500">
                      {r.sequenceKey === "unknown"
                        ? "—"
                        : SEQUENCE_LABELS[r.sequenceKey]}
                    </span>
                  </Td>
                  <Td align="right">{fmtInt(r.sent)}</Td>
                  <Td align="right">{fmtPct(r.openRate)}</Td>
                  <Td align="right">{fmtPct(r.clickRate)}</Td>
                  <Td align="right">{fmtInt(r.bounced)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ────────────────────────── Daily volume chart ──────────────────────────

function DailyVolumeChart({
  data,
  loading,
}: {
  data: Array<{ day: string; sent: number; opened: number; clicked: number }>;
  loading: boolean;
}) {
  const max = useMemo(
    () => Math.max(1, ...data.map((d) => Math.max(d.sent, d.opened, d.clicked))),
    [data],
  );
  return (
    <Card
      title="Daily volume"
      subtitle="Unique sends · opens · clicks per day"
    >
      {loading && data.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-slate-400">
          Loading…
        </div>
      ) : data.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-slate-400">
          No activity yet — webhook events will populate this chart once the
          Resend endpoint is configured.
        </div>
      ) : (
        <div className="px-2 pb-3">
          <div className="flex items-end gap-1 px-2" style={{ height: 160 }}>
            {data.map((d) => (
              <div
                key={d.day}
                className="flex flex-1 flex-col items-center justify-end gap-0.5"
                title={`${d.day} · ${d.sent} sent · ${d.opened} opened · ${d.clicked} clicked`}
              >
                <div
                  className="w-full max-w-[14px] rounded-t bg-slate-300"
                  style={{ height: `${(d.sent / max) * 100}%` }}
                />
                <div
                  className="w-full max-w-[14px] rounded-t bg-emerald-400"
                  style={{ height: `${(d.opened / max) * 100}%` }}
                />
                <div
                  className="w-full max-w-[14px] rounded-t bg-indigo-500"
                  style={{ height: `${(d.clicked / max) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-slate-500">
            <LegendDot color="bg-slate-300" label="Sent" />
            <LegendDot color="bg-emerald-400" label="Opened" />
            <LegendDot color="bg-indigo-500" label="Clicked" />
          </div>
        </div>
      )}
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

// ────────────────────────── Recent activity feed ──────────────────────────

function RecentActivityFeed({
  events,
  loading,
}: {
  events: EmailEvent[];
  loading: boolean;
}) {
  return (
    <Card title="Recent activity" subtitle="Latest 50 lifecycle events" dense>
      <div className="max-h-[680px] overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-slate-400">
            Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-slate-400">
            No events yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => {
              const tone = EVENT_TONE[e.event_type] || EVENT_TONE.sent;
              return (
                <li key={e.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={[
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em]",
                        tone.bg,
                        tone.text,
                      ].join(" ")}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                      {e.event_type}
                    </span>
                    <span
                      className="text-[11px] text-slate-400"
                      title={new Date(e.created_at).toLocaleString()}
                    >
                      {fmtRelative(e.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[12.5px] text-slate-700" title={e.email_to ?? undefined}>
                    {e.email_to || "(no recipient)"}
                  </div>
                  {e.subject && (
                    <div
                      className="truncate text-[11.5px] text-slate-500"
                      title={e.subject}
                    >
                      {e.subject}
                    </div>
                  )}
                  {e.click_url && (
                    <div
                      className="truncate font-mono text-[10.5px] text-indigo-600"
                      title={e.click_url}
                    >
                      → {e.click_url}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ────────────────────────── Card primitives ──────────────────────────

function Card({
  title,
  subtitle,
  children,
  dense,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header
        className={`flex items-end justify-between gap-3 border-b border-slate-100 px-5 ${
          dense ? "py-3" : "py-4"
        }`}
      >
        <div>
          <h2 className="text-[15.5px] font-semibold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p>
          )}
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={[
        "bg-slate-50/60 px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500",
        align === "right" ? "text-right" : "text-left",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={[
        "px-4 py-2.5 text-slate-700",
        align === "right" ? "text-right font-mono tabular-nums" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}
