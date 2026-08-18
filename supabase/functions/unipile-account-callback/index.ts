import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, json } from "../_shared/auth.ts";
import { getUnipileConfig, unipileRequest } from "../_shared/unipile.ts";

async function expectedSignature(sessionId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sessionId));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !service) return json({ ok: false }, 503);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false }, 400); }
  const sessionId = String(body.name || "");
  const callbackSession = new URL(req.url).searchParams.get("session") || "";
  const callbackSignature = new URL(req.url).searchParams.get("signature") || "";
  const remoteAccountId = String(body.account_id || "");
  const callbackStatus = String(body.status || "").toUpperCase();
  if (!sessionId || callbackSession !== sessionId || !remoteAccountId || !["CREATION_SUCCESS", "RECONNECTED"].includes(callbackStatus)) {
    return json({ ok: false }, 400);
  }

  const expected = await expectedSignature(sessionId, service);
  if (!callbackSignature || !constantTimeEqual(callbackSignature, expected)) return json({ ok: false }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session } = await admin.from("lit_unipile_auth_sessions").select("*")
    .eq("id", sessionId).is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!session) return json({ ok: false }, 403);

  try {
    const { data: existing } = await admin.from("lit_unipile_accounts").select("id,org_id")
      .eq("unipile_account_id", remoteAccountId).maybeSingle();
    if (existing && existing.org_id !== session.org_id) {
      throw new Error("This LinkedIn account is already connected to another workspace");
    }
    const connectedAt = new Date().toISOString();
    // CREATION_SUCCESS / RECONNECTED is Unipile's authoritative confirmation.
    // Persist that mapping before making any secondary profile request so a
    // temporary metadata lookup failure cannot lose a successful connection.
    const { error } = await admin.from("lit_unipile_accounts").upsert({
      org_id: session.org_id,
      owner_user_id: session.user_id,
      unipile_account_id: remoteAccountId,
      provider: "LINKEDIN",
      status: "OK",
      use_for_campaigns: session.purpose === "campaigns",
      use_for_lead_crm: session.purpose === "lead_crm",
      connected_at: connectedAt,
      last_synced_at: connectedAt,
      metadata: { callback_status: callbackStatus },
      updated_at: connectedAt,
    }, { onConflict: "unipile_account_id" });
    if (error) throw error;
    await admin.from("lit_unipile_auth_sessions").update({ consumed_at: new Date().toISOString() }).eq("id", session.id);

    // Enrich the card best-effort after the durable mapping exists.
    try {
      const remote = await unipileRequest<Record<string, unknown>>(`/accounts/${encodeURIComponent(remoteAccountId)}`);
      await admin.from("lit_unipile_accounts").update({
        display_name: typeof remote.name === "string" ? remote.name : typeof remote.username === "string" ? remote.username : null,
        email: typeof remote.email === "string" ? remote.email : null,
        metadata: remote,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("unipile_account_id", remoteAccountId);
    } catch (profileError) {
      console.warn("Unipile account metadata refresh deferred", profileError instanceof Error ? profileError.message : "unknown");
    }
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
    const message = error instanceof Error ? error.message : "unknown";
    console.error("unipile callback failed", JSON.stringify({ sessionId, remoteAccountId, message }));
    return json({ ok: false, error: message }, 502);
  }
});
