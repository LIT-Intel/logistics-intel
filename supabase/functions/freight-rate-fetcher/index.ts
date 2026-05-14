// Phase 4 — freight-rate-fetcher
//
// Scrapes the 12 Freightos Baltic Index (FBX) public terminal pages for
// current spot rates and upserts them into `lit_freight_rate_benchmarks`.
// Designed to be invoked weekly via Supabase cron (Mondays after FBX
// updates). Public Freightos pages render the current USD per 40' rate
// in the server-rendered HTML; we extract via regex.
//
// Auth: X-Internal-Cron header against LIT_CRON_SECRET env (shared-secret
// pattern used by all LIT cron-triggered edge fns — see _shared/cron_auth.ts).
// pg_cron + pg_net injects the header from current_setting('app.lit_cron_secret').
// Manual invocations should pass the same header.
//
// Body (optional):
//   { lanes?: ("FBX01" | ... | "FBX12")[]  // restrict to a subset
//     dry_run?: boolean }                  // return parsed values, do not write

import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyCronAuth } from "../_shared/cron_auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Lane = {
  code: string;
  slug: string;
  label: string;
  origin: string;
  destination: string;
};

const LANES: Lane[] = [
  { code: "FBX01", slug: "fbx-01-china-to-north-america-west-coast",   label: "China/East Asia → North America West Coast", origin: "China/East Asia",         destination: "North America West Coast" },
  { code: "FBX02", slug: "fbx-02-china-to-north-america-east-coast",   label: "China/East Asia → North America East Coast", origin: "China/East Asia",         destination: "North America East Coast" },
  { code: "FBX03", slug: "fbx-03-china-east-asia-to-north-europe",     label: "China/East Asia → North Europe",             origin: "China/East Asia",         destination: "North Europe" },
  { code: "FBX04", slug: "fbx-04-china-east-asia-to-mediterranean",    label: "China/East Asia → Mediterranean",            origin: "China/East Asia",         destination: "Mediterranean" },
  { code: "FBX05", slug: "fbx-05-north-america-west-coast-to-china",   label: "North America West Coast → China/East Asia", origin: "North America West Coast", destination: "China/East Asia" },
  { code: "FBX06", slug: "fbx-06-north-america-east-coast-to-china",   label: "North America East Coast → China/East Asia", origin: "North America East Coast", destination: "China/East Asia" },
  { code: "FBX07", slug: "fbx-07-north-europe-to-china",               label: "North Europe → China/East Asia",             origin: "North Europe",             destination: "China/East Asia" },
  { code: "FBX08", slug: "fbx-08-mediterranean-to-china",              label: "Mediterranean → China/East Asia",            origin: "Mediterranean",            destination: "China/East Asia" },
  { code: "FBX09", slug: "fbx-09-china-to-south-america-east-coast",   label: "China/East Asia → South America East Coast", origin: "China/East Asia",         destination: "South America East Coast" },
  { code: "FBX10", slug: "fbx-10-europe-to-south-america-east-coast",  label: "Europe → South America East Coast",          origin: "Europe",                   destination: "South America East Coast" },
  { code: "FBX11", slug: "fbx-11-north-america-east-coast-to-europe",  label: "North America East Coast → North Europe",    origin: "North America East Coast", destination: "North Europe" },
  { code: "FBX12", slug: "fbx-12-northern-europe-to-north-america-east-coast", label: "North Europe → North America East Coast", origin: "North Europe", destination: "North America East Coast" },
];

const FREIGHTOS_BASE = "https://www.freightos.com/enterprise/terminal/";

// Several patterns appear across the public pages; try each in order.
// First match wins.
const RATE_PATTERNS: RegExp[] = [
  // "$2,725.00" inside a price-display span
  /\$\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)/,
  // bare "2725.00 USD" or "2,725 USD"
  /([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)\s*USD/i,
  // JSON-LD price field
  /"price"\s*:\s*"?\$?\s*([0-9,]+(?:\.[0-9]+)?)"?/i,
];

async function fetchLaneRate(lane: Lane): Promise<{
  ok: boolean;
  lane: Lane;
  rate_usd_per_40ft?: number;
  error?: string;
  source_url: string;
}> {
  const url = `${FREIGHTOS_BASE}${lane.slug}/`;
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        // Look like a real browser — bot detection on these pages is light
        // but lenient.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!resp.ok) {
      return { ok: false, lane, error: `HTTP ${resp.status}`, source_url: url };
    }
    const html = await resp.text();

    // Some pages embed the rate in a hero card; skip header/footer noise.
    const heroSection =
      html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;

    for (const pattern of RATE_PATTERNS) {
      const match = heroSection.match(pattern);
      if (!match) continue;
      const raw = match[1].replace(/,/g, "");
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0 || num > 50000) continue;
      return { ok: true, lane, rate_usd_per_40ft: num, source_url: url };
    }
    return {
      ok: false,
      lane,
      error: "no rate pattern matched",
      source_url: url,
    };
  } catch (e: any) {
    return { ok: false, lane, error: String(e?.message ?? e), source_url: url };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const requestId = crypto.randomUUID();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      { ok: false, error: "Supabase env not configured", code: "ENV_MISSING" },
      500,
    );
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const requestedLanes: string[] = Array.isArray(body?.lanes)
    ? body.lanes.map((l: any) => String(l).toUpperCase())
    : [];
  const dryRun = Boolean(body?.dry_run);

  const lanesToFetch = requestedLanes.length
    ? LANES.filter((l) => requestedLanes.includes(l.code))
    : LANES;

  console.log("➡️ freight-rate-fetcher", {
    requestId,
    via: "cron_shared_secret",
    lane_count: lanesToFetch.length,
    dry_run: dryRun,
  });

  const today = new Date().toISOString().slice(0, 10);
  const results: any[] = [];
  let upserts = 0;
  const errors: any[] = [];

  for (const lane of lanesToFetch) {
    const fetched = await fetchLaneRate(lane);
    if (!fetched.ok || !fetched.rate_usd_per_40ft) {
      errors.push({
        lane_code: lane.code,
        error: fetched.error ?? "fetch failed",
        source_url: fetched.source_url,
      });
      results.push({ lane_code: lane.code, ok: false, error: fetched.error });
      continue;
    }
    const ratePerTeu = Math.round((fetched.rate_usd_per_40ft / 2) * 100) / 100;
    const row = {
      lane_code: lane.code,
      lane_label: lane.label,
      origin_region: lane.origin,
      destination_region: lane.destination,
      rate_usd_per_40ft: fetched.rate_usd_per_40ft,
      rate_usd_per_teu: ratePerTeu,
      source: "freightos_fbx",
      as_of_date: today,
      fetched_at: new Date().toISOString(),
    };
    results.push({ lane_code: lane.code, ok: true, ...row });

    if (!dryRun) {
      const { error } = await supabase
        .from("lit_freight_rate_benchmarks")
        .upsert(row, { onConflict: "source,lane_code,as_of_date" });
      if (error) {
        errors.push({ lane_code: lane.code, error: error.message });
      } else {
        upserts++;
      }
    }

    // Polite pacing — Freightos's CDN handles 12 sequential fetches fine
    // but we sleep 200ms between requests to be a good citizen.
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("✅ freight-rate-fetcher complete", {
    requestId,
    fetched: lanesToFetch.length,
    upserts,
    errors: errors.length,
  });

  return jsonResponse({
    ok: true,
    fetched_at: new Date().toISOString(),
    lanes_attempted: lanesToFetch.length,
    upserts,
    errors,
    results,
  });
});
