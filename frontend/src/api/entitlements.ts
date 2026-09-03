/**
 * Entitlements domain — server-authoritative plan / feature / usage snapshot.
 *
 * Single source of truth for plan-gating UX. Server-side enforcement at
 * mutation points (e.g. save-company) remains the actual security boundary;
 * this layer drives UI affordances only.
 *
 * Worked example for the api.ts domain split. See _client.ts and CLAUDE.md.
 */
import { invokeEdge, EdgeFunctionError } from "./_client";
import { supabase } from "@/lib/supabase";
import type { FeatureKey, UsageLimitKey } from "@/lib/planLimits";
import { parseLimitExceeded, type LimitExceeded } from "@/lib/usage";

/**
 * Server feature-keys actually emitted by the get-entitlements snapshot's
 * `limits` / `used` maps. These are the canonical edge-function keys (e.g.
 * `export_pdf`, `saved_map_view`, `company_search`, `pulse_search`) — distinct
 * from the `_per_month` UI mirror keys in UsageLimitKey. Folding them in lets
 * UI gates (e.g. PulseExploreTab's saveViewAllowed, the Billing meters) address
 * them type-safely.
 */
export type SnapshotLimitKey =
  | UsageLimitKey
  | "company_search"
  | "company_profile_view"
  | "saved_company"
  | "saved_contact"
  | "contact_enrichment"
  | "pulse_brief"
  | "pulse_ai"
  | "pulse_search"
  | "saved_pulse_list"
  | "export_pdf"
  | "saved_map_view"
  | "campaign_send"
  | "ai_brief"
  | "team_invite";

/**
 * Enrichment credit snapshot (Phase 1).
 *
 * Tracks Apollo/Lusha enrichment spend in a margin-protecting credit ledger.
 * 1 credit = 1 email unlock (~$0.05-0.20 wholesale).
 * Phase 3 will charge 10 credits per phone unlock to match Apollo's pricing.
 *
 * - quota: NULL means unlimited (Enterprise).
 * - reset_at: ISO timestamp of the next month boundary.
 */
export interface CreditUsageSnapshot {
  used_this_month: number;
  quota: number | null;
  remaining: number | null;
  reset_at?: string | null;
  plan?: string;
}

/**
 * Unified LIT Credits balance (Credits v2 engine, lit_credit_balance RPC):
 * included monthly + non-expiring purchased. NULL when the engine isn't present.
 */
export interface CreditBalanceSnapshot {
  org_id?: string | null;
  plan?: string | null;
  unlimited: boolean;
  included_quota: number;
  included_used: number;
  included_remaining: number;
  purchased_remaining: number;
  total_remaining: number;
  cycle_start?: string | null;
  cycle_end?: string | null;
}

