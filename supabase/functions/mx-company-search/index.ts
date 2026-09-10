// mx-company-search v2 — LIVE Mexico trade search (PowerQuery, on-demand cache).
// v2 adds cross-border intel on company rows: transport modes (truck/sea/…),
// customs offices (border gateways), counterparty countries (US/CA focus),
// city/state, and declared-value rollups where the API exposes them.
// NOTE: deployed via MCP with bundled ./_shared copies; repo copy uses ../_shared.
// 2026-09-10: MX search is now a PAID ADD-ON — after the paid-plan gate, the
// caller's org must also hold the $99/mo "Mexico Trade Intelligence" add-on
// (lit_addons 'mx_trade' + lit_org_addon_subscriptions, webhook-owned).
import { handlePreflight, json, requireUser } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";
import { meterAction } from "../_shared/credits.ts";

const BASE = (Deno.env.get("IMPORTYETI_API_BASE") || "https://data.importyeti.com/v1.0").replace(/\/+$/, "");
const log = createLogger("mx-company-search");

async function iy(path: string, q: string, apiKey: string, pageSize: number) {
  const u = new URL(BASE + path);
  u.searchParams.set("page", "1");
  u.searchParams.set("page_size", String(pageSize));
  u.searchParams.set("company_name", q);
  const r = await fetch(u.toString(), { headers: { IYApiKey: apiKey, Accept: "application/json" } });
  if (!r.ok) return { rows: [] as any[], credits: null as number | null, cost: 0 };
  const j = await r.json().catch(() => null);
  const d = j?.data;
  const rows = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
  return { rows, credits: j?.creditsRemaining ?? null, cost: Number(j?.requestCost ?? 0) || 0 };
}

// ── ImportYeti monthly spend cap (cost control). PowerQuery responses carry
// requestCost; we accumulate it per calendar month in lit_internal_meta
// (meta_key 'iy_spend_YYYY-MM', meta_value jsonb {spend}). All writes are
// best-effort — a meta hiccup must never fail a real request.
const IY_CAP = Number(Deno.env.get("LIT_IY_MONTHLY_CAP") ?? 2000) || 2000;
const iyMonthKey = () => "iy_spend_" + new Date().toISOString().slice(0, 7);

async function iyMonthSpend(admin: any): Promise<number> {
  try {
    const { data } = await admin.from("lit_internal_meta")
      .select("meta_value").eq("meta_key", iyMonthKey()).maybeSingle();
    return Number((data?.meta_value as any)?.spend ?? 0) || 0;
  } catch { return 0; }
}

