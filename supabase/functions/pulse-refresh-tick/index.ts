// pulse-refresh-tick — rolling refresh of saved companies via ImportYeti.
// Triggered every 15 min by pg_cron. Processes up to 20 companies per tick.
// Auth: X-Internal-Cron header against LIT_CRON_SECRET env.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { fetchAndUpsertSnapshot } from "../_shared/importyeti_fetch.ts";
import { computeAlertCandidates } from "../_shared/alert_diff.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IMPORTYETI_API_KEY = Deno.env.get("IMPORTYETI_API_KEY") || "";

const BATCH_SIZE = 20;
const TTL_DAYS = 14;
const LOCK_KEY = 7281990; // arbitrary 32-bit signed int identifying this cron lock

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Advisory lock — abort if another tick is mid-flight.
  const { data: lockOk } = await supabase.rpc("try_pulse_refresh_lock", { p_key: LOCK_KEY });
  if (!lockOk) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "lock_held" }), { headers: { "Content-Type": "application/json" } });
  }

  // 2. Start run telemetry row.
  const { data: runRow } = await supabase
    .from("lit_saved_company_refresh_runs")
    .insert({ notes: "pulse-refresh-tick start" })
    .select("id")
    .single();
  const runId = runRow?.id;

  // 3. Claim up to BATCH_SIZE companies. Two passes: stale snapshots, then never-fetched saves.
  const stale = await pickStaleSnapshots(supabase, BATCH_SIZE);
  const remaining = BATCH_SIZE - stale.length;
  const neverFetched = remaining > 0 ? await pickNeverFetched(supabase, remaining) : [];
  const slugs = [...stale, ...neverFetched];

  // 4. Process each company.
  let processed = 0;
  let alertsCreated = 0;
  let errors = 0;
  for (const slug of slugs) {
    try {
      const result = await fetchAndUpsertSnapshot(supabase, slug, { IMPORTYETI_API_KEY });
      if (result.httpStatus === 404) {
        await markUntrackable(supabase, slug);
        continue;
      }
      const candidates = computeAlertCandidates(result.previousParsedSummary, result.parsedSummary!);
      if (candidates.length > 0) {
        alertsCreated += await fanOutAlerts(supabase, slug, candidates);
      }
      await resetFailureCount(supabase, slug);
      processed++;
    } catch (err) {
      errors++;
      console.error(`[pulse-refresh-tick] ${slug}:`, err?.message || err);
      await bumpFailureCount(supabase, slug);
    }
  }

  // 5. Close run row.
  if (runId) {
    await supabase.from("lit_saved_company_refresh_runs").update({
      finished_at: new Date().toISOString(),
      processed_count: processed,
      alert_count: alertsCreated,
      error_count: errors,
    }).eq("id", runId);
  }

  // 6. Release lock (no-op if we didn't acquire).
  // pg_advisory_unlock(LOCK_KEY) — omitted; session ends here, lock auto-releases.

  return new Response(JSON.stringify({
    ok: true, processed, alerts: alertsCreated, errors, slugs: slugs.length,
  }), { headers: { "Content-Type": "application/json" } });
});

async function pickStaleSnapshots(supabase: any, limit: number): Promise<string[]> {
  const ttl = new Date(Date.now() - TTL_DAYS * 86400 * 1000).toISOString();
  const { data } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("company_id")
    .lt("updated_at", ttl)
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (!data || data.length === 0) return [];
  // Filter to only company_ids that are CURRENTLY saved AND not untrackable.
  const slugs = data.map((r: any) => r.company_id);
  const { data: active } = await supabase
    .from("lit_saved_companies")
    .select("source_company_key")
    .in("source_company_key", slugs)
    .eq("refresh_status", "active");
  const activeSet = new Set((active || []).map((r: any) => r.source_company_key));
  return slugs.filter((s: string) => activeSet.has(s));
}

async function pickNeverFetched(supabase: any, limit: number): Promise<string[]> {
  // Pick saved companies that have NO row in lit_importyeti_company_snapshot yet.
  const { data: saves } = await supabase
    .from("lit_saved_companies")
    .select("source_company_key")
    .eq("refresh_status", "active")
    .not("source_company_key", "is", null);
  if (!saves || saves.length === 0) return [];
  const allSlugs = Array.from(new Set(saves.map((r: any) => r.source_company_key)));
  const { data: existing } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("company_id")
    .in("company_id", allSlugs);
  const existingSet = new Set((existing || []).map((r: any) => r.company_id));
  return allSlugs.filter((s: string) => !existingSet.has(s)).slice(0, limit);
}

async function fanOutAlerts(supabase: any, slug: string, candidates: any[]): Promise<number> {
  const { data: saves } = await supabase
    .from("lit_saved_companies")
    .select("user_id")
    .eq("source_company_key", slug)
    .eq("refresh_status", "active");
  if (!saves || saves.length === 0) return 0;
  const rows: any[] = [];
  for (const c of candidates) {
    for (const s of saves) {
      rows.push({
        user_id: s.user_id,
        source_company_key: slug,
        alert_type: c.alert_type,
        severity: c.severity,
        payload: c.payload,
      });
    }
  }
  const { error } = await supabase.from("lit_pulse_alerts").insert(rows);
  if (error) { console.error("[pulse-refresh-tick] alert insert failed:", error.message); return 0; }
  return rows.length;
}

async function markUntrackable(supabase: any, slug: string): Promise<void> {
  // Bump failure count; mark untrackable after 3 consecutive 404s.
  const { data: rows } = await supabase
    .from("lit_saved_companies")
    .select("id, consecutive_refresh_failures")
    .eq("source_company_key", slug);
  for (const r of rows || []) {
    const next = (r.consecutive_refresh_failures || 0) + 1;
    const updates: any = { consecutive_refresh_failures: next };
    if (next >= 3) {
      updates.refresh_status = "untrackable";
      updates.refresh_status_updated_at = new Date().toISOString();
    }
    await supabase.from("lit_saved_companies").update(updates).eq("id", r.id);
  }
}

async function bumpFailureCount(supabase: any, slug: string): Promise<void> {
  await supabase.rpc("increment_consecutive_refresh_failures", { p_slug: slug }).catch(() => {});
  // Fallback if RPC not defined: do nothing (next tick will retry).
}

async function resetFailureCount(supabase: any, slug: string): Promise<void> {
  await supabase
    .from("lit_saved_companies")
    .update({ consecutive_refresh_failures: 0 })
    .eq("source_company_key", slug)
    .neq("consecutive_refresh_failures", 0);
}
