/// <reference path="./node_modules/@supabase/functions-js/edge-runtime.d.ts" />

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IY_BASE_URL = "https://data.importyeti.com/v1.0";
const IY_API_KEY = Deno.env.get("IY_API_KEY")!;
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
    const { action, q, company_id } = body;

    /* ---------------------------------------------------------
     * SEARCH
     * -------------------------------------------------------*/
    if (action === "search") {
      if (!q) {
        return json({ error: "Missing search query" }, 400);
      }

      const res = await fetch(`${IY_BASE_URL}/company/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${IY_API_KEY}`,
        },
        body: JSON.stringify({ query: q }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`ImportYeti search failed: ${err}`);
      }

      const data = await res.json();
      return json(data);
    }

    /* ---------------------------------------------------------
     * COMPANY SNAPSHOT
     * -------------------------------------------------------*/
    if (!company_id) {
      return json({ error: "company_id required" }, 400);
    }

    const slug = normalizeSlug(company_id);

    // 1️⃣ Check cached snapshot
    const { data: cached } = await supabase
      .from("lit_importyeti_company_snapshot")
      .select("*")
      .eq("company_id", slug)
      .maybeSingle();

    if (cached) {
      const ageDays =
        (Date.now() - new Date(cached.updated_at).getTime()) /
        (1000 * 60 * 60 * 24);

      if (ageDays <= SNAPSHOT_TTL_DAYS) {
        return json(cached.parsed_summary);
      }
    }

    // 2️⃣ Fetch company snapshot from ImportYeti
    const iyRes = await fetch(`${IY_BASE_URL}/company/${slug}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${IY_API_KEY}`,
      },
    });

    if (!iyRes.ok) {
      const err = await iyRes.text();
      throw new Error(`ImportYeti company fetch failed: ${err}`);
    }

    const raw = await iyRes.json();

    // 3️⃣ Normalize + parse
    const parsed = parseCompanySnapshot(slug, raw);

    // 4️⃣ Persist snapshot synchronously
    const { error: upsertError } = await supabase
      .from("lit_importyeti_company_snapshot")
      .upsert(
        {
          company_id: slug,
          raw_payload: raw,
          parsed_summary: parsed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      );

    if (upsertError) {
      throw upsertError;
    }

    return json(parsed);
  } catch (err) {
    console.error("importyeti-proxy error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});

/* =========================================================
 * HELPERS
 * =======================================================*/

function normalizeSlug(input: string): string {
  return input
    .replace(/^company\//, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, "-");
}

function parseCompanySnapshot(companyId: string, raw: any) {
  const routeKpis = raw.routeKpis || {};
  const containers = raw.containers || {};
  const timeSeriesRaw = raw.timeSeries || [];

  // KPI core
  const totalTEU = Number(routeKpis.teuLast12m || 0);
  const totalShipments = Number(routeKpis.shipmentsLast12m || 0);
  const fcl = Number(containers.fclShipments12m || 0);
  const lcl = Number(containers.lclShipments12m || 0);

  // Est spend (simple deterministic model)
  const estSpend = Math.round(totalTEU * 1200 * 100) / 100;

  // Monthly activity (normalize last 12 months)
  const monthlyMap: Record<
    string,
    { fcl: number; lcl: number; total: number }
  > = {};

  for (const row of timeSeriesRaw) {
    const month = row.month;
    if (!month) continue;

    const fclCount =
      Number(row.fclShipments ?? row.fcl ?? row.shipments ?? 0) || 0;
    const lclCount =
      Number(row.lclShipments ?? row.lcl ?? 0) || 0;

    monthlyMap[month] = {
      fcl: fclCount,
      lcl: lclCount,
      total: fclCount + lclCount,
    };
  }

  const monthlyActivity = Object.entries(monthlyMap)
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .slice(-12)
    .map(([month, v]) => ({ month, ...v }));

  // Trade routes
  const tradeRoutes = (routeKpis.topRoutesLast12m || []).map((r: any) => ({
    route:
      r.lane ||
      `${r.origin || "Unknown"} → ${r.destination || "Unknown"}`,
    shipments: Number(r.shipments || 0),
  }));

  return {
    key: `company/${companyId}`,
    title: raw.title || raw.company_name || companyId,
    country: raw.country || null,
    website: raw.website || null,
    companyId,

    routeKpis: {
      teuLast12m: totalTEU,
      shipmentsLast12m: totalShipments,
      topRoutesLast12m: tradeRoutes,
    },

    containers: {
      fclShipments12m: fcl,
      lclShipments12m: lcl,
    },

    totalTEU,
    estSpend,

    timeSeries: monthlyActivity,

    lastShipmentDate: raw.lastShipmentDate || null,
  };
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
