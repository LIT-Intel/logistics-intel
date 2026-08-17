"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList,
  PieChart, Pie, Legend,
} from "recharts";
import { Loader2, TrendingUp, DollarSign, Trophy, Percent, Gauge, RefreshCw } from "lucide-react";
import { loadPipelineReport, type PipelineReport, type StageBucket } from "@/api/crmReports";
import {
  DEAL_SERVICE_TYPES,
  DEAL_SERVICE_TYPE_LABELS,
  type DealServiceType,
} from "@/api/crm";
import { formatMoney, initials, avatarColor } from "@/features/crm/crmFormat";
import { useCrmTheme, type CrmThemeTokens } from "@/features/crm/CommandCenterTheme";

/**
 * CRM Phase 2 — Pipeline Reports.
 *
 * Reporting + forecasting over the org's deals. KPI chips, pipeline-by-stage
 * bar, created-vs-won 8-week bar, win/loss donut, owner leaderboard, and a
 * created→advanced→won/lost waterfall. Everything is a REAL aggregate over
 * the org's own rows (RLS-scoped) except the weighted forecast, which is the
 * only modeled figure: Σ(open value × stage win_probability).
 *
 * Visual language mirrors the dashboard / Command Center: Space Grotesk
 * headings, DM Sans body, JetBrains Mono figures, slate/indigo palette,
 * rounded white cards on #F8FAFC.
 */

const FONT_DISPLAY = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
function days(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}d`;
}

export default function PipelineReports({ viewAsUserId = "" }: { viewAsUserId?: string }) {
  const { theme, mode } = useCrmTheme();
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Service-type filter (All + the freight-broker mode set). Narrows every aggregate
  // on the report EXCEPT the "pipeline by service type" breakdown, which
  // always shows the full mix. Works alongside the view-as-user filter.
  const [serviceType, setServiceType] = useState<DealServiceType | "">("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // viewAsUserId (owner/admin "view as [member]") narrows the report to one
      // member; "" = All members. RLS still scopes members to their own rows.
      setReport(await loadPipelineReport(90, viewAsUserId || null, serviceType || null));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [viewAsUserId, serviceType]);

  useEffect(() => { load(); }, [load]);

  if (loading && !report) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "64px 0", color: theme.textMuted, fontFamily: FONT_BODY, fontSize: 14, background: theme.bg }}>
        <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
        Loading pipeline reports…
      </div>
    );
  }
  if (error) {
    return <div style={{ padding: "40px 24px", color: theme.danger, fontFamily: FONT_BODY, fontSize: 14, background: theme.bg }}>{error}</div>;
  }
  if (!report || !report.hasData) {
    return (
      <div style={{ textAlign: "center", padding: "64px 24px", background: theme.bg, flex: 1 }}>
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: theme.panelMuted, marginBottom: 16 }}>
          <TrendingUp style={{ width: 24, height: 24, color: theme.textFaint }} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: theme.heading, fontFamily: FONT_DISPLAY }}>No pipeline data yet</div>
        <div style={{ fontSize: 13, color: theme.textMuted, fontFamily: FONT_BODY, marginTop: 4 }}>
          Add deals from the Pipeline tab and your reports will fill in here.
        </div>
      </div>
    );
  }

  const r = report;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: theme.bg, padding: "20px 24px 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 10, fontWeight: 700, color: mode === "dark" ? "#A5B4FC" : "#6366F1", letterSpacing: "0.24em", textTransform: "uppercase" }}>
            Revenue Intelligence
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: theme.heading, letterSpacing: "-0.02em", marginTop: 4 }}>
            Pipeline Reports
          </div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
            Forecast + performance across your workspace pipeline
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: theme.textFaint }}>
              Service type
            </span>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as DealServiceType | "")}
              style={{ padding: "7px 10px", borderRadius: 10, border: `1.5px solid ${theme.borderStrong}`, background: theme.inputBg, color: theme.textMuted, fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              <option value="">All types</option>
              {DEAL_SERVICE_TYPES.map((m) => (
                <option key={m} value={m}>
                  {DEAL_SERVICE_TYPE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${theme.borderStrong}`, background: theme.panel, color: theme.textMuted, fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            <RefreshCw style={{ width: 13, height: 13, animation: loading ? "spin 1s linear infinite" : undefined }} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI chips */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 18 }}>
        <Kpi icon={<DollarSign style={ICON} />} label="Open pipeline" value={formatMoney(r.openValue)} sub={`${r.openDealCount} open deals`} tint="#6366F1" />
        <Kpi icon={<Gauge style={ICON} />} label="Weighted forecast" value={formatMoney(r.weightedForecast)} sub="value × stage probability" tint="#0EA5E9" />
        <Kpi icon={<Trophy style={ICON} />} label="Won this month" value={formatMoney(r.wonThisMonthValue)} sub={`${r.wonThisMonthCount} deals · MTD`} tint="#22C55E" />
        <Kpi icon={<Percent style={ICON} />} label="Win rate (90d)" value={pct(r.winRate)} sub={r.winRateSampleSize > 0 ? `${r.winLoss.won}/${r.winRateSampleSize} closed` : "no closes yet"} tint="#8B5CF6" />
        <Kpi icon={<TrendingUp style={ICON} />} label="Avg deal age" value={days(r.avgDaysInStage)} sub={r.velocityDaysToClose != null ? `${Math.round(r.velocityDaysToClose)}d to close` : "velocity —"} tint="#F59E0B" />
      </div>

      {/* Row 1: pipeline by stage (funnel bar) + win/loss donut */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 12, marginBottom: 12 }}>
        <Card title="Pipeline value by stage" subtitle="Open deal value in each stage">
          <StageBar buckets={r.stageBuckets.filter((b) => !b.isWon && !b.isLost)} />
        </Card>
        <Card title="Win / loss" subtitle="All closed deals">
          <WinLossDonut won={r.winLoss.won} lost={r.winLoss.lost} />
        </Card>
      </div>

      {/* Row 2: created vs won (8 weeks) + waterfall */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 12, marginBottom: 12 }}>
        <Card title="Created vs won" subtitle="Deals per week · last 8 weeks">
          <CreatedVsWon report={r} />
        </Card>
        <Card title="Pipeline waterfall" subtitle="Last 90 days">
          <Waterfall report={r} />
        </Card>
      </div>

      {/* Row 3: pipeline by service type + owner leaderboard */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
        <Card title="Pipeline by service type" subtitle="Count + open $ per mode">
          <ServiceTypeBreakdown report={r} />
        </Card>
        <Card title="Owner leaderboard" subtitle="Open + won by deal owner">
          <OwnerLeaderboard report={r} />
        </Card>
      </div>
    </div>
  );
}

