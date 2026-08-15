// partner-payout-run
//
// Pays out matured affiliate commissions to partners via Stripe Connect
// transfers. This is the final link in the affiliate money path:
//
//   invoice.payment_succeeded
//     -> affiliate_commission.ts inserts commission (status='pending', 30d hold)
//     -> affiliate-commission-clear moves pending -> 'earned' after the hold
//     -> THIS FN groups a partner's 'earned' (unpaid) commissions, creates a
//        Stripe transfer to their connected account, inserts an affiliate_payouts
//        row, and stamps those commissions 'paid' + payout_id.
//
// Auth (either):
//   - platform-admin JWT (manual "Run payout" from the admin UI), OR
//   - cron secret in X-Internal-Cron == LIT_CRON_SECRET (scheduled monthly run).
//
// Eligibility per partner:
//   - status='active', not deleted
//   - stripe_account_id present AND stripe_payouts_enabled = true
//   - sum(earned, unpaid commissions in payout_currency) >= min_payout_cents
//     (per-partner threshold; falls back to $50 when unset)
//
// Idempotency / safety:
//   - A partner with a payout already 'pending'/'processing' is skipped (a prior
//     run is mid-flight); prevents double-pay.
//   - The commissions are re-locked to the payout by id before the transfer, and
//     stamped 'paid' only after Stripe returns a transfer id. Uses a Stripe
//     idempotency key = payout row id so a retry of the same payout can't create
//     a second transfer.
//   - On Stripe error the payout row is marked 'failed' with failure_reason and
//     the commissions are released back (payout_id cleared, status stays 'earned').
//   - dry_run=true computes eligibility and amounts WITHOUT creating any Stripe
//     transfer or mutating commissions (used by the admin "Dry-run next batch").
//
// Deploy: MCP deploy_edge_function. Schedule (optional) via pg_cron + pg_net:
//   select cron.schedule('partner-payout-run-monthly', '0 14 1 * *',
//     $$ select net.http_post(
//          url := '<project>/functions/v1/partner-payout-run',
//          headers := jsonb_build_object('X-Internal-Cron','<LIT_CRON_SECRET>'),
//          body := '{}'::jsonb
//        ); $$);

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const moduleLog = createLogger("partner-payout-run");

const DEFAULT_MIN_PAYOUT_CENTS = 5000; // $50 floor when a partner has none set.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? null;
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }
  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey, stripeSecretKey };
}

/** Returns { adminClient } if the caller is a platform-admin JWT OR a valid cron
 *  secret; otherwise an error Response. */
async function authorize(req: Request, env: ReturnType<typeof getEnv>) {
  const adminClient: SupabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);

  // Cron path first (no JWT).
  const cron = verifyCronAuth(req);
  if (cron.ok) return { adminClient, actor: "cron" as const };

  // JWT path: must belong to a platform_admin.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: json({ ok: false, error: "Missing Authorization header or cron secret" }, 401) };
  }
  const userClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    return { error: json({ ok: false, error: "Unauthorized" }, 401) };
  }
  const { data: adminRow } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!adminRow) {
    return { error: json({ ok: false, error: "Forbidden: platform-admin access required" }, 403) };
  }
  return { adminClient, actor: `admin:${data.user.id}` as const };
}

interface PartnerRow {
  id: string;
  user_id: string;
  ref_code: string;
  status: string;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
  payout_currency: string;
  min_payout_cents: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const reqId = requestId();
  const log = moduleLog.child({ request_id: reqId });

  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (err) {
    log.error("env_missing", { err: err instanceof Error ? err.message : String(err) });
    return json({ ok: false, error: "Server misconfigured" }, 500);
  }

  const authz = await authorize(req, env);
  if ("error" in authz) return authz.error;
  const { adminClient, actor } = authz;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const dryRun = body.dry_run === true;
  const overrideMin =
    typeof body.min_payout_cents === "number" && Number.isFinite(body.min_payout_cents)
      ? Math.max(0, Math.round(body.min_payout_cents))
      : null;

