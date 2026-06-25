import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";
import { resolveOrg, requireQuotingFeature, computeTotals, LineItem } from "../_shared/quote_helpers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Whitelist of client-editable quote columns. NEVER includes org_id, created_by,
// status, quote_number, computed totals, share_token, or any pdf_* column —
// those are controlled server-side / elsewhere.
const EDITABLE_FIELDS = [
  "mode", "service_type", "shipment_type", "incoterms",
  "origin_name", "origin_address", "origin_city", "origin_state", "origin_country", "origin_postal", "origin_port",
  "destination_name", "destination_address", "destination_city", "destination_state", "destination_country", "destination_postal", "destination_port",
  "distance_miles", "equipment_type", "container_count", "weight_lbs", "volume_cbm", "pallet_count",
  "commodity", "hs_code", "cargo_value", "hazmat", "temp_controlled",
  "currency", "fuel_surcharge_pct", "notes", "terms_text", "valid_until",
  "owner_user_id", "contact_id",
  "benchmark_low", "benchmark_high", "benchmark_source", "benchmark_confidence",
  "revenue_opportunity", "revenue_opportunity_confidence",
] as const;

function pickQuoteFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_FIELDS) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("quote-update", { request_id: requestId() });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, svc);
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const userId = u.user.id;

  const orgId = await resolveOrg(admin, userId);
  if (!orgId) return json({ ok: false, code: "NO_ORG" }, 403);
  const gate = await requireQuotingFeature(admin, userId, orgId);
  if (!gate.ok) return json(gate.body, gate.status);

  const body = await req.json().catch(() => ({}));
  const quoteId = body.quote_id;
  if (!quoteId) return json({ ok: false, code: "INVALID_INPUT", message: "quote_id required" }, 400);

  // verify the quote belongs to this org
  const { data: existing } = await admin.from("lit_quotes").select("id, company_id").eq("id", quoteId).eq("org_id", orgId).maybeSingle();
  if (!existing) return json({ ok: false, code: "NOT_FOUND" }, 404);

  const items: LineItem[] = Array.isArray(body.line_items) ? body.line_items : [];
  const totals = computeTotals(items, body.fuel_surcharge_pct);

  // replace line items: delete then insert
  await admin.from("lit_quote_line_items").delete().eq("quote_id", quoteId);
  if (items.length) {
    await admin.from("lit_quote_line_items").insert(items.map((li, i) => ({
      quote_id: quoteId, org_id: orgId, type: li.type ?? null, name: li.name, description: li.description ?? null,
      unit: li.unit ?? null, quantity: li.quantity ?? 1, unit_cost: li.unit_cost ?? 0, unit_sell: li.unit_sell ?? 0,
      is_accessorial: !!li.is_accessorial, taxable: !!li.taxable, sort_order: li.sort_order ?? i,
    })));
  }

  const patch = { ...pickQuoteFields(body), ...totals, updated_at: new Date().toISOString() };
  const { data: quote, error } = await admin.from("lit_quotes").update(patch).eq("id", quoteId).eq("org_id", orgId).select("*").single();
  if (error) { log.error("update_failed", { err: error.message }); return json({ ok: false, code: "UPDATE_FAILED", message: error.message }, 500); }
  await admin.from("lit_quote_events").insert({ quote_id: quoteId, org_id: orgId, company_id: existing.company_id, event_type: "updated", created_by: userId });

  log.info("updated", { quote_id: quoteId });
  return json({ ok: true, data: { quote } });
});
