import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const IY_BASE_URL = "https://data.importyeti.com/v1.0";
const IY_API_KEY = Deno.env.get("IY_DMA_API_KEY");

if (!IY_API_KEY) {
  throw new Error("Missing IY_DMA_API_KEY");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function iyFetch(url: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${IY_API_KEY}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ImportYeti error ${res.status}: ${text}`);
  }

  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { type } = body;

    /**
     * ============================================================
     * COMPANY SEARCH (CRITICAL FIX)
     * ============================================================
     * ImportYeti DMA search ONLY works as:
     * GET /company/search?q=<query>
     */
    if (type === "search") {
      const query = body.query?.trim();
      if (!query) {
        return new Response(
          JSON.stringify({ companies: [] }),
          { headers: corsHeaders }
        );
      }

      const url =
        `${IY_BASE_URL}/company/search?q=` +
        encodeURIComponent(query);

      const results = await iyFetch(url);

      return new Response(
        JSON.stringify({ companies: results || [] }),
        { headers: corsHeaders }
      );
    }

    /**
     * ============================================================
     * COMPANY SNAPSHOT (POPUP / KPI SOURCE)
     * ============================================================
     */
    if (type === "company") {
      const companyKey = body.companyKey;
      if (!companyKey) {
        throw new Error("Missing companyKey");
      }

      const snapshotUrl =
        `${IY_BASE_URL}/company/${encodeURIComponent(companyKey)}`;

      const raw = await iyFetch(snapshotUrl);

      /**
       * ============================================================
       * NORMALIZATION (FACT-BASED FROM RAW PAYLOAD)
       * ============================================================
       */

      const shipments = Array.isArray(raw.shipments)
        ? raw.shipments
        : [];

      const last12m = shipments.filter((s) => {
        const d = new Date(s.date_formatted || s.date);
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 12);
        return d >= cutoff;
      });

      let totalTEU = 0;
      let fcl = 0;
      let lcl = 0;

      const monthlyMap: Record<
        string,
        { fcl: number; lcl: number }
      > = {};

      const routeMap: Record<string, number> = {};

      for (const s of last12m) {
        const teu =
          typeof s.containers_count === "number"
            ? s.containers_count
            : 0;

        totalTEU += teu;

        const isFCL = teu >= 1;
        if (isFCL) fcl++;
        else lcl++;

        const month = (s.date_formatted || "").slice(0, 7);
        if (month) {
          monthlyMap[month] ??= { fcl: 0, lcl: 0 };
          if (isFCL) monthlyMap[month].fcl++;
          else monthlyMap[month].lcl++;
        }

        const origin =
          s.supplier_address_loc ||
          s.supplier_address_location ||
          "Unknown";
        const dest =
          s.company_address_loc ||
          s.company_address_location ||
          "Unknown";

        const route = `${origin} → ${dest}`;
        routeMap[route] = (routeMap[route] || 0) + 1;
      }

      const timeSeries = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month,
          fclShipments: v.fcl,
          lclShipments: v.lcl,
        }));

      const topRoutes = Object.entries(routeMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([route, shipments]) => ({
          route,
          shipments,
        }));

      const response = {
        key: raw.company_url,
        title: raw.company_name,
        country: raw.company_address_country,
        website: raw.website || null,
        companyId: raw.company_basename,

        routeKpis: {
          teuLast12m: Number(totalTEU.toFixed(1)),
          shipmentsLast12m: last12m.length,
          topRoutesLast12m: topRoutes,
        },

        containers: {
          fclShipments12m: fcl,
          lclShipments12m: lcl,
        },

        timeSeries,
        lastShipmentDate:
          last12m.length > 0
            ? last12m[last12m.length - 1].date_formatted
            : null,
      };

      return new Response(
        JSON.stringify(response),
        { headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown request type" }),
      { status: 400, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
