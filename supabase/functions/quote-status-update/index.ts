import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";
import { resolveOrg, requireQuotingFeature } from "../_shared/quote_helpers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("quote-status-update", { request_id: requestId() });

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
  const gate = await requireQuotingFeature(admin, userId, orgId);
  if (!gate.ok) return json(gate.body, gate.status);

  const body = await req.json().catch(() => ({}));
  const quoteId = body.quote_id;
  const status = body.status;
  const ALLOWED = ["draft", "sent", "viewed", "approved", "closed_won", "closed_lost", "expired"];
  if (!quoteId || !ALLOWED.includes(status)) return json({ ok: false, code: "INVALID_INPUT" }, 400);

  const { data: existing } = await admin.from("lit_quotes").select("id, company_id, quote_number, total_sell").eq("id", quoteId).eq("org_id", orgId).maybeSingle();
  if (!existing) return json({ ok: false, code: "NOT_FOUND" }, 404);

  const EVENT: Record<string, string> = { sent: "sent", viewed: "viewed", approved: "approved", closed_won: "marked_won", closed_lost: "marked_lost", expired: "updated", draft: "updated" };
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "sent") patch.sent_at = new Date().toISOString();
  if (status === "approved") patch.approved_at = new Date().toISOString();
  if (status === "closed_won" || status === "closed_lost") patch.closed_at = new Date().toISOString();

  const { data: quote, error } = await admin.from("lit_quotes").update(patch).eq("id", quoteId).eq("org_id", orgId).select("*").single();
  if (error) { log.error("status_failed", { err: error.message }); return json({ ok: false, code: "STATUS_FAILED" }, 500); }

  await admin.from("lit_quote_events").insert({ quote_id: quoteId, org_id: orgId, company_id: existing.company_id, event_type: EVENT[status] ?? "updated", created_by: userId, event_payload: { status } });

  if (status === "closed_won" || status === "closed_lost") {
    await admin.from("lit_outreach_history").insert({
      user_id: userId, company_id: existing.company_id, channel: "quote",
      event_type: status === "closed_won" ? "quote_won" : "quote_lost",
      status: "logged", subject: `Quote ${existing.quote_number}`, occurred_at: new Date().toISOString(),
      metadata: { quote_id: quoteId, total_sell: existing.total_sell },
    });
  }

  log.info("status_updated", { quote_id: quoteId, status });
  return json({ ok: true, data: { quote } });
});
