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

  // These lookups are independent once the user's org is resolved.
  // Running them together avoids serial REST/RPC round trips on every
  // authenticated page while preserving the existing nullable fallbacks.
  const [credits, creditBalance, isPlatformAdmin, savedMapView, crmInfo, creditsMeteringEnabled] =
    await Promise.all([
      (async (): Promise<Record<string, unknown> | null> => {
        try {
          const { data, error } = await adminClient.rpc("lit_get_credit_usage", {
            p_org_id: orgId, p_user_id: user.id,
          });
          return error ? null : (data as Record<string, unknown> | null);
        } catch { return null; }
      })(),
      (async (): Promise<Record<string, unknown> | null> => {
        if (!orgId) return null;
        try {
          const { data, error } = await adminClient.rpc("lit_credit_balance", {
            p_org_id: orgId,
          });
          return error ? null : (data as Record<string, unknown> | null);
        } catch { return null; }
      })(),
      (async (): Promise<boolean> => {
        try {
          const { data } = await adminClient.from("platform_admins")
            .select("user_id").eq("user_id", user.id).maybeSingle();
          return Boolean(data);
        } catch { return false; }
      })(),
      (async (): Promise<{ limit: number | null; used: number } | null> => {
        try {
          const { data, error } = await adminClient.rpc("check_usage_limit", {
            p_org_id: orgId, p_user_id: user.id,
            p_feature_key: "saved_map_view", p_quantity: 0,
          });
          if (error || !data || typeof data !== "object") return null;
          const row = data as Record<string, unknown>;
          return {
            limit: row.limit == null ? null : Number(row.limit),
            used: Number(row.used ?? 0) || 0,
          };
        } catch { return null; }
      })(),
      (async (): Promise<{ enabled: boolean; seats: number }> => {
        if (!orgId) return { enabled: false, seats: 0 };
        try {
          const { data } = await adminClient.from("lit_crm_subscriptions")
            .select("status, seats").eq("org_id", orgId).maybeSingle();
          const status = String((data as any)?.status ?? "");
          const enabled = status === "active" || status === "trialing";
          return { enabled, seats: enabled ? Number((data as any)?.seats ?? 0) || 0 : 0 };
        } catch { return { enabled: false, seats: 0 }; }
      })(),
      (async (): Promise<boolean> => {
        try {
          const { data } = await adminClient.from("lit_feature_flags")
            .select("global_kill, rollout").eq("key", "credits_metering_enabled")
            .maybeSingle();
          return Boolean(data) && (data as any).global_kill !== true &&
            (Number((data as any).rollout ?? 0) || 0) > 0;
        } catch { return false; }
      })(),
    ]);
  const crmEnabled = crmInfo.enabled;
  const crmSeats = crmInfo.seats;

  const entitlements =
    data && typeof data === "object"
      ? { ...(data as Record<string, unknown>), credits, credit_balance: creditBalance, credits_metering_enabled: creditsMeteringEnabled, crm_enabled: crmEnabled, crm_seats: crmSeats }
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
