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
    console.error("[get-entitlements] rpc failed", error);
    return json({ ok: false, error: error.message }, 500);
  }

  return json({ ok: true, entitlements: data, org_id: orgId, user_id: user.id });
});
