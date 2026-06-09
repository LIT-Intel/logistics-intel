/**
 * Hook for the campaign skip-summary RPC. Powers the
 * RecipientsSkippedBadge — fires once per campaign load + caches 30s.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type SkipEventType = "consent_missing" | "daily_cap_reached" | "suppressed" | "send_failed";

export interface CampaignSkip {
  event_type: SkipEventType;
  skip_count: number;
  most_recent: string;
  sample_reason: string | null;
  sample_recipient: string | null;
}

export function useCampaignSkipSummary(campaignId: string | null | undefined) {
  return useQuery({
    queryKey: ["campaign-skip-summary", campaignId],
    enabled: Boolean(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lit_campaign_skip_summary", {
        p_campaign_id: campaignId,
      });
      if (error) {
        console.warn("[useCampaignSkipSummary] RPC failed:", error.message);
        return [] as CampaignSkip[];
      }
      return ((data ?? []) as CampaignSkip[]).filter((row) => row.skip_count > 0);
    },
    staleTime: 30_000,
  });
}
