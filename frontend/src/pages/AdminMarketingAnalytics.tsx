/**
 * /app/admin/marketing-analytics — Resend email-marketing dashboard for
 * Logistic Intel platform admins. Constant-Contact-flavoured: KPI strip
 * across the top, sequence + template tables in the middle, daily-volume
 * sparkline, recent activity feed in a side rail. The "LinkedIn
 * Performance" section (Ads + Organic, pulled from Windsor.ai via a
 * server-side proxy) sits between Sequence Performance and Daily Volume.
 *
 * Visual standard matches AdminDashboardV2 + AdminShared primitives:
 *   - Page background slate-50 (#F4F6FB)
 *   - Header bar with eyebrow + Space-Grotesk-700 title
 *   - rounded-xl cards, slate-200 borders, soft 1px shadow
 *   - Brand-blue gradient primary button + ghost secondary actions
 *   - Empty/loading/error states have a consistent icon-tile treatment
 *
 * Data sources:
 *   - public.lit_resend_events (Resend webhook receiver). RLS gates
 *     SELECTs to platform admins via public.is_admin_caller().
 *   - LinkedIn Ads + LinkedIn Organic via /api/admin/linkedin-analytics
 *     (marketing-side proxy → Windsor.ai). Returns null when the
 *     WINDSOR_API_KEY env var is unset, which we render as a friendly
 *     "not configured" state.
 *   - lit_leads first_touch / last_touch jsonb for the attribution
 *     cross-reference callout.
 *
 * Route guard: <RequireSuperAdmin> in App.jsx.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ExternalLink,
  Linkedin,
  Mail,
  MailCheck,
  MailOpen,
  MailWarning,
  MousePointerClick,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
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
import {
  fetchLinkedInAnalytics,
  fetchLinkedInLeadCount,
  type LinkedInAnalyticsResponse,
} from "@/api/linkedinAnalytics";
import { fontBody, fontDisplay, fontMono } from "@/features/admin/AdminShared";

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
  return Math.round(n).toLocaleString();
}

function fmtUsd(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtUsdPrecise(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

  // LinkedIn state
  const [li, setLi] = useState<LinkedInAnalyticsResponse | null>(null);
  const [liLoading, setLiLoading] = useState(true);
  const [liErr, setLiErr] = useState<string | null>(null);
  const [liNotConfigured, setLiNotConfigured] = useState(false);
  const [liLeadCount, setLiLeadCount] = useState<number | null>(null);

  const days = RANGE_OPTS.find((r) => r.id === range)?.days ?? 30;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
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
  }, [days, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLiLoading(true);
    setLiErr(null);
    setLiNotConfigured(false);
    Promise.all([
      fetchLinkedInAnalytics(days),
      fetchLinkedInLeadCount(days).catch(() => 0),
    ])
      .then(([analytics, leadCount]) => {
        if (cancelled) return;
        if (analytics === null) {
          setLiNotConfigured(true);
          setLi(null);
        } else {
          setLi(analytics);
        }
        setLiLeadCount(leadCount);
        setLiLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLiErr(e instanceof Error ? e.message : "Failed to load LinkedIn data");
        setLi(null);
        setLiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, refreshKey]);

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

  const recent = useMemo(() => events.slice(0, 50), [events]);

  return (
    <div className="min-h-screen bg-[#F4F6FB]" style={{ fontFamily: fontBody }}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header bar — matches AdminDashboardV2 visual rhythm */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-600">
              <BarChart3 className="h-4 w-4" aria-hidden />
              <span
                className="text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ fontFamily: fontDisplay }}
              >
                Marketing analytics
              </span>
            </div>
            <h1
              className="mt-1.5 text-[28px] font-bold tracking-[-0.02em] text-slate-950"
              style={{ fontFamily: fontDisplay }}
            >
              Marketing performance
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">
              Resend email events, LinkedIn Ads + organic, and lifecycle activity
              across logisticintel.com.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              {RANGE_OPTS.map((r) => {
                const active = r.id === range;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRange(r.id)}
                    className={[
                      "h-7 rounded-md px-3 text-[12.5px] font-semibold transition",
                      active
                        ? "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)]"
                        : "text-slate-600 hover:bg-slate-50",
                    ].join(" ")}
                    style={{ fontFamily: fontDisplay }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading && liLoading}
              style={{ fontFamily: fontDisplay }}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading || liLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </header>

        {err && <ErrorBanner message={err} />}

        {/* KPI strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          <KpiCard label="Sent" value={fmtInt(kpis.sent)} icon={Mail} tone="slate" />
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
            <LinkedInSection
              days={days}
              data={li}
              loading={liLoading}
              err={liErr}
              notConfigured={liNotConfigured}
              leadCount={liLeadCount}
            />
            <DailyVolumeChart data={daily} loading={loading} />
            <TemplateTable rows={templateRows} loading={loading} />
          </div>

          {/* Side rail: recent activity */}
          <aside className="lg:col-span-1">
            <RecentActivityFeed events={recent} loading={loading} />
          </aside>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── Shared atoms ──────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="mt-6 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

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
  tone: "slate" | "blue" | "emerald" | "indigo" | "rose" | "amber" | "violet";
}) {
  const toneBg: Record<typeof tone, string> = {
    slate: "bg-slate-100",
    blue: "bg-blue-50",
    emerald: "bg-emerald-50",
    indigo: "bg-indigo-50",
    rose: "bg-rose-50",
    amber: "bg-amber-50",
    violet: "bg-violet-50",
  };
  const toneIcon: Record<typeof tone, string> = {
    slate: "text-slate-600",
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    indigo: "text-indigo-700",
    rose: "text-rose-700",
    amber: "text-amber-700",
    violet: "text-violet-700",
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-[22px] w-[22px] items-center justify-center rounded-md ${toneBg[tone]} ${toneIcon[tone]}`}
        >
          <Icon className="h-3 w-3" />
        </div>
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500"
          style={{ fontFamily: fontDisplay }}
        >
          {label}
        </span>
      </div>
      <div
        className="leading-[1.05] text-[26px] font-bold tracking-[-0.02em] text-slate-950"
        style={{ fontFamily: fontDisplay }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11.5px] text-slate-400" style={{ fontFamily: fontBody }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
  dense,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <header
        className={`flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 ${
          dense ? "py-3" : "py-4"
        }`}
      >
        <div className="min-w-0">
          <h2
            className="text-[14.5px] font-bold tracking-[-0.005em] text-slate-900"
            style={{ fontFamily: fontDisplay }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className="mt-0.5 text-[12.5px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
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
        "bg-slate-50/60 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500",
        align === "right" ? "text-right" : "text-left",
      ].join(" ")}
      style={{ fontFamily: fontDisplay }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td
      className={[
        "px-4 py-2.5 text-[13px] text-slate-700",
        align === "right" ? "text-right tabular-nums" : "",
      ].join(" ")}
      style={mono ? { fontFamily: fontMono } : undefined}
    >
      {children}
    </td>
  );
}

function EmptyState({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div
        className="text-[13px] font-semibold text-slate-900"
        style={{ fontFamily: fontDisplay }}
      >
        {title}
      </div>
      {sub ? (
        <div
          className="mx-auto mt-1 max-w-md text-[12px] text-slate-500"
          style={{ fontFamily: fontBody }}
        >
          {sub}
        </div>
      ) : null}
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
        <table className="w-full">
          <thead>
            <tr>
              <Th>Sequence</Th>
              <Th align="right">Steps</Th>
              <Th align="right">Sent</Th>
              <Th align="right">Delivered</Th>
              <Th align="right">Open rate</Th>
              <Th align="right">Click rate</Th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.every((r) => r.sent === 0) ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[13px] text-slate-400">
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
                    <span
                      className="font-semibold text-slate-800"
                      style={{ fontFamily: fontDisplay }}
                    >
                      {r.label}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    {r.steps}
                  </Td>
                  <Td align="right" mono>
                    {fmtInt(r.sent)}
                  </Td>
                  <Td align="right" mono>
                    {fmtInt(r.delivered)}
                  </Td>
                  <Td align="right" mono>
                    {fmtPct(r.openRate)}
                  </Td>
                  <Td align="right" mono>
                    {fmtPct(r.clickRate)}
                  </Td>
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
        <table className="w-full">
          <thead>
            <tr>
              <Th>Template</Th>
              <Th>Sequence</Th>
              <Th align="right">Sent</Th>
              <Th align="right">Open rate</Th>
              <Th align="right">Click rate</Th>
              <Th align="right">Bounced</Th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[13px] text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-0">
                  <EmptyState
                    icon={Mail}
                    title="No template-tagged sends in this window"
                    sub="Once the Resend webhook receives tagged sends they appear here."
                  />
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
                      className="max-w-[280px] truncate font-semibold text-slate-800"
                      title={r.templateLabel}
                      style={{ fontFamily: fontDisplay }}
                    >
                      {r.templateLabel}
                    </div>
                    <div
                      className="max-w-[280px] truncate text-[10.5px] text-slate-400"
                      title={r.templateId}
                      style={{ fontFamily: fontMono }}
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
                  <Td align="right" mono>
                    {fmtInt(r.sent)}
                  </Td>
                  <Td align="right" mono>
                    {fmtPct(r.openRate)}
                  </Td>
                  <Td align="right" mono>
                    {fmtPct(r.clickRate)}
                  </Td>
                  <Td align="right" mono>
                    {fmtInt(r.bounced)}
                  </Td>
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
    <Card title="Daily volume" subtitle="Unique sends · opens · clicks per day">
      {loading && data.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-slate-400">Loading…</div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No activity yet"
          sub="Webhook events will populate this chart once the Resend endpoint is configured."
        />
      ) : (
        <div className="px-2 pb-4 pt-2">
          <div className="flex items-end gap-1 px-3" style={{ height: 160 }}>
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
          <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-slate-500">
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

// ────────────────────────── LinkedIn section ──────────────────────────

function LinkedInSection({
  days,
  data,
  loading,
  err,
  notConfigured,
  leadCount,
}: {
  days: number;
  data: LinkedInAnalyticsResponse | null;
  loading: boolean;
  err: string | null;
  notConfigured: boolean;
  leadCount: number | null;
}) {
  return (
    <Card
      title="LinkedIn performance"
      subtitle={`Ads + organic, last ${days} days · pulled from Windsor.ai`}
      right={
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700"
          style={{ fontFamily: fontDisplay }}
        >
          <Linkedin className="h-3 w-3" />
          LinkedIn
        </span>
      }
    >
      {notConfigured ? (
        <EmptyState
          icon={Linkedin}
          title="LinkedIn analytics not configured"
          sub={
            <>
              Set <span className="font-mono text-[11px] text-slate-700">WINDSOR_API_KEY</span> in
              the marketing Vercel project to pull LinkedIn Ads + Organic
              performance into this dashboard.
            </>
          }
        />
      ) : err ? (
        <div className="p-5">
          <ErrorBanner message={err} />
        </div>
      ) : loading || !data ? (
        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
          <LinkedInSkeleton />
          <LinkedInSkeleton />
        </div>
      ) : (
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <LinkedInAdsCard data={data.ads} days={days} />
            <LinkedInOrganicCard data={data.organic} days={days} />
          </div>
          <AttributionCallout
            leadCount={leadCount ?? 0}
            days={days}
            partialFailures={data.partial_failures}
          />
        </div>
      )}
    </Card>
  );
}

function LinkedInSkeleton() {
  return (
    <div className="flex min-h-[260px] animate-pulse flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="h-3 w-24 rounded bg-slate-200" />
      <div className="h-7 w-40 rounded bg-slate-200" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="h-12 rounded bg-slate-200/70" />
        <div className="h-12 rounded bg-slate-200/70" />
        <div className="h-12 rounded bg-slate-200/70" />
        <div className="h-12 rounded bg-slate-200/70" />
      </div>
      <div className="mt-2 h-14 rounded bg-slate-200/70" />
    </div>
  );
}

function LinkedInAdsCard({
  data,
  days,
}: {
  data: LinkedInAnalyticsResponse["ads"];
  days: number;
}) {
  const hasData = data.impressions > 0 || data.spend > 0;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-700">
            <Target className="h-3 w-3" />
          </div>
          <span
            className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500"
            style={{ fontFamily: fontDisplay }}
          >
            LinkedIn Ads
          </span>
        </div>
        <span className="text-[11px] text-slate-400" style={{ fontFamily: fontMono }}>
          {days}d
        </span>
      </div>

      {!hasData ? (
        <EmptyState
          icon={Target}
          title="No spend in this window"
          sub="When campaigns run they show here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LiStat label="Spend" value={fmtUsd(data.spend)} />
            <LiStat label="Impressions" value={fmtInt(data.impressions)} />
            <LiStat label="Clicks" value={fmtInt(data.clicks)} />
            <LiStat
              label="CTR"
              value={fmtPct(data.ctr)}
              sub={`${fmtUsdPrecise(data.cpc)} CPC`}
            />
          </div>

          <div className="mt-1">
            <div
              className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500"
              style={{ fontFamily: fontDisplay }}
            >
              Top campaigns by spend
            </div>
            {data.top_campaigns.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-[12px] text-slate-400">
                No campaign breakdown available.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {data.top_campaigns.map((c) => (
                  <li key={c.campaign} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-[12.5px] font-semibold text-slate-800"
                        title={c.campaign}
                        style={{ fontFamily: fontDisplay }}
                      >
                        {c.campaign}
                      </div>
                      <div
                        className="text-[10.5px] text-slate-500"
                        style={{ fontFamily: fontMono }}
                      >
                        {fmtInt(c.impressions)} imp · {fmtPct(c.ctr)} CTR
                        {c.leads > 0 ? ` · ${fmtInt(c.leads)} leads` : ""}
                      </div>
                    </div>
                    <div
                      className="text-right text-[12.5px] font-bold tabular-nums text-slate-900"
                      style={{ fontFamily: fontMono }}
                    >
                      {fmtUsd(c.spend)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LinkedInOrganicCard({
  data,
  days,
}: {
  data: LinkedInAnalyticsResponse["organic"];
  days: number;
}) {
  const delta = data.followers_delta;
  const deltaLabel =
    delta === 0 ? null : `${delta > 0 ? "+" : ""}${fmtInt(delta)} in ${days}d`;
  const hasData = data.post_impressions > 0 || data.followers > 0;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-50 text-violet-700">
            <Sparkles className="h-3 w-3" />
          </div>
          <span
            className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500"
            style={{ fontFamily: fontDisplay }}
          >
            LinkedIn Organic
          </span>
        </div>
        <span className="text-[11px] text-slate-400" style={{ fontFamily: fontMono }}>
          {days}d
        </span>
      </div>

      {!hasData ? (
        <EmptyState
          icon={Sparkles}
          title="No organic activity"
          sub="Post on the company page to populate this card."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LiStat
              label="Followers"
              value={fmtInt(data.followers)}
              sub={deltaLabel || undefined}
              subTone={delta > 0 ? "up" : delta < 0 ? "down" : "neutral"}
            />
            <LiStat label="Post impressions" value={fmtInt(data.post_impressions)} />
            <LiStat label="Engagements" value={fmtInt(data.engagements)} />
            <LiStat label="Engagement rate" value={fmtPct(data.engagement_rate)} />
          </div>

          <div className="mt-1">
            <div
              className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500"
              style={{ fontFamily: fontDisplay }}
            >
              Top posts by impressions
            </div>
            {data.top_posts.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-[12px] text-slate-400">
                No posts tagged in this window.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {data.top_posts.map((p) => (
                  <li key={p.post_id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-[12.5px] font-semibold text-slate-800"
                        title={p.title}
                        style={{ fontFamily: fontDisplay }}
                      >
                        {p.title}
                      </div>
                      <div
                        className="text-[10.5px] text-slate-500"
                        style={{ fontFamily: fontMono }}
                      >
                        {fmtInt(p.impressions)} imp · {fmtPct(p.engagement_rate)} eng
                      </div>
                    </div>
                    <div
                      className="text-right text-[12.5px] font-bold tabular-nums text-slate-900"
                      style={{ fontFamily: fontMono }}
                    >
                      {fmtInt(p.engagements)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LiStat({
  label,
  value,
  sub,
  subTone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: "up" | "down" | "neutral";
}) {
  const subColor =
    subTone === "up"
      ? "text-emerald-700"
      : subTone === "down"
        ? "text-rose-700"
        : "text-slate-400";
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/40 px-3 py-2">
      <div
        className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"
        style={{ fontFamily: fontDisplay }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-[17px] font-bold tracking-[-0.01em] text-slate-950"
        style={{ fontFamily: fontDisplay }}
      >
        {value}
      </div>
      {sub ? (
        <div
          className={`mt-0.5 text-[10.5px] font-semibold ${subColor}`}
          style={{ fontFamily: fontMono }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function AttributionCallout({
  leadCount,
  days,
  partialFailures,
}: {
  leadCount: number;
  days: number;
  partialFailures?: string[];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-white text-blue-700 ring-1 ring-blue-200">
          <Users className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <div
            className="text-[12.5px] font-bold text-slate-900"
            style={{ fontFamily: fontDisplay }}
          >
            LinkedIn attribution
          </div>
          <div className="mt-0.5 text-[12px] text-slate-600">
            <span
              className="font-bold text-blue-700"
              style={{ fontFamily: fontMono }}
            >
              {fmtInt(leadCount)}
            </span>{" "}
            lead{leadCount === 1 ? "" : "s"} in{" "}
            <span className="font-mono text-[11px] text-slate-700">lit_leads</span>{" "}
            had a LinkedIn first or last touch in the last {days} days.
          </div>
          {partialFailures && partialFailures.length > 0 ? (
            <div className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {partialFailures.length} Windsor slice
              {partialFailures.length === 1 ? "" : "s"} failed — partial data shown.
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a
          href="https://www.linkedin.com/campaignmanager/accounts/536270862/overview"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-slate-700 transition hover:bg-slate-50"
          style={{ fontFamily: fontDisplay }}
        >
          Campaign Manager
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
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
          <div className="px-4 py-10 text-center text-[13px] text-slate-400">Loading…</div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No events yet"
            sub="Lifecycle events stream here in real time as Resend fires them."
          />
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
                      style={{ fontFamily: fontDisplay }}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                      {e.event_type}
                    </span>
                    <span
                      className="text-[11px] text-slate-400"
                      title={new Date(e.created_at).toLocaleString()}
                      style={{ fontFamily: fontMono }}
                    >
                      {fmtRelative(e.created_at)}
                    </span>
                  </div>
                  <div
                    className="mt-1 truncate text-[12.5px] text-slate-700"
                    title={e.email_to ?? undefined}
                  >
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
                      className="truncate text-[10.5px] text-indigo-600"
                      title={e.click_url}
                      style={{ fontFamily: fontMono }}
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
