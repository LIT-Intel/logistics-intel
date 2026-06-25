import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";
import { resolveOrg, requireQuotingFeature, computeTotals, LineItem, numOrNull, numOr, emptyToNull } from "../_shared/quote_helpers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("quote-create", { request_id: requestId() });

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
  // Defensive company resolution: the company search now returns ImportYeti
  // slugs (e.g. "eae-usa") as source keys, NOT internal UUIDs. If a non-UUID
  // sneaks in as company_id, treat it as a source key so we never try to use a
  // slug as the lit_quotes.company_id FK (which would fail the FK constraint).
  const isUuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  let companyId: string | null = isUuid(body.company_id) ? body.company_id : null;
  const sourceKey = body.source_company_key ?? (!isUuid(body.company_id) && body.company_id ? body.company_id : null);
  if (!companyId && sourceKey) {
    const { data: existing } = await admin.from("lit_companies").select("id")
      .eq("source_company_key", sourceKey).maybeSingle();
    if (existing) companyId = existing.id;
    else {
      const { data: created, error } = await admin.from("lit_companies")
        .insert({ source: body.source ?? "importyeti", source_company_key: sourceKey, name: body.company_name ?? "Unknown" })
        .select("id").single();
      if (error) { log.error("company_link_failed", { err: error.message }); return json({ ok: false, code: "COMPANY_LINK_FAILED" }, 500); }
      companyId = created.id;
    }
  }
  if (!companyId) return json({ ok: false, code: "INVALID_INPUT", message: "company_id or source_company_key required" }, 400);

  const items: LineItem[] = Array.isArray(body.line_items) ? body.line_items : [];
  const totals = computeTotals(items, body.fuel_surcharge_pct);

  const { data: numberRow, error: numErr } = await admin.rpc("assign_quote_number", { p_org: orgId });
  if (numErr) { log.error("number_failed", { err: numErr.message }); return json({ ok: false, code: "NUMBER_FAILED" }, 500); }

  const { data: quote, error } = await admin.from("lit_quotes").insert({
    org_id: orgId, company_id: companyId, contact_id: body.contact_id ?? null,
    created_by: userId, owner_user_id: body.owner_user_id ?? userId,
    quote_number: numberRow, status: "draft",
    mode: body.mode ?? null, service_type: body.service_type ?? null, incoterms: body.incoterms ?? null,
    origin_port: body.origin_port ?? null, destination_port: body.destination_port ?? null,
    origin_city: body.origin_city ?? null, origin_state: body.origin_state ?? null, origin_country: body.origin_country ?? null, origin_postal: body.origin_postal ?? null,
    destination_city: body.destination_city ?? null, destination_state: body.destination_state ?? null, destination_country: body.destination_country ?? null, destination_postal: body.destination_postal ?? null,
    distance_miles: numOrNull(body.distance_miles), equipment_type: body.equipment_type ?? null,
    container_count: numOrNull(body.container_count), weight_lbs: numOrNull(body.weight_lbs),
    volume_cbm: numOrNull(body.volume_cbm), pallet_count: numOrNull(body.pallet_count),
    commodity: body.commodity ?? null, hs_code: body.hs_code ?? null, cargo_value: numOrNull(body.cargo_value),
    currency: body.currency ?? "USD", fuel_surcharge_pct: numOrNull(body.fuel_surcharge_pct),
    notes: body.notes ?? null, terms_text: body.terms_text ?? null, valid_until: emptyToNull(body.valid_until),
    ...totals,
  }).select("*").single();
  if (error) { log.error("insert_failed", { err: error.message }); return json({ ok: false, code: "INSERT_FAILED", message: error.message }, 500); }

  if (items.length) {
    const rows = items.map((li, i) => ({
      quote_id: quote.id, org_id: orgId, type: li.type ?? null, name: li.name, description: li.description ?? null,
      unit: li.unit ?? null, quantity: numOr(li.quantity, 1), unit_cost: numOr(li.unit_cost, 0), unit_sell: numOr(li.unit_sell, 0),
      is_accessorial: !!li.is_accessorial, taxable: !!li.taxable, sort_order: li.sort_order ?? i,
    }));
    await admin.from("lit_quote_line_items").insert(rows);
  }
  await admin.from("lit_quote_events").insert({ quote_id: quote.id, org_id: orgId, company_id: companyId, event_type: "created", created_by: userId });

  log.info("created", { quote_id: quote.id, quote_number: numberRow });
  return json({ ok: true, data: { quote } });
});
