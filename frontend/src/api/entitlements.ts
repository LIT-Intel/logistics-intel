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
  is_platform_admin?: boolean;
  /**
   * Folded from the top-level `org_id` on the get-entitlements response so
   * consumers (e.g. campaign query, save-company gating) have a single
   * place to read the user's primary org.
   */
  org_id?: string | null;
}

interface GetEntitlementsResponse {
  ok: true;
  entitlements: EntitlementsSnapshot;
  org_id: string | null;
  user_id: string;
  is_platform_admin?: boolean;
}

/**
 * Fetch the canonical entitlements snapshot for the current user. JWT-verified
 * server-side. Single call returns plan + features + limits + used.
 *
 * The edge fn returns `is_platform_admin` as a top-level field; fold it into
 * the snapshot if the snapshot itself didn't already carry it, so consumers
 * have one place to read it.
 */
export async function fetchEntitlementsSnapshot(): Promise<EntitlementsSnapshot | null> {
  const res = await invokeEdge<GetEntitlementsResponse>("get-entitlements", {});
  if (!res) return null;
  const snap = res.entitlements ?? null;
  if (snap && typeof res.is_platform_admin === "boolean" && snap.is_platform_admin === undefined) {
    snap.is_platform_admin = res.is_platform_admin;
  }
  if (snap && snap.org_id === undefined) {
    snap.org_id = res.org_id ?? null;
  }
  return snap;
}
