// get-entitlements
// Single read used by the frontend (Billing page, useEntitlements hook,
// global gating UI) to learn the current user's plan + per-feature
// limits + per-feature used counts.
//
// Auth: requires user JWT.
// Returns: { ok: true, entitlements: { plan, plan_name, reset_at,
//   market_benchmark_enabled, features: {...bool}, limits: {...num|null},
//   used: {...num} } }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger, requestId } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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

async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: json({ ok: false, error: "Missing Authorization header" }, 401) };
  }
  const env = getEnv();
  const userClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient: SupabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    return { error: json({ ok: false, error: "Unauthorized" }, 401) };
  }
  return { user: data.user, adminClient };
}

async function resolveOrgId(adminClient: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await adminClient
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.org_id ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  const log = createLogger("get-entitlements", { request_id: requestId() });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { user, adminClient } = auth;

  const orgId = await resolveOrgId(adminClient, user.id);

  const { data, error } = await adminClient.rpc("get_entitlements", {
    p_org_id: orgId,
    p_user_id: user.id,
  });
  if (error) {
    log.error("get_entitlements_rpc_failed", { detail: error.message, user_id: user.id, org_id: orgId });
    return json({ ok: false, error: error.message }, 500);
  }

  // Enrichment Phase 1: fold credit usage into the snapshot. RPC returns
  // { used_this_month, quota, remaining, reset_at, plan }. NULL quota =
  // unlimited (Enterprise). Soft-fail if the RPC isn't deployed yet so we
  // don't break the existing UI gating on rollback.
  let credits: Record<string, unknown> | null = null;
  try {
    const { data: creditData, error: creditErr } = await adminClient.rpc(
      "lit_get_credit_usage",
      { p_org_id: orgId, p_user_id: user.id },
    );
    if (!creditErr) credits = creditData as Record<string, unknown>;
  } catch (_) {
    // RPC may not exist in some environments; ignore.
  }

  // Credits v2 — the unified LIT Credits balance (included + purchased) from the
  // new credit engine (lit_credit_accounts). Soft-fail so the snapshot never
  // breaks if the engine isn't present in this environment.
  let creditBalance: Record<string, unknown> | null = null;
  try {
    if (orgId) {
      const { data: cbData, error: cbErr } = await adminClient.rpc(
        "lit_credit_balance",
        { p_org_id: orgId },
      );
      if (!cbErr) creditBalance = cbData as Record<string, unknown>;
    }
  } catch (_) {
    // engine not deployed in this env — ignore.
  }

  const { data: paRow } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const isPlatformAdmin = paRow !== null;

  // saved_map_view is enforced by check_usage_limit (migration
  // 20260624130000) but is NOT emitted by the get_entitlements RPC's
  // limits/used maps. The frontend's saveViewAllowed gate reads
  // entitlements.limits.saved_map_view, so derive it here from the
  // authoritative gate (limit/used) and fold it into the snapshot. We call
  // check_usage_limit with quantity 0 so it never consumes — it just reports
  // the current limit + used. Soft-fail (leave the key absent) on error; the
  // frontend already treats a missing key as blocked for free_trial.
  let savedMapView: { limit: number | null; used: number } | null = null;
  try {
    const { data: smvData, error: smvErr } = await adminClient.rpc(
      "check_usage_limit",
      {
        p_org_id: orgId,
        p_user_id: user.id,
        p_feature_key: "saved_map_view",
        p_quantity: 0,
      },
    );
    if (!smvErr && smvData && typeof smvData === "object") {
      const row = smvData as Record<string, unknown>;
      const rawLimit = row.limit;
      const rawUsed = row.used;
      savedMapView = {
        limit:
          rawLimit === null || rawLimit === undefined
            ? null
            : Number(rawLimit),
        used: typeof rawUsed === "number" ? rawUsed : Number(rawUsed ?? 0) || 0,
      };
    }
  } catch (_) {
    // RPC unavailable in this env — leave the key absent.
  }

  // CRM per-seat add-on entitlement. Org-level: read the org's row in
  // lit_crm_subscriptions (written by billing-webhook). crm_enabled is true
  // for an active/trialing subscription; crm_seats is the paid seat count.
  // Soft-fail (disabled) when the org has no row or the table is absent so
  // rollout/rollback never breaks the snapshot.
  let crmEnabled = false;
  let crmSeats = 0;
  if (orgId) {
    try {
      const { data: crmRow } = await adminClient
        .from("lit_crm_subscriptions")
        .select("status, seats")
        .eq("org_id", orgId)
        .maybeSingle();
      if (crmRow) {
        const status = String((crmRow as Record<string, unknown>).status ?? "");
        crmEnabled = status === "active" || status === "trialing";
        crmSeats = crmEnabled
          ? Number((crmRow as Record<string, unknown>).seats ?? 0) || 0
          : 0;
      }
    } catch (_) {
      // Table not present in this env — leave CRM disabled.
    }
  }

  const entitlements =
    data && typeof data === "object"
      ? { ...(data as Record<string, unknown>), credits, credit_balance: creditBalance, crm_enabled: crmEnabled, crm_seats: crmSeats }
      : data;

  // Fold saved_map_view into the limits/used maps so the UI gate + Billing
  // meter can read it like any other feature key.
  if (
    savedMapView &&
    entitlements &&
    typeof entitlements === "object"
  ) {
    const ent = entitlements as Record<string, unknown>;
    if (ent.limits && typeof ent.limits === "object") {
      (ent.limits as Record<string, unknown>).saved_map_view =
        savedMapView.limit;
    }
    if (ent.used && typeof ent.used === "object") {
      (ent.used as Record<string, unknown>).saved_map_view = savedMapView.used;
    }
  }

  return json({
    ok: true,
    entitlements,
    org_id: orgId,
    user_id: user.id,
    is_platform_admin: isPlatformAdmin,
  });
});
