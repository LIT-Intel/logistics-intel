// company-live-enrich — on-demand live company enrichment for the search detail
// panel. Given a company name (+ optional domain/location), does a single free
// Apollo Organization Search (mixed_companies/search — org data, no per-match
// credit) and returns display-ready fields: website, phone, HQ address,
// industry, revenue, headcount, linkedin, logo. JWT-required.
//
// "On click" trigger only (per product decision) — one company per open, so
// cost stays bounded. Returns { ok:true, data:null, enriched:false } cleanly
// when Apollo is unconfigured or no match, so the panel just keeps its
// shipment-intel view.
import { handlePreflight, json, requireUser } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const APOLLO_BASE = Deno.env.get("APOLLO_API_BASE") || "https://api.apollo.io";
const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") || "";

function normDomain(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null;
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const log = createLogger("company-live-enrich", { request_id: requestId() });
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 200);
  const domain = normDomain(body?.domain);
  if (!name && !domain) return json({ ok: false, error: "name_or_domain_required" }, 400);

  if (!APOLLO_API_KEY) return json({ ok: true, data: null, enriched: false, reason: "apollo_unconfigured" });

  const search: Record<string, unknown> = { page: 1, per_page: 5 };
  if (name) search.q_organization_name = name;
  if (domain) search.q_organization_domains_list = [domain];

  let org: Record<string, unknown> | null = null;
  try {
    const r = await fetch(`${APOLLO_BASE}/api/v1/mixed_companies/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": APOLLO_API_KEY },
      body: JSON.stringify(search),
    });
    if (r.ok) {
      const d = await r.json();
      const orgs: any[] = Array.isArray(d?.organizations)
        ? d.organizations
        : Array.isArray(d?.accounts)
          ? d.accounts
          : [];
      // Prefer a match that actually has a domain (real company vs stub).
      org = orgs.find((o) => o?.primary_domain || o?.website_url) || orgs[0] || null;
    } else {
      log.warn("apollo_search_failed", { err: `HTTP ${r.status}` });
    }
  } catch (e) {
    log.error("apollo_error", { err: String(e) });
  }

  if (!org) return json({ ok: true, data: null, enriched: false });

  const phone =
    (org.primary_phone && typeof org.primary_phone === "object" ? (org.primary_phone as any).number : null) ||
    (org.phone as string) ||
    null;
  const data = {
    name: (org.name as string) ?? null,
    website: normDomain(org.primary_domain || org.website_url),
    phone,
    street_address: (org.street_address as string) || (org.raw_address as string) || null,
    city: (org.city as string) || null,
    state: (org.state as string) || null,
    country: (org.country as string) || null,
    industry: (org.industry as string) ?? null,
    estimated_num_employees: Number.isFinite(Number(org.estimated_num_employees))
      ? Number(org.estimated_num_employees)
      : null,
    annual_revenue: Number.isFinite(Number(org.organization_revenue)) ? Number(org.organization_revenue) : null,
    annual_revenue_printed: (org.organization_revenue_printed as string) ?? null,
    linkedin_url: (org.linkedin_url as string) ?? null,
    logo_url: (org.logo_url as string) ?? null,
    apollo_organization_id: org.id ? String(org.id) : null,
  };
  return json({ ok: true, data, enriched: true });
});
