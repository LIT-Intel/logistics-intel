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
  const log = createLogger("quote-detail", { request_id: requestId() });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, svc);
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const userId = u.user.id;

  const orgId = await resolveOrg(admin, userId);
  if (!orgId) return json({ ok: false, code: "NO_ORG" }, 403);

  const body = await req.json().catch(() => ({}));
  const quoteId = body.quote_id;
  if (!quoteId) return json({ ok: false, code: "INVALID_INPUT", message: "quote_id required" }, 400);
  const { data: quote, error } = await admin.from("lit_quotes").select("*").eq("id", quoteId).eq("org_id", orgId).maybeSingle();
  if (error) { log.error("detail_failed", { err: error.message }); return json({ ok: false, code: "DETAIL_FAILED" }, 500); }
  if (!quote) return json({ ok: false, code: "NOT_FOUND" }, 404);
  const [{ data: line_items }, { data: events }, { data: company }] = await Promise.all([
    admin.from("lit_quote_line_items").select("*").eq("quote_id", quoteId).order("sort_order", { ascending: true }),
    admin.from("lit_quote_events").select("*").eq("quote_id", quoteId).order("created_at", { ascending: false }),
    admin.from("lit_companies").select("id,name,domain,website,logo_url,city,state,country_code").eq("id", quote.company_id).maybeSingle(),
  ]);
  return json({ ok: true, data: { quote, line_items: line_items ?? [], events: events ?? [], company: company ?? null } });
});
