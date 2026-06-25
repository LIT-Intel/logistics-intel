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
  const log = createLogger("quote-dashboard-metrics", { request_id: requestId() });

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

  const { data, error } = await admin.from("lit_quotes").select("status,total_sell").eq("org_id", orgId);
  if (error) { log.error("metrics_failed", { err: error.message }); return json({ ok: false, code: "METRICS_FAILED" }, 500); }
  const rows = data ?? [];
  const sum = (pred: (s: string) => boolean) => rows.filter((r) => pred(r.status)).reduce((a, r) => a + Number(r.total_sell || 0), 0);
  return json({
    ok: true,
    data: {
      draft: sum((s) => s === "draft"),
      sent: sum((s) => s === "sent" || s === "viewed"),
      approved: sum((s) => s === "approved"),
      won: sum((s) => s === "closed_won"),
      open_pipeline: sum((s) => ["draft", "sent", "viewed", "approved"].includes(s)),
      count: rows.length,
    },
  });
});
