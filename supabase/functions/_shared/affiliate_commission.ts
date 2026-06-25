// supabase/functions/_shared/affiliate_commission.ts
//
// Affiliate "money path": converts a paid Stripe invoice into a pending
// affiliate commission ledger row. Called from billing-webhook's
// invoice.payment_succeeded handler (AFTER the core subscription write has
// already succeeded). Refunds void the matching commissions.
//
// HARD RULE: this module must NEVER throw to its caller. The billing webhook's
// 200-to-Stripe + subscription writes are the security/billing-critical path;
// affiliate accounting is strictly additive. Every public function is wrapped
// so any failure returns a structured {credited:false, reason} (or a voided
// count) and logs via console — it can never break billing.
//
// Money correctness:
//   - Idempotent per invoice. An affiliate_commissions row already existing for
//     invoice.id short-circuits with reason:'already_credited'. A UNIQUE partial
//     index on affiliate_commissions(invoice_id) (migration
//     20260624150000_affiliate_commission_idempotency.sql) is the second guard
//     against a concurrent webhook-retry double-insert (caught as 23505).
//   - Respects commission_months: stops once the referral has accrued
//     partner.commission_months commissions (the recurring window).
//   - amount_cents = round(invoice.amount_paid * partner.commission_pct / 100).
//
// NOTE: this builds the commission LEDGER + clearing only. The payout runner
// (Stripe Connect transfers) is intentionally NOT built here — partners aren't
// connected yet. Next step: an affiliate-payout-run fn that groups 'cleared'
// commissions per partner into affiliate_payouts + Stripe transfers.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// Minimal shape of the Stripe invoice fields we read. Kept local so this module
// has no hard dependency on a specific Stripe type import version.
export interface StripeInvoiceLike {
  id: string;
  object?: string;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  amount_paid?: number | null;
  subtotal?: number | null;
  amount_due?: number | null;
  currency?: string | null;
  number?: string | null;
  lines?: {
    data?: Array<{
      plan?: { nickname?: string | null } | null;
      price?: { id?: string | null; nickname?: string | null } | null;
    }>;
  } | null;
}

export interface CreditResult {
  credited: boolean;
  reason?: string;
  commission_id?: string;
  amount_cents?: number;
}

export interface VoidResult {
  voided: boolean;
  count?: number;
  reason?: string;
}

function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    fn: "affiliate_commission",
    event,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Normalize a Stripe field that may be an id string or an expanded object. */
function idOf(v: string | { id?: string } | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  return v.id ?? null;
}

/**
 * Best-effort plan_code extraction from the invoice line items. The invoice
 * carries the price nickname (not our internal plan_code), so this is purely
 * advisory — used to populate affiliate_referrals.plan_code for display. The
 * authoritative plan_code on `subscriptions` is still derived by billing-webhook
 * from the plans table; we do not touch that here.
 */
function planCodeFromInvoice(invoice: StripeInvoiceLike): string | null {
  const line = invoice.lines?.data?.[0];
  return (
    line?.price?.nickname ??
    line?.plan?.nickname ??
    null
  );
}

/**
 * Credit an affiliate commission for a paid invoice. Never throws.
 *
 * @param admin  service-role Supabase client (RLS-bypassing)
 * @param invoice  the Stripe invoice object from invoice.payment_succeeded
 */
