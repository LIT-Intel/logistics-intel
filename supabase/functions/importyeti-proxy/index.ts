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

type Json = Record<string, any>;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await safeJson(req);
    const { action, company_id, q, page, pageSize } = body;

    // SEARCH
    if (action === "search") {
      return handleSearchAction(q, page, pageSize);
    }

    // company_id required for any non-search action
    if (!company_id) {
      return jsonResponse(
        { ok: false, error: "company_id is required" },
        400
      );
    }

    // BOLS (cached rows to compute KPIs client-side if needed)
    if (action === "companyBols") {
      return handleCompanyBolsAction(supabase, company_id);
    }

    // For compatibility:
    // - action omitted => snapshot
    // - action "company" => snapshot (canonical)
    // - action "snapshot" => snapshot
    const isSnapshotAction =
      !action || action === "snapshot" || action === "company";

    if (!isSnapshotAction) {
      return jsonResponse(
        { ok: false, error: `Unknown action: ${String(action)}` },
        400
      );
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 SNAPSHOT REQUEST:", company_id);

    const normalizedCompanyId = normalizeCompanyKey(company_id); // slug only
    const companyKey = `company/${normalizedCompanyId}`; // stable compare key
    console.log("  Normalized slug:", normalizedCompanyId);
    console.log("  Company key:", companyKey);

    // Check for existing snapshot
    const { data: existingSnapshot, error: fetchError } = await supabase
      .from("lit_importyeti_company_snapshot")
      .select("*")
      .eq("company_id", normalizedCompanyId)
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
      return jsonResponse(
        {
          ok: true,
          source: "cache",
          company_id: normalizedCompanyId,
          company_key: companyKey,
          snapshot: existingSnapshot.parsed_summary,
          raw: existingSnapshot.raw_payload,
          cached_at: existingSnapshot.updated_at,
        },
        200
      );
    }

    // Fetch from ImportYeti
    console.log("🌐 Fetching from ImportYeti (1 credit)");
    const iyUrl = `${IY_BASE_URL}/company/${normalizedCompanyId}`;

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
      return jsonResponse(
        {
          ok: false,
          error: "ImportYeti API error",
          status: iyResponse.status,
          details: errorText,
        },
        iyResponse.status
      );
    }

    const rawPayload = await iyResponse.json();
    console.log("✅ ImportYeti response received");

    // Parse summary (frontend-aligned contract)
    const parsedSummary = parseCompanySnapshot(rawPayload, normalizedCompanyId);
    console.log("📊 Parsed KPIs:", {
      shipmentsLast12m: parsedSummary?.routeKpis?.shipmentsLast12m,
      teuLast12m: parsedSummary?.routeKpis?.teuLast12m,
      estSpendUsd12m: parsedSummary?.estSpendUsd12m,
      trend: parsedSummary?.trend,
      timeSeriesMonths: Array.isArray(parsedSummary?.timeSeries) ? parsedSummary.timeSeries.length : 0,
      topRoutes: Array.isArray(parsedSummary?.routeKpis?.topRoutesLast12m)
        ? parsedSummary.routeKpis.topRoutesLast12m.length
        : 0,
    });

    // Save snapshot
    const { error: upsertError } = await supabase
      .from("lit_importyeti_company_snapshot")
      .upsert({
        company_id: normalizedCompanyId,
        raw_payload: rawPayload,
        parsed_summary: parsedSummary,
        updated_at: now.toISOString(),
      });

    if (upsertError) {
      console.error("❌ Snapshot save error:", upsertError);
    } else {
      console.log("✅ Snapshot saved");
    }

    // Update search index (keep as-is but use normalized id)
    const rawData = rawPayload?.data || rawPayload || {};
    const { error: indexError } = await supabase
      .from("lit_company_index")
      .upsert({
        company_id: normalizedCompanyId,
        company_name: rawData.name || rawData.title || normalizedCompanyId,
        country: rawData.country || null,
        city: rawData.city || rawData.address_plain || null,
        last_shipment_date: parsedSummary.lastShipmentDate || parsedSummary.last_shipment_date || null,
        total_shipments: parsedSummary.routeKpis?.shipmentsLast12m || parsedSummary.total_shipments || 0,
        total_teu: parsedSummary.routeKpis?.teuLast12m || parsedSummary.total_teu || 0,
        updated_at: now.toISOString(),
      });

    if (indexError) {
      console.error("❌ Index update error:", indexError);
    } else {
      console.log("✅ Search index updated");
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return jsonResponse(
      {
        ok: true,
        source: "importyeti",
        company_id: normalizedCompanyId,
        company_key: companyKey,
        snapshot: parsedSummary,
        raw: rawPayload,
        fetched_at: now.toISOString(),
      },
      200
    );
  } catch (error: any) {
    console.error("❌ Fatal error:", error);
    return jsonResponse(
      { ok: false, error: error?.message || "Internal server error" },
      500
    );
  }
});

