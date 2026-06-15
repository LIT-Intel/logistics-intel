/**
 * CampaignKpiHero — state-dependent hero for the campaign builder.
 * Replaces the old single AUDIENCE SIZE strip.
 *
 * Draft state (DR Move 4): a single truthful "configuration summary"
 * card showing audience size, schedule, and sequence shape. No
 * industry-average estimate tiles — those signal "metrics demo" not
 * "real outbound campaign you're configuring." A single thin disclosure
 * line explains where rates will appear.
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
import { RecipientsSkippedBadge } from "./RecipientsSkippedBadge";
import type { EngagementEventType } from "../hooks/useEngagementRecipients";

interface Props {
  status: CampaignStatus;
  audienceCount: number;
  funnel: CampaignFunnel | null;
  sparkData: number[];
  scheduledLabel?: string;
  campaignId?: string | null;
  /** DR Move 4: sequence shape for the draft summary card (e.g.
   *  "3 emails over 14 days"). Optional; falls back to a generic
   *  "Sequence configured" line if not provided. */
  sequenceSummary?: string;
}

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

// A sparkline is only meaningful when it has enough points to show a
// trend AND there's actual variation. A 2-point series renders as a
// single diagonal segment which looks like a stray UI artifact rather
// than data — hide it. Same when every bucket is zero (no activity yet)
// or all buckets are identical (flat line carries no info).
function hasMeaningfulSpark(spark: number[] | undefined): spark is number[] {
  if (!spark || spark.length < 4) return false;
  const max = Math.max(...spark);
  if (max <= 0) return false;
  const min = Math.min(...spark);
  return max !== min;
}

function Tile({ label, value, hint, spark, tone = "neutral", onClick }: TileProps) {
  const classes = TONE_CLASSES[tone];
  const showSpark = hasMeaningfulSpark(spark);
  return (
    <div
      onClick={onClick}
      className={`flex min-w-[120px] flex-col gap-1 rounded-2xl border ${classes.bg} ${classes.border} px-4 py-3 shadow-sm ${onClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      <span className={`text-2xl font-bold tabular-nums ${classes.value}`}>
        {value}
      </span>
      <div className="flex items-center justify-between gap-2">
        {hint ? (
          <span className="text-[11px] text-slate-500">{hint}</span>
        ) : <span />}
        {showSpark ? (
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
  sequenceSummary,
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
  const sentClick     = canDrill && (funnel?.sent     ?? 0) > 0 ? () => setDrill("sent")     : undefined;
  const openClick     = canDrill && (funnel?.opened   ?? 0) > 0 ? () => setDrill("opened")   : undefined;
  const clickedClick  = canDrill && (funnel?.clicked  ?? 0) > 0 ? () => setDrill("clicked")  : undefined;
  const replyClick    = canDrill && (funnel?.replied  ?? 0) > 0 ? () => setDrill("replied")  : undefined;
  const bounceClick   = canDrill && (funnel?.bounced  ?? 0) > 0 ? () => setDrill("bounced")  : undefined;
  const meetingsClick = canDrill && (funnel?.meetings ?? 0) > 0 ? () => setDrill("meetings") : undefined;

  return (
    <div className="relative">
      {status === "paused" && (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Paused
        </span>
      )}
      {status === "archived" && (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Complete
        </span>
      )}

      {campaignId && (
        <div className="mb-3">
          <RecipientsSkippedBadge campaignId={campaignId} />
        </div>
      )}

      {isDraft ? (
        /* DR Move 4: collapse 6 fake-metric tiles to ONE truthful
           summary card. Draft campaigns have no real KPIs yet — six
           tiles of industry-average estimates signalled "metrics demo"
           and ate ~60% of the page. The card mirrors Tile's visual
           language (rounded-2xl border bg-white shadow-sm) for
           continuity, but uses a slate / neutral tone end-to-end so
           it never competes visually with the live-data hero. */
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Audience
              </span>
              <span className="text-4xl font-bold tabular-nums text-slate-900">
                {audienceDisplay}
              </span>
              <span className="text-[11px] text-slate-500">
                {audienceCount > 0
                  ? `${audienceCount === 1 ? "recipient" : "recipients"} selected`
                  : "Pick recipients to continue"}
              </span>
            </div>

            <div className="hidden h-12 w-px shrink-0 bg-slate-200 md:block" aria-hidden="true" />

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Schedule
              </span>
              <span className="text-lg font-semibold text-slate-900">
                {scheduledLabel ?? "Not scheduled"}
              </span>
              <span className="text-[11px] text-slate-500">
                {scheduledLabel ? "First send" : "Pick a time to launch"}
              </span>
            </div>

            <div className="hidden h-12 w-px shrink-0 bg-slate-200 md:block" aria-hidden="true" />

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Sequence
              </span>
              <span className="text-lg font-semibold text-slate-900">
                {sequenceSummary ?? "Sequence configured"}
              </span>
              <span className="text-[11px] text-slate-500">
                Steps in this campaign
              </span>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-[11px] text-slate-500">
              Open / click / reply rates appear after first send.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
          <Tile
            label="Audience"
            value={audienceDisplay}
            hint={audienceCount > 0 ? "selected" : "pick recipients"}
          />
          <Tile
            label="Sent"
            value={formatCount(funnel?.sent ?? null)}
            hint={hasMeaningfulSpark(sparkData) ? "sends / day, last 14d" : undefined}
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
          <Tile
            label="Meetings"
            value={formatCount(funnel?.meetings ?? 0)}
            hint={
              funnel
                ? (funnel.meetings ?? 0) > 0
                  ? "Cal.com booked"
                  : "Cal.com integration"
                : undefined
            }
            tone="emerald"
            onClick={meetingsClick}
          />
        </div>
      )}

      {/* CR P1-4: conditional mount. The drill-in subscribes to a
          useEngagementRecipients query on mount even though it gates
          the actual fetch on `enabled: open`. Mounting six closed
          drill-ins (one per KPI) across every hero render still
          pays the query-client + react subtree cost. Only mount
          the drill-in when there's actually something to show. */}
      {campaignId && drill !== null ? (
        <EngagementDrillIn
          open
          onClose={() => setDrill(null)}
          campaignId={campaignId}
          eventType={drill}
        />
      ) : null}
    </div>
  );
}
