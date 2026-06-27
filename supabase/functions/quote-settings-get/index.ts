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
  const log = createLogger("quote-settings-get", { request_id: requestId() });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, svc);
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const userId = u.user.id;

  const orgId = await resolveOrg(admin, userId);
  if (!orgId) return json({ ok: true, data: { org_name: null, org_logo_url: null, settings: {} } });

  const { data: org, error: orgErr } = await admin.from("organizations").select("name, logo_url").eq("id", orgId).maybeSingle();
  if (orgErr) { log.error("org_read_failed", { err: orgErr.message, org_id: orgId }); return json({ ok: false, code: "READ_FAILED" }, 500); }
  const { data: os, error: osErr } = await admin.from("org_settings").select("quote_defaults").eq("org_id", orgId).maybeSingle();
  if (osErr) { log.error("settings_read_failed", { err: osErr.message, org_id: orgId }); return json({ ok: false, code: "READ_FAILED" }, 500); }

  return json({ ok: true, data: { org_name: org?.name ?? null, org_logo_url: org?.logo_url ?? null, settings: os?.quote_defaults ?? {} } });
});
