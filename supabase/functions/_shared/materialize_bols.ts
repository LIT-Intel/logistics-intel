// supabase/functions/_shared/materialize_bols.ts
//
// Re-materialize lit_unified_shipments rows for a single company_id from the
// parsed_summary.recent_bols[] JSONB array in lit_importyeti_company_snapshot.
// Preserves tracking_* state when (company_id, bol_number) match.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type SupabaseClient = ReturnType<typeof createClient>;

export interface MaterializeResult {
  upserted: number;
  removed: number;
  preserved_tracking_state: number;
}

export async function rematerializeCompanyBols(
  supabase: SupabaseClient,
  companyId: string,
  parsedSummary: any,
): Promise<MaterializeResult> {
  const rawBols = Array.isArray(parsedSummary?.recent_bols) ? parsedSummary.recent_bols : [];

  // 1. Snapshot current tracking state to preserve across re-materialize.
  const { data: existing } = await supabase
    .from("lit_unified_shipments")
    .select("bol_number, tracking_status, tracking_eta, tracking_arrival_actual, tracking_last_event_code, tracking_last_event_at, tracking_refreshed_at")
    .eq("company_id", companyId);
  const prior = new Map((existing || []).map((r: any) => [r.bol_number, r]));

  // 2. Build new row set from JSONB.
  const rows = rawBols.map((b: any) => buildRow(companyId, b, prior)).filter(Boolean) as any[];

  // 3. Upsert (matches on company_id + bol_number).
  let upserted = 0;
  if (rows.length > 0) {
    const { error } = await supabase
      .from("lit_unified_shipments")
      .upsert(rows, { onConflict: "company_id,bol_number" });
    if (error) throw new Error(`materialize_upsert_failed: ${error.message}`);
    upserted = rows.length;
  }

  // 4. Delete stale rows (BOLs no longer in the snapshot).
  const newKeys = new Set(rows.map((r) => r.bol_number));
  const staleBolNumbers = Array.from(prior.keys()).filter((k) => !newKeys.has(k));
  let removed = 0;
  if (staleBolNumbers.length > 0) {
    const { error } = await supabase
      .from("lit_unified_shipments")
      .delete()
      .eq("company_id", companyId)
      .in("bol_number", staleBolNumbers);
    if (error) throw new Error(`materialize_delete_failed: ${error.message}`);
    removed = staleBolNumbers.length;
  }

  return {
    upserted,
    removed,
    preserved_tracking_state: rows.filter((r) => r.tracking_refreshed_at).length,
  };
}

function buildRow(companyId: string, b: any, prior: Map<string, any>): any | null {
  const bolNumber =
    b.house_bill_of_lading || b.houseBillOfLading ||
    b.Bill_of_Lading || b.bolNumber ||
    b.Master_Bill_of_Lading || b.masterBillOfLading;
  if (!bolNumber) return null;

  const masterBol = b.Master_Bill_of_Lading || b.masterBillOfLading || null;
  const carrierCode = b.carrierCode || null;
  const carrierName = b.carrierName || b.carrier || b.topServiceProvider || null;
  const shipmentDate = b.shipmentDate || b.date_formatted || null;
  const containerCount = num(b.containers_count) ?? num(b.quantity) ?? num(b.Quantity);
  const teu = num(b.TEU) ?? num(b.teu);
  const isLcl = (b.lcl === true) || (typeof b.fcl_lcl === "string" && b.fcl_lcl.toLowerCase().includes("lcl"));
  const destCountry = b.destinationCountry || b.Country || null;
  const destCountryCode = b.destinationCountryCode || b.country_code || null;
  const originCountry = b.originCountry || null;
  const originCountryCode = b.originCountryCode || null;
  const originPort = (b.route && b.route.origin) || (b.shipping_route && b.shipping_route.split("→")[0]?.trim()) || null;
  const destPort = (b.route && b.route.destination) || (b.shipping_route && b.shipping_route.split("→")[1]?.trim()) || null;
  const { city, state } = parseConsigneeAddress(b.Consignee_Address);
  const preserved = prior.get(bolNumber);

  return {
    company_id: companyId,
    bol_number: bolNumber,
    master_bol: masterBol,
    bol_date: shipmentDate ? new Date(shipmentDate).toISOString() : null,
    scac: carrierCode,
    carrier_name: carrierName,
    shipper_name: b.Shipper_Name || b.shipper_basename || null,
    consignee_name: b.Consignee_Name || b.consignee_basename || null,
    origin_country: originCountry,
    origin_country_code: originCountryCode,
    destination_country: destCountry,
    destination_country_code: destCountryCode,
    origin_port: originPort,
    destination_port: destPort,
    dest_city: city,
    dest_state: state,
    hs_code: b.HS_Code || null,
    product_description: b.Product_Description || null,
    container_count: containerCount,
    teu,
    weight_kg: num(b.Weight_in_KG) ?? num(b.weightKg),
    lcl: isLcl,
    load_type: b.loadType || null,
    shipping_cost_usd: num(b.shipping_cost),
    raw_payload: b,
    // Preserve tracking state if we already had it for this BOL.
    tracking_status: preserved?.tracking_status ?? null,
    tracking_eta: preserved?.tracking_eta ?? null,
    tracking_arrival_actual: preserved?.tracking_arrival_actual ?? null,
    tracking_last_event_code: preserved?.tracking_last_event_code ?? null,
    tracking_last_event_at: preserved?.tracking_last_event_at ?? null,
    tracking_refreshed_at: preserved?.tracking_refreshed_at ?? null,
    updated_at: new Date().toISOString(),
  };
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, $]/g, ""));
  return isFinite(n) ? n : null;
}

// Parse "123 Main St, Chicago, IL 60601, USA" → { city: "Chicago", state: "IL" }.
// Real-world ImportYeti data uses mixed case ("Wa 98109"), so the regex is
// case-insensitive and the state token is uppercased before returning.
export function parseConsigneeAddress(addr: any): { city: string | null; state: string | null } {
  if (!addr || typeof addr !== "string") return { city: null, state: null };
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { city: null, state: null };
  // Require the ZIP code so a bare country suffix ("Us") doesn't get
  // misinterpreted as a state. Real US-format addresses always carry the ZIP.
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/^([A-Za-z]{2})\s+\d{5}(?:-\d{4})?$/);
    if (m && i >= 1) {
      return { city: parts[i - 1], state: m[1].toUpperCase() };
    }
  }
  return { city: null, state: null };
}
