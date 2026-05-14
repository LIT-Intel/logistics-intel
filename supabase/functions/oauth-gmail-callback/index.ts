// Phase A — Gmail OAuth callback.
//
// Google redirects the browser here with ?code & ?state. We verify
// state (HMAC), exchange code for tokens, fetch the user's gmail
// address + display name, then upsert lit_email_accounts +
// lit_oauth_tokens under the service role.
//
// On success: 302 to FRONTEND_URL/settings?tab=integrations&email_connect=success&provider=gmail
// On failure: 302 to FRONTEND_URL/settings?tab=integrations&email_connect=error&provider=gmail&reason=…
//
// FRONTEND_URL must include the app base path (e.g. https://www.logisticintel.com/app).
//
// Tokens are stored plain-text today. Application-level encryption
// at rest is an explicit Phase E hardening item documented in the
// 20260424 migration that defines lit_oauth_tokens.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyState } from "../_shared/oauth-state.ts";

function settingsUrl() {
  // The SPA is deployed at app.logisticintel.com with React Router routes
  // prefixed by /app (e.g. /app/settings). Using the marketing apex
  // (www.logisticintel.com) lands on the Next.js 404 page since /app/*
  // doesn't exist there. Default to the app subdomain so the redirect
  // works even when FRONTEND_URL is unset.
  const frontendUrl =
    Deno.env.get("FRONTEND_URL") || "https://app.logisticintel.com/app";
  return `${frontendUrl.replace(/\/$/, "")}/settings?tab=integrations`;
}

function redirectSuccess() {
  return new Response(null, {
    status: 302,
    headers: { Location: `${settingsUrl()}&email_connect=success&provider=gmail` },
  });
}

function redirectError(reason: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${settingsUrl()}&email_connect=error&provider=gmail&reason=${encodeURIComponent(reason)}`,
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
  const clientId = Deno.env.get("GMAIL_CLIENT_ID");
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
  // GMAIL_REDIRECT_URI is canonical; fall back to GMAIL_REDIRECT_URL so
  // either secret name works while operators normalize their secrets.
  const redirectUri =
    Deno.env.get("GMAIL_REDIRECT_URI") ?? Deno.env.get("GMAIL_REDIRECT_URL");
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
    console.warn("[oauth-gmail-callback] provider error", oauthError);
    return redirectError(oauthError);
  }
  if (!code || !state) {
    return redirectError("missing_code_or_state");
  }

  const verified = await verifyState(state, "gmail", stateSecret);
  if (!verified.ok) {
    console.warn("[oauth-gmail-callback] bad state", verified.reason);
    return redirectError(verified.reason);
  }
  const userId = verified.uid;

  // Exchange auth code for tokens.
  let tokenJson: any;
  try {
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    tokenJson = await tokenResp.json();
    if (!tokenResp.ok || !tokenJson?.access_token) {
      console.warn("[oauth-gmail-callback] token exchange failed", tokenResp.status, tokenJson);
      return redirectError("token_exchange_failed");
    }
  } catch (e) {
    console.error("[oauth-gmail-callback] token exchange threw", e);
    return redirectError("token_exchange_threw");
  }

  // Fetch profile (email, display name).
  let email = "";
  let displayName: string | null = null;
  try {
    const profileResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profile = await profileResp.json();
    if (!profileResp.ok || !profile?.email) {
      console.warn("[oauth-gmail-callback] userinfo failed", profileResp.status, profile);
      return redirectError("userinfo_failed");
    }
    email = String(profile.email).toLowerCase();
    displayName = profile.name || profile.given_name || null;
  } catch (e) {
    console.error("[oauth-gmail-callback] userinfo threw", e);
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
        provider: "gmail",
        email,
        display_name: displayName,
        status: "connected",
        scopes,
        connected_at: new Date().toISOString(),
        metadata: { source: "oauth-gmail-callback" },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider,email" },
    )
    .select("id")
    .single();
  if (acctErr || !account?.id) {
    console.error("[oauth-gmail-callback] account upsert failed", acctErr);
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
    provider: "gmail",
    access_token: tokenJson.access_token,
    expires_at: expiresAt,
    scopes,
    token_type: tokenJson.token_type || "Bearer",
    metadata: { id_token_present: Boolean(tokenJson.id_token) },
    updated_at: new Date().toISOString(),
  };
  if (tokenJson.refresh_token) {
    tokenRow.refresh_token = tokenJson.refresh_token;
  } else if (!existingTok?.refresh_token) {
    // Brand new connection but Google didn't return a refresh_token —
    // usually means the user has previously consented. Force the user
    // to re-consent next time by clearing the access path on this row.
    tokenRow.refresh_token = null;
  }

  const { error: tokErr } = existingTok?.id
    ? await admin.from("lit_oauth_tokens").update(tokenRow).eq("id", existingTok.id)
    : await admin.from("lit_oauth_tokens").insert(tokenRow);
  if (tokErr) {
    console.error("[oauth-gmail-callback] token upsert failed", tokErr);
    return redirectError("token_persist_failed");
  }

  return redirectSuccess();
});