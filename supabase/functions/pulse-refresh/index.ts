// pulse-refresh — Pulse Explorer per-account ImportYeti refresh.
//
// Distinct from importyeti-proxy's existing companyProfile action: this
// uses 24h cache TTL (vs 30-day) and per-user daily quota (vs the existing
// company_profile_view monthly entitlement) per the Pulse Explorer spec.
//
// Auth: Bearer <user JWT>. Body: { company_id: string, force?: boolean }
// Returns:
//   - { ok:true, source:"cache", from_cache:true, last_refreshed_at, snapshot }
//   - { ok:true, source:"fresh", from_cache:false, last_refreshed_at, snapshot }
//   - { ok:false, error:"quota_exceeded", code:"PULSE_REFRESH_QUOTA_EXCEEDED", cap, used, plan_tier } (429)
//
// Does NOT call ImportYeti upstream itself — delegates to the existing
// importyeti-proxy companyProfile action with the user's JWT for the
// actual fetch (so we reuse all the upstream parsing + snapshot persist
// logic). This wrapper enforces the Explorer-specific cache + quota.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CACHE_TTL_HOURS = 24;

const PULSE_REFRESH_DAILY_CAP: Record<string, number> = {
  free_trial: 5,
  starter: 25,
  growth: 50,
  scale: 200,
  enterprise: 1000,
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadPlanTier(admin: any, userId: string): Promise<string> {
  try {
    const { data } = await admin
      .from("subscriptions")
      .select("plan_tier")
      .eq("user_id", userId)
      .maybeSingle();
    const tier = (data as any)?.plan_tier;
    return typeof tier === "string" && tier ? tier : "free_trial";
  } catch {
    return "free_trial";
  }
}

async function getCachedSnapshotIfFresh(admin: any, companyId: string) {
  const { data } = await admin
    .from("lit_importyeti_company_snapshot")
    .select("company_id, parsed_summary, raw_payload, updated_at")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data?.updated_at) return null;
  const ageHours = (Date.now() - new Date(data.updated_at).getTime()) / (1000 * 60 * 60);
  return ageHours < CACHE_TTL_HOURS ? data : null;
}

async function checkAndIncrementPulseQuota(
  admin: any,
  userId: string,
  planTier: string,
): Promise<{ ok: true } | { ok: false; cap: number; used: number }> {
  const cap = PULSE_REFRESH_DAILY_CAP[planTier] ?? PULSE_REFRESH_DAILY_CAP.free_trial;
  const today = new Date().toISOString().slice(0, 10);
  const { data: row } = await admin
    .from("lit_user_importyeti_quota")
    .select("calls_count")
    .eq("user_id", userId)
    .eq("day", today)
    .maybeSingle();
  const used = (row as any)?.calls_count ?? 0;
  if (used >= cap) return { ok: false, cap, used };
  await admin
    .from("lit_user_importyeti_quota")
    .upsert(
      { user_id: userId, day: today, calls_count: used + 1 },
      { onConflict: "user_id,day" },
    );
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: "supabase_env_missing" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let userId: string | null = null;
  try {
    const { data: u } = await admin.auth.getUser(token);
    userId = u?.user?.id ?? null;
  } catch {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!userId) return json({ ok: false, error: "unauthorized" }, 401);

  let body: { company_id?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const { company_id, force = false } = body;
  if (!company_id) return json({ ok: false, error: "company_id required" }, 400);

  // 1. Cache-hit gate (24h).
  if (!force) {
    const cached = await getCachedSnapshotIfFresh(admin, company_id);
    if (cached) {
      return json({
        ok: true,
        source: "cache",
        from_cache: true,
        company_id,
        last_refreshed_at: cached.updated_at,
        snapshot: cached.parsed_summary,
      });
    }
  }

  // 2. Per-user daily quota.
  const planTier = await loadPlanTier(admin, userId);
  const quota = await checkAndIncrementPulseQuota(admin, userId, planTier);
  if (!quota.ok) {
    return json(
      {
        ok: false,
        error: "quota_exceeded",
        code: "PULSE_REFRESH_QUOTA_EXCEEDED",
        cap: quota.cap,
        used: quota.used,
        plan_tier: planTier,
      },
      429,
    );
  }

  // 3. Delegate the upstream fetch + parse + snapshot persist to the existing
  //    importyeti-proxy (companyProfile action, with refresh:true to force
  //    fresh upstream). We pass the user JWT through so the proxy can honor
  //    its own admin/usage tracking.
  try {
    const proxyUrl = `${SUPABASE_URL}/functions/v1/importyeti-proxy`;
    const r = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "companyProfile",
        company_id,
        refresh: true,
      }),
    });
    const proxyBody = await r.json();
    if (!r.ok || proxyBody?.ok === false) {
      return json(
        { ok: false, error: proxyBody?.error ?? `proxy_${r.status}` , code: proxyBody?.code ?? "PROXY_FAILED" },
        r.status,
      );
    }
    return json({
      ok: true,
      source: "fresh",
      from_cache: false,
      company_id,
      last_refreshed_at: proxyBody?.fetched_at ?? new Date().toISOString(),
      snapshot: proxyBody?.snapshot ?? null,
    });
  } catch (err: any) {
    return json(
      { ok: false, error: err?.message ?? "Pulse refresh failed", code: "PULSE_REFRESH_FAILED" },
      500,
    );
  }
});
