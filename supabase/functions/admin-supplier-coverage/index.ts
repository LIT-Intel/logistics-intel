// admin-supplier-coverage — T2 coverage diagnostic for the Suppliers /
// Opportunity data pipeline. Returns lit_supplier_coverage_diagnostic():
// directory size, snapshots-with-suppliers, the T5 supplier 12M rollup
// row/company counts, saved-with-snapshot, opportunity-score coverage, and the
// scoring MV size. Read-only aggregates (no PII).
//
// Optional POST { action: "rebuild" } re-runs lit_rebuild_supplier_aggregates()
// first (admin on-demand refresh of the T5 rollup), then returns the fresh
// diagnostic.
//
// Auth: platform_admin only, verified server-side against platform_admins.
// Service-role client runs the RPC so the (SECURITY INVOKER) diagnostic sees
// all tables regardless of RLS.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("admin-supplier-coverage");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    log.error("server_misconfigured", { err: "missing Supabase env" });
    return json({ ok: false, error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "Missing Authorization header" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    log.warn("unauthorized", { err: authError?.message });
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const { data: adminRow } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) {
    log.warn("forbidden_non_admin", { user_id: user.id });
    return json({ ok: false, error: "Forbidden: platform admin required" }, 403);
  }

  let action: string | null = null;
  try {
    const body = req.method === "POST" ? await req.json() : {};
    action = (body?.action ?? null) as string | null;
  } catch { /* no body */ }

  let rebuilt: number | null = null;
  if (action === "rebuild") {
    const { data: n, error: rebErr } = await admin.rpc("lit_rebuild_supplier_aggregates");
    if (rebErr) {
      log.error("rebuild_failed", { err: rebErr.message });
      return json({ ok: false, error: "Rollup rebuild failed" }, 500);
    }
    rebuilt = Number(n);
    log.info("rollup_rebuilt", { rows: rebuilt, by: user.id });
  }

  const { data, error } = await admin.rpc("lit_supplier_coverage_diagnostic");
  if (error) {
    log.error("diagnostic_failed", { err: error.message });
    return json({ ok: false, error: "Diagnostic query failed" }, 500);
  }

  const metrics = (data ?? []) as Array<{ metric: string; value: number }>;
  const byKey: Record<string, number> = {};
  for (const m of metrics) byKey[m.metric] = Number(m.value);

  return json({ ok: true, metrics, byKey, rebuilt, generated_at: new Date().toISOString() });
});
