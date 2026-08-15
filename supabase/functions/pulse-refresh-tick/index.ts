// pulse-refresh-tick — rolling refresh of saved companies via ImportYeti.
// Triggered by pg_cron. Auth: X-Internal-Cron header against LIT_CRON_SECRET env.
//
// Phase 2B (2026-08-14): background-refresh is now credit-controlled. It:
//   - exits early when IMPORTYETI_BACKGROUND_REFRESH_ENABLED is killed;
//   - only refreshes ACTIVE, non-churned owners on daily/weekly tiers whose
//     snapshot age exceeds the tier cadence (selection lives in the
//     pick_refreshable_saved_snapshots RPC — 'none'/NULL tiers get no bg refresh);
//   - meters every upstream call into provider_usage_events + mirrors the live
//     ImportYeti balance (via fetchAndUpsertSnapshot's meterCtx);
//   - enforces a hard per-run cap so a bug can't drain the whole balance.
// The auto-deploy workflow skips _shared-only diffs, so editing this file also
// forces the redeploy that picks up the updated _shared modules.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import {
  fetchAndUpsertSnapshot,
  type MeterCtx,
} from "../_shared/importyeti_fetch.ts";
import { computeAlertCandidates } from "../_shared/alert_diff.ts";
import { rematerializeCompanyBols } from "../_shared/materialize_bols.ts";
import { isProviderEnabled } from "../_shared/provider_ledger.ts";
import {
  PROVIDER_FLAGS,
  PROVIDER_OPERATIONS,
  TRIGGER_TYPES,
} from "../_shared/provider_operations.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IMPORTYETI_API_KEY = Deno.env.get("IMPORTYETI_API_KEY") || "";

// Per-run hard cap on companies refreshed. A safety valve: even if the picker
// mis-selects, one tick can never drain more than this many credits. Overridable
// via env (PULSE_REFRESH_MAX_PER_RUN) so ops can tune without a redeploy.
const DEFAULT_MAX_PER_RUN = 200;
const MAX_PER_RUN = (() => {
  const raw = Number(Deno.env.get("PULSE_REFRESH_MAX_PER_RUN"));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_PER_RUN;
})();

// Per-tick batch. The tier + activeness + cadence filtering now lives in the
// pick_refreshable_saved_snapshots RPC, so this is just how many due candidates
// we take per run (never more than MAX_PER_RUN).
const BATCH_SIZE = 40;
const LOCK_KEY = 7281990; // arbitrary 32-bit signed int identifying this cron lock

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 0. Background-refresh kill switch. If disabled, do ZERO work (no upstream
  //    spend, no lock churn). Fail-open lives inside isProviderEnabled, so a
  //    flag-RPC bug won't silently pause the sweep.
  const bgEnabled = await isProviderEnabled(
    supabase,
    PROVIDER_FLAGS.IMPORTYETI_BACKGROUND_REFRESH_ENABLED,
  );
  if (!bgEnabled) {
    console.log("[pulse-refresh-tick] background refresh disabled — 0 work");
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "background_refresh_disabled" }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

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

  // 3. Claim due candidates. The RPC filters to ACTIVE (activity in last 30d),
  //    non-churned owners on daily/weekly tiers whose snapshot age exceeds the
  //    tier cadence (weekly=7d, daily=24h; 'none'/NULL tiers excluded). The
  //    per-run cap is a hard ceiling below which a bug cannot drain the balance.
  const take = Math.min(BATCH_SIZE, MAX_PER_RUN);
  const candidates = await pickRefreshable(supabase, take);
  const capped = candidates.length >= MAX_PER_RUN;
  if (capped) {
    console.log(`[pulse-refresh-tick] per-run cap reached: ${MAX_PER_RUN} companies`);
  }

  // 4. Process each candidate — gated + ledgered via meterCtx.
  let processed = 0;
  let alertsCreated = 0;
  let errors = 0;
  for (const cand of candidates) {
    const slug = cand.source_company_key;
    try {
      const meterCtx: MeterCtx = {
        operation: PROVIDER_OPERATIONS.PULSE_REFRESH,
        trigger_type: TRIGGER_TYPES.CRON,
        source: "pulse-refresh-tick",
        organization_id: cand.org_id ?? null,
        user_id: cand.user_id ?? null,
        saved_company_id: cand.saved_company_id ?? null,
        subscription_tier: cand.subscription_tier ?? null,
        flagKey: PROVIDER_FLAGS.IMPORTYETI_BACKGROUND_REFRESH_ENABLED,
      };
      const result = await fetchAndUpsertSnapshot(
        supabase,
        slug,
        { IMPORTYETI_API_KEY },
        meterCtx,
      );
      if (result.httpStatus === 404) {
        await markUntrackable(supabase, slug);
        continue;
      }
      // Re-materialize lit_unified_shipments from the fresh JSONB blob.
      // Wrapped so a materializer failure does NOT fail the tick — the
      // snapshot is already persisted and we'll retry on the next pass.
      try {
        const matResult = await rematerializeCompanyBols(supabase, slug, result.parsedSummary);
        console.log(`[pulse-refresh-tick] rematerialize ${slug}: +${matResult.upserted} -${matResult.removed}`);
      } catch (matErr) {
        console.error(`[pulse-refresh-tick] rematerialize failed for ${slug}:`, (matErr as any)?.message || matErr);
      }
      const candidateAlerts = computeAlertCandidates(result.previousParsedSummary, result.parsedSummary!);
      if (candidateAlerts.length > 0) {
        alertsCreated += await fanOutAlerts(supabase, slug, candidateAlerts);
      }
      await resetFailureCount(supabase, slug);
      processed++;
    } catch (err) {
      errors++;
      console.error(`[pulse-refresh-tick] ${slug}:`, (err as any)?.message || err);
      // A global kill mid-run (PROVIDER_DISABLED) shouldn't be logged as a
      // per-company failure spiral — stop the sweep cleanly.
      if ((err as any)?.code === "PROVIDER_DISABLED") {
        console.log("[pulse-refresh-tick] provider disabled mid-run — stopping");
        break;
      }
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
    ok: true, processed, alerts: alertsCreated, errors, candidates: candidates.length, capped,
  }), { headers: { "Content-Type": "application/json" } });
});

type RefreshCandidate = {
  source_company_key: string;
  saved_company_id: string | null;
  user_id: string | null;
  org_id: string | null;
  subscription_tier: string | null;
  snapshot_updated_at: string | null;
};

async function pickRefreshable(supabase: any, limit: number): Promise<RefreshCandidate[]> {
  // Delegates ALL selection to pick_refreshable_saved_snapshots: active-user +
  // non-churned + tier-cadence filtering happens in SQL so the LIMIT applies
  // after filtering (mirrors the old pick_stale_saved_snapshots pattern).
  const { data, error } = await supabase.rpc("pick_refreshable_saved_snapshots", {
    p_limit: limit,
  });
  if (error) {
    console.error("[pulse-refresh-tick] pick_refreshable_saved_snapshots RPC failed:", error);
    return [];
  }
  return (data ?? []) as RefreshCandidate[];
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
