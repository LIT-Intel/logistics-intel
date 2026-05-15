// supabase/functions/pulse-arrival-alerts/index.ts
//
// Daily cron at 08:00 UTC. For each lit_unified_shipments row where the
// shipment is "in-flight" (bol_date <= now, no actual arrival recorded yet):
//   1) Infer arrival from origin_country_code -> origin_region + dest mapping
//      using lit_lane_transit_times (median + 25th/75th percentile).
//   2) Persist estimated_arrival_date / _low / _high.
//   3) For shipments arriving in the next 14 days that the user has saved,
//      insert a `lit_pulse_alerts` row of alert_type='arrival_window'.
//      The trg_pulse_alert_to_notification trigger fans it into
//      lit_notifications automatically.
//
// Dedup: skip BOLs that already produced an arrival_window alert for the
// same (user_id, bol_number) in the last 7 days.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FALLBACK_MEDIAN_DAYS = 21;

// Country -> origin_region mapping.
const ORIGIN_REGION: Record<string, string> = {
  // Asia
  CN: "asia", JP: "asia", KR: "asia", HK: "asia", TW: "asia", VN: "asia",
  TH: "asia", ID: "asia", MY: "asia", PH: "asia", SG: "asia", BD: "asia",
  IN: "asia", PK: "asia", LK: "asia",
  // Europe
  GB: "europe", DE: "europe", FR: "europe", IT: "europe", NL: "europe",
  BE: "europe", ES: "europe", PT: "europe", SE: "europe", NO: "europe",
  FI: "europe", DK: "europe", PL: "europe", IE: "europe", AT: "europe",
  CH: "europe", CZ: "europe",
  // Latam
  MX: "latam", BR: "latam", CL: "latam", PE: "latam", CO: "latam",
  EC: "latam", AR: "latam", CR: "latam", GT: "latam", HN: "latam",
  PA: "latam", DO: "latam",
  // Middle East
  AE: "middle-east", SA: "middle-east", IL: "middle-east", TR: "middle-east",
  // Africa (EG falls here; intentionally overrides middle-east default)
  ZA: "africa", MA: "africa", KE: "africa", NG: "africa", EG: "africa",
  // Oceania
  AU: "oceania", NZ: "oceania",
};

// US dest_state -> dest_region.
const US_STATE_REGION: Record<string, string> = {
  CA: "us-west", WA: "us-west", OR: "us-west", AK: "us-west", HI: "us-west",
  NY: "us-east", NJ: "us-east", FL: "us-east", MA: "us-east", CT: "us-east",
  RI: "us-east", ME: "us-east", NH: "us-east", VA: "us-east", NC: "us-east",
  SC: "us-east", GA: "us-east", MD: "us-east", DE: "us-east", PA: "us-east",
  DC: "us-east",
  TX: "us-gulf", LA: "us-gulf", AL: "us-gulf", MS: "us-gulf",
};

function originRegionOf(code: string | null | undefined): string | null {
  if (!code) return null;
  return ORIGIN_REGION[code.toUpperCase()] || null;
}

function destRegionOf(destCountryCode: string | null | undefined, destState: string | null | undefined): string | null {
  const cc = (destCountryCode || "").toUpperCase();
  if (cc === "US") {
    const st = (destState || "").toUpperCase();
    return US_STATE_REGION[st] || "us-other";
  }
  if (cc) {
    // Non-US destinations — use the same origin region buckets.
    return ORIGIN_REGION[cc] || null;
  }
  return null;
}

type TransitRow = { origin_region: string; dest_region: string; median_days: number; low_days: number; high_days: number };

function lookup(transit: TransitRow[], origin: string, dest: string): TransitRow | null {
  return transit.find((t) => t.origin_region === origin && t.dest_region === dest) || null;
}

