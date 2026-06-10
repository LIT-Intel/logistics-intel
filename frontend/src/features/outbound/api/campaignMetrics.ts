/**
 * Typed client for the lit_campaign_metrics_batch Postgres RPC.
 * Batched fetch keeps the campaigns list page to two queries total
 * (campaigns + metrics) regardless of campaign count.
 */
import { supabase } from "@/lib/supabase";
import type { CampaignFunnel } from "../types";

interface RpcRow {
  campaign_id: string;
  enrolled: number;
  sent: number;
  unique_sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  suppressed: number;
  meetings: number | null;
  last_event_at: string | null;
  open_rate: number | null;
  click_rate: number | null;
  reply_rate: number | null;
  bounce_rate: number | null;
}

export async function fetchCampaignMetricsBatch(
  campaignIds: string[],
): Promise<Map<string, CampaignFunnel>> {
  if (!campaignIds.length) return new Map();

  const { data, error } = await supabase.rpc("lit_campaign_metrics_batch", {
    p_campaign_ids: campaignIds,
  });

  if (error) {
    console.warn("[campaignMetrics] RPC failed:", error.message);
    return new Map();
  }

  const out = new Map<string, CampaignFunnel>();
  (data as RpcRow[] | null)?.forEach((row) => {
    out.set(row.campaign_id, {
      enrolled: Number(row.enrolled ?? 0),
      sent: Number(row.sent ?? 0),
      uniqueSent: Number(row.unique_sent ?? 0),
      opened: Number(row.opened ?? 0),
      clicked: Number(row.clicked ?? 0),
      replied: Number(row.replied ?? 0),
      bounced: Number(row.bounced ?? 0),
      suppressed: Number(row.suppressed ?? 0),
      meetings: Number(row.meetings ?? 0),
      openRate: row.open_rate,
      clickRate: row.click_rate,
      replyRate: row.reply_rate,
      bounceRate: row.bounce_rate,
      lastEventAt: row.last_event_at,
    });
  });
  return out;
}