async function handleCompanyBolsAction(supabase: any, company_id: string) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 COMPANY BOLS REQUEST:", company_id);

  const normalizedCompanyId = normalizeCompanyKey(company_id);
  console.log("  Normalized slug:", normalizedCompanyId);

  // Fetch snapshot to get BOLs
  const { data: snapshot, error } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("*")
    .eq("company_id", normalizedCompanyId)
    .maybeSingle();

  if (error) {
    console.error("❌ Snapshot fetch error:", error);
    return jsonResponse({ ok: false, error: "Failed to fetch snapshot" }, 500);
  }

  if (!snapshot) {
    console.log("⚠️  No snapshot found - fetching fresh data");
    const iyUrl = `${IY_BASE_URL}/company/${normalizedCompanyId}`;
    const iyResponse = await fetch(iyUrl, {
      method: "GET",
      headers: {
        "IYApiKey": IY_API_KEY,
        "Accept": "application/json",
      },
    });

    if (!iyResponse.ok) {
      return jsonResponse({ ok: false, error: "Company not found" }, 404);
    }

    const rawPayload = await iyResponse.json();
    const data = rawPayload.data || rawPayload;
    const rows = Array.isArray(data.recent_bols) ? data.recent_bols : [];

    console.log("✅ BOLs fetched:", rows.length);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return jsonResponse({ ok: true, rows, total: rows.length }, 200);
  }

  const rawPayload = snapshot.raw_payload || {};
  const data = rawPayload.data || rawPayload;
  const rows = Array.isArray(data.recent_bols) ? data.recent_bols : [];

  console.log("✅ BOLs from cache:", rows.length);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return jsonResponse(
    {
      ok: true,
      rows,
      total: rows.length,
      cached_at: snapshot.updated_at,
    },
    200
  );
}

