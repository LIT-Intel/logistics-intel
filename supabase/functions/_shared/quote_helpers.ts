// Shared quoting helpers for edge functions.
//
// Three concerns, all server-side authoritative:
//   1. computeTotals  — pure totals math. The DB/edge layer is the source of
//      truth for quote financials; the client never sends precomputed totals.
//   2. resolveOrg     — map a user to their primary active org.
//   3. requireQuotingFeature — server-side feature gate for `quoting`.
//      Matches get-entitlements reality: the `get_entitlements(p_org_id,
//      p_user_id)` RPC returns jsonb whose `features` map is
//      jsonb_object_agg(feature_key, enabled) over plan_entitlements for the
//      resolved plan, so `features.quoting === true` means entitled.
//      Platform admins bypass. Fails CLOSED on any read error.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "./logger.ts";

export type LineItem = {
  id?: string; type?: string; name: string; description?: string; unit?: string;
  quantity?: number; unit_cost?: number; unit_sell?: number;
  is_accessorial?: boolean; taxable?: boolean; sort_order?: number;
};

/** Coerce a value to a number or null. Empty string / null / undefined / NaN → null.
 *  Critical: form inputs send "" for untouched numeric fields, and Postgres rejects
 *  "" for numeric columns. Use for every numeric quote column before insert/update. */
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerce a numeric with a fallback (for line-item qty/cost that must not be null). */
export function numOr(v: unknown, fallback: number): number {
  const n = numOrNull(v);
  return n === null ? fallback : n;
}

/** Empty string / null / undefined → null; otherwise pass through (for date/text-nullable cols). */
export function emptyToNull<T>(v: T): T | null {
  return v === "" || v === undefined || v === null ? null : v;
}

/** Recompute all quote financials from line items + fuel %. Server is source of truth. */
export function computeTotals(items: LineItem[], fuelPct: number | null | undefined) {
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  let subtotal_cost = 0, subtotal_sell = 0, accessorial_total = 0;
  for (const li of items) {
    const tc = num(li.quantity) * num(li.unit_cost);
    const ts = num(li.quantity) * num(li.unit_sell);
    subtotal_cost += tc;
    subtotal_sell += ts;
    if (li.is_accessorial) accessorial_total += ts;
  }
  const pct = num(fuelPct);
  const fuel_surcharge_amount = +(subtotal_sell * (pct / 100)).toFixed(2);
  const total_cost = +subtotal_cost.toFixed(2);
  const total_sell = +(subtotal_sell + fuel_surcharge_amount).toFixed(2);
  const gross_profit = +(total_sell - total_cost).toFixed(2);
  const gross_margin_pct = total_sell > 0 ? +((gross_profit / total_sell) * 100).toFixed(2) : 0;
  return {
    subtotal_cost: +subtotal_cost.toFixed(2),
    subtotal_sell: +subtotal_sell.toFixed(2),
    accessorial_total: +accessorial_total.toFixed(2),
    fuel_surcharge_amount, total_cost, total_sell, gross_profit, gross_margin_pct,
  };
}

/** Resolve the user's primary active org. */
export async function resolveOrg(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("org_members")
    .select("org_id").eq("user_id", userId).eq("status", "active")
    .order("joined_at", { ascending: true }).limit(1).maybeSingle();
  return data?.org_id ?? null;
}

const FEATURE_DENIED = {
  ok: false as const,
  code: "FEATURE_NOT_IN_PLAN",
  feature: "quoting",
  upgrade_url: "/app/billing",
};

/** Server-side gate: is `quoting` enabled for this user's plan? Platform admins bypass. */
export async function requireQuotingFeature(admin: SupabaseClient, userId: string, orgId: string)
  : Promise<{ ok: true } | { ok: false; status: number; body: unknown }> {
  const log = createLogger("quote_helpers");
  try {
    // 1. Platform admin bypass (server-side security boundary).
    const { data: paRow, error: paErr } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (paErr) {
      log.error("quoting_gate_admin_lookup_failed", { err: String(paErr.message ?? paErr), user_id: userId, org_id: orgId });
      return { ok: false, status: 403, body: FEATURE_DENIED };
    }
    if (paRow) return { ok: true };

    // 2. Plan entitlements via the canonical get_entitlements RPC.
    //    Returns jsonb with a `features` map (feature_key -> bool). quoting must be true.
    const { data, error } = await admin.rpc("get_entitlements", {
      p_org_id: orgId,
      p_user_id: userId,
    });
    if (error) {
      log.error("quoting_gate_entitlements_rpc_failed", { err: error.message, user_id: userId, org_id: orgId });
      return { ok: false, status: 403, body: FEATURE_DENIED };
    }

    const features = (data && typeof data === "object")
      ? (data as Record<string, unknown>).features
      : undefined;
    const enabled = features && typeof features === "object"
      ? (features as Record<string, unknown>).quoting === true
      : false;

    if (enabled) return { ok: true };
    return { ok: false, status: 403, body: FEATURE_DENIED };
  } catch (err) {
    // Fail CLOSED on any unexpected error — never silently allow.
    log.error("quoting_gate_unexpected_error", { err: String(err), user_id: userId, org_id: orgId });
    return { ok: false, status: 403, body: FEATURE_DENIED };
  }
}

// Re-export for callers that build their own admin client.
export { createClient };
export type { SupabaseClient };
