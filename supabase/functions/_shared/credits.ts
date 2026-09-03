// _shared/credits.ts — the LIT Credits "CreditService" for edge functions (§14).
//
// One place that wraps the reserve → commit → refund credit engine
// (lit_credit_* RPCs) so every billable action meters CONSISTENTLY and can
// never charge a customer for a failed provider call (§16). No edge function
// should touch the credit RPCs or ledger directly — call these helpers.
//
// Pattern:
//   const meter = await meterAction(admin, { orgId, userId, feature, entityId },
//     async () => { const r = await callProvider(); return { ok: r.success, data: r }; });
//   if (!meter.ok) return json({ ok: false, error: meter.reason, ... }, 402);
//   // meter.result.data is the provider result; meter.charged credits were spent.
//
// The reserve holds credits atomically; commit finalizes on success; a throw or
// an { ok:false } result releases the hold (0 net credits). Unlock dedup + free
// actions (cost 0 or already-owned) return with no reservation to commit.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export type MeterParams = {
  orgId: string;
  userId?: string | null;
  /** Must exist in lit_credit_feature_costs (e.g. 'company_unlock', 'pulse_brief'). */
  feature: string;
  entityType?: string | null; // e.g. 'company'
  entityId?: string | null;   // e.g. source_company_key
  metadata?: Record<string, unknown>;
};

export type ReserveResult =
  | { ok: true; charged: number; reservationId: string | null; alreadyOwned?: boolean; unlimited?: boolean }
  | { ok: false; reason: string; needed?: number; available?: number };

export type MeterResult<T> = {
  ok: boolean;
  reason?: string;
  /** true when the failure is a balance/limit block (surface an "Add credits" prompt). */
  blocked?: boolean;
  charged?: number;
  reservationId?: string | null;
  alreadyOwned?: boolean;
  result?: T;
};

/** Current workspace balance (included + purchased). */
export async function getCreditBalance(admin: SupabaseClient, orgId: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin.rpc("lit_credit_balance", { p_org_id: orgId });
  return (data ?? null) as Record<string, unknown> | null;
}

/** Credit cost for a feature key (0 if unknown/free). */
export async function getCreditCost(admin: SupabaseClient, feature: string): Promise<number> {
  const { data } = await admin.rpc("lit_credit_cost", { p_feature: feature });
  return Number(data ?? 0);
}

/** Has this workspace already unlocked/owns this entity (free re-view, §7/§9). */
export async function hasUnlocked(
  admin: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string,
): Promise<boolean> {
  const { data } = await admin.rpc("lit_workspace_has_unlocked", {
    p_org_id: orgId,
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  return data === true;
}

/** Atomically reserve credits for an action (holds against the balance). */
export async function reserveCredits(admin: SupabaseClient, p: MeterParams): Promise<ReserveResult> {
  const { data, error } = await admin.rpc("lit_credit_reserve", {
    p_org_id: p.orgId,
    p_user_id: p.userId ?? null,
    p_feature: p.feature,
    p_entity_type: p.entityType ?? null,
    p_entity_id: p.entityId ?? null,
    p_metadata: p.metadata ?? {},
  });
  if (error) return { ok: false, reason: `reserve_error: ${error.message}` };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      reason: String(r.reason ?? "reserve_failed"),
      needed: r.needed as number | undefined,
      available: r.available as number | undefined,
    };
  }
  return {
    ok: true,
    charged: Number(r.charged ?? 0),
    reservationId: (r.reservation_id as string | null) ?? null,
    alreadyOwned: r.already_owned === true,
    unlimited: r.unlimited === true,
  };
}

/** Finalize a reservation (records unlock ownership for unlock features). */
export async function commitCredits(
  admin: SupabaseClient,
  reservationId: string | null,
  metadata?: Record<string, unknown>,
): Promise<{ ok: boolean; reason?: string }> {
  if (!reservationId) return { ok: true };
  const { error } = await admin.rpc("lit_credit_commit", { p_reservation_id: reservationId, p_metadata: metadata ?? {} });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/** Release a reservation (return the held credits — used on provider failure, §16). */
export async function refundCredits(
  admin: SupabaseClient,
  reservationId: string | null,
  reason?: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!reservationId) return { ok: true };
  const { error } = await admin.rpc("lit_credit_refund", { p_reservation_id: reservationId, p_reason: reason ?? null });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/**
 * Run a billable action safely (§16). Reserves credits, runs `work`, commits on
 * success, and refunds on a throw or an `{ ok:false }` result so a failed
 * provider call charges 0 net credits.
 *
 * `work` must return an object with an `ok` boolean. When it returns ok:false or
 * throws, the hold is released. Free actions (cost 0) and already-owned unlocks
 * short-circuit with `ok:true` and no reservation.
 */
export async function meterAction<T extends { ok: boolean }>(
  admin: SupabaseClient,
  p: MeterParams,
  work: () => Promise<T>,
): Promise<MeterResult<T>> {
  const res = await reserveCredits(admin, p);
  if (!res.ok) {
    const blocked = res.reason === "insufficient_credits" || res.reason === "user_limit_exceeded";
    return { ok: false, reason: res.reason, blocked };
  }
  // Free action or already-owned unlock — nothing to commit/refund.
  if (!res.reservationId) {
    return { ok: true, charged: res.charged, reservationId: null, alreadyOwned: res.alreadyOwned };
  }
  let result: T;
  try {
    result = await work();
  } catch (e) {
    await refundCredits(admin, res.reservationId, "work_threw");
    return { ok: false, reason: `work_error: ${e instanceof Error ? e.message : String(e)}`, charged: 0 };
  }
  if (!result || result.ok === false) {
    await refundCredits(admin, res.reservationId, "work_failed");
    return { ok: false, reason: "work_failed", charged: 0, result };
  }
  await commitCredits(admin, res.reservationId, { committed_at: new Date().toISOString() });
  return { ok: true, charged: res.charged, reservationId: res.reservationId, result };
}
