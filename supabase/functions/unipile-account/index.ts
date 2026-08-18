import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, json, requireUser, resolveUserOrg } from "../_shared/auth.ts";
import { getUnipileConfig, unipileRequest } from "../_shared/unipile.ts";

function safeReturnUrl(value: unknown): string {
  const appUrl = (Deno.env.get("APP_URL") || "https://app.logisticintel.com").replace(/\/$/, "");
  const raw = String(value || "/app/settings?section=integrations");
  if (raw.startsWith("/")) return `${appUrl}${raw}`;
  try {
    const parsed = new URL(raw);
    if (parsed.origin === new URL(appUrl).origin || parsed.hostname === "localhost") return parsed.toString();
  } catch { /* fall through */ }
  return `${appUrl}/app/settings?section=integrations`;
}

async function signCallback(sessionId: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!secret) throw new Error("Callback signing is not configured");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sessionId));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" }, 405);
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, code: "BAD_JSON", error: "Invalid JSON" }, 400); }
  const action = String(body.action || "list");

  try {
    const purpose = body.purpose === "lead_crm" ? "lead_crm" : "campaigns";
    const requestedOrgId = String(body.org_id || "").trim();
    const membershipQuery = auth.admin.from("org_members").select("org_id,role,status")
      .eq("user_id", auth.user.id).eq("status", "active");
    const { data: memberships } = await membershipQuery;
    const membership = (memberships || []).find((m) => !requestedOrgId || m.org_id === requestedOrgId);
    const fallback = await resolveUserOrg(auth.admin, auth.user.id);
    let orgId = membership?.org_id || fallback.orgId;
    if (purpose === "lead_crm") {
      const { data: access } = await auth.userClient.rpc("lit_my_lead_crm_access");
      const gate = Array.isArray(access) ? access[0] : access;
      if (!gate?.is_member) return json({ ok: false, code: "LEAD_CRM_REQUIRED", error: "Lead CRM membership required" }, 403);
      const { data: internalOrg } = await auth.admin.from("organizations").select("id").eq("is_internal", true).limit(1).maybeSingle();
      orgId = internalOrg?.id || null;
    }
    if (!orgId) return json({ ok: false, code: "ORG_REQUIRED", error: "Active workspace membership required" }, 403);

    if (action === "list") {
      const { data, error } = await auth.admin.from("lit_unipile_accounts")
        .select("id,org_id,owner_user_id,unipile_account_id,provider,display_name,email,status,use_for_campaigns,use_for_lead_crm,daily_invite_cap,daily_message_cap,connected_at,last_synced_at")
        .eq("org_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return json({ ok: true, accounts: data || [] });
    }

    if (action === "hosted_link") {
      let reconnectAccount: { id: string; unipile_account_id: string } | null = null;
      if (body.account_id) {
        const { data } = await auth.admin.from("lit_unipile_accounts")
          .select("id,unipile_account_id").eq("id", String(body.account_id)).eq("org_id", orgId).maybeSingle();
        reconnectAccount = data;
        if (!reconnectAccount) return json({ ok: false, code: "ACCOUNT_NOT_FOUND", error: "LinkedIn account not found" }, 404);
      }

      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const { data: session, error: sessionError } = await auth.admin.from("lit_unipile_auth_sessions")
        .insert({ org_id: orgId, user_id: auth.user.id, purpose, reconnect_account_id: reconnectAccount?.id || null, expires_at: expiresAt })
        .select("id").single();
      if (sessionError || !session) throw sessionError || new Error("Could not create connection session");

      const cfg = getUnipileConfig();
      const returnUrl = safeReturnUrl(body.return_url);
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const callbackSignature = await signCallback(session.id);
      const hostedPayload: Record<string, unknown> = {
        type: reconnectAccount ? "reconnect" : "create",
        providers: ["LINKEDIN"],
        api_url: cfg.baseUrl,
        expiresOn: expiresAt,
        notify_url: `${supabaseUrl}/functions/v1/unipile-account-callback?session=${encodeURIComponent(session.id)}&signature=${callbackSignature}`,
        success_redirect_url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}unipile=connected`,
        failure_redirect_url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}unipile=failed`,
        name: session.id,
      };
      if (reconnectAccount) hostedPayload.reconnect_account = reconnectAccount.unipile_account_id;
      const result = await unipileRequest<{ url?: string }>("/hosted/accounts/link", {
        method: "POST", body: JSON.stringify(hostedPayload),
      });
      if (!result.url) throw new Error("Unipile returned no hosted authentication URL");
      return json({ ok: true, url: result.url, expires_at: expiresAt });
    }

    if (action === "refresh") {
      const localId = String(body.account_id || "");
      const { data: local } = await auth.admin.from("lit_unipile_accounts")
        .select("id,unipile_account_id").eq("id", localId).eq("org_id", orgId).maybeSingle();
      if (!local) return json({ ok: false, code: "ACCOUNT_NOT_FOUND", error: "LinkedIn account not found" }, 404);
      const remote = await unipileRequest<Record<string, unknown>>(`/accounts/${encodeURIComponent(local.unipile_account_id)}`);
      const status = String(remote.sources ? "OK" : remote.status || "OK").toUpperCase();
      const { data: updated, error } = await auth.admin.from("lit_unipile_accounts").update({
        status: ["OK","CONNECTING","CREDENTIALS","ERROR","STOPPED","DELETED"].includes(status) ? status : "OK",
        display_name: remote.name || remote.username || null,
        email: remote.email || null,
        metadata: remote,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", local.id).select().single();
      if (error) throw error;
      return json({ ok: true, account: updated });
    }

    return json({ ok: false, code: "UNKNOWN_ACTION", error: "Unknown action" }, 400);
  } catch (error) {
    const upstreamStatus = Number((error as { status?: number })?.status || 0);
    const message = error instanceof Error ? error.message : "Unipile account operation failed";
    const code = upstreamStatus === 401 || upstreamStatus === 403
      ? "UNIPILE_CREDENTIALS_REJECTED"
      : upstreamStatus === 422 || upstreamStatus === 400
      ? "UNIPILE_REQUEST_REJECTED"
      : "UNIPILE_ACCOUNT_ERROR";
    console.error("unipile-account failed", JSON.stringify({ code, upstreamStatus, message }));
    return json({ ok: false, code, error: message }, upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502);
  }
});
