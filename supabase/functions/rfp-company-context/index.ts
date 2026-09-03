import { createLogger, requestId } from "../_shared/logger.ts";
import { handlePreflight, json, requireUser, resolveUserOrg } from "../_shared/auth.ts";
import { isUuid } from "../_shared/rfp_helpers.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("rfp-company-context", { request_id: requestId() });
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { orgId } = await resolveUserOrg(auth.admin, auth.user.id);
  if (!orgId) return json({ ok: false, code: "NO_ORG", error: "No active workspace" }, 403);
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body.company_id)) return json({ ok: false, code: "INVALID_INPUT", error: "company_id required" }, 400);

  try {
    // RFP creation is intentionally limited to companies already saved into
    // the caller's Command Center workspace.
    const { data: saved } = await auth.admin.from("lit_saved_companies")
      .select("id").eq("org_id", orgId).eq("company_id", body.company_id).limit(1).maybeSingle();
    if (!saved) return json({ ok: false, code: "NOT_SAVED", error: "Save this company to Command Center first" }, 403);
    const { data: company, error } = await auth.admin.from("lit_companies")
      .select("id,name,domain,website,logo_url,city,state,country_code,source_company_key,shipments_12m,teu_12m,top_route_12m,most_recent_shipment_date")
      .eq("id", body.company_id).maybeSingle();
    if (error) throw error;
    if (!company) return json({ ok: false, code: "NOT_FOUND", error: "Company not found" }, 404);
    const keys = company.source_company_key
      ? [company.source_company_key, `company/${company.source_company_key}`]
      : [];
    const { data: lanes } = keys.length
      ? await auth.admin.from("lit_company_port_lanes")
          .select("exit_port,entry_port,shipments,teu")
          .in("company_id", keys).order("shipments", { ascending: false }).limit(5)
      : { data: [] };
    return json({
      ok: true,
      data: {
        company,
        suggested_lanes: (lanes ?? []).map((lane) => ({
          origin: lane.exit_port,
          destination: lane.entry_port,
          annual_volume: Number(lane.shipments ?? 0),
          mode: "ocean",
        })),
      },
    });
  } catch (error) {
    log.error("context_failed", { err: String(error), user_id: auth.user.id, org_id: orgId });
    return json({ ok: false, code: "CONTEXT_FAILED", error: "Unable to load company context" }, 500);
  }
});
