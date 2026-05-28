/**
 * Entitlements domain — server-authoritative plan / feature / usage snapshot.
 *
 * Single source of truth for plan-gating UX. Server-side enforcement at
 * mutation points (e.g. save-company) remains the actual security boundary;
 * this layer drives UI affordances only.
 *
 * Worked example for the api.ts domain split. See _client.ts and CLAUDE.md.
 */
import { invokeEdge } from "./_client";
import type { FeatureKey, UsageLimitKey } from "@/lib/planLimits";

export interface EntitlementsSnapshot {
  plan: string;
  plan_name?: string;
  reset_at?: string | null;
  features: Partial<Record<FeatureKey, boolean>>;
  limits: Partial<Record<UsageLimitKey, number | null>>;
  used: Partial<Record<UsageLimitKey, number>>;
  market_benchmark_enabled?: boolean;
}

interface GetEntitlementsResponse {
  ok: true;
  entitlements: EntitlementsSnapshot;
  org_id: string | null;
  user_id: string;
}

/**
 * Fetch the canonical entitlements snapshot for the current user. JWT-verified
 * server-side. Single call returns plan + features + limits + used.
 */
export async function fetchEntitlementsSnapshot(): Promise<EntitlementsSnapshot | null> {
  const res = await invokeEdge<GetEntitlementsResponse>("get-entitlements", {});
  return res?.entitlements ?? null;
}