export interface EntitlementsSnapshot {
  plan: string;
  plan_name?: string;
  reset_at?: string | null;
  features: Partial<Record<FeatureKey, boolean>>;
  limits: Partial<Record<SnapshotLimitKey, number | null>>;
  used: Partial<Record<SnapshotLimitKey, number>>;
  market_benchmark_enabled?: boolean;
  is_platform_admin?: boolean;
  /**
   * Enrichment credit usage snapshot (Phase 1). NULL when the credit RPC isn't
   * deployed in this env (graceful fallback).
   */
  credits?: CreditUsageSnapshot | null;
  /**
   * Unified LIT Credits balance (Credits v2). NULL on older edge-fn versions.
   */
  credit_balance?: CreditBalanceSnapshot | null;
  /**
   * CRM per-seat add-on gate (derived server-side from lit_crm_subscriptions).
   * crm_enabled = the org has an active/trialing CRM subscription; crm_seats =
   * the paid seat count. Absent on older edge-fn versions — treat as false/0.
   */
  crm_enabled?: boolean;
  crm_seats?: number;
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

/**
 * CRM add-on checkout.
 *
 * Calls the crm-checkout edge fn (JWT-verified) to create an embedded Stripe
 * Checkout Session for the caller's org + plan tier. Returns the session
 * client_secret (mount with Stripe EmbeddedCheckout) plus the tier/seat info.
 *
 * On a Stripe price/mode mismatch the edge fn returns ok:false with
 * code:'billing_not_configured'; invokeEdge surfaces that as an
 * EdgeFunctionError we re-map to a typed { notConfigured: true } result so the
 * modal can render a friendly "billing not configured for this environment"
 * message instead of a generic error.
 */
/**
 * Per-seat CRM add-on price for a plan tier (for the "Unlock CRM — $X/seat"
 * banner). Read directly from lit_crm_addon_pricing via RLS (authenticated
 * SELECT is allowed; it's non-sensitive catalog data). Returns null if the
 * tier has no pricing row.
 */
export interface CrmAddonPricing {
  plan_code: string;
  per_seat_cents: number;
  forced_seats: number | null;
}

export async function fetchCrmAddonPricing(planCode: string): Promise<CrmAddonPricing | null> {
  const { data, error } = await supabase
    .from("lit_crm_addon_pricing")
    .select("plan_code, per_seat_cents, forced_seats")
    .eq("plan_code", planCode)
    .maybeSingle();
  if (error || !data) return null;
  return data as CrmAddonPricing;
}

export type CrmCheckoutResult =
  | { ok: true; client_secret: string; plan_code: string; seats: number }
  | { ok: false; notConfigured: true; message: string };

export async function startCrmCheckout(returnUrl?: string): Promise<CrmCheckoutResult> {
  try {
    const res = await invokeEdge<{
      ok: true;
      client_secret: string;
      plan_code: string;
      seats: number;
    }>("crm-checkout", returnUrl ? { return_url: returnUrl } : {});
    return {
      ok: true,
      client_secret: res.client_secret,
      plan_code: res.plan_code,
      seats: res.seats,
    };
  } catch (e) {
    if (e instanceof EdgeFunctionError && e.code === "billing_not_configured") {
      return { ok: false, notConfigured: true, message: e.message };
    }
    throw e;
  }
}

/* ── LIT Credits top-up packs (Credits v2) ──────────────────────────────── */

export interface CreditPack {
  id: string;
  credits: number;
  price_usd_cents: number;
  is_most_popular: boolean;
  sort_order: number;
}

/** Active credit packs from lit_credit_packages (non-sensitive catalog; RLS
 * allows authenticated SELECT). Sorted by sort_order. */
export async function fetchCreditPackages(): Promise<CreditPack[]> {
  const { data, error } = await supabase
    .from("lit_credit_packages")
    .select("id, credits, price_usd_cents, is_most_popular, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as CreditPack[];
}

/* ── Credit cost matrix (how credits are spent per action) ─────────────── */

export interface CreditCost {
  feature_key: string;
  credits: number;
  label: string;
  category: string | null;
}

/** Active credit-cost matrix from lit_credit_feature_costs — what each billable
 * action costs. Non-sensitive catalog (authenticated SELECT). Sorted by cost. */
export async function fetchCreditCostMatrix(): Promise<CreditCost[]> {
  const { data, error } = await supabase
    .from("lit_credit_feature_costs")
    .select("feature_key, credits, label, category")
    .eq("active", true)
    .order("credits", { ascending: true });
  if (error || !data) return [];
  return data as CreditCost[];
}

/* ── Per-user credit limits (workspace admin control) ──────────────────── */

/** Map of user_id -> monthly credit cap for the org (admin-gated read). Users
 * without a cap are absent from the map (they draw on the shared org balance). */
export async function fetchUserCreditLimits(orgId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("lit_credit_user_limits", { p_org_id: orgId });
  const out: Record<string, number> = {};
  if (error || !Array.isArray(data)) return out;
  for (const r of data as { user_id: string; monthly_limit: number | null }[]) {
    if (r.monthly_limit != null) out[r.user_id] = r.monthly_limit;
  }
  return out;
}

/** Set (or clear, with null) a member's monthly credit cap. Server-side the RPC
 * is workspace-admin gated. Returns true on success. */
export async function setUserCreditLimit(orgId: string, userId: string, limit: number | null): Promise<boolean> {
  const { error } = await supabase.rpc("lit_credit_set_user_limit", {
    p_org_id: orgId,
    p_user_id: userId,
    p_limit: limit,
  });
  return !error;
}

/* ── Company unlock (Credits v2 §7 metering) ───────────────────────────── */

export type UnlockResult =
  | { ok: true; unlocked: true; charged: number; alreadyOwned: boolean; meteringOff: boolean }
  | { ok: false; insufficient: true; message: string };

/**
 * Unlock a company for the workspace (credit-unlock-company edge fn). While the
 * credits_metering_enabled flag is OFF this returns immediately with charged:0 /
 * meteringOff:true, so callers can gate "open" on it transparently. Fails OPEN
 * on any non-insufficient error so a flaky unlock call never blocks the user.
 */
export async function unlockCompany(opts: {
  company_id?: string | null;
  source_company_key?: string | null;
  company_name?: string | null;
}): Promise<UnlockResult> {
  try {
    const res = await invokeEdge<{
      ok: true;
      unlocked: boolean;
      charged?: number;
      already_owned?: boolean;
      metering_off?: boolean;
    }>("credit-unlock-company", opts);
    return {
      ok: true,
      unlocked: true,
      charged: res.charged ?? 0,
      alreadyOwned: res.already_owned === true,
      meteringOff: res.metering_off === true,
    };
  } catch (e) {
    if (e instanceof EdgeFunctionError && e.code === "insufficient_credits") {
      return { ok: false, insufficient: true, message: e.message || "Not enough credits to unlock this company." };
    }
    // Fail open — never block opening a company on a transient unlock error.
    return { ok: true, unlocked: true, charged: 0, alreadyOwned: false, meteringOff: true };
  }
}

/* ── Credit Usage report (Credit Usage page) ────────────────────────────── */

export interface CreditUsageActivityRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  feature: string | null;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  credits: number;
  transaction_type: string | null;
  created_at: string;
}

export interface CreditUsageMember {
  user_id: string;
  user_email: string | null;
  full_name: string | null;
  role: string | null;
  joined_at: string | null;
}
export interface CreditUsageFeatureUse {
  feature: string;
  uses: number;
  users: number;
}
export interface CreditUsageActivityUse {
  id: string;
  feature: string | null;
  action: string | null;
  quantity: number;
  user_email: string | null;
  created_at: string;
}

export interface CreditUsageReport {
  ok: boolean;
  is_admin: boolean;
  balance: CreditBalanceSnapshot;
  by_feature: { feature: string; credits: number }[];
  by_user: { user_id: string; user_email: string | null; credits: number }[];
  activity: CreditUsageActivityRow[];
  // v2 additions — real activity from the live usage ledger + full team roster,
  // so the page is meaningful even when credit metering is dark / unlimited.
  members?: CreditUsageMember[];
  feature_usage?: CreditUsageFeatureUse[];
  usage_activity?: CreditUsageActivityUse[];
}

/** Full Credit Usage report for a workspace (balance + per-feature + per-user +
 * recent activity). Membership-gated server-side; per-user data is admin-only. */
export async function fetchCreditUsageReport(orgId: string): Promise<CreditUsageReport | null> {
  const { data, error } = await supabase.rpc("lit_credit_usage_report", { p_org_id: orgId });
  if (error || !data || (data as { ok?: boolean }).ok === false) return null;
  return data as CreditUsageReport;
}

export type CreditPackCheckoutResult =
  | { ok: true; client_secret: string; pack_id: string; credits: number }
  | { ok: false; notConfigured: true; message: string };

/** Start an embedded one-time Stripe checkout for a credit pack (admin-gated
 * server-side). Credits are granted by billing-webhook on completion. */
export async function startCreditPackCheckout(
  packId: string,
  returnUrl?: string,
): Promise<CreditPackCheckoutResult> {
  try {
    const res = await invokeEdge<{ ok: true; client_secret: string; pack_id: string; credits: number }>(
      "credit-pack-checkout",
      { pack_id: packId, ...(returnUrl ? { return_url: returnUrl } : {}) },
    );
    return { ok: true, client_secret: res.client_secret, pack_id: res.pack_id, credits: res.credits };
  } catch (e) {
    if (
      e instanceof EdgeFunctionError &&
      (e.code === "billing_not_configured" || e.code === "pack_not_found" || e.code === "admin_only")
    ) {
      return { ok: false, notConfigured: true, message: e.message };
    }
    throw e;
  }
}

/**
 * Result of a server-side PDF export-quota pre-flight.
 *  - { ok: true }                    → caller may generate the PDF.
 *  - { ok: false, limit }            → quota exceeded (export_pdf). Caller must
 *                                      surface the UpgradeModal and ABORT.
 */
export type ExportQuotaResult =
  | { ok: true }
  | { ok: false; limit: LimitExceeded };

/**
 * Server-side gate for CLIENT-SIDE PDF generation.
 *
 * The PDF surfaces (CompanyProfileV2 jsPDF export, Pulse Explorer report PDF)
 * render entirely in the browser, so a client-only entitlement hint can be
 * bypassed. This calls export-company-profile with intent='check', which runs
 * check_usage_limit('export_pdf') server-side and — on ok — consumes one unit.
 * The security boundary is the edge function (CLAUDE.md rule #6); this helper
 * is the client's way of honoring it before doing local work.
 *
 * Returns { ok:true } when generation is allowed (also fails OPEN on a
 * transport/infra error so a transient hiccup never blocks a paying user —
 * the edge fn returns a clean 403 for the real over-limit case). Returns
 * { ok:false, limit } only when the server explicitly reports LIMIT_EXCEEDED.
 *
 * Direct fetch (not invokeEdge) so we can read the 403 LIMIT_EXCEEDED body,
 * mirroring pulse-explore.js.
 */
export async function checkExportQuota(): Promise<ExportQuotaResult> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  const baseUrl =
    (import.meta as ImportMeta & { env?: { VITE_SUPABASE_URL?: string } }).env
      ?.VITE_SUPABASE_URL ?? "";
  if (!token || !baseUrl) {
    // Can't reach the server — fail open rather than block on auth glitch.
    return { ok: true };
  }
  try {
    const res = await fetch(`${baseUrl}/functions/v1/export-company-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ intent: "check" }),
    });
    if (res.status === 403) {
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        /* ignore */
      }
      const limit = parseLimitExceeded(payload);
      if (limit) return { ok: false, limit };
      // 403 without a parseable LIMIT_EXCEEDED — treat as blocked but
      // synthesize a payload so the modal still renders.
      return {
        ok: false,
        limit: {
          ok: false,
          code: "LIMIT_EXCEEDED",
          feature: "export_pdf",
          used: 0,
          limit: 0,
          plan: "free_trial",
          reset_at: null,
          upgrade_url: "/app/billing",
          message: "PDF exports are included on paid plans.",
        },
      };
    }
    // Any other status (200 ok, or a non-quota error) → allow generation.
    return { ok: true };
  } catch {
    // Network failure — fail open.
    return { ok: true };
  }
}
