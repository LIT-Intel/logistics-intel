// supabase/functions/affiliate-commission-clear/index.ts
//
// 30-day hold release for affiliate commissions.
//
// Moves affiliate_commissions rows from 'pending' -> 'cleared' once their
// clears_at hold has elapsed and they have not been voided (refunded). A
// 'cleared' commission is eligible for the (not-yet-built) payout runner.
//
// Cron-only: gated by verifyCronAuth (X-Internal-Cron header == LIT_CRON_SECRET).
// Schedule via pg_cron + pg_net, e.g. daily:
//   select cron.schedule(
//     'affiliate-commission-clear-daily', '17 6 * * *',
//     $$ select net.http_post(
//          url := '<project>/functions/v1/affiliate-commission-clear',
//          headers := jsonb_build_object('X-Internal-Cron', '<LIT_CRON_SECRET>')
//        ); $$);

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const moduleLog = createLogger("affiliate-commission-clear");

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Internal-Cron",
      },
    });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const reqId = requestId();
  const log = moduleLog.child({ request_id: reqId });

  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    log.warn("cron_auth_failed", { err: "X-Internal-Cron mismatch or missing" });
    return auth.response;
  }

  const db = createClient(supabaseUrl!, serviceRoleKey!);
  const nowIso = new Date().toISOString();

  try {
    // pending -> cleared where the hold has elapsed and not voided.
    const { data, error } = await db
      .from("affiliate_commissions")
      .update({ status: "cleared", updated_at: nowIso })
      .eq("status", "pending")
      .is("voided_at", null)
      .lte("clears_at", nowIso)
      .select("id");

    if (error) {
      log.error("clear_update_failed", { err: error.message });
      return json({ ok: false, error: error.message }, 500);
    }

    const cleared = data?.length ?? 0;
    log.info("cleared", { count: cleared });
    return json({ ok: true, cleared });
  } catch (e: any) {
    log.error("clear_unexpected_error", { err: e?.message || String(e) });
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
