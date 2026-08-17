import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const cleanDomain = (value: unknown) => String(value || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase() || null;
const canonicalName = (value: unknown) => String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "").replace(/(inc|llc|ltd|corp|corporation|company|co)$/i, "");
const apolloIdFromNotes = (value: unknown) => String(value || "").match(/organization\s+([A-Za-z0-9_-]+)/i)?.[1] || null;
const domainFromNotes = (value: unknown) => cleanDomain(String(value || "").match(/Imported from Apollo\s*·\s*(\S+)/i)?.[1]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const apolloKey = Deno.env.get("APOLLO_API_KEY") || "";
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization || !url || !anon || !service) return json({ ok: false, error: "Unauthorized" }, 401);

  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await caller.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  if (userError || !userData.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const { data: access } = await caller.rpc("lit_my_lead_crm_access");
  const gate = Array.isArray(access) ? access[0] : access;
  if (!gate?.is_member) return json({ ok: false, error: "Lead CRM membership required" }, 403);
  if (!apolloKey) return json({ ok: false, error: "Apollo is not configured" }, 503);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const keywords = (Array.isArray(body.keywords) ? body.keywords : [body.keywords]).map((v) => String(v || "").trim()).filter(Boolean).slice(0, 10);
  if (!keywords.length) return json({ ok: false, error: "At least one keyword is required" }, 400);
  const page = Math.max(1, Math.min(100, Number(body.page) || 1));
  const perPage = Math.max(1, Math.min(50, Number(body.per_page) || 50));

  const apolloBody: Record<string, unknown> = { q_organization_keyword_tags: keywords, page, per_page: perPage };
  if (body.location) apolloBody.organization_locations = [String(body.location).trim()];
  const response = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", { method: "POST", headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": apolloKey }, body: JSON.stringify(apolloBody) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return json({ ok: false, error: payload?.message || payload?.error || "Apollo search failed", provider_status: response.status }, response.status === 429 ? 429 : 502);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: leadRows, error: leadsError }, { data: qualificationRows, error: qualificationError }] = await Promise.all([
    admin.from("lit_admin_leads").select("id,company_name,company_domain,website,notes,apollo_organization_id,archived_at,deleted_at"),
    admin.from("lit_lead_company_qualifications").select("provider_company_id,status,company_type,confidence,reason,checked_at,expires_at").eq("provider", "apollo"),
  ]);
  if (leadsError) console.error("saved lead lookup failed", leadsError);
  if (qualificationError) console.error("qualification lookup failed", qualificationError);

  const savedByApollo = new Map<string, any>();
  const savedByDomain = new Map<string, any>();
  const savedByName = new Map<string, any>();
  for (const lead of leadRows || []) {
    const apolloId = lead.apollo_organization_id || apolloIdFromNotes(lead.notes);
    const domain = cleanDomain(lead.company_domain || lead.website) || domainFromNotes(lead.notes);
    const name = canonicalName(lead.company_name);
    if (apolloId) savedByApollo.set(String(apolloId), lead);
    if (domain) savedByDomain.set(domain, lead);
    if (name) savedByName.set(name, lead);
  }
  const qualifications = new Map((qualificationRows || []).map((row: any) => [String(row.provider_company_id), row]));
  const rows = Array.isArray(payload?.organizations) ? payload.organizations : Array.isArray(payload?.accounts) ? payload.accounts : [];
  const companies = rows.map((org: any) => {
    const id = String(org.id || `${org.name || "company"}-${org.primary_domain || ""}`);
    const domain = cleanDomain(org.primary_domain || org.website_url);
    const existing = savedByApollo.get(id) || (domain ? savedByDomain.get(domain) : null) || savedByName.get(canonicalName(org.name));
    const qualification: any = qualifications.get(id);
    const qualificationFresh = qualification && new Date(qualification.expires_at).getTime() > Date.now();
    const savedStatus = existing ? existing.deleted_at ? "deleted" : existing.archived_at ? "archived" : "active" : null;
    return {
      id,
      name: String(org.name || "Unnamed company"),
      domain,
      website: org.website_url || (org.primary_domain ? `https://${org.primary_domain}` : null),
      logo_url: org.logo_url || (domain ? `https://img.logo.dev/${domain}?size=160` : null),
      industry: org.industry || null,
      city: org.city || null,
      state: org.state || null,
      country: org.country || null,
      employee_count: Number.isFinite(Number(org.estimated_num_employees)) ? Number(org.estimated_num_employees) : null,
      linkedin_url: org.linkedin_url || null,
      saved: Boolean(existing),
      saved_lead_id: existing?.id || null,
      saved_status: savedStatus,
      qualification_status: qualificationFresh ? qualification.status : "unverified",
      qualification_company_type: qualificationFresh ? qualification.company_type : null,
      qualification_confidence: qualificationFresh ? Number(qualification.confidence) : null,
      qualification_reason: qualificationFresh ? qualification.reason : null,
      safe_to_enrich: Boolean(qualificationFresh && qualification.status === "qualified" && Number(qualification.confidence) >= 0.75),
    };
  });
  return json({ ok: true, companies, pagination: payload?.pagination || { page, per_page: perPage }, provider: "apollo" });
});
