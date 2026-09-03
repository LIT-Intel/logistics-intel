import { createLogger, requestId } from "../_shared/logger.ts";
import { handlePreflight, json, requireUser, resolveUserOrg } from "../_shared/auth.ts";
import { assertOrgRfp, isUuid } from "../_shared/rfp_helpers.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("rfp-detail", { request_id: requestId() });
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { orgId } = await resolveUserOrg(auth.admin, auth.user.id);
  if (!orgId) return json({ ok: false, code: "NO_ORG", error: "No active workspace" }, 403);
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body.rfp_id)) return json({ ok: false, code: "INVALID_INPUT", error: "rfp_id required" }, 400);

  try {
    const rfp = await assertOrgRfp(auth.admin, orgId, body.rfp_id);
    if (!rfp) return json({ ok: false, code: "NOT_FOUND", error: "RFP not found" }, 404);
    const { data: company } = await auth.admin
      .from("lit_companies")
      .select("id,name,domain,website,logo_url,city,state,country_code,source_company_key,shipments_12m,teu_12m,top_route_12m,most_recent_shipment_date")
      .eq("id", rfp.company_id)
      .maybeSingle();
    const keys = company?.source_company_key
      ? [company.source_company_key, `company/${company.source_company_key}`]
      : [];
    const [quotesResult, eventsResult, docsResult, lanesResult, monthsResult] = await Promise.all([
      auth.admin.from("lit_quotes").select("id,quote_number,status,total_sell,gross_profit,gross_margin_pct,revision_no,updated_at").eq("rfp_id", rfp.id).order("revision_no", { ascending: false }),
      auth.admin.from("lit_rfp_events").select("id,event_type,event_payload,created_by,created_at").eq("rfp_id", rfp.id).order("created_at", { ascending: false }).limit(100),
      auth.admin.from("lit_rfp_documents").select("id,file_name,mime_type,size_bytes,document_type,created_at").eq("rfp_id", rfp.id).order("created_at", { ascending: false }),
      keys.length
        ? auth.admin.from("lit_company_port_lanes").select("exit_port,exit_port_country,entry_port,entry_port_region,shipments,weight_kg,teu,updated_at").in("company_id", keys).order("shipments", { ascending: false }).limit(8)
        : Promise.resolve({ data: [] }),
      keys.length
        ? auth.admin.from("lit_company_lane_months").select("origin_country,origin_city,dest_country,dest_state,dest_city,month,shipments,teu").in("company_id", keys).order("month", { ascending: false }).limit(24)
        : Promise.resolve({ data: [] }),
    ]);

    const recentMonths = monthsResult.data ?? [];
    const shipmentTrend = recentMonths.reduce((sum, row) => sum + Number(row.shipments ?? 0), 0);
    return json({
      ok: true,
      data: {
        rfp: { ...rfp, estimated_annual_value: Number(rfp.estimated_annual_value ?? 0) },
        company: company ?? null,
        quotes: (quotesResult.data ?? []).map((q) => ({
          ...q,
          total_sell: Number(q.total_sell ?? 0),
          gross_profit: Number(q.gross_profit ?? 0),
          gross_margin_pct: Number(q.gross_margin_pct ?? 0),
        })),
        events: eventsResult.data ?? [],
        documents: docsResult.data ?? [],
        intelligence: {
          top_lanes: (lanesResult.data ?? []).map((lane) => ({
            ...lane,
            shipments: Number(lane.shipments ?? 0),
            weight_kg: Number(lane.weight_kg ?? 0),
            teu: Number(lane.teu ?? 0),
          })),
          recent_lane_months: recentMonths,
          recent_shipments: shipmentTrend,
        },
      },
    });
  } catch (error) {
    log.error("detail_failed", { err: String(error), user_id: auth.user.id, org_id: orgId });
    return json({ ok: false, code: "DETAIL_FAILED", error: "Unable to load RFP" }, 500);
  }
});
