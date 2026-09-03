import { createLogger, requestId } from "../_shared/logger.ts";
import { corsHeaders, handlePreflight, json, requireUser, resolveUserOrg } from "../_shared/auth.ts";
import {
  assertOrgRfp,
  cleanText,
  isUuid,
  normalizePayload,
  RFP_STATUSES,
  summarizePayload,
} from "../_shared/rfp_helpers.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  const log = createLogger("rfp-save", { request_id: requestId() });
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { orgId } = await resolveUserOrg(auth.admin, auth.user.id);
  if (!orgId) return json({ ok: false, code: "NO_ORG", error: "No active workspace" }, 403);

  const body = await req.json().catch(() => ({}));
  const rfpId = isUuid(body.rfp_id) ? body.rfp_id : null;
  const title = cleanText(body.title, 180);
  const companyId = isUuid(body.company_id) ? body.company_id : null;
  const status = RFP_STATUSES.includes(body.status) ? body.status : "draft";
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.due_date ?? ""))
    ? body.due_date
    : null;
  const payload = normalizePayload(body.payload);
  const summary = summarizePayload(payload);

  if (!title) return json({ ok: false, code: "INVALID_INPUT", error: "RFP name is required" }, 400);
  if (!companyId) return json({ ok: false, code: "INVALID_INPUT", error: "Select a company" }, 400);

  const { data: company } = await auth.admin
    .from("lit_companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return json({ ok: false, code: "COMPANY_NOT_FOUND", error: "Company not found" }, 404);

  const row = {
    title,
    company_id: companyId,
    status,
    payload,
    due_date: dueDate,
    estimated_annual_value: summary.estimatedAnnualValue,
    primary_mode: summary.primaryMode,
    lane_count: summary.laneCount,
  };

  try {
    if (rfpId) {
      const existing = await assertOrgRfp(auth.admin, orgId, rfpId);
      if (!existing) return json({ ok: false, code: "NOT_FOUND", error: "RFP not found" }, 404);
      const { data, error } = await auth.admin
        .from("lit_rfps")
        .update({ ...row, owner_user_id: existing.owner_user_id ?? auth.user.id })
        .eq("id", rfpId)
        .eq("org_id", orgId)
        .select("*")
        .single();
      if (error) throw error;
      await auth.admin.from("lit_rfp_events").insert({
        rfp_id: rfpId,
        org_id: orgId,
        event_type: existing.status === status ? "updated" : "status_changed",
        event_payload: existing.status === status ? {} : { from: existing.status, to: status },
        created_by: auth.user.id,
      });
      return json({ ok: true, data: { rfp: data } });
    }

    const { data: rfpNumber, error: numberError } = await auth.admin
      .rpc("assign_rfp_number", { p_org: orgId });
    if (numberError) throw numberError;
    const { data, error } = await auth.admin
      .from("lit_rfps")
      .insert({
        ...row,
        org_id: orgId,
        user_id: auth.user.id,
        owner_user_id: auth.user.id,
        rfp_number: rfpNumber,
      })
      .select("*")
      .single();
    if (error) throw error;
    await auth.admin.from("lit_rfp_events").insert({
      rfp_id: data.id,
      org_id: orgId,
      event_type: "created",
      created_by: auth.user.id,
    });
    return json({ ok: true, data: { rfp: data } });
  } catch (error) {
    log.error("save_failed", { err: String(error), user_id: auth.user.id, org_id: orgId });
    return new Response(JSON.stringify({ ok: false, code: "SAVE_FAILED", error: "Unable to save RFP" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
