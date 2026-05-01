import { useCallback, useEffect, useState } from "react";
import {
  getCampaignWithDetails,
  type CampaignDetails,
} from "../api/campaignActions";

export interface UseCampaignResult {
  details: CampaignDetails | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCampaign(campaignId: string | null): UseCampaignResult {
  const [details, setDetails] = useState<CampaignDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(campaignId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!campaignId) {
      setDetails(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const d = await getCampaignWithDetails(campaignId);
      setDetails(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load campaign.";
      setError(msg);
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { details, loading, error, refresh };
}