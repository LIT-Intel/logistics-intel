// supabase/functions/_shared/opportunity_scoring.ts
// Pulse Explorer v1 opportunity scores. All return 0–100, normalized.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function consolidationScore(i: {
  forwarder_count: number;
  total_teu_12m: number;
}): number {
  if (!i.forwarder_count || i.forwarder_count < 2) return 0;
  return clamp(
    (i.forwarder_count - 1) * 25 + Math.log10((i.total_teu_12m ?? 0) + 1) * 8,
  );
}

export function vulnerableScore(i: {
  forwarder_concentration: number; // 0–1
  recent_6m_teu: number;
  prior_6m_teu: number;
}): number {
  const trend =
    (i.recent_6m_teu - i.prior_6m_teu) / Math.max(i.prior_6m_teu, 1);
  return clamp(i.forwarder_concentration * 60 + Math.max(0, -trend) * 100);
}

export function velocityScore(i: {
  percentile_teu: number; // 0–1
  days_since_last_shipment: number;
}): number {
  const recency = Math.max(0, 1 - i.days_since_last_shipment / 90);
  return clamp(i.percentile_teu * 80 + recency * 20);
}

export function compositeScore(i: {
  consolidation: number;
  vulnerable: number;
  velocity: number;
  defend: number;
}): number {
  const scores = [i.consolidation, i.vulnerable, i.velocity, i.defend];
  const max = Math.max(...scores);
  const top2 = [...scores].sort((a, b) => b - a).slice(0, 2);
  const avgTop2 = (top2[0] + top2[1]) / 2;
  return clamp(max * 0.7 + avgTop2 * 0.3);
}