const ICON: React.CSSProperties = { width: 15, height: 15 };

function Kpi({ icon, label, value, sub, tint }: { icon: React.ReactNode; label: string; value: string; sub: string; tint: string }) {
  const { theme } = useCrmTheme();
  return (
    <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, background: `${tint}${theme.mode === "dark" ? "26" : "15"}`, color: tint }}>{icon}</span>
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: theme.textFaint }}>{label}</span>
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 22, fontWeight: 700, color: theme.heading, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: theme.textMuted, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { theme } = useCrmTheme();
  return (
    <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, color: theme.heading }}>{title}</div>
      {subtitle ? <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: theme.textFaint, marginTop: 2, marginBottom: 10 }}>{subtitle}</div> : <div style={{ height: 10 }} />}
      {children}
    </div>
  );
}

// Recharts tooltip surface — themed so the popover isn't white-on-white in dark.
function useTooltipStyle(): React.CSSProperties {
  const { theme } = useCrmTheme();
  return { fontFamily: FONT_BODY, fontSize: 12, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text };
}

// Shared chart axis/grid colors, themed.
function useChartColors() {
  const { theme, mode } = useCrmTheme();
  return {
    grid: mode === "dark" ? "#1E2A44" : "#EEF2F7",
    axisFaint: theme.textFaint,
    axisMuted: theme.textMuted,
  };
}

