import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, json, requireUser } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";
import {
  buildHarveyCopilotOutput,
  type HarveyContact,
  type HarveyContext,
} from "../_shared/harvey_copilot.ts";

const FN = "harvey-copilot";
const FLAG = "harvey_contextual_copilot";

type Body = {
  action?: "context" | "handoff";
  company_id?: string | null;
  source_company_key?: string | null;
  company_name?: string | null;
  domain?: string | null;
};

function text(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

function numberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bareKey(v: string | null): string | null {
  return text(v)?.replace(/^company\//i, "").toLowerCase() ?? null;
}

async function flagEnabled(admin: any, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("lit_feature_flags")
    .select("global_kill, rollout")
    .eq("key", FLAG)
    .maybeSingle();
  if (error || !data || data.global_kill !== false) return false;
  const rollout = Math.max(0, Math.min(100, Number(data.rollout ?? 0)));
  if (rollout >= 100) return true;
  if (rollout <= 0) return false;
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 100 < rollout;
}

async function activeOrg(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.org_id ?? null;
}

async function internalAccess(userClient: any, userId: string): Promise<boolean> {
  const { data, error } = await userClient.rpc("is_lead_crm_member", { p_user_id: userId });
  return !error && data === true;
}

async function loadCompany(userClient: any, body: Body): Promise<{ company: any; directory: any | null } | null> {
  let company: any = null;
  if (body.company_id) {
    const { data } = await userClient.from("lit_companies").select("*").eq("id", body.company_id).maybeSingle();
    company = data ?? null;
  }
  if (!company && body.source_company_key) {
    const candidates = [body.source_company_key, bareKey(body.source_company_key), `company/${bareKey(body.source_company_key)}`].filter(Boolean);
    const { data } = await userClient.from("lit_companies").select("*").in("source_company_key", candidates).limit(1);
    company = data?.[0] ?? null;
  }
  if (!company && body.domain) {
    const domain = body.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    const { data } = await userClient.from("lit_companies").select("*").eq("domain", domain).limit(1);
    company = data?.[0] ?? null;
  }

  const key = text(company?.source_company_key) ?? text(body.source_company_key);
  let directory: any = null;
  if (key) {
    const bare = bareKey(key);
    const candidates = [key, bare, `company/${bare}`].filter(Boolean);
    const directoryFields = "id,company_key,source_company_key,company_name,canonical_name,canonical_domain,domain,industry,city,state,opportunity_composite_score,shipments,teu,updated_at";
    const { data: byCompanyKey } = await userClient
      .from("lit_company_directory")
      .select(directoryFields)
      .in("company_key", candidates)
      .limit(1);
    directory = byCompanyKey?.[0] ?? null;
    if (!directory) {
      const { data: bySourceKey } = await userClient
        .from("lit_company_directory")
        .select(directoryFields)
        .in("source_company_key", candidates)
        .limit(1);
      directory = bySourceKey?.[0] ?? null;
    }
  }
  if (!company && !directory && body.company_name) {
    const { data } = await userClient
      .from("lit_company_directory")
      .select("id,company_key,source_company_key,company_name,canonical_name,canonical_domain,domain,industry,city,state,opportunity_composite_score,shipments,teu,updated_at")
      .ilike("company_name", body.company_name)
      .limit(1);
    directory = data?.[0] ?? null;
  }
  return company || directory ? { company, directory } : null;
}

async function buildContext(auth: any, orgId: string, body: Body): Promise<HarveyContext | null> {
  const resolved = await loadCompany(auth.userClient, body);
  if (!resolved) return null;
  const { company, directory } = resolved;
  const companyId = text(company?.id);
  const key = text(company?.source_company_key) ?? text(directory?.company_key) ?? text(directory?.source_company_key);
  const bare = bareKey(key);
  const name = text(company?.name) ?? text(directory?.canonical_name) ?? text(directory?.company_name) ?? text(body.company_name) ?? "Unknown company";

  const savedPromise = companyId
    ? auth.userClient.from("lit_saved_companies").select("company_id,stage,org_id,user_id").eq("company_id", companyId).eq("user_id", auth.user.id).maybeSingle()
    : Promise.resolve({ data: null });
  const contactsPromise = companyId
    ? auth.userClient.from("lit_contacts").select("id,full_name,title,email,phone,linkedin_url,email_verified,verified_by_provider").eq("company_id", companyId).limit(50)
    : Promise.resolve({ data: [] });
  const activityPromise = companyId
    ? auth.userClient.from("lit_activity_events").select("id", { count: "exact", head: true }).eq("company_id", companyId)
    : Promise.resolve({ count: 0 });
  const inlandPromise = bare
    ? auth.userClient.rpc("lit_company_inland_freight", { p_company_id: bare })
    : Promise.resolve({ data: null });
  const memberPromise = internalAccess(auth.userClient, auth.user.id);

  const [savedRes, contactsRes, activityRes, inlandRes, leadCrmMember] = await Promise.all([
    savedPromise, contactsPromise, activityPromise, inlandPromise, memberPromise,
  ]);

  let leadId: string | null = null;
  if (leadCrmMember) {
    let q = auth.userClient.from("lit_admin_leads").select("id").is("deleted_at", null);
    if (companyId) q = q.eq("company_id", companyId);
    else if (bare) q = q.eq("source_company_key", bare);
    const { data } = await q.limit(1);
    leadId = data?.[0]?.id ?? null;
  }

  const contacts: HarveyContact[] = (contactsRes.data ?? []).map((c: any) => ({
    id: text(c.id),
    full_name: text(c.full_name) ?? "Unknown contact",
    title: text(c.title),
    email: text(c.email),
    phone: text(c.phone),
    linkedin_url: text(c.linkedin_url),
    verified: c.email_verified === true || c.verified_by_provider === true,
  }));
  const inland = inlandRes.data && typeof inlandRes.data === "object" ? inlandRes.data as any : null;
  const facilityConfidence = Array.isArray(inland?.facilities)
    ? inland.facilities.reduce((m: number, f: any) => Math.max(m, Number(f?.confidence ?? 0)), 0) / 100
    : 0;

  return {
    version: "1.0",
    generated_at: new Date().toISOString(),
    tenant: { org_id: orgId, user_id: auth.user.id },
    company: {
      id: companyId,
      key,
      name,
      domain: text(company?.domain) ?? text(directory?.canonical_domain) ?? text(directory?.domain),
      industry: text(company?.industry) ?? text(directory?.industry),
      city: text(company?.city) ?? text(directory?.city),
      state: text(company?.state) ?? text(directory?.state),
    },
    freight: {
      shipments_12m: numberOrNull(company?.shipments_12m) ?? numberOrNull(directory?.shipments),
      teu_12m: numberOrNull(company?.teu_12m) ?? numberOrNull(directory?.teu),
      last_shipment: text(company?.most_recent_shipment_date),
      top_route: text(company?.top_route_12m) ?? text(company?.recent_route),
      opportunity_score: numberOrNull(directory?.opportunity_composite_score) ?? numberOrNull(company?.confidence_score),
    },
    domestic: {
      estimated_truckloads_month: numberOrNull(inland?.totals?.est_tl_month),
      facilities: Array.isArray(inland?.facilities) ? inland.facilities.length : 0,
      flows: Array.isArray(inland?.flows) ? inland.flows.length : 0,
      confidence: Math.min(1, Math.max(0, facilityConfidence)),
    },
    contacts,
    relationship: {
      is_saved: Boolean(savedRes.data),
      stage: text(savedRes.data?.stage),
      activity_count: Number(activityRes.count ?? 0),
      lead_crm_member: leadCrmMember,
      internal_lead_id: leadId,
    },
  };
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const rid = requestId();
  const log = createLogger(FN, { request_id: rid });
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  if (!(await flagEnabled(auth.admin, auth.user.id))) {
    return json({ ok: false, error: "feature_disabled", request_id: rid }, 404);
  }
  const orgId = await activeOrg(auth.admin, auth.user.id);
  if (!orgId) return json({ ok: false, error: "active_organization_required", request_id: rid }, 403);

  let body: Body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json", request_id: rid }, 400); }
  if (body.action && body.action !== "context" && body.action !== "handoff") {
    return json({ ok: false, error: "invalid_action", request_id: rid }, 400);
  }
  const context = await buildContext(auth, orgId, body);
  if (!context) return json({ ok: false, error: "company_not_found", request_id: rid }, 404);

  if (body.action === "handoff") {
    if (!context.relationship.lead_crm_member) {
      log.warn("handoff_forbidden", { user_id: auth.user.id, org_id: orgId });
      return json({ ok: false, error: "forbidden", request_id: rid }, 403);
    }
    const { data, error } = await auth.userClient.rpc("lit_leadcrm_create_lead_from_company", {
      p_company_id: context.company.id,
      p_source_company_key: bareKey(context.company.key),
      p_company_name: context.company.name,
      p_stage_id: null,
      p_assignee: auth.user.id,
    });
    if (error) {
      log.error("handoff_failed", { err: error.message, user_id: auth.user.id });
      return json({ ok: false, error: "handoff_failed", request_id: rid }, 500);
    }
    const row = Array.isArray(data) ? data[0] : data;
    return json({ ok: true, handoff: { ...row, mode: "assisted", sends_outreach: false }, request_id: rid });
  }

  return json({ ok: true, data: buildHarveyCopilotOutput(context), request_id: rid });
});
