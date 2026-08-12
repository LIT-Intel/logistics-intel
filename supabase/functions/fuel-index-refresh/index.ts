// supabase/functions/fuel-index-refresh/index.ts
//
// Weekly cron (Tue 12:00 UTC — EIA publishes Monday afternoon ET) that
// refreshes `lit_fuel_index` with the latest EIA weekly US on-highway
// diesel retail price. Consumed by _shared/drayage_cost.ts, which converts
// the flat 22% fuel surcharge into a diesel-indexed per-mile surcharge.
//
// Data source, in order of preference:
//   1. EIA Open Data API v2 (requires free EIA_API_KEY from
//      https://www.eia.gov/opendata/register.php):
//      route petroleum/pri/gnd, series EMD_EPD2D_PTE_NUS_DPG
//      (Weekly U.S. No 2 Diesel Retail Prices, $/gal).
//   2. Public RSS feed behind the EIA gasdiesel page (no key needed):
//      https://www.eia.gov/petroleum/gasdiesel/includes/gas_diesel_rss.xml
//      — item title carries "Data For MM/DD/YY", description carries the
//      diesel U.S. average.
//
// Graceful no-op: if both sources fail, returns 200 { ok, noop: true } with
// a hint — drayage_cost.ts falls back to the flat 22% until a row lands.
//
// Auth: pg_cron via X-Internal-Cron (LIT_CRON_SECRET) — _shared/cron_auth.ts.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** EIA v2 series id — Weekly U.S. No 2 Diesel Retail Prices ($/gal). */
const EIA_SERIES = "EMD_EPD2D_PTE_NUS_DPG";
const EIA_RSS_URL =
  "https://www.eia.gov/petroleum/gasdiesel/includes/gas_diesel_rss.xml";

type FuelReading = { week_of: string; diesel_usd_gal: number; source: string };

async function fetchFromEiaApi(apiKey: string): Promise<FuelReading | null> {
  const url =
    `https://api.eia.gov/v2/petroleum/pri/gnd/data/` +
    `?api_key=${encodeURIComponent(apiKey)}` +
    `&frequency=weekly&data[0]=value` +
    `&facets[series][]=${EIA_SERIES}` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=1`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error("[fuel-index-refresh] EIA API HTTP", res.status);
    return null;
  }
  const body = await res.json();
  const row = body?.response?.data?.[0];
  const period = String(row?.period || "");
  const value = Number(row?.value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period) || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return { week_of: period, diesel_usd_gal: value, source: "EIA" };
}

/**
 * Keyless fallback — parse the public EIA gasdiesel RSS feed. Title:
 * "Data For 08/10/26"; description contains "...Diesel... 5.257 .. U.S. ...".
 */
async function fetchFromEiaRss(): Promise<FuelReading | null> {
  const res = await fetch(EIA_RSS_URL);
  if (!res.ok) {
    console.error("[fuel-index-refresh] EIA RSS HTTP", res.status);
    return null;
  }
  const xml = await res.text();

  const dateMatch = xml.match(/Data\s+For\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (!dateMatch) return null;
  const [, mm, dd, yyRaw] = dateMatch;
  const yyyy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
  const week_of = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;

  // The description lists the gasoline section first, then the diesel
  // section — and "Diesel" ALSO appears in the channel title ("Gasoline and
  // Diesel Fuel Update"), so anchoring on the FIRST occurrence grabs the
  // gasoline U.S. average. Scan "diesel" occurrences from the LAST one
  // backwards and take the first "<price> ... U.S." pairing found in the
  // window after it — that's the diesel-section U.S. average.
  const lower = xml.toLowerCase();
  const dieselIndices: number[] = [];
  for (let i = lower.indexOf("diesel"); i >= 0; i = lower.indexOf("diesel", i + 1)) {
    dieselIndices.push(i);
  }
  for (let k = dieselIndices.length - 1; k >= 0; k--) {
    const chunk = xml.slice(dieselIndices[k], dieselIndices[k] + 4000);
    const priceMatch = chunk.match(/(\d{1,2}\.\d{2,3})[\s.]*U\.S\./);
    if (!priceMatch) continue;
    const price = Number(priceMatch[1]);
    if (Number.isFinite(price) && price > 0 && price < 20) {
      return { week_of, diesel_usd_gal: price, source: "EIA" };
    }
  }
  return null;
}

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const apiKey = Deno.env.get("EIA_API_KEY") || "";
  let reading: FuelReading | null = null;
  let via: "api" | "rss" | null = null;

  if (apiKey) {
    try {
      reading = await fetchFromEiaApi(apiKey);
      if (reading) via = "api";
    } catch (err) {
      console.error("[fuel-index-refresh] EIA API threw", String(err));
    }
  }
  if (!reading) {
    try {
      reading = await fetchFromEiaRss();
      if (reading) via = "rss";
    } catch (err) {
      console.error("[fuel-index-refresh] EIA RSS threw", String(err));
    }
  }

  if (!reading) {
    // Graceful no-op — drayage_cost.ts keeps its 22% fallback.
    return json({
      ok: true,
      noop: true,
      reason: apiKey ? "all_sources_failed" : "rss_failed_no_api_key",
      hint:
        "Set EIA_API_KEY (free key: https://www.eia.gov/opendata/register.php) " +
        "for the primary API path.",
    });
  }

  const { error } = await supabase.from("lit_fuel_index").upsert(
    {
      week_of: reading.week_of,
      diesel_usd_gal: reading.diesel_usd_gal,
      source: reading.source,
    },
    { onConflict: "week_of" },
  );
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, via, ...reading });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