async function addIySpend(admin: any, amount: number): Promise<void> {
  if (!(amount > 0)) return;
  try {
    const key = iyMonthKey();
    const { data } = await admin.from("lit_internal_meta")
      .select("meta_value").eq("meta_key", key).maybeSingle();
    const cur = Number((data?.meta_value as any)?.spend ?? 0) || 0;
    await admin.from("lit_internal_meta")
      .upsert({ meta_key: key, meta_value: { spend: cur + amount }, updated_at: new Date().toISOString() });
  } catch (e) { log.warn("iy_spend_write_failed", { err: String(e) }); }
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
    auth.admin.from("org_members").select("org_id").eq("user_id", auth.user.id)
      .order("joined_at", { ascending: true }).limit(5),
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

  // ── ADD-ON gate (owner ruling 2026-09-10): a paid base plan alone is NOT
  // enough — MX search additionally requires the $99/mo "Mexico Trade
  // Intelligence" add-on (lit_addons.addon_key='mx_trade'). Server-side =
  // the security boundary; the platform-admin bypass above applies here too.
  // While lit_addons.stripe_price_id is NULL (owner hasn't created the Stripe
  // price yet) the add-on is not purchasable and non-admins are gated.
  // Access activates the moment the price id lands in lit_addons AND the org
  // holds a live add-on subscription: a webhook-written
  // lit_org_addon_subscriptions row, or (belt-and-suspenders) any org
  // subscriptions row carrying the add-on's price id.
  if (!pa) {
    const ADDON_STATUSES = ["active", "trialing", "past_due"];
    let hasAddon = false;
    const { data: addon } = await auth.admin.from("lit_addons")
      .select("stripe_price_id").eq("addon_key", "mx_trade").eq("active", true).maybeSingle();
    const addonPrice = (addon as { stripe_price_id?: string | null } | null)?.stripe_price_id ?? null;
    const addonOrgIds = (om ?? []).map((r: any) => r.org_id).filter(Boolean);
    if (addonPrice && addonOrgIds.length) {
      const [{ data: oas }, { data: priced }] = await Promise.all([
        auth.admin.from("lit_org_addon_subscriptions").select("org_id")
          .in("org_id", addonOrgIds).eq("addon_key", "mx_trade")
          .in("status", ADDON_STATUSES).limit(1),
        auth.admin.from("subscriptions").select("id")
          .in("organization_id", addonOrgIds).eq("stripe_price_id", addonPrice)
          .in("status", ADDON_STATUSES).limit(1),
      ]);
      hasAddon = Boolean((oas && oas.length) || (priced && priced.length));
    }
    if (!hasAddon) {
      log.info("mx_addon_gate", { rid, user_id: auth.user.id, purchasable: Boolean(addonPrice) });
      return json({
        ok: false,
        code: "mx_addon_required",
        message: "Mexico Trade Intelligence is a paid add-on. Add it to your plan to unlock cross-border data.",
        price_usd: 99,
      });
    }
  }

  let body: { q?: string; mode?: string } = {};
  try { body = await req.json(); } catch { /* validated below */ }
  const q = String(body.q ?? "").trim().slice(0, 120);
  if (q.length < 2) return json({ ok: false, error: "q_required" }, 400);

  // ── LIT-credit metering (owner-approved pricing): MX search = 5 credits,
  // company open (declarations pull) = 10; CACHE-SERVED responses are never
  // debited (both callers below run only on a cache miss). Same mechanism as
  // credit-unlock-company: credits_metering_enabled dark-launch flag (OFF ⇒
  // free), workspace-level meterAction via _shared/credits.ts, and a
  // platform-admin bypass identical to the paid gate above. Non-balance
  // metering errors fail OPEN — a credit-engine hiccup never blocks a paid
  // user (mirrors the frontend unlockCompany fail-open policy).
  const isPlatformAdmin = Boolean(pa);
  const orgId = (Array.isArray(om) && om.length ? om[0]?.org_id : null) ?? null;
  const debitOrBlock = async (feature: string, needed: number, entityType: string): Promise<Response | null> => {
    if (isPlatformAdmin) return null;
    if (!orgId) return null; // paid via admin-less edge case — nothing to debit
    const { data: flag } = await auth.admin.from("lit_feature_flags")
      .select("global_kill").eq("key", "credits_metering_enabled").maybeSingle();
    const meteringOn = flag && (flag as { global_kill?: boolean }).global_kill === false;
    if (!meteringOn) return null; // dark launch — metering off ⇒ free
    const meter = await meterAction(
      auth.admin,
      { orgId, userId: auth.user.id, feature, entityType, entityId: q.toLowerCase(), metadata: { q } },
      async () => ({ ok: true }),
    );
    if (!meter.ok) {
      if (meter.blocked) {
        return json({
          ok: false, code: "insufficient_credits", needed,
          message: `Not enough LIT credits — this Mexico ${feature === "mx_company_open" ? "company open" : "search"} costs ${needed} credits. Add credits to continue.`,
        });
      }
      log.warn("mx_debit_failed_open", { rid, feature, err: meter.reason ?? null, org_id: orgId });
    }
    return null;
  };
  const iyCapBlock = async (): Promise<Response | null> => {
    const spend = await iyMonthSpend(auth.admin);
    if (spend >= IY_CAP) {
      log.warn("iy_cap_reached", { rid, spend, cap: IY_CAP });
      return json({ ok: false, code: "iy_cap_reached",
        message: "Mexico data temporarily paused — monthly data budget reached." });
    }
    return null;
  };

  if (body.mode === "declarations") {
    // DB-first: if we pulled this company within 7 days, build the summary from
    // our own cache — zero ImportYeti charge on repeat opens.
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const [{ data: priorImp }, { data: priorExp }] = await Promise.all([
      auth.admin.from("lit_mx_import_declarations")
        .select("transport_type, customs_office, supplier_country, value_usd")
        .ilike("importer_name", q + "%").gte("fetched_at", since).limit(200),
      auth.admin.from("lit_mx_export_declarations")
        .select("transport_type, customs_office, consignee_country, value_usd")
        .ilike("exporter_name", q + "%").gte("fetched_at", since).limit(200),
    ]);
    const priorAll = [
      ...((priorImp ?? []) as any[]),
      ...((priorExp ?? []) as any[]).map((r) => ({ ...r, supplier_country: r.consignee_country })),
    ];
    if (priorAll.length > 0) {
      const cnt = (k: string) => {
        const m = new Map<string, number>();
        for (const r of priorAll) { const v = r[k]; if (v) m.set(v, (m.get(v) ?? 0) + 1); }
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, n]) => ({ v, n }));
      };
      return json({ ok: true, cached: true,
        imports: (priorImp ?? []).length, exports: (priorExp ?? []).length,
        modes: cnt("transport_type"), gateways: cnt("customs_office"),
        counterparties: cnt("supplier_country"),
        total_value_usd: priorAll.reduce((a, r) => a + (Number(r.value_usd) || 0), 0),
        credits: null });
    }
    // Cache miss → live IY pull. Cost controls run in order: monthly IY spend
    // cap first (don't debit LIT credits for a pull we won't make), then the
    // 10-credit company-open debit.
    const capD = await iyCapBlock();
    if (capD) return capD;
    const debitD = await debitOrBlock("mx_company_open", 10, "mx_company");
    if (debitD) return debitD;
    const [imp, exp] = await Promise.all([
      iy("/powerquery/mx-import/declarations", q, apiKey, 20),
      iy("/powerquery/mx-export/declarations", q, apiKey, 20),
    ]);
    await addIySpend(auth.admin, (imp.cost || 0) + (exp.cost || 0));
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
    // Export table uses exporter_name/consignee_* columns — writing importer_*
    // failed silently and NOTHING cached for exporter companies (owner-reported
    // recharge). Dedicated mapper fixes the save.
    const mapExpDecl = (r: any) => ({
      declaration_id: r.declaration_id || r.pedimento_number || null,
      declaration_date: r.declaration_date || r.export_date || null,
      exporter_name: r.company_name || null,
      exporter_rfc: r.rfc_number || null,
      consignee_name: r.consignee_name || r.counterparty_name || r.supplier_name || null,
      consignee_country: r.consignee_country_code || r.consignee_country || r.supplier_country_code || r.supplier_country || null,
      customs_broker_name: r.customs_broker || r.customs_broker_name || null,
      customs_office: r.customs_office || null,
      transport_type: r.transportation_type || r.transport_type || null,
      hs_code: r.hs_code || null,
      product_description: r.hs_code_description || r.product_description || null,
      value_usd: num(r.value_usd ?? r.customs_value_usd),
      weight_kg: num(r.weight_kg ?? r.gross_weight),
      destination_country: r.destination_country_code || r.destination_country || null,
      raw_payload: r,
    });
    const impRows = imp.rows.map(mapDecl).filter((x) => x.declaration_id);
    const expRows = exp.rows.map(mapExpDecl).filter((x) => x.declaration_id);
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
      counterparties: count((r) => r.supplier_country ?? r.consignee_country),
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
  // Cache miss → live IY pull. Spend cap first, then the 5-credit search debit.
  const capS = await iyCapBlock();
  if (capS) return capS;
  const debitS = await debitOrBlock("mx_company_search", 5, "mx_search");
  if (debitS) return debitS;
  const [imp, exp] = await Promise.all([
    iy("/powerquery/mx-import/companies", q, apiKey, 10),
    iy("/powerquery/mx-export/companies", q, apiKey, 10),
  ]);
  await addIySpend(auth.admin, (imp.cost || 0) + (exp.cost || 0));
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
