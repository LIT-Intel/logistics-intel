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
  const log = createLogger("quote-list", { request_id: requestId() });

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
  let q = admin.from("lit_quotes").select("id,quote_number,company_id,status,mode,service_type,origin_port,origin_city,destination_port,destination_city,total_sell,gross_profit,gross_margin_pct,owner_user_id,sent_at,valid_until,updated_at")
    .eq("org_id", orgId).order("updated_at", { ascending: false });
  if (body.status) q = q.eq("status", body.status);
  if (body.company_id) q = q.eq("company_id", body.company_id);
  const { data, error } = await q;
  if (error) { log.error("list_failed", { err: error.message }); return json({ ok: false, code: "LIST_FAILED" }, 500); }
  const ids = [...new Set((data ?? []).map((r) => r.company_id).filter(Boolean))];
  const { data: cos } = await admin.from("lit_companies").select("id,name,domain,logo_url")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const byId = Object.fromEntries((cos ?? []).map((c) => [c.id, c]));
  return json({ ok: true, items: (data ?? []).map((r) => ({ ...r, company: byId[r.company_id] ?? null })) });
});
