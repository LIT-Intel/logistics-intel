/// <reference lib="deno.ns" />

// supabase/functions/bulk-import-fmcsa/index.ts
//
// FMCSA + Apollo → Attio bulk import.
// Platform-admin only. Supports dryRun: true for pre-commit review.
//
// Flow:
//   1. Auth + parse body { dryRun: boolean, mode: "initial" | "delta" }
//   2. Open a lit_fmcsa_import_runs row (status: running)
//   3. Download FMCSA bulk CSV from configured URL
//   4. Parse + ICP filter (authority age, type, status)
//   5. (delta mode) dedup against prior runs
//   6. Apollo enrich: company match → contact search → unlock
//   7. Score each contact via icp-scorer (Hot / Cold / Exclude)
//   8. Dry-run: write funnel + sample to run row, return.
//      Real-run: upsert Attio + queue sends + update run row.
//
// Env:
//   ATTIO_API_KEY, APOLLO_API_KEY (required for real-run; dry-run skips Apollo writes)
//   FMCSA_CSV_URL (required — see spec §5 manual setup)
//   ATTIO_LIST_OUTBOUND_HOT, ATTIO_LIST_NEWSLETTER_COLD (required for real-run)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger, requestId } from "../_shared/logger.ts";
import { scoreContact, type ScoreInput, type TitleTier } from "../_shared/icp-scorer.ts";
import { parseFmcsaCsv, normalizeAuthority, type NormalizedAuthority } from "./fmcsa-parser.ts";
import { makeApolloClient } from "./apollo-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RequestBody {
  dryRun?: boolean;
  mode?: "initial" | "delta";
  limit?: number; // safety cap; default 1000
}

serve(async (req) => {
  const log = createLogger("bulk-import-fmcsa", { request_id: requestId() });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Auth: platform_admin required
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);
  const { data: adminRow } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return json({ error: "Forbidden: platform admin required" }, 403);

  // Parse body
  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const dryRun = body.dryRun === true;
  const mode = body.mode === "delta" ? "delta" : "initial";
  const limit = Math.max(1, Math.min(2000, body.limit ?? 1000));

  // Open run row
  const { data: runRow, error: insertErr } = await admin
    .from("lit_fmcsa_import_runs")
    .insert({
      triggered_by: user.id,
      dry_run: dryRun,
      mode,
      status: "running",
    })
    .select("id")
    .single();
  if (insertErr || !runRow) {
    log.error("run_row_insert_failed", { err: insertErr?.message });
    return json({ error: "Failed to open run" }, 500);
  }
  const runId = runRow.id as string;
  log.info("run_started", { run_id: runId, dry_run: dryRun, mode, limit });

  // TODO D2/D3: full pipeline here.
  // For D1 we just close the run as succeeded with empty funnel so
  // we can deploy and verify auth + run-row plumbing.
  await admin
    .from("lit_fmcsa_import_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: dryRun ? "dry_run_complete" : "succeeded",
      funnel: { skeleton_only: true },
    })
    .eq("id", runId);

  return json({
    ok: true,
    runId,
    dryRun,
    mode,
    limit,
    funnel: { skeleton_only: true },
  });
});
