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

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 SNAPSHOT REQUEST:", company_id);

    // Check for existing snapshot
    const { data: existingSnapshot, error: fetchError } = await supabase
      .from("lit_importyeti_company_snapshot")
      .select("*")
      .eq("company_id", company_id)
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
    const iyUrl = `${IY_BASE_URL}/company/${company_id}`;

    console.log("  URL:", iyUrl);
    console.log("  Key:", IY_API_KEY?.substring(0, 10) + "...");

    const iyResponse = await fetch(iyUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${IY_API_KEY}`,
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
        company_id,
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
        company_id,
        company_name: rawPayload.name || company_id,
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
    const iyUrl = `${IY_BASE_URL}/company/search`;
    const requestBody = {
      q: q.trim(),
      page: Math.max(1, Number.isFinite(page) ? Number(page) : 1),
      pageSize: Math.max(1, Math.min(100, Number.isFinite(pageSize) ? Number(pageSize) : 25)),
    };

    console.log("  URL:", iyUrl);
    console.log("  Request body:", requestBody);
    console.log("  Auth:", `Bearer ${IY_API_KEY?.substring(0, 10)}...`);

    const iyResponse = await fetch(iyUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${IY_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(requestBody),
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

    const rows = Array.isArray(rawPayload?.results)
      ? rawPayload.results
      : Array.isArray(rawPayload?.data)
        ? rawPayload.data
        : Array.isArray(rawPayload)
          ? rawPayload
          : [];

    const total = rawPayload?.total ?? rawPayload?.pagination?.total ?? rows.length;

    console.log("📊 Search result:", {
      rows_count: rows.length,
      total,
      page: requestBody.page,
      pageSize: requestBody.pageSize,
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return new Response(
      JSON.stringify({
        ok: true,
        rows,
        page: requestBody.page,
        pageSize: requestBody.pageSize,
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

function parseCompanySnapshot(raw: any): any {
  const shipments = raw.shipments || [];
  const containers = raw.containers || [];

  // Calculate TEU
  let totalTeu = 0;
  containers.forEach((c: any) => {
    const size = String(c.size || "").toLowerCase();
    if (size.includes("20")) totalTeu += 1;
    else if (size.includes("40")) totalTeu += 2;
    else if (size.includes("45")) totalTeu += 2.25;
  });

  // Find date range
  const dates = shipments
    .map((s: any) => s.arrival_date || s.date)
    .filter(Boolean)
    .map((d: string) => new Date(d))
    .filter((d: Date) => !isNaN(d.getTime()))
    .sort((a: Date, b: Date) => b.getTime() - a.getTime());

  const lastShipmentDate = dates[0] || null;

  // Calculate trend (last 3 months vs previous 3 months)
  const now = new Date();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const recentCount = dates.filter((d) => d >= threeMonthsAgo).length;
  const previousCount = dates.filter((d) => d >= sixMonthsAgo && d < threeMonthsAgo).length;

  let trend = "flat";
  if (recentCount > previousCount * 1.1) trend = "up";
  else if (recentCount < previousCount * 0.9) trend = "down";

  // Top ports
  const portCounts: Record<string, number> = {};
  shipments.forEach((s: any) => {
    const port = s.arrival_port || s.entry_port || s.port;
    if (port) {
      portCounts[port] = (portCounts[port] || 0) + 1;
    }
  });

  const topPorts = Object.entries(portCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([port, count]) => ({ port, count }));

  // Monthly volumes
  const monthlyVolumes: Record<string, { fcl: number; lcl: number }> = {};
  shipments.forEach((s: any) => {
    const date = s.arrival_date || s.date;
    if (!date) return;
    const monthKey = date.substring(0, 7); // YYYY-MM
    if (!monthlyVolumes[monthKey]) {
      monthlyVolumes[monthKey] = { fcl: 0, lcl: 0 };
    }
    if (s.load_type === "FCL") monthlyVolumes[monthKey].fcl++;
    else if (s.load_type === "LCL") monthlyVolumes[monthKey].lcl++;
  });

  return {
    company_id: raw.id || raw.key,
    company_name: raw.name,
    country: raw.country,
    city: raw.city,
    website: raw.website,
    total_shipments: shipments.length,
    total_teu: Math.round(totalTeu * 10) / 10,
    last_shipment_date: lastShipmentDate?.toISOString().split("T")[0] || null,
    trend,
    top_ports: topPorts,
    monthly_volumes: monthlyVolumes,
    shipments_last_12m: dates.filter(
      (d) => d >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    ).length,
  };
}