// Pick the best fallback for unknown region pairs.
function resolveTransit(transit: TransitRow[], origin: string | null, dest: string | null): TransitRow | null {
  if (!origin || !dest) return null;
  const direct = lookup(transit, origin, dest);
  if (direct) return direct;
  // us-other -> use us-east as proxy
  if (dest === "us-other") {
    const east = lookup(transit, origin, "us-east");
    if (east) return east;
  }
  return null;
}

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const startedAt = Date.now();

  // 1) Load transit table.
  const { data: transitData, error: transitErr } = await supabase
    .from("lit_lane_transit_times")
    .select("origin_region, dest_region, median_days, low_days, high_days");
  if (transitErr) return json({ ok: false, error: `transit load: ${transitErr.message}` }, 500);
  const transit = (transitData || []) as TransitRow[];

  // 2) Pull in-flight shipments (last 60 days, no actual arrival).
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400 * 1000).toISOString();
  const { data: shipments, error: shipErr } = await supabase
    .from("lit_unified_shipments")
    .select("id, company_id, bol_number, bol_date, origin_country_code, destination_country_code, dest_city, dest_state, destination_port, container_count, consignee_name, shipper_name, estimated_arrival_date")
    .gte("bol_date", sixtyDaysAgo)
    .is("tracking_arrival_actual", null)
    .limit(5000);
  if (shipErr) return json({ ok: false, error: `shipments load: ${shipErr.message}` }, 500);

  let computed = 0;
  let skipped_no_region = 0;
  const candidates: Array<{
    row: any;
    eta: Date;
    etaLow: Date;
    etaHigh: Date;
  }> = [];
  // Buffer of updates to apply in parallel batches (fast path for ~1000 rows).
  const pendingUpdates: Array<{ id: string; eta: string; etaLow: string; etaHigh: string }> = [];

  // 3) Compute estimated arrivals; collect updates & upcoming-window candidates.
  for (const row of shipments || []) {
    if (!row.bol_date) continue;
    const origin = originRegionOf(row.origin_country_code);
    const dest = destRegionOf(row.destination_country_code, row.dest_state);
    let medianDays = FALLBACK_MEDIAN_DAYS;
    let lowDays = FALLBACK_MEDIAN_DAYS;
    let highDays = FALLBACK_MEDIAN_DAYS;
    let confident = false;

    const t = resolveTransit(transit, origin, dest);
    if (t) {
      medianDays = t.median_days;
      lowDays = t.low_days;
      highDays = t.high_days;
      confident = true;
    } else {
      skipped_no_region++;
    }

    const bolDate = new Date(row.bol_date);
    const eta = new Date(bolDate.getTime() + medianDays * 86400 * 1000);
    const etaLow = new Date(bolDate.getTime() + lowDays * 86400 * 1000);
    const etaHigh = new Date(bolDate.getTime() + highDays * 86400 * 1000);

    const existingIso = row.estimated_arrival_date ? new Date(row.estimated_arrival_date).toISOString() : null;
    const newIso = eta.toISOString();
    if (existingIso !== newIso) {
      pendingUpdates.push({ id: row.id, eta: newIso, etaLow: etaLow.toISOString(), etaHigh: etaHigh.toISOString() });
      computed++;
    }

    // Only generate alerts for confident estimates inside the 14-day window.
    if (!confident) continue;
    const now = Date.now();
    const horizon = now + 14 * 86400 * 1000;
    if (eta.getTime() >= now && eta.getTime() <= horizon) {
      candidates.push({ row, eta, etaLow, etaHigh });
    }
  }

  // Apply updates in parallel batches of 25 to keep the function under the
  // wall-clock budget while avoiding too many concurrent connections.
  const BATCH = 25;
  for (let i = 0; i < pendingUpdates.length; i += BATCH) {
    const slice = pendingUpdates.slice(i, i + BATCH);
    await Promise.all(slice.map((u) =>
      supabase.from("lit_unified_shipments").update({
        estimated_arrival_date: u.eta,
        estimated_arrival_low: u.etaLow,
        estimated_arrival_high: u.etaHigh,
      }).eq("id", u.id)
    ));
  }
  console.log(`[pulse-arrival-alerts] phase1 done: examined=${shipments?.length || 0} computed=${computed} candidates=${candidates.length}`);

  // 4) For each candidate, find subscribers (lit_saved_companies users) and insert alerts.
  // Map shipment.company_id (e.g. "ford-motor") -> lit_companies.source_company_key
  // ("company/ford-motor"). lit_saved_companies.company_id -> lit_companies.id (uuid).
  let alertsInserted = 0;
  let alertsDeduped = 0;
  let companiesNotFound = 0;
  let noSubscribers = 0;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  // Group candidates by shipment.company_id for fewer subscriber lookups.
  const byCompanyId = new Map<string, typeof candidates>();
  for (const c of candidates) {
    if (!c.row.company_id) continue;
    const arr = byCompanyId.get(c.row.company_id) || [];
    arr.push(c);
    byCompanyId.set(c.row.company_id, arr);
  }

  // Bulk-load existing alerts (last 7 days, arrival_window) so we can dedup
  // entirely in-memory instead of per-row queries.
  const { data: recentAlerts } = await supabase
    .from("lit_pulse_alerts")
    .select("user_id, payload")
    .eq("alert_type", "arrival_window")
    .gte("created_at", sevenDaysAgo);
  const dedupKey = new Set<string>();
  for (const a of recentAlerts || []) {
    const bn = (a.payload as any)?.bol_number;
    if (bn && a.user_id) dedupKey.add(`${a.user_id}:${bn}`);
  }

  // Bulk-load all candidate companies in one query.
  const sourceKeys = Array.from(byCompanyId.keys()).map((cid) => `company/${cid}`);
  const { data: companyRows } = await supabase
    .from("lit_companies")
    .select("id, name, source_company_key")
    .in("source_company_key", sourceKeys);
  const companyBySourceKey = new Map<string, { id: string; name: string | null; source_company_key: string }>();
  for (const c of companyRows || []) {
    companyBySourceKey.set(c.source_company_key, c);
  }

  // Bulk-load all saves for these companies in one query.
  const companyIds = (companyRows || []).map((c) => c.id);
  const savesByCompany = new Map<string, string[]>();
  if (companyIds.length > 0) {
    const { data: allSaves } = await supabase
      .from("lit_saved_companies")
      .select("user_id, company_id")
      .in("company_id", companyIds);
    for (const s of allSaves || []) {
      const arr = savesByCompany.get(s.company_id) || [];
      arr.push(s.user_id);
      savesByCompany.set(s.company_id, arr);
    }
  }

  // Build pending inserts.
  const pendingInserts: Array<{
    user_id: string;
    source_company_key: string;
    alert_type: string;
    severity: string;
    payload: any;
  }> = [];

  for (const [companyId, items] of byCompanyId.entries()) {
    const sourceKey = `company/${companyId}`;
    const companyRow = companyBySourceKey.get(sourceKey);
    if (!companyRow) {
      companiesNotFound++;
      continue;
    }
    const userIds = savesByCompany.get(companyRow.id) || [];
    if (userIds.length === 0) {
      noSubscribers++;
      continue;
    }

    for (const c of items) {
      const containerCount = Number(c.row.container_count || 0);
      const severity = containerCount >= 5 ? "critical" : containerCount >= 2 ? "warning" : "info";
      const companyName = companyRow.name || c.row.consignee_name || "Unknown company";
      const destPortGuess = c.row.destination_port
        || (c.row.dest_city && c.row.dest_state
              ? `${c.row.dest_city}, ${c.row.dest_state}`
              : c.row.dest_city || c.row.dest_state || "destination");

      const payload = {
        company_name: companyName,
        bol_number: c.row.bol_number,
        container_count: containerCount,
        estimated_arrival_date: c.eta.toISOString().slice(0, 10),
        estimated_arrival_low: c.etaLow.toISOString().slice(0, 10),
        estimated_arrival_high: c.etaHigh.toISOString().slice(0, 10),
        destination_port_guess: destPortGuess,
        dest_city: c.row.dest_city || null,
        dest_state: c.row.dest_state || null,
        shipper_name: c.row.shipper_name || null,
        bol_date: c.row.bol_date,
      };

      for (const userId of userIds) {
        const key = `${userId}:${c.row.bol_number}`;
        if (dedupKey.has(key)) {
          alertsDeduped++;
          continue;
        }
        dedupKey.add(key); // Also dedup within this run.
        pendingInserts.push({
          user_id: userId,
          source_company_key: sourceKey,
          alert_type: "arrival_window",
          severity,
          payload,
        });
      }
    }
  }

  // Insert in batches.
  for (let i = 0; i < pendingInserts.length; i += BATCH) {
    const slice = pendingInserts.slice(i, i + BATCH);
    const { error: insertErr } = await supabase.from("lit_pulse_alerts").insert(slice);
    if (insertErr) {
      console.error("[pulse-arrival-alerts] batch insert failed:", insertErr.message);
      continue;
    }
    alertsInserted += slice.length;
  }

  return json({
    ok: true,
    examined: shipments?.length || 0,
    transit_rows: transit.length,
    estimates_computed: computed,
    skipped_no_region,
    candidates_in_window: candidates.length,
    alerts_inserted: alertsInserted,
    alerts_deduped: alertsDeduped,
    companies_not_found: companiesNotFound,
    no_subscribers: noSubscribers,
    elapsed_ms: Date.now() - startedAt,
  });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
