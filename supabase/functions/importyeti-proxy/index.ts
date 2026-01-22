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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, company_id, q, page, pageSize } = body;

    if (action === "search") {
      return handleSearchAction(q, page, pageSize);
    }

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle companyBols action - returns BOL array for KPI computation
    if (action === "companyBols") {
      return handleCompanyBolsAction(supabase, company_id);
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 SNAPSHOT REQUEST:", company_id);

    const normalizedCompanyKey = normalizeCompanyKey(company_id);
    console.log("  Normalized slug:", normalizedCompanyKey);

    // Check for existing snapshot
    const { data: existingSnapshot, error: fetchError } = await supabase
      .from("lit_importyeti_company_snapshot")
      .select("*")
      .eq("company_id", normalizedCompanyKey)
      .maybeSingle();

    if (fetchError) {
      console.error("❌ Snapshot fetch error:", fetchError);
    }

    // Calculate age
    const now = new Date();
    const snapshotAge = existingSnapshot
      ? (now.getTime() - new Date(existingSnapshot.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    console.log("📅 Snapshot age:", snapshotAge.toFixed(1), "days");

    // Return cached if fresh
    if (existingSnapshot && snapshotAge < SNAPSHOT_TTL_DAYS) {
      console.log("✅ Using cached snapshot (0 credits)");
      return new Response(
        JSON.stringify({
          ok: true,
          source: "cache",
          snapshot: existingSnapshot.parsed_summary,
          raw: existingSnapshot.raw_payload,
          cached_at: existingSnapshot.updated_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch from ImportYeti
    console.log("🌐 Fetching from ImportYeti (1 credit)");
    const iyUrl = `${IY_BASE_URL}/company/${normalizedCompanyKey}`;

    console.log("  URL:", iyUrl);
    console.log("  Key:", IY_API_KEY?.substring(0, 10) + "...");

    const iyResponse = await fetch(iyUrl, {
      method: "GET",
      headers: {
        "IYApiKey": IY_API_KEY,
        "Accept": "application/json",
      },
    });

    if (!iyResponse.ok) {
      const errorText = await iyResponse.text();
      console.error("❌ ImportYeti error:", iyResponse.status, errorText);
      return new Response(
        JSON.stringify({
          error: "ImportYeti API error",
          status: iyResponse.status,
          details: errorText,
        }),
        { status: iyResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawPayload = await iyResponse.json();
    console.log("✅ ImportYeti response received");

    // Parse summary
    const parsedSummary = parseCompanySnapshot(rawPayload);
    console.log("📊 Parsed KPIs:", {
      shipments: parsedSummary.total_shipments,
      teu: parsedSummary.total_teu,
      trend: parsedSummary.trend,
    });

    // Save snapshot
    const { error: upsertError } = await supabase
      .from("lit_importyeti_company_snapshot")
      .upsert({
        company_id: normalizedCompanyKey,
        raw_payload: rawPayload,
        parsed_summary: parsedSummary,
        updated_at: now.toISOString(),
      });

    if (upsertError) {
      console.error("❌ Snapshot save error:", upsertError);
    } else {
      console.log("✅ Snapshot saved");
    }

    // Update search index
    const { error: indexError } = await supabase
      .from("lit_company_index")
      .upsert({
        company_id: normalizedCompanyKey,
        company_name: rawPayload.name || normalizedCompanyKey,
        country: rawPayload.country || null,
        city: rawPayload.city || null,
        last_shipment_date: parsedSummary.last_shipment_date || null,
        total_shipments: parsedSummary.total_shipments || 0,
        total_teu: parsedSummary.total_teu || 0,
        updated_at: now.toISOString(),
      });

    if (indexError) {
      console.error("❌ Index update error:", indexError);
    } else {
      console.log("✅ Search index updated");
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return new Response(
      JSON.stringify({
        ok: true,
        source: "importyeti",
        snapshot: parsedSummary,
        raw: rawPayload,
        fetched_at: now.toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleCompanyBolsAction(supabase: any, company_id: string) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 COMPANY BOLS REQUEST:", company_id);

  const normalizedCompanyKey = normalizeCompanyKey(company_id);
  console.log("  Normalized slug:", normalizedCompanyKey);

  // Fetch snapshot to get BOLs
  const { data: snapshot, error } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("*")
    .eq("company_id", normalizedCompanyKey)
    .maybeSingle();

  if (error) {
    console.error("❌ Snapshot fetch error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to fetch snapshot" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!snapshot) {
    console.log("⚠️  No snapshot found - fetching fresh data");
    // Fetch fresh data from ImportYeti
    const iyUrl = `${IY_BASE_URL}/company/${normalizedCompanyKey}`;
    const iyResponse = await fetch(iyUrl, {
      method: "GET",
      headers: {
        "IYApiKey": IY_API_KEY,
        "Accept": "application/json",
      },
    });

    if (!iyResponse.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawPayload = await iyResponse.json();
    const data = rawPayload.data || rawPayload;
    const rows = Array.isArray(data.recent_bols) ? data.recent_bols : [];

    console.log("✅ BOLs fetched:", rows.length);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return new Response(
      JSON.stringify({
        ok: true,
        rows,
        total: rows.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Extract BOLs from cached snapshot
  const rawPayload = snapshot.raw_payload || {};
  const data = rawPayload.data || rawPayload;
  const rows = Array.isArray(data.recent_bols) ? data.recent_bols : [];

  console.log("✅ BOLs from cache:", rows.length);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return new Response(
    JSON.stringify({
      ok: true,
      rows,
      total: rows.length,
      cached_at: snapshot.updated_at,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleSearchAction(q: string, page: number = 1, pageSize: number = 25) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 SEARCH REQUEST:", { q, page, pageSize });

  if (!q || typeof q !== "string" || q.trim().length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "Query (q) is required and must be non-empty" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!IY_API_KEY) {
    console.error("❌ IY_API_KEY not configured");
    return new Response(
      JSON.stringify({ ok: false, error: "ImportYeti API key not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const validatedPage = Math.max(1, Number.isFinite(page) ? Number(page) : 1);
    const validatedPageSize = Math.max(1, Math.min(100, Number.isFinite(pageSize) ? Number(pageSize) : 25));
    const offset = (validatedPage - 1) * validatedPageSize;

    const url = new URL(`${IY_BASE_URL}/company/search`);
    url.searchParams.set("name", q.trim());
    url.searchParams.set("page_size", String(validatedPageSize));
    url.searchParams.set("offset", String(offset));

    const iyUrl = url.toString();

    console.log("  METHOD: GET");
    console.log("  URL:", iyUrl);
    console.log("  Auth: IYApiKey (header)");

    const iyResponse = await fetch(iyUrl, {
      method: "GET",
      headers: {
        "IYApiKey": IY_API_KEY,
        "Accept": "application/json",
      },
    });

    if (!iyResponse.ok) {
      const errorText = await iyResponse.text();
      console.error("❌ ImportYeti error:", iyResponse.status, errorText);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "ImportYeti API error",
          status: iyResponse.status,
          details: errorText,
        }),
        { status: iyResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawPayload = await iyResponse.json();
    console.log("✅ ImportYeti response received");

    const results = Array.isArray(rawPayload?.results)
      ? rawPayload.results
      : Array.isArray(rawPayload?.data)
        ? rawPayload.data
        : Array.isArray(rawPayload)
          ? rawPayload
          : [];

    const total = rawPayload?.total ?? rawPayload?.pagination?.total ?? results.length;

    console.log("📊 Search result:", {
      results_count: results.length,
      total,
      page: validatedPage,
      pageSize: validatedPageSize,
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return new Response(
      JSON.stringify({
        ok: true,
        results,
        page: validatedPage,
        pageSize: validatedPageSize,
        total,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Search handler error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message || "Search failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

function normalizeCompanyKeyToSlug(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const stripped = trimmed.startsWith("company/")
    ? trimmed.slice("company/".length)
    : trimmed;
  const lowercased = stripped.toLowerCase();
  const replaced = lowercased.replace(/[\s_.]+/g, "-");
  const cleaned = replaced.replace(/[^a-z0-9-]/g, "");
  const collapsed = cleaned.replace(/-{2,}/g, "-");
  const trimmed_edges = collapsed.replace(/^-+|-+$/g, "");
  return trimmed_edges || "unknown";
}

function normalizeCompanyKey(key: string): string {
  if (!key) return "";
  return normalizeCompanyKeyToSlug(key);
}

function parseCompanySnapshot(raw: any): any {
  const data = raw.data || raw;
  const recentBols = Array.isArray(data.recent_bols) ? data.recent_bols : [];

  const totalShipments = parseInt(String(data.total_shipments || "0"), 10) || 0;
  const avgTeuPerMonth = data.avg_teu_per_month || {};
  const totalTeu12m = typeof avgTeuPerMonth["12m"] === "number"
    ? Math.round(avgTeuPerMonth["12m"] * 12 * 10) / 10
    : 0;
  const estSpend = parseFloat(String(data.total_shipping_cost || "0")) || 0;

  const dateRange = data.date_range || {};
  let lastShipmentDate = null;
  if (dateRange.end_date) {
    const parts = dateRange.end_date.split("/");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      lastShipmentDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  let fclCount = 0;
  let lclCount = 0;
  recentBols.forEach((bol: any) => {
    if (bol.lcl === true) {
      lclCount++;
    } else if (bol.lcl === false) {
      fclCount++;
    }
  });

  const now = new Date();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const bolDates = recentBols
    .map((b: any) => {
      if (!b.date_formatted) return null;
      const parts = b.date_formatted.split("/");
      if (parts.length !== 3) return null;
      const [day, month, year] = parts;
      return new Date(`${year}-${month}-${day}`);
    })
    .filter((d: any) => d && !isNaN(d.getTime()))
    .sort((a: Date, b: Date) => b.getTime() - a.getTime());

  const recentCount = bolDates.filter((d: Date) => d >= threeMonthsAgo).length;
  const previousCount = bolDates.filter((d: Date) => d >= sixMonthsAgo && d < threeMonthsAgo).length;

  let trend = "flat";
  if (recentCount > previousCount * 1.1) trend = "up";
  else if (recentCount < previousCount * 0.9) trend = "down";

  const portCounts: Record<string, number> = {};
  recentBols.forEach((bol: any) => {
    const port = bol.Consignee_Address || bol.supplier_address_loc;
    if (port && typeof port === "string") {
      portCounts[port] = (portCounts[port] || 0) + 1;
    }
  });

  const topPorts = Object.entries(portCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([port, count]) => ({ port, count }));

  const monthlyVolumes: Record<string, { fcl: number; lcl: number }> = {};
  recentBols.forEach((bol: any) => {
    if (!bol.date_formatted) return;
    const parts = bol.date_formatted.split("/");
    if (parts.length !== 3) return;
    const [day, month, year] = parts;
    const monthKey = `${year}-${month.padStart(2, "0")}`;

    if (!monthlyVolumes[monthKey]) {
      monthlyVolumes[monthKey] = { fcl: 0, lcl: 0 };
    }
    if (bol.lcl === true) {
      monthlyVolumes[monthKey].lcl++;
    } else if (bol.lcl === false) {
      monthlyVolumes[monthKey].fcl++;
    }
  });

  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const shipmentsLast12m = bolDates.filter((d: Date) => d >= oneYearAgo).length;

  const timeSeries = buildTimeSeries12m(monthlyVolumes);
  const topRoutes = extractTopRoutes(recentBols);

  return {
    company_id: data.key || data.id,
    company_name: data.title || data.name,
    country: data.country,
    city: data.city || data.address_plain,
    website: data.website,
    total_shipments: totalShipments,
    total_teu: totalTeu12m,
    est_spend: estSpend,
    fcl_count: fclCount,
    lcl_count: lclCount,
    last_shipment_date: lastShipmentDate,
    trend,
    top_ports: topPorts,
    monthly_volumes: monthlyVolumes,
    shipments_last_12m: shipmentsLast12m || totalShipments,
    timeSeries,
    routeKpis: {
      shipmentsLast12m: shipmentsLast12m || totalShipments,
      teuLast12m: totalTeu12m,
      estSpendUsd12m: estSpend,
      fclShipments12m: fclCount,
      lclShipments12m: lclCount,
      topRoutesLast12m: topRoutes,
    },
  };
}

function buildTimeSeries12m(monthlyVolumes: Record<string, { fcl: number; lcl: number }>): Array<{ period: string; fcl: number; lcl: number }> {
  const now = new Date();
  const months = [];

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const data = monthlyVolumes[period] || { fcl: 0, lcl: 0 };
    months.push({
      period,
      fcl: data.fcl || 0,
      lcl: data.lcl || 0,
    });
  }

  return months;
}

function extractTopRoutes(bols: any[]): Array<{ route: string; shipmentCount: number }> {
  const routeCounts: Record<string, number> = {};

  bols.forEach((bol: any) => {
    const origin = bol.origin_port || bol.Port_of_Lading || bol.origin;
    const destination = bol.destination_port || bol.Port_of_Unlading || bol.destination;

    if (origin && destination) {
      const route = `${origin} → ${destination}`;
      routeCounts[route] = (routeCounts[route] || 0) + 1;
    }
  });

  return Object.entries(routeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([route, shipmentCount]) => ({ route, shipmentCount }));
}