  if (!env.stripeSecretKey && !dryRun) {
    // Honest failure — the UI shows a "Stripe Connect not configured" message.
    return json({ ok: false, code: "STRIPE_NOT_CONFIGURED" }, 200);
  }
  const stripe = env.stripeSecretKey
    ? new Stripe(env.stripeSecretKey, { apiVersion: "2024-06-20" })
    : null;

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  try {
    // 1. Eligible partners: active, connected, payouts enabled.
    const { data: partnersRaw, error: partnersErr } = await adminClient
      .from("affiliate_partners")
      .select("id, user_id, ref_code, status, stripe_account_id, stripe_payouts_enabled, payout_currency, min_payout_cents")
      .eq("status", "active")
      .is("deleted_at", null)
      .eq("stripe_payouts_enabled", true)
      .not("stripe_account_id", "is", null);
    if (partnersErr) {
      log.error("partners_load_failed", { err: partnersErr.message });
      return json({ ok: false, error: partnersErr.message }, 500);
    }
    const partners = (partnersRaw ?? []) as PartnerRow[];

    const results: Array<Record<string, unknown>> = [];
    let paidCount = 0;
    let paidCents = 0;
    let skipped = 0;
    let failed = 0;

    for (const partner of partners) {
      const minCents = overrideMin ?? partner.min_payout_cents ?? DEFAULT_MIN_PAYOUT_CENTS;
      const currency = (partner.payout_currency || "usd").toLowerCase();

      // 2. Matured, unpaid, not-yet-assigned commissions in the payout currency.
      const { data: coms, error: comsErr } = await adminClient
        .from("affiliate_commissions")
        .select("id, amount_cents, currency, earned_at")
        .eq("partner_id", partner.id)
        .eq("status", "earned")
        .is("payout_id", null)
        .eq("currency", currency);
      if (comsErr) {
        log.error("commissions_load_failed", { partner_id: partner.id, err: comsErr.message });
        results.push({ partner_id: partner.id, ref_code: partner.ref_code, status: "error", reason: comsErr.message });
        failed++;
        continue;
      }
      const commissions = coms ?? [];
      const sumCents = commissions.reduce((acc, c) => acc + (Number(c.amount_cents) || 0), 0);

      if (commissions.length === 0 || sumCents < minCents) {
        results.push({
          partner_id: partner.id,
          ref_code: partner.ref_code,
          status: "below_threshold",
          eligible_cents: sumCents,
          min_payout_cents: minCents,
          commissions_count: commissions.length,
        });
        skipped++;
        continue;
      }

      // 3. Idempotency: skip if a payout is already in flight for this partner.
      const { data: inflight } = await adminClient
        .from("affiliate_payouts")
        .select("id, status")
        .eq("partner_id", partner.id)
        .in("status", ["pending", "processing"])
        .limit(1);
      if (inflight && inflight.length > 0) {
        results.push({
          partner_id: partner.id,
          ref_code: partner.ref_code,
          status: "skipped_inflight",
          existing_payout_id: inflight[0].id,
        });
        skipped++;
        continue;
      }

      const commissionIds = commissions.map((c) => c.id);
      const periods = commissions
        .map((c) => c.earned_at)
        .filter(Boolean)
        .sort() as string[];
      const periodStart = periods.length ? periods[0].slice(0, 10) : today;
      const periodEnd = today;

      if (dryRun) {
        results.push({
          partner_id: partner.id,
          ref_code: partner.ref_code,
          status: "eligible",
          amount_cents: sumCents,
          currency,
          commissions_count: commissionIds.length,
          min_payout_cents: minCents,
        });
        paidCents += sumCents;
        paidCount++;
        continue;
      }

      // 4. Create the payout row (status='processing') so we have a stable id
      //    to (a) use as the Stripe idempotency key and (b) stamp on commissions.
      const { data: payout, error: payoutErr } = await adminClient
        .from("affiliate_payouts")
        .insert({
          partner_id: partner.id,
          period_start: periodStart,
          period_end: periodEnd,
          amount_cents: sumCents,
          currency,
          commissions_count: commissionIds.length,
          status: "processing",
          metadata: { commission_ids: commissionIds, triggered_by: actor },
        })
        .select("id")
        .single();
      if (payoutErr || !payout) {
        log.error("payout_insert_failed", { partner_id: partner.id, err: payoutErr?.message });
        results.push({ partner_id: partner.id, ref_code: partner.ref_code, status: "error", reason: payoutErr?.message });
        failed++;
        continue;
      }
      const payoutId = payout.id as string;

      // 5. Lock the commissions to this payout id (still 'earned' — flipped to
      //    'paid' only after the transfer succeeds). Guard on payout_id IS NULL
      //    so a concurrent run can't grab the same rows.
      const { data: locked, error: lockErr } = await adminClient
        .from("affiliate_commissions")
        .update({ payout_id: payoutId, updated_at: nowIso })
        .in("id", commissionIds)
        .is("payout_id", null)
        .eq("status", "earned")
        .select("id, amount_cents");
      if (lockErr) {
        log.error("commission_lock_failed", { partner_id: partner.id, payout_id: payoutId, err: lockErr.message });
        await adminClient.from("affiliate_payouts").update({
          status: "failed", failure_reason: `lock failed: ${lockErr.message}`, updated_at: nowIso,
        }).eq("id", payoutId);
        results.push({ partner_id: partner.id, ref_code: partner.ref_code, status: "error", reason: lockErr.message });
        failed++;
        continue;
      }
      const lockedIds = (locked ?? []).map((c) => c.id);
      const lockedCents = (locked ?? []).reduce((a, c) => a + (Number(c.amount_cents) || 0), 0);
      if (lockedIds.length === 0) {
        // Another run already claimed them; back out.
        await adminClient.from("affiliate_payouts").update({
          status: "cancelled", failure_reason: "no commissions to lock (raced)", updated_at: nowIso,
        }).eq("id", payoutId);
        results.push({ partner_id: partner.id, ref_code: partner.ref_code, status: "skipped_raced" });
        skipped++;
        continue;
      }

      // 6. Stripe transfer to the connected account. Idempotency key = payout id.
      try {
        const transfer = await stripe!.transfers.create(
          {
            amount: lockedCents,
            currency,
            destination: partner.stripe_account_id!,
            metadata: {
              affiliate_partner_id: partner.id,
              affiliate_payout_id: payoutId,
              commissions_count: String(lockedIds.length),
            },
          },
          { idempotencyKey: `affiliate_payout_${payoutId}` },
        );

        // 7. Success: stamp commissions 'paid' + payout, finalize payout row.
        await adminClient
          .from("affiliate_commissions")
          .update({ status: "paid", paid_at: nowIso, updated_at: nowIso })
          .in("id", lockedIds);
        await adminClient
          .from("affiliate_payouts")
          .update({
            status: "paid",
            amount_cents: lockedCents,
            commissions_count: lockedIds.length,
            stripe_transfer_id: transfer.id,
            paid_on: nowIso,
            updated_at: nowIso,
          })
          .eq("id", payoutId);

        log.info("payout_paid", { partner_id: partner.id, payout_id: payoutId, amount_cents: lockedCents, transfer_id: transfer.id });
        results.push({
          partner_id: partner.id,
          ref_code: partner.ref_code,
          status: "paid",
          payout_id: payoutId,
          amount_cents: lockedCents,
          commissions_count: lockedIds.length,
          stripe_transfer_id: transfer.id,
        });
        paidCount++;
        paidCents += lockedCents;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("stripe_transfer_failed", { partner_id: partner.id, payout_id: payoutId, err: msg });
        // Release the commissions back to 'earned'/unassigned and mark payout failed.
        await adminClient
          .from("affiliate_commissions")
          .update({ payout_id: null, updated_at: nowIso })
          .in("id", lockedIds);
        await adminClient
          .from("affiliate_payouts")
          .update({ status: "failed", failure_reason: msg.slice(0, 500), updated_at: nowIso })
          .eq("id", payoutId);
        results.push({
          partner_id: partner.id,
          ref_code: partner.ref_code,
          status: "failed",
          payout_id: payoutId,
          reason: msg,
        });
        failed++;
      }
    }

    return json({
      ok: true,
      dry_run: dryRun,
      partners_considered: partners.length,
      paid_count: paidCount,
      paid_cents: paidCents,
      skipped,
      failed,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("run_unexpected_error", { err: msg });
    return json({ ok: false, error: msg }, 500);
  }
});