export async function creditAffiliateForInvoice(
  admin: SupabaseClient,
  invoice: StripeInvoiceLike,
): Promise<CreditResult> {
  try {
    const invoiceId = invoice?.id;
    if (!invoiceId) {
      log("warn", "credit_no_invoice_id");
      return { credited: false, reason: "no_invoice_id" };
    }

    const customerId = idOf(invoice.customer);
    if (!customerId) {
      return { credited: false, reason: "no_customer" };
    }

    const nowIso = new Date().toISOString();

    // ── Idempotency (in-code): bail if this invoice already produced a row. ──
    {
      const { data: existing, error } = await admin
        .from("affiliate_commissions")
        .select("id")
        .eq("invoice_id", invoiceId)
        .limit(1)
        .maybeSingle();
      if (error) {
        log("error", "credit_idempotency_check_failed", { err: error.message, invoice_id: invoiceId });
        return { credited: false, reason: "idempotency_check_failed" };
      }
      if (existing) {
        return { credited: false, reason: "already_credited" };
      }
    }

    // ── Resolve the paying user_id from subscriptions by stripe_customer_id. ──
    // There may be multiple subscription rows for a customer over time; pick one
    // that actually carries a user_id.
    const { data: subRows, error: subErr } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .not("user_id", "is", null)
      .limit(1);
    if (subErr) {
      log("error", "credit_subscription_lookup_failed", { err: subErr.message, invoice_id: invoiceId });
      return { credited: false, reason: "subscription_lookup_failed" };
    }
    const userId = subRows?.[0]?.user_id ?? null;
    if (!userId) {
      log("info", "credit_no_user_for_customer", { invoice_id: invoiceId, stripe_customer_id: customerId });
      return { credited: false, reason: "no_user_for_customer" };
    }

    // ── Find an eligible referral: this user, unexpired, not churned. ──
    // attribution_expires_at IS NULL OR > now AND churned_at IS NULL.
    const { data: refRows, error: refErr } = await admin
      .from("affiliate_referrals")
      .select("id, partner_id, plan_code, mrr_cents, became_paid_at, attribution_expires_at, churned_at")
      .eq("referred_user_id", userId)
      .is("churned_at", null)
      .or(`attribution_expires_at.is.null,attribution_expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(1);
    if (refErr) {
      log("error", "credit_referral_lookup_failed", { err: refErr.message, invoice_id: invoiceId, user_id: userId });
      return { credited: false, reason: "referral_lookup_failed" };
    }
    const referral = refRows?.[0];
    if (!referral) {
      return { credited: false, reason: "no_referral" };
    }

    // ── Load the partner; require status='active'. ──
    const { data: partner, error: partnerErr } = await admin
      .from("affiliate_partners")
      .select("id, status, commission_pct, commission_months")
      .eq("id", referral.partner_id)
      .maybeSingle();
    if (partnerErr) {
      log("error", "credit_partner_lookup_failed", { err: partnerErr.message, invoice_id: invoiceId, partner_id: referral.partner_id });
      return { credited: false, reason: "partner_lookup_failed" };
    }
    if (!partner) {
      return { credited: false, reason: "no_partner" };
    }
    if (partner.status !== "active") {
      log("info", "credit_partner_not_active", { invoice_id: invoiceId, partner_id: partner.id, status: partner.status });
      return { credited: false, reason: "partner_not_active" };
    }

    const commissionMonths = Number(partner.commission_months ?? 0);
    const commissionPct = Number(partner.commission_pct ?? 0);

    // ── Respect commission_months: stop once the recurring window is used up. ──
    {
      const { count, error: countErr } = await admin
        .from("affiliate_commissions")
        .select("id", { count: "exact", head: true })
        .eq("referral_id", referral.id);
      if (countErr) {
        log("error", "credit_count_check_failed", { err: countErr.message, invoice_id: invoiceId, referral_id: referral.id });
        return { credited: false, reason: "count_check_failed" };
      }
      const existingCount = count ?? 0;
      if (commissionMonths > 0 && existingCount >= commissionMonths) {
        log("info", "credit_months_exhausted", { invoice_id: invoiceId, referral_id: referral.id, existing_count: existingCount, commission_months: commissionMonths });
        return { credited: false, reason: "months_exhausted" };
      }

      // ── Amounts. Prefer amount_paid; fall back to subtotal. ──
      const baseCents = Number(
        invoice.amount_paid ?? invoice.subtotal ?? 0,
      );
      const currency = (invoice.currency ?? "usd").toLowerCase();
      const planCode = planCodeFromInvoice(invoice) ?? referral.plan_code ?? null;
      const amountCents = Math.round((baseCents * commissionPct) / 100);
      const subscriptionId = idOf(invoice.subscription);
      const monthIndex = existingCount + 1;
      const clearsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // ── Update the referral (status / plan / mrr / became_paid_at). ──
      const referralUpdate: Record<string, unknown> = {
        subscription_status: "active",
        mrr_cents: baseCents,
        updated_at: nowIso,
      };
      if (planCode) referralUpdate.plan_code = planCode;
      if (!referral.became_paid_at) referralUpdate.became_paid_at = nowIso;
      {
        const { error: updErr } = await admin
          .from("affiliate_referrals")
          .update(referralUpdate)
          .eq("id", referral.id);
        if (updErr) {
          // Non-fatal for the commission itself — log and continue to insert.
          log("warn", "credit_referral_update_failed", { err: updErr.message, invoice_id: invoiceId, referral_id: referral.id });
        }
      }

      // ── Insert the commission (status='pending', 30-day hold). ──
      const insertRow = {
        partner_id: partner.id,
        referral_id: referral.id,
        invoice_id: invoiceId,
        stripe_customer_id: customerId,
        subscription_id: subscriptionId,
        amount_cents: amountCents,
        currency,
        commission_pct: commissionPct,
        commission_months: commissionMonths,
        status: "pending",
        earned_at: nowIso,
        clears_at: clearsAt,
        metadata: {
          invoice_number: invoice.number ?? null,
          month_index: monthIndex,
        },
      };

      const { data: inserted, error: insErr } = await admin
        .from("affiliate_commissions")
        .insert(insertRow)
        .select("id")
        .single();

      if (insErr) {
        // 23505 = unique_violation on affiliate_commissions(invoice_id): a
        // concurrent webhook retry already inserted. Treat as idempotent success
        // of the OTHER delivery, not an error.
        if ((insErr as { code?: string }).code === "23505") {
          log("info", "credit_already_credited_race", { invoice_id: invoiceId });
          return { credited: false, reason: "already_credited" };
        }
        log("error", "credit_insert_failed", { err: insErr.message, invoice_id: invoiceId, referral_id: referral.id });
        return { credited: false, reason: "insert_failed" };
      }

      log("info", "credit_created", {
        invoice_id: invoiceId,
        commission_id: inserted?.id,
        partner_id: partner.id,
        referral_id: referral.id,
        amount_cents: amountCents,
        month_index: monthIndex,
      });
      return { credited: true, commission_id: inserted?.id, amount_cents: amountCents };
    }
  } catch (e) {
    // Absolute backstop — this module must never throw to the webhook.
    log("error", "credit_unexpected_error", { err: e instanceof Error ? e.message : String(e), invoice_id: invoice?.id });
    return { credited: false, reason: "unexpected_error" };
  }
}

/**
 * Void all non-paid commissions tied to an invoice (refund handling). Never
 * throws. Paid commissions are deliberately left untouched — clawing back money
 * already transferred to a partner is a separate ops decision, not an automatic
 * refund side-effect.
 */
export async function voidAffiliateCommissionsForInvoice(
  admin: SupabaseClient,
  invoiceId: string,
  reason: string,
): Promise<VoidResult> {
  try {
    if (!invoiceId) {
      return { voided: false, reason: "no_invoice_id" };
    }
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from("affiliate_commissions")
      .update({ status: "voided", voided_at: nowIso, notes: reason, updated_at: nowIso })
      .eq("invoice_id", invoiceId)
      .neq("status", "paid")
      .neq("status", "voided")
      .select("id");
    if (error) {
      log("error", "void_failed", { err: error.message, invoice_id: invoiceId });
      return { voided: false, reason: "update_failed" };
    }
    const count = data?.length ?? 0;
    log("info", "void_completed", { invoice_id: invoiceId, count, reason });
    return { voided: true, count };
  } catch (e) {
    log("error", "void_unexpected_error", { err: e instanceof Error ? e.message : String(e), invoice_id: invoiceId });
    return { voided: false, reason: "unexpected_error" };
  }
}
