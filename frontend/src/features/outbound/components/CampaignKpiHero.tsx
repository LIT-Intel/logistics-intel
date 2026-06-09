/**
 * CampaignKpiHero — state-dependent 6-tile hero for the campaign
 * builder. Replaces the old single AUDIENCE SIZE strip.
 *
 * Draft state: shows audience + scheduled + estimated reach + 3
 * estimated rates (industry-average fallback when org has no
 * historical campaigns).
 *
 * Active/paused/complete: shows audience + sent + 4 real rates
 * (open/click/reply/bounce) from the funnel data. Paused state adds
 * a grey "Paused" badge.
 */
import { useState } from "react";
import type { CampaignFunnel, CampaignStatus } from "../types";
import { formatCount, formatRate } from "../lib/metrics";
import { Sparkline } from "./Sparkline";
import { EngagementDrillIn } from "./EngagementDrillIn";
import type { EngagementEventType } from "../hooks/useEngagementRecipients";

interface Props {
  status: CampaignStatus;
  audienceCount: number;
  funnel: CampaignFunnel | null;
  sparkData: number[];
  scheduledLabel?: string;
  campaignId?: string | null;
}

// Industry-average fallback rates (B2B email) when org has no
// launched-campaign history yet. Hard-coded here per spec's "Open
// design decisions" — empty estimate tiles look broken.
const FALLBACK_OPEN_RATE = 40;
const FALLBACK_CLICK_RATE = 8;
const FALLBACK_REPLY_RATE = 3;

type TileTone = "neutral" | "blue" | "indigo" | "emerald" | "amber" | "rose";

const TONE_CLASSES: Record<TileTone, { bg: string; border: string; value: string; spark: string }> = {
  neutral: { bg: "bg-white", border: "border-slate-200", value: "text-slate-900", spark: "#3B82F6" },
  blue:    { bg: "bg-blue-50/40", border: "border-blue-200", value: "text-blue-900", spark: "#3B82F6" },
  indigo:  { bg: "bg-indigo-50/40", border: "border-indigo-200", value: "text-indigo-900", spark: "#6366F1" },
  emerald: { bg: "bg-emerald-50/40", border: "border-emerald-200", value: "text-emerald-900", spark: "#10B981" },
  amber:   { bg: "bg-amber-50/40", border: "border-amber-300", value: "text-amber-900", spark: "#F59E0B" },
  rose:    { bg: "bg-rose-50/40", border: "border-rose-300", value: "text-rose-900", spark: "#F43F5E" },
};

interface TileProps {
  label: string;
  value: string;
  hint?: string;
  spark?: number[];
  tone?: TileTone;
  onClick?: () => void;
}

function Tile({ label, value, hint, spark, tone = "neutral", onClick }: TileProps) {
  const classes = TONE_CLASSES[tone];
  return (
    <div
      onClick={onClick}
      className={`flex min-w-[120px] flex-col gap-1 rounded-2xl border ${classes.bg} ${classes.border} px-4 py-3 shadow-sm ${onClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      <span className={`text-2xl font-bold tabular-nums ${classes.value}`}>
        {value}
      </span>
      <div className="flex items-center justify-between gap-2">
        {hint ? (
          <span className="text-[11px] text-slate-500">{hint}</span>
        ) : <span />}
        {spark && spark.length >= 2 ? (
          <Sparkline data={spark} width={56} height={18} color={classes.spark} />
        ) : null}
      </div>
    </div>
  );
}

export function CampaignKpiHero({
  status,
  audienceCount,
  funnel,
  sparkData,
  scheduledLabel,
  campaignId,
}: Props) {
  const isDraft = status === "draft";
  const audienceDisplay = audienceCount > 0 ? formatCount(audienceCount) : "—";
  const [drill, setDrill] = useState<EngagementEventType | null>(null);

  const bounceTone: TileTone = (funnel?.bounceRate ?? 0) > 10
    ? "rose"
    : (funnel?.bounceRate ?? 0) > 5
      ? "amber"
      : "neutral";

  // Drill-in only meaningful when we have an id AND that metric has > 0.
  const canDrill = Boolean(campaignId) && Boolean(funnel);
  const sentClick    = canDrill && (funnel?.sent    ?? 0) > 0 ? () => setDrill("sent")    : undefined;
  const openClick    = canDrill && (funnel?.opened  ?? 0) > 0 ? () => setDrill("opened")  : undefined;
  const clickedClick = canDrill && (funnel?.clicked ?? 0) > 0 ? () => setDrill("clicked") : undefined;
  const replyClick   = canDrill && (funnel?.replied ?? 0) > 0 ? () => setDrill("replied") : undefined;
  const bounceClick  = canDrill && (funnel?.bounced ?? 0) > 0 ? () => setDrill("bounced") : undefined;

  return (
    <div className="relative">
      {status === "paused" && (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          Paused
        </span>
      )}
      {status === "archived" && (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          Complete
        </span>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Audience"
          value={audienceDisplay}
          hint={audienceCount > 0 ? "selected" : "pick recipients"}
        />

        {isDraft ? (
          <>
            <Tile label="Scheduled" value={scheduledLabel ?? "—"} hint="first send" />
            <Tile
              label="Estimated Reach"
              value={audienceCount > 0 ? formatCount(audienceCount) : "—"}
              hint="unique recipients"
            />
            <Tile label="Est. Open Rate" value={`${FALLBACK_OPEN_RATE}%`} hint="industry avg" />
            <Tile label="Est. Click Rate" value={`${FALLBACK_CLICK_RATE}%`} hint="industry avg" />
            <Tile label="Est. Reply Rate" value={`${FALLBACK_REPLY_RATE}%`} hint="industry avg" />
          </>
        ) : (
          <>
            <Tile
              label="Sent"
              value={formatCount(funnel?.sent ?? null)}
              spark={sparkData}
              tone="neutral"
              onClick={sentClick}
            />
            <Tile
              label="Open Rate"
              value={formatRate(funnel?.openRate ?? null)}
              hint={funnel ? `${formatCount(funnel.opened)} opened` : undefined}
              tone="blue"
              onClick={openClick}
            />
            <Tile
              label="Click Rate"
              value={formatRate(funnel?.clickRate ?? null)}
              hint={funnel ? `${formatCount(funnel.clicked)} clicked` : undefined}
              tone="indigo"
              onClick={clickedClick}
            />
            <Tile
              label="Reply Rate"
              value={formatRate(funnel?.replyRate ?? null)}
              hint={funnel ? `${formatCount(funnel.replied)} replied` : undefined}
              tone="emerald"
              onClick={replyClick}
            />
            <Tile
              label="Bounce Rate"
              value={formatRate(funnel?.bounceRate ?? null)}
              hint={funnel ? `${formatCount(funnel.bounced)} bounced` : undefined}
              tone={bounceTone}
              onClick={bounceClick}
            />
          </>
        )}
      </div>

      {campaignId ? (
        <EngagementDrillIn
          open={drill !== null}
          onClose={() => setDrill(null)}
          campaignId={campaignId}
          eventType={drill ?? "clicked"}
        />
      ) : null}
    </div>
  );
}
