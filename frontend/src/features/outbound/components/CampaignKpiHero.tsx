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
import type { CampaignFunnel, CampaignStatus } from "../types";
import { formatCount, formatRate } from "../lib/metrics";
import { Sparkline } from "./Sparkline";

interface Props {
  status: CampaignStatus;
  audienceCount: number;
  funnel: CampaignFunnel | null;
  sparkData: number[];
  scheduledLabel?: string;
}

// Industry-average fallback rates (B2B email) when org has no
// launched-campaign history yet. Hard-coded here per spec's "Open
// design decisions" — empty estimate tiles look broken.
const FALLBACK_OPEN_RATE = 40;
const FALLBACK_CLICK_RATE = 8;
const FALLBACK_REPLY_RATE = 3;

interface TileProps {
  label: string;
  value: string;
  hint?: string;
  spark?: number[];
}

function Tile({ label, value, hint, spark }: TileProps) {
  return (
    <div className="flex min-w-[120px] flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </span>
      <div className="flex items-center justify-between gap-2">
        {hint ? (
          <span className="text-[11px] text-slate-500">{hint}</span>
        ) : <span />}
        {spark && spark.length >= 2 ? (
          <Sparkline data={spark} width={56} height={18} />
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
}: Props) {
  const isDraft = status === "draft";
  const audienceDisplay = audienceCount > 0 ? formatCount(audienceCount) : "—";

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
            <Tile label="Sent" value={formatCount(funnel?.sent ?? null)} spark={sparkData} />
            <Tile
              label="Open Rate"
              value={formatRate(funnel?.openRate ?? null)}
              hint={funnel ? `${formatCount(funnel.opened)} opened` : undefined}
            />
            <Tile
              label="Click Rate"
              value={formatRate(funnel?.clickRate ?? null)}
              hint={funnel ? `${formatCount(funnel.clicked)} clicked` : undefined}
            />
            <Tile
              label="Reply Rate"
              value={formatRate(funnel?.replyRate ?? null)}
              hint={funnel ? `${formatCount(funnel.replied)} replied` : undefined}
            />
            <Tile
              label="Bounce Rate"
              value={formatRate(funnel?.bounceRate ?? null)}
              hint={funnel ? `${formatCount(funnel.bounced)} bounced` : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}