async function handleSearchAction(q: string, page: number = 1, pageSize: number = 25) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 SEARCH REQUEST:", { q, page, pageSize });

  if (!q || typeof q !== "string" || q.trim().length === 0) {
    return jsonResponse(
      { ok: false, error: "Query (q) is required and must be non-empty" },
      400
    );
  }

  if (!IY_API_KEY) {
    console.error("❌ IY_API_KEY not configured");
    return jsonResponse(
      { ok: false, error: "ImportYeti API key not configured" },
      500
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
      return jsonResponse(
        {
          ok: false,
          error: "ImportYeti API error",
          status: iyResponse.status,
          details: errorText,
        },
        iyResponse.status
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

    // Add stable company_key + slug where possible (non-breaking)
    const hydratedResults = results.map((r: any) => {
      const keyCandidate =
        r?.key || r?.id || r?.company_id || r?.slug || r?.name || "";
      const slug = normalizeCompanyKey(String(keyCandidate));
      return {
        ...r,
        company_id: r?.company_id ?? slug,
        company_key: r?.company_key ?? (slug ? `company/${slug}` : undefined),
        title: r?.title ?? r?.name,
      };
    });

    const total = rawPayload?.total ?? rawPayload?.pagination?.total ?? hydratedResults.length;

    console.log("📊 Search result:", {
      results_count: hydratedResults.length,
      total,
      page: validatedPage,
      pageSize: validatedPageSize,
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return jsonResponse(
      {
        ok: true,
        results: hydratedResults,
        page: validatedPage,
        pageSize: validatedPageSize,
        total,
      },
      200
    );
  } catch (error: any) {
    console.error("❌ Search handler error:", error);
    return jsonResponse(
      { ok: false, error: error?.message || "Search failed" },
      500
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

// FRONTEND-ALIGNED SNAPSHOT PARSER
// Returns BOTH legacy fields and canonical UI fields
function parseCompanySnapshot(raw: any, normalizedCompanyId?: string): Json {
  const data = raw?.data || raw || {};
  const company_id = normalizedCompanyId || normalizeCompanyKey(String(data.key || data.id || data.company_id || "unknown"));
  const company_key = `company/${company_id}`;

  const recentBols = Array.isArray(data.recent_bols) ? data.recent_bols : [];

  // ----- Base metrics (ImportYeti fields)
  const totalShipments = toInt(data.total_shipments);
  const avgTeuPerMonth = (data.avg_teu_per_month && typeof data.avg_teu_per_month === "object")
    ? data.avg_teu_per_month
    : {};

  // Prefer explicit 12m if present, else derive from other known shapes
  const avgTeu12m = typeof avgTeuPerMonth["12m"] === "number"
    ? avgTeuPerMonth["12m"]
    : (typeof avgTeuPerMonth["12"] === "number" ? avgTeuPerMonth["12"] : 0);

  // UI expects "teuLast12m" (total over 12m). We estimate from avg_teu_per_month * 12.
  const teuLast12m = avgTeu12m > 0 ? round1(avgTeu12m * 12) : 0;

  // Spend: ImportYeti provides total_shipping_cost in many payloads
  const estSpendUsd12m = toFloat(data.total_shipping_cost);

  // ----- Date parsing
  // ImportYeti date formats: often "DD/MM/YYYY" under date_range.end_date
  const dateRange = data.date_range || {};
  const lastShipmentDate = parseIyDateToIso(dateRange.end_date);

  // ----- FCL/LCL counts from recent BOLs
  let fclShipments12m = 0;
  let lclShipments12m = 0;

  // We'll also compute shipmentsLast12m from BOL dates if possible
  const bolDates = recentBols
    .map((b: any) => parseIyDateToDate(b?.date_formatted))
    .filter((d: Date | null) => d && !isNaN(d.getTime())) as Date[];

  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  const bolsLast12m = recentBols.filter((bol: any) => {
    const d = parseIyDateToDate(bol?.date_formatted);
    return d ? d >= oneYearAgo : false;
  });

  bolsLast12m.forEach((bol: any) => {
    if (bol?.lcl === true) lclShipments12m++;
    else if (bol?.lcl === false) fclShipments12m++;
  });

  const shipmentsLast12m = bolsLast12m.length > 0
    ? bolsLast12m.length
    : (toInt(data.shipments_last_12m) || totalShipments);

  // ----- Trend from last 6 months vs prior 3 months
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const recentCount = bolDates.filter((d: Date) => d >= threeMonthsAgo).length;
  const previousCount = bolDates.filter((d: Date) => d >= sixMonthsAgo && d < threeMonthsAgo).length;

  let trend: "up" | "down" | "flat" = "flat";
  if (previousCount === 0 && recentCount > 0) trend = "up";
  else if (recentCount > previousCount * 1.1) trend = "up";
  else if (recentCount < previousCount * 0.9) trend = "down";

  // ----- Top ports (legacy)
  const portCounts: Record<string, number> = {};
  recentBols.forEach((bol: any) => {
    const port = bol?.Consignee_Address || bol?.supplier_address_loc;
    if (port && typeof port === "string") {
      portCounts[port] = (portCounts[port] || 0) + 1;
    }
  });

  const topPorts = Object.entries(portCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([port, count]) => ({ port, count }));

  // ----- Trade routes (canonical): origin -> destination lanes from BOLs
  const routeCounts: Record<string, number> = {};
  bolsLast12m.forEach((bol: any) => {
    const origin = extractOrigin(bol) || "Unknown Origin";
    const dest = extractDestination(bol) || "Unknown Destination";
    const lane = `${origin} → ${dest}`;
    routeCounts[lane] = (routeCounts[lane] || 0) + 1;
  });

  const topRoutesLast12m = Object.entries(routeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([lane, count]) => {
      const [origin, destination] = lane.split(" → ");
      return {
        origin,
        destination,
        lane,
        shipments: count,
      };
    });

  // ----- Monthly volumes aggregation from recent BOLs (legacy map + canonical array)
  const monthlyVolumes: Record<string, { fcl: number; lcl: number }> = {};
  recentBols.forEach((bol: any) => {
    const d = parseIyDateToDate(bol?.date_formatted);
    if (!d) return;
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyVolumes[monthKey]) monthlyVolumes[monthKey] = { fcl: 0, lcl: 0 };
    if (bol?.lcl === true) monthlyVolumes[monthKey].lcl++;
    else if (bol?.lcl === false) monthlyVolumes[monthKey].fcl++;
  });

  const timeSeries = Object.entries(monthlyVolumes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      fcl: v.fcl,
      lcl: v.lcl,
      total: v.fcl + v.lcl,
    }));

  // ----- Canonical snapshot contract for popup
  const canonicalSnapshot = {
    // identity
    company_id,
    company_key,
    company_name: data.title || data.name || company_id,
    title: data.title || data.name || company_id,
    website: data.website || null,
    country: data.country || null,
    city: data.city || data.address_plain || null,

    // canonical UI fields
    lastShipmentDate: lastShipmentDate,
    estSpendUsd12m: estSpendUsd12m,
    containers: {
      fclShipments12m,
      lclShipments12m,
    },
    routeKpis: {
      shipmentsLast12m,
      teuLast12m,
      topRoutesLast12m,
    },
    timeSeries,

    // keep trend label
    trend,

    // legacy fields retained for backward compatibility
    total_shipments: totalShipments,
    total_teu: teuLast12m, // legacy name, but aligns to 12m total
    est_spend: estSpendUsd12m,
    fcl_count: fclShipments12m,
    lcl_count: lclShipments12m,
    last_shipment_date: lastShipmentDate,
    shipments_last_12m: shipmentsLast12m,
    monthly_volumes: monthlyVolumes,
    top_ports: topPorts,
  };

  return canonicalSnapshot;
}

// -------- helpers

function jsonResponse(body: any, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function safeJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function toInt(v: any): number {
  const n = parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function toFloat(v: any): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ImportYeti format: "DD/MM/YYYY"
function parseIyDateToIso(v: any): string | null {
  if (!v || typeof v !== "string") return null;
  const parts = v.split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  if (!day || !month || !year) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIyDateToDate(v: any): Date | null {
  const iso = parseIyDateToIso(v);
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// Heuristic extraction: these fields vary; we use best available
function extractOrigin(bol: any): string | null {
  // supplier location fields (common candidates)
  const candidates = [
    bol?.supplier_address_loc,
    bol?.Supplier_Address,
    bol?.Supplier,
    bol?.supplier,
    bol?.shipper_address,
    bol?.shipper_address_loc,
  ];
  return pickFirstString(candidates);
}

function extractDestination(bol: any): string | null {
  // consignee location fields (common candidates)
  const candidates = [
    bol?.Consignee_Address,
    bol?.consignee_address_loc,
    bol?.consignee_address,
    bol?.Consignee,
    bol?.consignee,
    bol?.receiver_address,
  ];
  return pickFirstString(candidates);
}

function pickFirstString(arr: any[]): string | null {
  for (const v of arr) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}
