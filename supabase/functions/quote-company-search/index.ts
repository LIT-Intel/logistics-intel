import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";
import { resolveOrg } from "../_shared/quote_helpers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("quote-company-search", { request_id: requestId() });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, svc);
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const userId = u.user.id;

  // Product rule: a user may only quote companies they have SAVED to their org's
  // Command Center. So this searches the org's saved companies (lit_saved_companies
  // joined to lit_companies), NOT the global lit_company_index. Each hit already
  // carries the internal lit_companies UUID — no slug linking needed downstream.
  // Auth only — the real write boundary lives in quote-create.
  const body = await req.json().catch(() => ({}));
  const q = typeof body.q === "string" ? body.q.trim() : "";
  const limit = Math.min(20, Math.max(1, Number(body.limit) || 8));
  if (q.length < 2) return json({ ok: true, items: [] });

  const orgId = await resolveOrg(admin, userId);
  if (!orgId) return json({ ok: true, items: [] }); // no org → nothing saved to quote

  // Org's saved companies, name-filtered via the embedded company table.
  // Single FK (lit_saved_companies.company_id → lit_companies.id) makes the
  // plain `lit_companies!inner(...)` embed unambiguous.
  const { data, error } = await admin
    .from("lit_saved_companies")
    .select("company_id, lit_companies!inner(id, name, domain, city, state, country_code, shipments_12m)")
    .eq("org_id", orgId)
    .ilike("lit_companies.name", `%${q}%`)
    .limit(50);
  if (error) { log.error("search_failed", { err: error.message }); return json({ ok: false, code: "SEARCH_FAILED" }, 500); }

  const items = (data ?? [])
    .map((r: any) => {
      const c = r.lit_companies;
      return c ? {
        company_id: c.id,                 // internal UUID — already a real lit_companies row
        company_name: c.name,
        domain: c.domain ?? null,
        city: c.city ?? null,
        country: c.country_code ?? null,
        shipments_12m: c.shipments_12m ?? null,
      } : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (b.shipments_12m ?? 0) - (a.shipments_12m ?? 0))
    .slice(0, limit);

  return json({ ok: true, items });
});
