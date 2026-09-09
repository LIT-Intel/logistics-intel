// mx-company-search v2 — LIVE Mexico trade search (PowerQuery, on-demand cache).
// v2 adds cross-border intel on company rows: transport modes (truck/sea/…),
// customs offices (border gateways), counterparty countries (US/CA focus),
// city/state, and declared-value rollups where the API exposes them.
// NOTE: deployed via MCP with bundled ./_shared copies; repo copy uses ../_shared.
import { handlePreflight, json, requireUser } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const BASE = (Deno.env.get("IMPORTYETI_API_BASE") || "https://data.importyeti.com/v1.0").replace(/\/+$/, "");
const log = createLogger("mx-company-search");

async function iy(path: string, q: string, apiKey: string, pageSize: number) {
  const u = new URL(BASE + path);
  u.searchParams.set("page", "1");
  u.searchParams.set("page_size", String(pageSize));
  u.searchParams.set("company_name", q);
  const r = await fetch(u.toString(), { headers: { IYApiKey: apiKey, Accept: "application/json" } });
  if (!r.ok) return { rows: [] as any[], credits: null as number | null };
  const j = await r.json().catch(() => null);
  const d = j?.data;
  const rows = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
  return { rows, credits: j?.creditsRemaining ?? null };
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
const arr = (v: unknown): string[] => Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 6) : [];

