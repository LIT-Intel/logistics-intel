// affiliate-admin
// Super-admin-only data API for the Partner Program Admin page.
//
// Auth: requires a JWT belonging to a row in public.platform_admins.
// Internally uses the service role to read across affiliate_* tables so
// the admin UI doesn't depend on widening RLS.
//
// Body shape:
//   { action: "list_applications" | "list_partners" | "list_commissions"
//           | "list_payouts" | "list_tiers" | "kpis",
//     params?: { ... }
//   }
//
// Returns: { ok: true, ...data } | { ok: false, error }
// All read-only — no mutations. Approvals go through affiliate-review.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }
  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

async function authenticateSuperAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: json({ ok: false, error: "Missing Authorization header" }, 401) };
  }
  const env = getEnv();
  const userClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient: SupabaseClient = createClient(
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
  );
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
    return { error: json({ ok: false, error: "Forbidden: super-admin access required" }, 403) };
  }
  return { user: data.user, adminClient };
}

// Resolve auth.users emails for a list of user_ids in one batched call.
async function fetchEmails(adminClient: SupabaseClient, userIds: string[]) {
  const map = new Map<string, string | null>();
  if (userIds.length === 0) return map;
  // Use the auth admin API to fetch each user. Batched with Promise.all.
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  await Promise.all(
    unique.map(async (id) => {
      try {
        const { data } = await adminClient.auth.admin.getUserById(id);
        map.set(id, data?.user?.email ?? null);
      } catch {
        map.set(id, null);
      }
    }),
  );
  return map;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const auth = await authenticateSuperAdmin(req);
  if ("error" in auth) return auth.error;
  const { adminClient } = auth;

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action;

  try {
    if (action === "kpis") {
      const [pendingQ, partnersQ, suspendedQ, commissionsPendingQ, payoutsPendingQ] =
        await Promise.all([
          adminClient.from("affiliate_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
          adminClient.from("affiliate_partners").select("id", { count: "exact", head: true }).eq("status", "active"),
          adminClient.from("affiliate_partners").select("id", { count: "exact", head: true }).eq("status", "suspended"),
          adminClient.from("affiliate_commissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
          adminClient.from("affiliate_payouts").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
        ]);
      // Approved / rejected counts in last 30 days.
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const [approvedQ, rejectedQ] = await Promise.all([
        adminClient.from("affiliate_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved")
          .gte("reviewed_at", since),
        adminClient.from("affiliate_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "rejected")
          .gte("reviewed_at", since),
      ]);
      return json({
        ok: true,
        applications_pending: pendingQ.count ?? 0,
        applications_approved_30d: approvedQ.count ?? 0,
        applications_rejected_30d: rejectedQ.count ?? 0,
        partners_active: partnersQ.count ?? 0,
        partners_suspended: suspendedQ.count ?? 0,
        commissions_pending: commissionsPendingQ.count ?? 0,
        payouts_pending: payoutsPendingQ.count ?? 0,
      });
    }

    if (action === "list_applications") {
      const { data, error } = await adminClient
        .from("affiliate_applications")
        .select(
          "id, user_id, status, full_name, company_or_brand, website_or_linkedin, country, audience_description, audience_size, primary_channels, expected_referral_volume, submitted_at, reviewed_at, reviewer, rejection_reason",
        )
        .order("submitted_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("[affiliate-admin] list_applications failed", error);
        return json({ ok: false, error: error.message }, 500);
      }
      const rows = data ?? [];
      const emails = await fetchEmails(adminClient, rows.map((r: any) => r.user_id));
      return json({
        ok: true,
        applications: rows.map((r: any) => ({
          ...r,
          email: emails.get(r.user_id) ?? null,
        })),
      });
    }

    if (action === "list_partners") {
      const { data: partners, error } = await adminClient
        .from("affiliate_partners")
        .select(
          "id, user_id, application_id, ref_code, tier, status, commission_pct, commission_months, stripe_status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, joined_at, suspended_at",
        )
        .order("joined_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("[affiliate-admin] list_partners failed", error);
        return json({ ok: false, error: error.message }, 500);
      }
      const partnerRows = partners ?? [];
      const partnerIds = partnerRows.map((p: any) => p.id);

      // Aggregate referrals + commissions per partner.
      const aggMap = new Map<
        string,
        { referrals: number; lifetime_cents: number; available_cents: number; pending_cents: number }
      >();
      for (const id of partnerIds) {
        aggMap.set(id, { referrals: 0, lifetime_cents: 0, available_cents: 0, pending_cents: 0 });
      }

      if (partnerIds.length > 0) {
        const [refsQ, comsQ] = await Promise.all([
          adminClient.from("affiliate_referrals").select("partner_id").in("partner_id", partnerIds),
          adminClient
            .from("affiliate_commissions")
            .select("partner_id, amount_cents, status")
            .in("partner_id", partnerIds),
        ]);
        for (const r of refsQ.data ?? []) {
          const e = aggMap.get(r.partner_id);
          if (e) e.referrals += 1;
        }
        for (const c of comsQ.data ?? []) {
          const e = aggMap.get(c.partner_id);
          if (!e) continue;
          const amt = Number(c.amount_cents) || 0;
          if (c.status === "paid") e.lifetime_cents += amt;
          else if (c.status === "earned") {
            e.lifetime_cents += amt;
            e.available_cents += amt;
          } else if (c.status === "pending") {
            e.pending_cents += amt;
          }
        }
      }

      const emails = await fetchEmails(adminClient, partnerRows.map((p: any) => p.user_id));
      return json({
        ok: true,
        partners: partnerRows.map((p: any) => {
          const agg = aggMap.get(p.id) ?? {
            referrals: 0, lifetime_cents: 0, available_cents: 0, pending_cents: 0,
          };
          return {
            ...p,
            email: emails.get(p.user_id) ?? null,
            referrals_count: agg.referrals,
            lifetime_earnings_cents: agg.lifetime_cents,
            available_cents: agg.available_cents,
            pending_cents: agg.pending_cents,
          };
        }),
      });
    }

    if (action === "list_commissions") {
      const { data: coms, error } = await adminClient
        .from("affiliate_commissions")
        .select(
          "id, partner_id, referral_id, invoice_id, amount_cents, currency, commission_pct, commission_months, status, earned_at, clears_at, paid_at, voided_at, created_at, notes",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("[affiliate-admin] list_commissions failed", error);
        return json({ ok: false, error: error.message }, 500);
      }
      const rows = coms ?? [];
      const partnerIds = Array.from(new Set(rows.map((r: any) => r.partner_id).filter(Boolean)));
      const referralIds = Array.from(new Set(rows.map((r: any) => r.referral_id).filter(Boolean)));

      const partnerMap = new Map<string, { name: string; ref_code: string }>();
      const referralMap = new Map<string, string>();

      if (partnerIds.length > 0) {
        const { data: partners } = await adminClient
          .from("affiliate_partners")
          .select("id, user_id, ref_code")
          .in("id", partnerIds);
        const userIds = (partners ?? []).map((p: any) => p.user_id);
        const emails = await fetchEmails(adminClient, userIds);
        for (const p of partners ?? []) {
          partnerMap.set(p.id, {
            name: emails.get(p.user_id) ?? p.user_id,
            ref_code: p.ref_code,
          });
        }
      }
      if (referralIds.length > 0) {
        const { data: refs } = await adminClient
          .from("affiliate_referrals")
          .select("id, referred_email, referred_company")
          .in("id", referralIds);
        for (const r of refs ?? []) {
          referralMap.set(r.id, r.referred_company || r.referred_email || "—");
        }
      }

      return json({
        ok: true,
        commissions: rows.map((r: any) => ({
          ...r,
          partner_label: partnerMap.get(r.partner_id)?.name ?? null,
          partner_ref_code: partnerMap.get(r.partner_id)?.ref_code ?? null,
          referred_label: r.referral_id ? referralMap.get(r.referral_id) ?? null : null,
        })),
      });
    }

    if (action === "list_payouts") {
      const { data, error } = await adminClient
        .from("affiliate_payouts")
        .select(
          "id, partner_id, period_start, period_end, amount_cents, currency, commissions_count, stripe_transfer_id, stripe_payout_id, status, paid_on, failure_reason, created_at",
        )
        .order("period_start", { ascending: false })
        .limit(200);
      if (error) {
        console.error("[affiliate-admin] list_payouts failed", error);
        return json({ ok: false, error: error.message }, 500);
      }
      return json({ ok: true, payouts: data ?? [] });
    }

    if (action === "list_tiers") {
      const { data: tiers, error } = await adminClient
        .from("affiliate_tiers")
        .select("id, code, name, commission_pct, commission_months, attribution_days, min_payout_cents, description, is_active")
        .order("commission_pct", { ascending: true });
      if (error) {
        console.error("[affiliate-admin] list_tiers failed", error);
        return json({ ok: false, error: error.message }, 500);
      }
      const tierRows = tiers ?? [];
      // Count partners per tier.
      const counts = new Map<string, number>();
      const { data: partners } = await adminClient
        .from("affiliate_partners")
        .select("tier")
        .eq("status", "active");
      for (const p of partners ?? []) {
        counts.set(p.tier, (counts.get(p.tier) ?? 0) + 1);
      }
      return json({
        ok: true,
        tiers: tierRows.map((t: any) => ({
          ...t,
          partners_count: counts.get(t.code) ?? 0,
        })),
      });
    }

    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[affiliate-admin] handler error", err);
    return json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal error",
    }, 500);
  }
});
