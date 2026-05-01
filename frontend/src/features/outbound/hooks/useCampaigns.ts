import { useCallback, useEffect, useState } from "react";
import { getCrmCampaigns } from "@/lib/api";
import type {
  CampaignStatus,
  OutboundCampaign,
} from "../types";
import type { ChannelKind } from "../tokens";

const VALID_CHANNELS: readonly ChannelKind[] = [
  "email",
  "linkedin_invite",
  "linkedin_message",
  "call",
  "wait",
];

function asArray<T = any>(resp: any): T[] {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp as T[];
  if (Array.isArray(resp?.rows)) return resp.rows as T[];
  if (Array.isArray(resp?.data)) return resp.data as T[];
  return [];
}

function normalizeStatus(raw: unknown): CampaignStatus {
  const s = String(raw ?? "draft").toLowerCase();
  if (s === "active" || s === "paused" || s === "draft" || s === "archived") {
    return s;
  }
  return "draft";
}

function extractRecipientCount(c: any): number | null {
  const m = c?.metrics && typeof c.metrics === "object" ? c.metrics : {};
  const candidates = [
    m.recipients,
    m.recipient_count,
    m.contacts,
    m.contact_count,
    c?.recipient_count,
    c?.contact_count,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function deriveChannels(c: any): ChannelKind[] {
  const m = c?.metrics && typeof c.metrics === "object" ? c.metrics : {};
  const declared = Array.isArray(m.channels) ? m.channels : [];
  const cleaned = declared
    .map((x: unknown) => String(x ?? "").toLowerCase())
    .filter((x: string): x is ChannelKind =>
      (VALID_CHANNELS as readonly string[]).includes(x),
    );
  if (cleaned.length > 0) return cleaned;
  // Fallback to top-level channel if recognized.
  const top = String(c?.channel ?? "email").toLowerCase();
  if ((VALID_CHANNELS as readonly string[]).includes(top)) {
    return [top as ChannelKind];
  }
  return ["email"];
}

function deriveStepCount(c: any): number {
  const m = c?.metrics && typeof c.metrics === "object" ? c.metrics : {};
  const n = Number(m.step_count ?? m.steps ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalize(row: any): OutboundCampaign {
  const status = normalizeStatus(row?.status);
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? "Untitled campaign"),
    status,
    channel: row?.channel ?? null,
    channels: deriveChannels(row),
    steps: deriveStepCount(row),
    recipients: extractRecipientCount(row),
    metrics:
      row?.metrics && typeof row.metrics === "object" ? row.metrics : {},
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
    // Funnel / spark / health remain null until there is a backed
    // aggregation endpoint over lit_outreach_history. The UI renders an
    // honest "no outreach data yet" state for these.
    funnel: null,
    health: null,
    alert: null,
    spark: null,
    nextSendLabel: status === "draft" ? "—" : status === "paused" ? "paused" : "—",
  };
}

export interface UseCampaignsResult {
  campaigns: OutboundCampaign[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCampaigns(): UseCampaignsResult {
  const [campaigns, setCampaigns] = useState<OutboundCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await getCrmCampaigns();
      const rows = asArray(resp);
      setCampaigns(rows.map(normalize));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load campaigns.";
      setError(msg);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { campaigns, loading, error, refresh };
}