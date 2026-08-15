// Phase 2B: shared provider ledger + balance helper.
//
// The single write-path for the cost ledger (`provider_usage_events`) and the
// live ImportYeti balance mirror (`lit_internal_meta['importyeti_credits_remaining']`).
//
// Design invariants (do NOT relax):
//   - isProviderEnabled fails OPEN. A metering/flag bug must never take the
//     product down. On RPC error we log a warning and return true.
//   - recordProviderUsage NEVER throws. A ledger failure must not break the
//     user-facing (or cron) call. Everything is wrapped in try/catch + logged.
//   - updateProviderBalance NEVER throws. Same reasoning.
//
// Consumers pass canonical operation/trigger/provider strings from
// `_shared/provider_operations.ts` — never bare string literals.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger } from "./logger.ts";
import {
  normalizeOperation,
  PROVIDERS,
  type Provider,
  type ProviderOperation,
  type TriggerType,
} from "./provider_operations.ts";

const log = createLogger("provider-ledger");

const USAGE_TABLE = "provider_usage_events";
const PRICING_TABLE = "provider_pricing";
const META_TABLE = "lit_internal_meta";
const BALANCE_META_KEY = "importyeti_credits_remaining";

/** Row shape written to `provider_usage_events`. All ids optional. */
export type ProviderUsageEvent = {
  provider: Provider | string;
  operation: ProviderOperation | string;
  status: "success" | "not_found" | "credits_exhausted" | "error";
  /** When null, the helper fills credits_consumed from provider_pricing.credit_cost. */
  credits_consumed?: number | null;
  cache_hit?: boolean;
  trigger_type?: TriggerType | string | null;
  source?: string | null;
  organization_id?: string | null;
  user_id?: string | null;
  company_id?: string | null;
  saved_company_id?: string | null;
  subscription_tier?: string | null;
  request_id?: string | null;
  provider_request_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Returns whether a provider flag is enabled. Fails OPEN (returns true) on RPC
 * error so a metering bug never disables the product — but logs a warning so
 * the failure is visible.
 */
export async function isProviderEnabled(
  supabase: SupabaseClient,
  flagKey: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("lit_provider_flag", {
      p_key: flagKey,
    });
    if (error) {
      log.warn("provider_flag_rpc_failed_fail_open", {
        flag_key: flagKey,
        err: error.message,
      });
      return true;
    }
    // RPC returns boolean; coerce defensively (fail-open on unexpected null).
    return data === false ? false : true;
  } catch (err) {
    log.warn("provider_flag_rpc_threw_fail_open", {
      flag_key: flagKey,
      err: String((err as any)?.message ?? err),
    });
    return true;
  }
}

/**
 * Service-role INSERT into `provider_usage_events`. Looks up the active
 * `provider_pricing` row for (provider, operation) to fill credits_consumed
 * (when the caller passes null/undefined) and to compute estimated_cost_usd =
 * credits_consumed * usd_cost_per_credit (0 when cache_hit). NEVER throws.
 */
export async function recordProviderUsage(
  supabase: SupabaseClient,
  event: ProviderUsageEvent,
): Promise<void> {
  try {
    const provider = event.provider || PROVIDERS.IMPORTYETI;
    const operation = normalizeOperation(event.operation);
    const cacheHit = event.cache_hit === true;

    // Look up pricing for the canonical (provider, operation). credit_cost is
    // the source of truth for credits_consumed when the caller passes null.
    let creditCost = 0;
    let usdPerCredit = 0;
    try {
      const { data: pricing, error: pricingErr } = await supabase
        .from(PRICING_TABLE)
        .select("credit_cost, usd_cost_per_credit")
        .eq("provider", provider)
        .eq("operation", operation)
        .eq("active", true)
        .maybeSingle();
      if (pricingErr) {
        log.warn("provider_pricing_lookup_failed", {
          provider,
          operation,
          err: pricingErr.message,
        });
      }
      creditCost = Number((pricing as any)?.credit_cost ?? 0) || 0;
      usdPerCredit = Number((pricing as any)?.usd_cost_per_credit ?? 0) || 0;
    } catch (pricingThrow) {
      log.warn("provider_pricing_lookup_threw", {
        provider,
        operation,
        err: String((pricingThrow as any)?.message ?? pricingThrow),
      });
    }

    // credits_consumed: 0 on a cache hit; otherwise the caller-supplied value,
    // or the pricing-table default when the caller passed null/undefined.
    const creditsConsumed = cacheHit
      ? 0
      : event.credits_consumed == null
        ? creditCost
        : Number(event.credits_consumed) || 0;

    const estimatedCostUsd = cacheHit ? 0 : creditsConsumed * usdPerCredit;

    const row = {
      provider,
      operation,
      organization_id: event.organization_id ?? null,
      user_id: event.user_id ?? null,
      company_id: event.company_id ?? null,
      saved_company_id: event.saved_company_id ?? null,
      subscription_tier: event.subscription_tier ?? null,
      request_id: event.request_id ?? null,
      provider_request_id: event.provider_request_id ?? null,
      credits_consumed: creditsConsumed,
      estimated_cost_usd: estimatedCostUsd,
      status: event.status,
      cache_hit: cacheHit,
      trigger_type: event.trigger_type ?? null,
      source: event.source ?? null,
      metadata: event.metadata ?? {},
    };

    const { error } = await supabase.from(USAGE_TABLE).insert(row);
    if (error) {
      log.error("provider_usage_insert_failed", {
        provider,
        operation,
        status: event.status,
        err: error.message,
      });
    }
  } catch (err) {
    // Absolute backstop — a ledger failure must NEVER break the caller.
    log.error("provider_usage_record_threw", {
      err: String((err as any)?.message ?? err),
    });
  }
}

/**
 * Upserts the live provider balance mirror in lit_internal_meta when
 * creditsRemaining is a finite number. Stores {credits_remaining, updated_at}.
 * NEVER throws. No-op for null/undefined/NaN (upstream didn't report a balance).
 */
export async function updateProviderBalance(
  supabase: SupabaseClient,
  provider: Provider | string,
  creditsRemaining: number | null | undefined,
): Promise<void> {
  try {
    if (
      creditsRemaining == null ||
      typeof creditsRemaining !== "number" ||
      !Number.isFinite(creditsRemaining)
    ) {
      return;
    }
    // Only ImportYeti has a canonical balance key today; other providers are
    // no-op until a balance meta_key is defined for them.
    if (provider !== PROVIDERS.IMPORTYETI) return;

    const { error } = await supabase.from(META_TABLE).upsert(
      {
        meta_key: BALANCE_META_KEY,
        meta_value: {
          credits_remaining: creditsRemaining,
          updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "meta_key" },
    );
    if (error) {
      log.warn("provider_balance_upsert_failed", {
        provider,
        credits_remaining: creditsRemaining,
        err: error.message,
      });
    }
  } catch (err) {
    log.warn("provider_balance_update_threw", {
      provider,
      err: String((err as any)?.message ?? err),
    });
  }
}
