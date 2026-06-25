import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";

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

  // Search/view op over shared reference data (lit_company_index). Auth only —
  // no org scoping and no quoting feature gate: the company index is not
  // workspace-private, and the actual write boundary lives in quote-create.
  const body = await req.json().catch(() => ({}));
  const q = typeof body.q === "string" ? body.q.trim() : "";
  const limit = Math.min(20, Math.max(1, Number(body.limit) || 8));
  if (q.length < 2) return json({ ok: true, items: [] });

  const { data, error } = await admin.from("lit_company_index")
    .select("company_id, company_name, country, city, total_shipments, total_teu")
    .ilike("company_name", `%${q}%`)
    .order("total_shipments", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) { log.error("search_failed", { err: error.message }); return json({ ok: false, code: "SEARCH_FAILED" }, 500); }

  const items = (data ?? []).map((r) => ({
    source_company_key: r.company_id, // the slug → becomes lit_companies.source_company_key on link
    company_name: r.company_name,
    country: r.country ?? null,
    city: r.city ?? null,
    total_shipments: r.total_shipments ?? null,
    total_teu: r.total_teu ?? null,
  }));
  return json({ ok: true, items });
});
