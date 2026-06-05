// firmographics-backfill-once — one-shot bounded backfill that
// invokes normalize-company for saved companies with no firmographics.
//
// Why this exists: normalize-company requires user/service JWT auth
// (CSO F-001 fix), so we can't pg_net-loop it from SQL with just the
// cron secret. This wrapper IS cron-authed (LIT_CRON_SECRET) and
// internally calls normalize-company with its own
// SUPABASE_SERVICE_ROLE_KEY as Bearer.
//
// Hard cap: 20 saved companies per invocation. Trigger via SQL
// repeatedly until `{ remaining: 0 }` returns. Each invocation costs
// ~$0.36 in Anthropic Sonnet credits (20 calls x ~$0.018). Delete
// this fn once backfill is complete.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH = 20;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-internal-cron, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  // Cron-auth gate. verifyCronAuth returns { ok, response } not Response.
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Pick up to BATCH saved companies that have NO firmographics yet.
  // Join via lit_saved_companies so we only spend Anthropic tokens on
  // saved companies (not the orphan-snapshot population).
  const { data: candidates, error: pickErr } = await admin
    .from("lit_companies")
    .select(`
      id, name,
      lit_saved_companies!inner(refresh_status)
    `)
    .eq("lit_saved_companies.refresh_status", "active")
    .is("headcount", null)
    .is("revenue", null)
    .limit(BATCH);

  if (pickErr) {
    console.error("[firmographics-backfill-once] pick failed:", pickErr);
    return new Response(JSON.stringify({ ok: false, error: pickErr.message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  let errored = 0;
  const errors: string[] = [];

  for (const company of (candidates ?? [])) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/normalize-company`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ company_id: company.id, force_refresh: true }),
      });
      if (resp.ok) {
        processed++;
      } else {
        errored++;
        const txt = await resp.text().catch(() => "");
        errors.push(`${company.id} ${company.name}: ${resp.status} ${txt.slice(0, 200)}`);
        console.warn(
          `[firmographics-backfill-once] ${company.name} failed:`,
          resp.status,
          txt.slice(0, 200),
        );
      }
    } catch (e) {
      errored++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${company.id} ${company.name}: ${msg}`);
      console.error(`[firmographics-backfill-once] ${company.name} threw:`, e);
    }
    // Be polite to Anthropic + DB
    await new Promise((r) => setTimeout(r, 250));
  }

  // Count remaining SAVED companies still missing firmographics
  // (mirrors the pick filter) for the caller's loop guard. We don't
  // want to bill Anthropic for unsaved orphan-snapshot companies.
  const { count: remaining } = await admin
    .from("lit_companies")
    .select("id, lit_saved_companies!inner(refresh_status)", { count: "exact", head: true })
    .eq("lit_saved_companies.refresh_status", "active")
    .is("headcount", null)
    .is("revenue", null);

  return new Response(
    JSON.stringify({
      ok: true,
      processed,
      errored,
      remaining: remaining ?? null,
      errors: errors.slice(0, 5),
    }),
    { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
  );
});
