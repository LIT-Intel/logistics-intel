/**
 * Engagement drill-in hooks — TanStack Query wrappers around the
 * lit_campaign_engagement_recipients + lit_recipient_link_clicks RPCs.
 *
 * The recipients query is keyed by (campaignId, eventType, sinceIso)
 * and held in cache for 30s so flipping between tiles in the
 * slide-over doesn't refetch on every click. The link-clicks query
 * is lazy (`enabled`) so it only fires when a recipient row is
 * expanded in clicked-mode.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type EngagementEventType = "sent" | "opened" | "clicked" | "replied" | "bounced" | "meetings";

export interface EngagementRecipient {
  recipient_id: string;
  recipient_email: string;
  display_name: string;
  event_count: number;
  first_event_at: string;
  last_event_at: string;
}

export interface RecipientLinkClick {
  link_id: string;
  original_url: string;
  click_count: number;
  first_clicked_at: string;
  last_clicked_at: string;
}

const DEFAULT_LOOKBACK_DAYS = 90;

export function useEngagementRecipients(
  campaignId: string | null,
  eventType: EngagementEventType,
  options?: { sinceIso?: string; enabled?: boolean },
) {
  const sinceIso =
    options?.sinceIso ??
    new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  return useQuery<EngagementRecipient[]>({
    queryKey: ["engagement-recipients", campaignId, eventType, sinceIso],
    enabled: Boolean(campaignId) && (options?.enabled ?? true),
    staleTime: 30_000,
    queryFn: async () => {
      if (!campaignId) return [];
      const { data, error } = await supabase.rpc(
        "lit_campaign_engagement_recipients",
        {
          p_campaign_id: campaignId,
          p_event_type: eventType,
          p_since: sinceIso,
        },
      );
      if (error) throw error;
      return (data ?? []) as EngagementRecipient[];
    },
  });
}

export function useRecipientLinkClicks(
  recipientId: string | null,
  campaignId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<RecipientLinkClick[]>({
    queryKey: ["recipient-link-clicks", recipientId, campaignId],
    enabled:
      Boolean(recipientId) &&
      Boolean(campaignId) &&
      (options?.enabled ?? true),
    staleTime: 30_000,
    queryFn: async () => {
      if (!recipientId || !campaignId) return [];
      const { data, error } = await supabase.rpc("lit_recipient_link_clicks", {
        p_recipient_id: recipientId,
        p_campaign_id: campaignId,
      });
      if (error) throw error;
      return (data ?? []) as RecipientLinkClick[];
    },
  });
}
