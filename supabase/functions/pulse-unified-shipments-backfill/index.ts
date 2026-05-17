// pulse-unified-shipments-backfill — one-off backfill.
//
// Walks every lit_importyeti_company_snapshot row, expands its
// parsed_summary.recent_bols[] into lit_unified_shipments rows via the
// shared materializer. Idempotent (matches on company_id + bol_number).
// Auth: X-Internal-Cron. Not scheduled.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { rematerializeCompanyBols } from "../_shared/materialize_bols.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 50;

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let processed = 0, totalUpserted = 0, totalRemoved = 0, errors = 0;
  let lastCompanyId: string | null = null;

  while (true) {
    let q = supabase
      .from("lit_importyeti_company_snapshot")
      .select("company_id, parsed_summary")
      .order("company_id", { ascending: true })
      .limit(BATCH_SIZE);
    if (lastCompanyId) q = q.gt("company_id", lastCompanyId);
    const { data: batch, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!batch || batch.length === 0) break;

    for (const row of batch) {
      try {
        const result = await rematerializeCompanyBols(supabase, row.company_id, row.parsed_summary);
        totalUpserted += result.upserted;
        totalRemoved += result.removed;
        processed++;
      } catch (err) {
        console.error(`[backfill] failed for ${row.company_id}:`, (err as any)?.message || err);
        errors++;
      }
      lastCompanyId = row.company_id;
    }
  }

  return json({ ok: true, processed, totalUpserted, totalRemoved, errors });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
