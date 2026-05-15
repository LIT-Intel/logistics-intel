// supabase/functions/pulse-bol-tracking-tick/index.ts
//
// Daily cron at 06:00 UTC. Refreshes tracking for "active voyage" BOLs:
// shipped <= 60 days ago, no arrival_date yet, not refreshed in last 12h.
// Routes by SCAC to Maersk or Hapag-Lloyd client; everything else marked
// tracking_status='unsupported'. Advisory-locked so concurrent ticks are safe.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { fetchMaerskEvents } from "../_shared/maersk_client.ts";
import { fetchHapagEvents } from "../_shared/hapag_client.ts";
import { routeBySCAC } from "../_shared/scac_router.ts";
import { summarizeEvents } from "../_shared/dcsa_event_map.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENV = {
  MAERSK_CLIENT_ID: Deno.env.get("MAERSK_CLIENT_ID") || "",
  MAERSK_CLIENT_SECRET: Deno.env.get("MAERSK_CLIENT_SECRET") || "",
  HAPAG_CLIENT_ID: Deno.env.get("HAPAG_CLIENT_ID") || "",
  HAPAG_CLIENT_SECRET: Deno.env.get("HAPAG_CLIENT_SECRET") || "",
};
const BATCH_CAP = 500;
const ADVISORY_LOCK_KEY = 814715210;

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Advisory lock — concurrent ticks no-op.
  const { data: lockRows } = await supabase.rpc("try_pulse_advisory_lock", {
    p_key: ADVISORY_LOCK_KEY,
  });
  if (!lockRows) return json({ ok: true, skipped: "lock_held" });

  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400 * 1000).toISOString();
    const twelveHoursAgo = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const { data: candidates, error } = await supabase
      .from("lit_unified_shipments")
      .select("company_id, bol_number, scac, bol_date, tracking_refreshed_at")
      .gte("bol_date", sixtyDaysAgo)
      .is("tracking_arrival_actual", null)
      .or(`tracking_refreshed_at.is.null,tracking_refreshed_at.lt.${twelveHoursAgo}`)
      .limit(BATCH_CAP);
    if (error) return json({ ok: false, error: error.message }, 500);

    let tracked = 0, unsupported = 0, errors = 0;
    for (const row of candidates || []) {
      const carrier = routeBySCAC(row.scac);
      if (!carrier) {
        await supabase.from("lit_unified_shipments").update({
          tracking_status: "unsupported",
          tracking_refreshed_at: new Date().toISOString(),
        }).eq("company_id", row.company_id).eq("bol_number", row.bol_number);
        unsupported++;
        continue;
      }
      const result = carrier === "maersk"
        ? await fetchMaerskEvents({ bolNumber: row.bol_number, env: ENV })
        : await fetchHapagEvents({ bolNumber: row.bol_number, env: ENV });
      if (!result.ok) {
        errors++;
        await supabase.from("lit_unified_shipments").update({
          tracking_status: "error",
          tracking_refreshed_at: new Date().toISOString(),
        }).eq("company_id", row.company_id).eq("bol_number", row.bol_number);
        continue;
      }
      // Insert events (ON CONFLICT DO NOTHING via unique index).
      for (const ev of result.events) {
        await supabase.from("lit_bol_tracking_events").upsert({
          bol_number: row.bol_number,
          scac: row.scac,
          carrier: carrier === "maersk" ? "Maersk" : "Hapag-Lloyd",
          event_code: ev.event_code,
          event_classifier: ev.event_classifier,
          event_timestamp: ev.event_timestamp,
          location_name: ev.location_name,
          location_unloc: ev.location_unloc,
          vessel_name: ev.vessel_name,
          voyage_number: ev.voyage_number,
          container_number: ev.container_number,
          raw_payload: ev.raw,
        }, { onConflict: "bol_number,event_code,event_timestamp,container_number", ignoreDuplicates: true });
      }
      const summary = summarizeEvents(result.events);
      await supabase.from("lit_unified_shipments").update({
        tracking_status: result.events.length > 0 ? "tracked" : "no_match",
        tracking_eta: summary.eta,
        tracking_arrival_actual: summary.arrivalActual,
        tracking_last_event_code: summary.lastEventCode,
        tracking_last_event_at: summary.lastEventAt,
        tracking_refreshed_at: new Date().toISOString(),
      }).eq("company_id", row.company_id).eq("bol_number", row.bol_number);
      tracked++;
      // Rate-limit: 1 req/sec across both carriers.
      await new Promise((r) => setTimeout(r, 1000));
    }

    return json({ ok: true, tracked, unsupported, errors, examined: candidates?.length || 0 });
  } finally {
    await supabase.rpc("release_pulse_advisory_lock", { p_key: ADVISORY_LOCK_KEY });
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
