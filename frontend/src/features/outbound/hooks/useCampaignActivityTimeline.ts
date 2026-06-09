/**
 * Activity timeline hook — TanStack Query wrapper around the
 * lit_campaign_activity_timeline RPC. Returns every tracked event
 * for a campaign in reverse-chronological order: sends, delivered,
 * opens, clicks, replies, bounces, skips, meeting_booked /
 * rescheduled / cancelled.
 *
 * Used by <CampaignActivityTimeline /> mounted under the KPI hero.
 * 30s staleTime keeps tab-switches snappy without missing fresh events.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface CampaignActivityEvent {
  event_id: string;
  event_type: string;
  status: string | null;
  recipient_email: string | null;
  subject: string | null;
  provider: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
}

const DEFAULT_LIMIT = 200;

export function useCampaignActivityTimeline(
  campaignId: string | null,
  options?: { limit?: number; enabled?: boolean },
) {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  return useQuery<CampaignActivityEvent[]>({
    queryKey: ["campaign-activity-timeline", campaignId, limit],
    enabled: Boolean(campaignId) && (options?.enabled ?? true),
    staleTime: 30_000,
    queryFn: async () => {
      if (!campaignId) return [];
      const { data, error } = await supabase.rpc(
        "lit_campaign_activity_timeline",
        { p_campaign_id: campaignId, p_limit: limit },
      );
      if (error) throw error;
      return (data ?? []) as CampaignActivityEvent[];
    },
  });
}
