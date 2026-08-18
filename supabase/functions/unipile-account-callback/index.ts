import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, json } from "../_shared/auth.ts";
import { getUnipileConfig, unipileRequest } from "../_shared/unipile.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !service) return json({ ok: false }, 503);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false }, 400); }
  const sessionId = String(body.name || "");
  const remoteAccountId = String(body.account_id || "");
  const callbackStatus = String(body.status || "").toUpperCase();
  if (!sessionId || !remoteAccountId || !["CREATION_SUCCESS", "RECONNECTED"].includes(callbackStatus)) {
    return json({ ok: false }, 400);
  }

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session } = await admin.from("lit_unipile_auth_sessions").select("*")
    .eq("id", sessionId).is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!session) return json({ ok: false }, 403);

  try {
    const remote = await unipileRequest<Record<string, unknown>>(`/accounts/${encodeURIComponent(remoteAccountId)}`);
    const { data: existing } = await admin.from("lit_unipile_accounts").select("id,org_id")
      .eq("unipile_account_id", remoteAccountId).maybeSingle();
    if (existing && existing.org_id !== session.org_id) {
      throw new Error("This LinkedIn account is already connected to another workspace");
    }
    const { error } = await admin.from("lit_unipile_accounts").upsert({
      org_id: session.org_id,
      owner_user_id: session.user_id,
      unipile_account_id: remoteAccountId,
      provider: "LINKEDIN",
      display_name: remote.name || remote.username || null,
      email: remote.email || null,
      status: "OK",
      use_for_campaigns: session.purpose === "campaigns",
      use_for_lead_crm: session.purpose === "lead_crm",
      connected_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      metadata: remote,
      updated_at: new Date().toISOString(),
    }, { onConflict: "unipile_account_id" });
    if (error) throw error;
    await admin.from("lit_unipile_auth_sessions").update({ consumed_at: new Date().toISOString() }).eq("id", session.id);
    // Webhook setup is best-effort and idempotent at the event-inbox layer.
    // A missing webhook secret never blocks the account connection itself.
    const cfg = getUnipileConfig();
    if (cfg.webhookSecret) {
      const requestUrl = `${url}/functions/v1/unipile-webhook`;
      const headers = [
        { key: "Content-Type", value: "application/json" },
        { key: "Unipile-Auth", value: cfg.webhookSecret },
      ];
      for (const spec of [
        { source: "messaging", name: "LIT LinkedIn messages" },
        { source: "users", name: "LIT LinkedIn relations" },
      ]) {
        try {
          await unipileRequest("/webhooks", { method: "POST", body: JSON.stringify({ ...spec, request_url: requestUrl, headers }) });
        } catch (webhookError) {
          console.warn("Unipile webhook registration skipped", webhookError instanceof Error ? webhookError.message : "unknown");
        }
      }
    }
    return json({ ok: true });
  } catch (error) {
    console.error("unipile callback failed", error instanceof Error ? error.message : "unknown");
    return json({ ok: false }, 502);
  }
});
