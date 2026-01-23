import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IY_BASE_URL = "https://data.importyeti.com/v1.0";
const IY_API_KEY = Deno.env.get("IY_API_KEY") || "";
const SNAPSHOT_TTL_DAYS = 30;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action, company_id, q, page, pageSize } = body;

    if (action === "search") {
      return handleSearch(q, page, pageSize);
    }

    if (!company_id) {
      return json({ error: "company_id required" }, 400);
    }

    const slug = normalizeSlug(company_id);
    const companyKey = `company/${slug}`;

    // Check cache
    const { data: cached } = await supabase
      .from("lit_importyeti_company_snapshot")
      .select("*")
      .eq("company_id", slug)
      .maybeSingle();

    const now = new Date();
    const ageDays = cached
      ? (now.getTime() - new Date(cached.updated_at).getTime()) / 86400000
      : Infinity;

    if (cached && ageDays < SNAPSHOT_TTL_DAYS) {
      return json({
        ok: true,
        company_key: companyKey,
        snapshot: cached.parsed_summary,
        raw: cached.raw_payload,
        source: "cache",
      });
    }

    // Fetch ImportYeti
    const res = await fetch(`${IY_BASE_URL}/company/${slug}`, {
      headers: { IYApiKey: IY_API_KEY },
    });

    if (!res.ok) {
      return json({ error: "ImportYeti error" }, res.status);
    }

    const raw = await res.json();
    const snapshot = parseSnapshot(raw, slug);

    await supabase.from("lit_importyeti_company_snapshot").upsert({
      company_id: slug,
      raw_payload: raw,
      parsed_summary: snapshot,
      updated_at: now.toISOString(),
    });

    return json({
      ok: true,
      company_key: companyKey,
      snapshot,
      raw,
      source: "importyeti",
    });

  } catch (e: any) {
    console.error(e);
    return json({ error: e.message }, 500);
  }
});

/* ---------------- SNAPSHOT PARSER ---------------- */

function parseSnapshot(raw: any, slug: string) {
  const data = raw.data || raw;
  const bols = Array.isArray(data.recent_bols) ? data.recent_bols : [];

  const avgTeu = data.avg_teu_per_month?.["12m"] || 0;
  const teuLast12m = Math.round(avgTeu * 12 * 10) / 10;
  const estSpendUsd12m = Number(data.total_shipping_cost || 0);

  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 86400000);

  let fcl = 0;
  let lcl = 0;
  const routes: Record<string, number> = {};
  const monthly: Record<string, { fcl: number; lcl: number }> = {};

  bols.forEach((b: any) => {
    const d = parseDate(b.date_formatted);
    if (!d || d < oneYearAgo) return;

    b.lcl ? lcl++ : fcl++;

    const origin = b.supplier_address_loc || "Unknown";
    const dest = b.consignee_address_loc || "Unknown";
    const lane = `${origin} → ${dest}`;
    routes[lane] = (routes[lane] || 0) + 1;

    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly[key] ||= { fcl: 0, lcl: 0 };
    b.lcl ? monthly[key].lcl++ : monthly[key].fcl++;
  });

  const timeSeries = Object.entries(monthly).map(([m, v]) => ({
    month: m,
    fcl: v.fcl,
    lcl: v.lcl,
    total: v.fcl + v.lcl,
  }));

  const topRoutesLast12m = Object.entries(routes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([lane, shipments]) => {
      const [origin, destination] = lane.split(" → ");
      return { origin, destination, lane, shipments };
    });

  return {
    company_id: slug,
    company_key: `company/${slug}`,
    company_name: data.name || slug,

    lastShipmentDate: data.date_range?.end_date
      ? parseDate(data.date_range.end_date)?.toISOString().slice(0, 10)
      : null,

    estSpendUsd12m,

    containers: {
      fclShipments12m: fcl,
      lclShipments12m: lcl,
    },

    routeKpis: {
      shipmentsLast12m: fcl + lcl,
      teuLast12m,
      topRoutesLast12m,
    },

    timeSeries,
  };
}

/* ---------------- HELPERS ---------------- */

function normalizeSlug(v: string) {
  return v.replace(/^company\//, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function parseDate(v?: string) {
  if (!v) return null;
  const [d, m, y] = v.split("/");
  return new Date(`${y}-${m}-${d}`);
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleSearch(q: string, page = 1, pageSize = 25) {
  const url = new URL(`${IY_BASE_URL}/company/search`);
  url.searchParams.set("name", q);
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("offset", String((page - 1) * pageSize));

  const res = await fetch(url.toString(), {
    headers: { IYApiKey: IY_API_KEY },
  });

  const data = await res.json();
  return json({ ok: true, results: data.results || data.data || [] });
}
