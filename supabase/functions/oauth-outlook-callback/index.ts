// Phase A — Outlook OAuth callback.
//
// Microsoft redirects the browser here with ?code & ?state. We verify
// state (HMAC), exchange code for tokens, fetch the user's profile
// (email, display name) from Graph, then upsert lit_email_accounts +
// lit_oauth_tokens under the service role.
//
// On success: 302 to FRONTEND_URL/settings?tab=integrations&email_connect=success&provider=outlook
// On failure: 302 to FRONTEND_URL/settings?tab=integrations&email_connect=error&provider=outlook&reason=…
//
// FRONTEND_URL must include the app base path (e.g. https://www.logisticintel.com/app).
// The marketing apex 404s on /settings — see the strip-trailing-slash
// + /settings?tab=integrations construction below.
//
// Tokens are stored plain-text today. Application-level encryption
// at rest is an explicit Phase E hardening item documented in the
// 20260424 migration that defines lit_oauth_tokens.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyState } from "../_shared/oauth-state.ts";

const OUTLOOK_SCOPES = [
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
];

function settingsUrl() {
  const frontendUrl =
    Deno.env.get("FRONTEND_URL") || "https://www.logisticintel.com/app";
  return `${frontendUrl.replace(/\/$/, "")}/settings?tab=integrations`;
}

function redirectSuccess() {
  return new Response(null, {
    status: 302,
    headers: { Location: `${settingsUrl()}&email_connect=success&provider=outlook` },
  });
}

function redirectError(reason: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${settingsUrl()}&email_connect=error&provider=outlook&reason=${encodeURIComponent(reason)}`,
    },
  });
}

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("OUTLOOK_CLIENT_ID");
  const clientSecret = Deno.env.get("OUTLOOK_CLIENT_SECRET");
  const redirectUri = Deno.env.get("OUTLOOK_REDIRECT_URI");
  const tenant = Deno.env.get("OUTLOOK_TENANT") || "common";
  const stateSecret = Deno.env.get("OAUTH_STATE_SECRET");

  if (
    !supabaseUrl ||
    !supabaseServiceRoleKey ||
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !stateSecret
  ) {
    return redirectError("server_misconfigured");
  }

  if (oauthError) {
    console.warn("[oauth-outlook-callback] provider error", oauthError);
    return redirectError(oauthError);
  }
  if (!code || !state) {
    return redirectError("missing_code_or_state");
  }

  const verified = await verifyState(state, "outlook", stateSecret);
  if (!verified.ok) {
    console.warn("[oauth-outlook-callback] bad state", verified.reason);
    return redirectError(verified.reason);
  }
  const userId = verified.uid;

  // Exchange auth code for tokens.
  let tokenJson: any;
  try {
    const tokenResp = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          scope: OUTLOOK_SCOPES.join(" "),
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          client_secret: clientSecret,
        }),
      },
    );
    tokenJson = await tokenResp.json();
    if (!tokenResp.ok || !tokenJson?.access_token) {
      console.warn("[oauth-outlook-callback] token exchange failed", tokenResp.status, tokenJson?.error);
      return redirectError("token_exchange_failed");
    }
  } catch (e) {
    console.error("[oauth-outlook-callback] token exchange threw", e);
    return redirectError("token_exchange_threw");
  }

  // Fetch profile (email, display name) from Microsoft Graph.
  let email = "";
  let displayName: string | null = null;
  try {
    const profileResp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profile = await profileResp.json();
    if (!profileResp.ok) {
      console.warn("[oauth-outlook-callback] graph profile failed", profileResp.status, profile?.error?.code);
      return redirectError("userinfo_failed");
    }
    // Microsoft returns email in `mail` (preferred) or `userPrincipalName` (fallback).
    const rawEmail = profile.mail || profile.userPrincipalName;
    if (!rawEmail) {
      console.warn("[oauth-outlook-callback] no email in graph profile");
      return redirectError("userinfo_no_email");
    }
    email = String(rawEmail).toLowerCase();
    displayName = profile.displayName || null;
  } catch (e) {
    console.error("[oauth-outlook-callback] graph profile threw", e);
    return redirectError("userinfo_threw");
  }

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
  const scopes: string[] = String(tokenJson.scope || "").split(/\s+/).filter(Boolean);
  const expiresIn = Number(tokenJson.expires_in) || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Upsert lit_email_accounts (user_id, provider, email).
  const { data: account, error: acctErr } = await admin
    .from("lit_email_accounts")
    .upsert(
      {
        user_id: userId,
        provider: "outlook",
        email,
        display_name: displayName,
        status: "connected",
        scopes,
        connected_at: new Date().toISOString(),
        metadata: { source: "oauth-outlook-callback", tenant },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider,email" },
    )
    .select("id")
    .single();
  if (acctErr || !account?.id) {
    console.error("[oauth-outlook-callback] account upsert failed", acctErr);
    return redirectError("account_upsert_failed");
  }

  // Upsert lit_oauth_tokens by email_account_id. Refresh token may be
  // missing on subsequent re-consents; only overwrite when present so
  // we don't lose offline access.
  const { data: existingTok } = await admin
    .from("lit_oauth_tokens")
    .select("id, refresh_token")
    .eq("email_account_id", account.id)
    .maybeSingle();

  const tokenRow: Record<string, unknown> = {
    email_account_id: account.id,
    user_id: userId,
    provider: "outlook",
    access_token: tokenJson.access_token,
    expires_at: expiresAt,
    scopes,
    token_type: tokenJson.token_type || "Bearer",
    metadata: { tenant },
    updated_at: new Date().toISOString(),
  };
  if (tokenJson.refresh_token) {
    tokenRow.refresh_token = tokenJson.refresh_token;
  } else if (!existingTok?.refresh_token) {
    tokenRow.refresh_token = null;
  }

  const { error: tokErr } = existingTok?.id
    ? await admin.from("lit_oauth_tokens").update(tokenRow).eq("id", existingTok.id)
    : await admin.from("lit_oauth_tokens").insert(tokenRow);
  if (tokErr) {
    console.error("[oauth-outlook-callback] token upsert failed", tokErr);
    return redirectError("token_persist_failed");
  }

  return redirectSuccess();
});