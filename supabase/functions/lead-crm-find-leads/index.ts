import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const cleanDomain = (value: unknown) => String(value || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase() || null;

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

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const keywords = (Array.isArray(body.keywords) ? body.keywords : [body.keywords]).map((v: unknown) => String(v || "").trim()).filter(Boolean).slice(0, 10);
  if (!keywords.length) return json({ ok: false, error: "At least one keyword is required" }, 400);
  const page = Math.max(1, Math.min(100, Number(body.page) || 1));
  const perPage = Math.max(1, Math.min(50, Number(body.per_page) || 50));

  const apolloBody: Record<string, unknown> = { q_organization_keyword_tags: keywords, page, per_page: perPage };
  if (body.location) apolloBody.organization_locations = [String(body.location).trim()];
  const response = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", { method: "POST", headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": apolloKey }, body: JSON.stringify(apolloBody) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return json({ ok: false, error: payload?.message || payload?.error || "Apollo search failed", provider_status: response.status }, response.status === 429 ? 429 : 502);

  const rows = Array.isArray(payload?.organizations) ? payload.organizations : Array.isArray(payload?.accounts) ? payload.accounts : [];
  const companies = rows.map((org: any) => ({
    id: String(org.id || `${org.name || "company"}-${org.primary_domain || ""}`),
    name: String(org.name || "Unnamed company"),
    domain: cleanDomain(org.primary_domain || org.website_url),
    website: org.website_url || (org.primary_domain ? `https://${org.primary_domain}` : null),
    logo_url: org.logo_url || null,
    industry: org.industry || null,
    city: org.city || null,
    state: org.state || null,
    country: org.country || null,
    employee_count: Number.isFinite(Number(org.estimated_num_employees)) ? Number(org.estimated_num_employees) : null,
    linkedin_url: org.linkedin_url || null,
  }));
  return json({ ok: true, companies, pagination: payload?.pagination || { page, per_page: perPage }, provider: "apollo" });
});