function normCompany(r: any, direction: "import" | "export") {
  const geo = r.company_address_geocode || r.address_geocode || null;
  return {
    name: r.company_name || r.name || null,
    rfc: r.rfc_number || r.rfc || null,
    city: geo?.address_components?.city || r.company_city || null,
    state: r.company_state || geo?.address_components?.state || null,
    country: "Mexico",
    country_code: "MX",
    shipments: num(r.company_total_shipments ?? r.total_shipments ?? r.shipment_count),
    latitude: num(geo?.location?.lat),
    longitude: num(geo?.location?.lon),
    address: geo?.formatted_address || r.company_address || null,
    transport_types: arr(r.transportation_types ?? r.transport_types ?? (r.transportation_type ? [r.transportation_type] : [])),
    customs_offices: arr(r.customs_offices ?? (r.customs_office ? [r.customs_office] : [])),
    counterparty_countries: arr(r.supplier_countries ?? r.counterparty_countries ?? (r.supplier_country_code ? [r.supplier_country_code] : [])),
    value_usd: num(r.total_value_usd ?? r.value_usd),
    direction,
    raw: r,
  };
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const rid = requestId();
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const apiKey = Deno.env.get("IMPORTYETI_API_KEY") || "";
  if (!apiKey) return json({ ok: true, results: [], reason: "iy_unconfigured" });

  // PAID-ONLY gate (owner ruling: PowerQuery credits are expensive; trial users
  // cannot run MX searches). Server-side = the security boundary. A user
  // qualifies with ANY org subscription row in a live status, or platform admin.
  const [{ data: om }, { data: pa }] = await Promise.all([
    auth.admin.from("org_members").select("org_id").eq("user_id", auth.user.id).limit(5),
    auth.admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  let paid = Boolean(pa);
  if (!paid && om && om.length) {
    const orgIds = om.map((r: any) => r.org_id).filter(Boolean);
    const { data: subs } = await auth.admin
      .from("subscriptions").select("id")
      .in("organization_id", orgIds)
      .in("status", ["active", "trialing", "past_due"])
      .limit(1);
    paid = Boolean(subs && subs.length);
  }
  if (!paid) {
    return json({ ok: false, code: "mx_requires_paid",
      message: "Mexico trade search is available on paid plans. Upgrade to unlock cross-border intelligence." });
  }

  let body: { q?: string; mode?: string } = {};
  try { body = await req.json(); } catch { /* validated below */ }
  const q = String(body.q ?? "").trim().slice(0, 120);
  if (q.length < 2) return json({ ok: false, error: "q_required" }, 400);

  if (body.mode === "declarations") {
    // DB-first: if we pulled this company within 7 days, build the summary from
    // our own cache — zero ImportYeti charge on repeat opens.
    const { data: prior } = await auth.admin
      .from("lit_mx_import_declarations")
      .select("transport_type, customs_office, supplier_country, value_usd")
      .ilike("importer_name", q + "%")
      .gte("fetched_at", new Date(Date.now() - 7 * 864e5).toISOString())
      .limit(200);
    if (prior && prior.length > 0) {
      const cnt = (k: string) => {
        const m = new Map<string, number>();
        for (const r of prior as any[]) { const v = r[k]; if (v) m.set(v, (m.get(v) ?? 0) + 1); }
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, n]) => ({ v, n }));
      };
      return json({ ok: true, cached: true, imports: prior.length, exports: 0,
        modes: cnt("transport_type"), gateways: cnt("customs_office"),
        counterparties: cnt("supplier_country"),
        total_value_usd: (prior as any[]).reduce((a, r) => a + (Number(r.value_usd) || 0), 0),
        credits: null });
    }
    const [imp, exp] = await Promise.all([
      iy("/powerquery/mx-import/declarations", q, apiKey, 20),
      iy("/powerquery/mx-export/declarations", q, apiKey, 20),
    ]);
    const mapDecl = (r: any) => ({
      declaration_id: r.declaration_id || r.pedimento_number || null,
      declaration_date: r.declaration_date || r.import_date || r.export_date || null,
      importer_name: r.company_name || null,
      importer_rfc: r.rfc_number || null,
      supplier_name: r.supplier_name || r.counterparty_name || null,
      supplier_country: r.supplier_country_code || r.supplier_country || null,
      customs_broker_name: r.customs_broker || r.customs_broker_name || null,
      customs_office: r.customs_office || null,
      transport_type: r.transportation_type || r.transport_type || null,
      hs_code: r.hs_code || null,
      product_description: r.hs_code_description || r.product_description || null,
      value_usd: num(r.value_usd ?? r.customs_value_usd),
      weight_kg: num(r.weight_kg ?? r.gross_weight),
      origin_country: r.origin_country_code || r.origin_country || null,
      raw_payload: r,
    });
    const impRows = imp.rows.map(mapDecl).filter((x) => x.declaration_id);
    const expRows = exp.rows.map(mapDecl).filter((x) => x.declaration_id);
    for (const [table, rows] of [["lit_mx_import_declarations", impRows], ["lit_mx_export_declarations", expRows]] as const) {
      if (!rows.length) continue;
      try {
        const ids = rows.map((r) => r.declaration_id);
        const { data: existing } = await auth.admin.from(table).select("declaration_id").in("declaration_id", ids);
        const have = new Set((existing ?? []).map((e: any) => e.declaration_id));
        const fresh = rows.filter((r) => !have.has(r.declaration_id));
        if (fresh.length) await auth.admin.from(table).insert(fresh);
      } catch (e) { log.warn("mx_cache_failed", { rid, table, err: String(e) }); }
    }
    const all = [...impRows, ...expRows];
    const count = (k: (r: any) => string | null) => {
      const m = new Map<string, number>();
      for (const r of all) { const v = k(r); if (v) m.set(v, (m.get(v) ?? 0) + 1); }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, n]) => ({ v, n }));
    };
    return json({
      ok: true, imports: impRows.length, exports: expRows.length,
      modes: count((r) => r.transport_type), gateways: count((r) => r.customs_office),
      counterparties: count((r) => r.supplier_country),
      total_value_usd: all.reduce((a, r) => a + (r.value_usd ?? 0), 0),
      credits: imp.credits ?? exp.credits,
    });
  }

  // Query-level cache: repeat searches are FREE for 7 days.
  const qkey = q.toLowerCase();
  const { data: hit } = await auth.admin
    .from("lit_mx_search_cache").select("payload, fetched_at").eq("q", qkey).maybeSingle();
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < 7 * 864e5) {
    return json({ ok: true, cached: true, results: hit.payload, credits: null });
  }
  const [imp, exp] = await Promise.all([
    iy("/powerquery/mx-import/companies", q, apiKey, 10),
    iy("/powerquery/mx-export/companies", q, apiKey, 10),
  ]);
  const byName = new Map<string, any>();
  for (const r of imp.rows.map((x) => normCompany(x, "import"))) if (r.name) byName.set(r.name.toLowerCase(), r);
  for (const r of exp.rows.map((x) => normCompany(x, "export"))) {
    if (!r.name) continue;
    const k = r.name.toLowerCase();
    const prev = byName.get(k);
    if (prev) prev.direction = "both";
    else byName.set(k, r);
  }
  const results = [...byName.values()].sort((a, b) => (b.shipments ?? 0) - (a.shipments ?? 0));
  await auth.admin.from("lit_mx_search_cache")
    .upsert({ q: qkey, payload: results, fetched_at: new Date().toISOString() })
    .then(() => {}, () => {});
  log.info("mx_search_ok", { rid, q, n: results.length });
  return json({ ok: true, results, credits: imp.credits ?? exp.credits });
});