function StageBar({ buckets }: { buckets: StageBucket[] }) {
  const tooltipStyle = useTooltipStyle();
  const { grid, axisFaint, axisMuted } = useChartColors();
  const data = buckets.map((b) => ({ name: b.name, value: b.openValue, count: b.openCount, color: b.color, prob: b.winProbability }));
  if (!data.some((d) => d.value > 0 || d.count > 0)) return <Empty label="No open deals in the pipeline" />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={grid} />
        <XAxis type="number" tickFormatter={(v) => formatMoney(Number(v))} tick={{ fontSize: 11, fontFamily: FONT_BODY, fill: axisFaint }} />
        <YAxis type="category" dataKey="name" width={84} tick={{ fontSize: 11, fontFamily: FONT_DISPLAY, fill: axisMuted }} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: any, _n: any, p: any) => [`${formatMoney(Number(v))} · ${p?.payload?.count ?? 0} deals · ${p?.payload?.prob ?? 0}% win`, "Open value"]}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          <LabelList dataKey="value" position="right" formatter={(v: any) => formatMoney(Number(v))} style={{ fontFamily: FONT_MONO, fontSize: 10, fill: axisMuted }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function WinLossDonut({ won, lost }: { won: number; lost: number }) {
  const tooltipStyle = useTooltipStyle();
  if (won + lost === 0) return <Empty label="No closed deals yet" />;
  const data = [
    { name: "Won", value: won, color: "#22C55E" },
    { name: "Lost", value: lost, color: "#F43F5E" },
  ];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontFamily: FONT_BODY, fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function CreatedVsWon({ report }: { report: PipelineReport }) {
  const tooltipStyle = useTooltipStyle();
  const { grid, axisFaint } = useChartColors();
  const data = report.weekly.map((w) => ({ name: w.label, created: w.created, won: w.won }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: FONT_BODY, fill: axisFaint }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fontFamily: FONT_BODY, fill: axisFaint }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontFamily: FONT_BODY, fontSize: 12 }} />
        <Bar dataKey="created" name="Created" fill="#6366F1" radius={[4, 4, 0, 0]} />
        <Bar dataKey="won" name="Won" fill="#22C55E" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Waterfall({ report }: { report: PipelineReport }) {
  const tooltipStyle = useTooltipStyle();
  const { grid, axisFaint, axisMuted } = useChartColors();
  const w = report.waterfall;
  const data = [
    { name: "Created", value: w.created, color: "#6366F1" },
    { name: "Advanced", value: w.advanced, color: "#0EA5E9" },
    { name: "Won", value: w.won, color: "#22C55E" },
    { name: "Lost", value: w.lost, color: "#F43F5E" },
  ];
  if (!data.some((d) => d.value > 0)) return <Empty label="No pipeline movement in window" />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: FONT_BODY, fill: axisFaint }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fontFamily: FONT_BODY, fill: axisFaint }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          <LabelList dataKey="value" position="top" style={{ fontFamily: FONT_MONO, fontSize: 11, fill: axisMuted }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function OwnerLeaderboard({ report }: { report: PipelineReport }) {
  const { theme } = useCrmTheme();
  if (!report.owners.length) return <Empty label="No deal owners yet" />;
  const max = Math.max(1, ...report.owners.map((o) => o.openValue + o.wonValue));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {report.owners.slice(0, 10).map((o) => {
        const total = o.openValue + o.wonValue;
        return (
          <div key={o.ownerId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: avatarColor(o.name), color: "#FFFFFF", fontFamily: FONT_DISPLAY, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {initials(o.name)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: 12.5, fontWeight: 600, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.textMuted, flexShrink: 0 }}>{formatMoney(total)}</span>
              </div>
              <div style={{ position: "relative", height: 6, borderRadius: 3, background: theme.panelMuted, marginTop: 4, overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: `${(total / max) * 100}%`, background: "linear-gradient(90deg,#6366F1,#8B5CF6)", borderRadius: 3 }} />
              </div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: theme.textFaint, marginTop: 3 }}>
                {o.openCount} open · {o.wonCount} won
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ServiceTypeBreakdown({ report }: { report: PipelineReport }) {
  const { theme } = useCrmTheme();
  const rows = report.serviceTypes;
  if (!rows.length) return <Empty label="No deals yet" />;
  const max = Math.max(1, ...rows.map((s) => s.openValue + s.wonValue));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((s) => {
        const total = s.openValue + s.wonValue;
        return (
          <div key={s.serviceType} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: 12.5, fontWeight: 600, color: s.serviceType === "unspecified" ? theme.textFaint : theme.text }}>{s.label}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.textMuted, flexShrink: 0 }}>{formatMoney(s.openValue)}</span>
              </div>
              <div style={{ position: "relative", height: 6, borderRadius: 3, background: theme.panelMuted, marginTop: 4, overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: `${(total / max) * 100}%`, background: "linear-gradient(90deg,#0EA5E9,#6366F1)", borderRadius: 3 }} />
              </div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: theme.textFaint, marginTop: 3 }}>
                {s.totalCount} deals · {s.openCount} open · {s.wonCount} won
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  const { theme } = useCrmTheme();
  return (
    <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: theme.textFaint, fontFamily: FONT_BODY, fontSize: 12.5 }}>
      {label}
    </div>
  );
}
