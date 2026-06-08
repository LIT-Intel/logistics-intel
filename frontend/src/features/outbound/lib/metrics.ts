/**
 * Pure helpers for campaign metric formatting + health derivation.
 * No React, no Supabase — fully testable in isolation.
 */
import type { CampaignFunnel, CampaignHealth } from "../types";

/**
 * Derive a simple traffic-light health from funnel metrics.
 *  - null: not enough data (sent === 0 or no funnel)
 *  - 'attention': bounce > 5% OR (sent > 50 with zero replies)
 *  - 'great': replyRate > 5 AND openRate > 40
 *  - 'good': everything in between
 */
export function deriveHealth(f: CampaignFunnel | null): CampaignHealth {
  if (!f || f.sent === 0) return null;
  if ((f.bounceRate ?? 0) > 5) return "attention";
  if (f.sent > 50 && (f.replyRate ?? 0) === 0) return "attention";
  if ((f.replyRate ?? 0) > 5 && (f.openRate ?? 0) > 40) return "great";
  return "good";
}

/**
 * Format a 0-100 rate for tile display. Null → em-dash. Whole numbers
 * drop the trailing ".0".
 */
export function formatRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}

/**
 * Format a count for compact tile display. >=1M uses 'M', >=1k uses
 * 'k', everything below shows the integer.
 */
export function formatCount(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}
