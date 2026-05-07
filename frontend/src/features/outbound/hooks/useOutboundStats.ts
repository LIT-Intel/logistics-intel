import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

// Aggregate outreach history into top-line counts for the Outbound Engine
// PulseBar + per-campaign cards. Source of truth is lit_outreach_history
// (one row per actual delivery event the dispatcher writes), filtered to
// the current org's campaigns.
//
// Counts ignore test_sent rows so the Sent KPI reflects real campaign
// outreach only.

export interface OutboundStats {
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  perCampaign: Record<string, { sent: number; opened: number; clicked: number; replied: number }>;
  loading: boolean;
  error: string | null;
}

const EMPTY_STATS: OutboundStats = {
  sent: 0,
  opened: 0,
  clicked: 0,
  replied: 0,
  bounced: 0,
  perCampaign: {},
  loading: true,
  error: null,
};

export function useOutboundStats(): OutboundStats {
  const { orgId } = useAuth();
  const [stats, setStats] = useState<OutboundStats>(EMPTY_STATS);

  useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setStats({ ...EMPTY_STATS, loading: false });
      return;
    }
    (async () => {
      try {
        const { data: members, error: memberErr } = await supabase
          .from("org_members")
          .select("user_id")
          .eq("org_id", orgId);
        if (memberErr) throw memberErr;
        const userIds = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
        if (userIds.length === 0) {
          if (!cancelled) setStats({ ...EMPTY_STATS, loading: false });
          return;
        }
        const { data, error } = await supabase
          .from("lit_outreach_history")
          .select("campaign_id, event_type")
          .in("user_id", userIds)
          .in("event_type", ["sent", "opened", "clicked", "replied", "bounced"]);
        if (error) throw error;
        const totals = { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 };
        const perCampaign: OutboundStats["perCampaign"] = {};
        for (const row of (data ?? []) as Array<{ campaign_id: string | null; event_type: string }>) {
          const evt = row.event_type as keyof typeof totals;
          if (evt in totals) totals[evt] += 1;
          if (row.campaign_id) {
            const bucket =
              perCampaign[row.campaign_id] ??
              (perCampaign[row.campaign_id] = { sent: 0, opened: 0, clicked: 0, replied: 0 });
            if (evt === "sent") bucket.sent += 1;
            else if (evt === "opened") bucket.opened += 1;
            else if (evt === "clicked") bucket.clicked += 1;
            else if (evt === "replied") bucket.replied += 1;
          }
        }
        if (cancelled) return;
        setStats({ ...totals, perCampaign, loading: false, error: null });
      } catch (e) {
        if (!cancelled)
          setStats({ ...EMPTY_STATS, loading: false, error: e instanceof Error ? e.message : "load_failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return stats;
}
