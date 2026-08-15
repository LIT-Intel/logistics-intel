"use client";

/**
 * Lead-CRM KPI row — the Attio-style headline metrics above the leads list.
 *
 * Mirrors the AdminCommandDeck KpiCard visual language (rounded-2xl white card,
 * mono value, uppercase Space-Grotesk label) but is self-contained here so the
 * standalone workspace doesn't import the admin deck. Fed by
 * `lit_leadcrm_pipeline_summary()` (extended with new_this_week / unassigned /
 * avg_score) + the list total. Every value is coerced through `asText` and is
 * null-safe — an absent metric renders an honest "—", never NaN or a raw object.
 */
import React from "react";
import { Users, Sparkles, TrendingUp, UserX, Target, Loader2 } from "lucide-react";
import { FONT_HEAD, FONT_BODY, FONT_MONO, asText, stageBadgeStyle } from "./leadCrmFormat";
import type { PipelineSummary } from "@/api/leadCrm";

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ style?: React.CSSProperties }>;
  tone?: "blue" | "violet" | "emerald" | "amber" | "slate";
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    blue: { bg: "#EFF6FF", fg: "#2563EB" },
    violet: { bg: "#F5F3FF", fg: "#7C3AED" },
    emerald: { bg: "#ECFDF5", fg: "#059669" },
    amber: { bg: "#FFFBEB", fg: "#B45309" },
    slate: { bg: "#F1F5F9", fg: "#475569" },
  };
  const t = tones[tone] ?? tones.blue;
  return (
    <div style={{ borderRadius: 16, border: "1px solid #E5E7EB", background: "#FFFFFF", padding: "13px 15px", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {Icon ? (
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 10, background: t.bg, color: t.fg, flexShrink: 0 }}>
            <Icon style={{ width: 16, height: 16 }} />
          </span>
        ) : null}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 20, fontWeight: 700, lineHeight: 1, color: "#0F172A" }}>
            {value}
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94A3B8", marginTop: 5 }}>
            {label}
          </div>
          {hint ? (
            <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: "#94A3B8", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {hint}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Number → locale string, or "—" when null/undefined/NaN. */
function num(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return Math.round(v).toLocaleString();
}

/** Percent value (already 0–100) → "42%" or "—". */
function pct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${Math.round(v)}%`;
}

export type StageChip = { stage_id: string | null; name: string; color: string | null; count: number };

/**
 * The KPI row. `summary` is the full pipeline summary; `totalLeads` is the list
 * total (falls back to summary.totals.total_leads). `stageChips` are the ordered
 * per-stage counts rendered as compact colored chips.
 */
export default function LeadCrmKpis({
  summary,
  totalLeads,
  stageChips,
  loading,
}: {
  summary: PipelineSummary | null;
  totalLeads: number | null;
  stageChips: StageChip[];
  loading?: boolean;
}) {
  const totals = summary?.totals ?? null;
  const conv = summary?.conversion_rates ?? null;

  const total = totalLeads != null ? totalLeads : totals?.total_leads ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Headline cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KpiCard
          label="Total leads"
          value={loading && total == null ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : asText(num(total))}
          icon={Users}
          tone="blue"
        />
        <KpiCard label="New this week" value={asText(num(totals?.new_this_week))} icon={Sparkles} tone="violet" />
        <KpiCard
          label="Lead → Trial"
          value={asText(pct(conv?.lead_to_trial))}
          hint="conversion"
          icon={TrendingUp}
          tone="emerald"
        />
        <KpiCard
          label="Trial → Subscriber"
          value={asText(pct(conv?.trial_to_subscriber))}
          hint="conversion"
          icon={Target}
          tone="emerald"
        />
        <KpiCard label="Unassigned" value={asText(num(totals?.unassigned))} icon={UserX} tone="amber" />
        <KpiCard label="Avg score" value={asText(num(totals?.avg_score))} icon={Target} tone="slate" />
      </div>

      {/* Per-stage chips */}
      {stageChips.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {stageChips.map((s) => (
            <span
              key={s.stage_id ?? s.name}
              style={{ ...stageBadgeStyle(s.color), gap: 6 }}
              title={`${asText(s.name)}: ${asText(num(s.count))}`}
            >
              {asText(s.name)}
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700 }}>{asText(num(s.count))}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
