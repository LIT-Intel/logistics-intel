/**
 * Amber chip rendered in CampaignKpiHero when the campaign has any
 * skip events in the last 7 days. Click → opens RecipientsSkippedDrillIn
 * slide-over with per-event-type breakdown + one-click remediation.
 */
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useCampaignSkipSummary } from "@/features/outbound/hooks/useCampaignSkipSummary";
import { RecipientsSkippedDrillIn } from "./RecipientsSkippedDrillIn";

interface Props {
  campaignId: string | null | undefined;
}

export function RecipientsSkippedBadge({ campaignId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: skips } = useCampaignSkipSummary(campaignId);

  if (!skips || skips.length === 0) return null;

  const totalSkipped = skips.reduce((acc, s) => acc + Number(s.skip_count), 0);
  const hasFailures = skips.some((s) => s.event_type === "send_failed");
  const toneClass = hasFailures
    ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
    : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${toneClass}`}
      >
        <AlertTriangle size={12} />
        {totalSkipped} recipient{totalSkipped === 1 ? "" : "s"} skipped (last 7d)
      </button>
      <RecipientsSkippedDrillIn
        open={open}
        onClose={() => setOpen(false)}
        campaignId={campaignId}
        skips={skips}
      />
    </>
  );
}
