// email-oauth-callback — provider-agnostic OAuth callback for the email
// connect flow (Gmail / Outlook). Pairs with email-oauth-start which
// signs the state payload that we decode here to recover user_id +
// org_id + provider without a DB round-trip.
//
// On success: 302 to FRONTEND_URL/settings?tab=integrations&email_connect=success&provider=<gmail|outlook>
// On failure: 302 to FRONTEND_URL/settings?tab=integrations&email_connect=error&provider=<gmail|outlook|unknown>&reason=<reason>
//
// FRONTEND_URL must include the app base path so /settings resolves on
// the SPA, not on the marketing apex (which 404s). Default:
// https://app.logisticintel.com/app

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Provider = "gmail" | "outlook";

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0
      ? ""
      : "=".repeat(4 - (normalized.length % 4));

  return atob(normalized + pad);
}

function settingsUrl() {
  // The SPA is deployed at app.logisticintel.com with React Router routes
  // prefixed by /app. Using the marketing apex lands on a 404. Default
  // to the app subdomain so this works even when FRONTEND_URL is unset.
  const frontendUrl =
    Deno.env.get("FRONTEND_URL") || "https://app.logisticintel.com/app";
  return `${frontendUrl.replace(/\/$/, "")}/settings?tab=integrations`;
}

function redirectSuccess(provider: Provider) {
  return Response.redirect(
    `${settingsUrl()}&email_connect=success&provider=${provider}`,
    302,
  );
}

function redirectError(reason: string, provider: Provider | "unknown" = "unknown") {
  return Response.redirect(
    `${settingsUrl()}&email_connect=error&provider=${provider}&reason=${encodeURIComponent(reason)}`,
    302,
  );
}

async function exchangeGoogleCode(code: string) {
  const clientId = Deno.env.get("GMAIL_CLIENT_ID");
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
  // GMAIL_REDIRECT_URI is canonical; GMAIL_REDIRECT_URL kept as fallback.
  const redirectUri =
    Deno.env.get("GMAIL_REDIRECT_URI") ?? Deno.env.get("GMAIL_REDIRECT_URL");

  const missing: string[] = [];
  if (!clientId) missing.push("GMAIL_CLIENT_ID");
  if (!clientSecret) missing.push("GMAIL_CLIENT_SECRET");
  if (!redirectUri) missing.push("GMAIL_REDIRECT_URI (or GMAIL_REDIRECT_URL)");
  if (missing.length) {
    throw new Error(`Missing Gmail env: ${missing.join(", ")}`);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }

  return res.json();
}

async function exchangeOutlookCode(code: string) {
  const clientId = Deno.env.get("OUTLOOK_CLIENT_ID");
  const clientSecret = Deno.env.get("OUTLOOK_CLIENT_SECRET");
  const redirectUri = Deno.env.get("OUTLOOK_REDIRECT_URI");
  const tenant = Deno.env.get("OUTLOOK_TENANT") || "common";

  const missing: string[] = [];
  if (!clientId) missing.push("OUTLOOK_CLIENT_ID");
  if (!clientSecret) missing.push("OUTLOOK_CLIENT_SECRET");
  if (!redirectUri) missing.push("OUTLOOK_REDIRECT_URI");
  if (missing.length) {
    throw new Error(`Missing Outlook env: ${missing.join(", ")}`);
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook token exchange failed: ${text}`);
  }

  return res.json();
}

async function getGoogleProfile(accessToken: string) {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google profile fetch failed: ${text}`);
  }

  const profile = await res.json();

  return {
    email: profile.email as string,
    display_name: (profile.name as string | null) || null,
    provider_account_id: (profile.sub as string | null) || null,
  };
}

async function getOutlookProfile(accessToken: string) {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook profile fetch failed: ${text}`);
  }

  const profile = await res.json();

  return {
    email: (profile.mail || profile.userPrincipalName) as string,
    display_name: (profile.displayName as string | null) || null,
    provider_account_id: (profile.id as string | null) || null,
  };
}

serve(async (req) => {
  let provider: Provider | "unknown" = "unknown";

  try {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const providerError = url.searchParams.get("error");

    if (providerError) {
      console.error("OAuth provider error:", providerError);
      return redirectError(providerError);
    }

    if (!code || !state) {
      console.error("Missing OAuth code or state");
      return redirectError("missing_code_or_state");
    }

    const statePayload = JSON.parse(base64UrlDecode(state)) as {
      user_id: string;
      org_id: string;
      provider: Provider;
      nonce: string;
      created_at: string;
    };

    if (!statePayload.user_id || !statePayload.org_id) {
      throw new Error("Invalid OAuth state payload");
    }

    if (!["gmail", "outlook"].includes(statePayload.provider)) {
      throw new Error("Invalid OAuth provider in state");
    }
    provider = statePayload.provider;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase service environment variables");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const tokenData =
      provider === "gmail"
        ? await exchangeGoogleCode(code)
        : await exchangeOutlookCode(code);

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = Number(tokenData.expires_in || 3600);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    if (!accessToken) {
      throw new Error(`${provider} did not return an access token`);
    }

    const profile =
      provider === "gmail"
        ? await getGoogleProfile(accessToken)
        : await getOutlookProfile(accessToken);

    if (!profile.email) {
      throw new Error(`${provider} did not return mailbox email`);
    }

    // Schema notes (verified against information_schema):
    //   lit_email_accounts unique key = (user_id, provider, email)
    //   columns send_enabled and disconnected_at do NOT exist — do not write them.
    //   lit_oauth_tokens.user_id is NOT NULL — must be set on insert.
    const scopesArr = String(tokenData.scope || "")
      .split(" ")
      .filter(Boolean);
    const scopeStr =
      tokenData.scope ||
      (provider === "gmail"
        ? "https://www.googleapis.com/auth/gmail.send"
        : "openid email profile offline_access User.Read Mail.Send");

    // Auto-promote: if the user has no other primary connected mailbox,
    // mark this one primary on insert/upsert. Otherwise leave is_primary
    // alone so we don't clobber an explicit user choice.
    const { data: existingPrimary } = await supabase
      .from("lit_email_accounts")
      .select("id")
      .eq("user_id", statePayload.user_id)
      .eq("is_primary", true)
      .eq("status", "connected")
      .maybeSingle();
    const shouldPromote = !existingPrimary;

    const accountPayload: Record<string, unknown> = {
      org_id: statePayload.org_id,
      user_id: statePayload.user_id,
      provider,
      email: profile.email,
      display_name: profile.display_name,
      provider_account_id: profile.provider_account_id,
      status: "connected",
      scopes: scopesArr,
      connected_at: new Date().toISOString(),
      last_connected_at: new Date().toISOString(),
      error_message: null,
      metadata: { source: "email-oauth-callback" },
      updated_at: new Date().toISOString(),
    };
    if (shouldPromote) accountPayload.is_primary = true;

    const { data: emailAccount, error: accountError } = await supabase
      .from("lit_email_accounts")
      .upsert(accountPayload, { onConflict: "user_id,provider,email" })
      .select("id")
      .single();

    if (accountError || !emailAccount) {
      const detail = accountError
        ? `${accountError.code || "?"}:${accountError.message || ""}`
        : "no_row_returned";
      console.error("[email-oauth-callback] lit_email_accounts upsert failed:", detail);
      throw new Error(`db_write_failed:account:${detail}`);
    }

    const { error: delErr } = await supabase
      .from("lit_oauth_tokens")
      .delete()
      .eq("email_account_id", emailAccount.id);
    if (delErr) {
      console.warn("[email-oauth-callback] token delete warned:", delErr.code, delErr.message);
      // Non-fatal — insert below will still proceed.
    }

    const { error: tokenError } = await supabase.from("lit_oauth_tokens").insert({
      email_account_id: emailAccount.id,
      user_id: statePayload.user_id,
      org_id: statePayload.org_id,
      provider,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      scopes: scopesArr,
      token_type: tokenData.token_type || "Bearer",
      scope: scopeStr,
      raw_json: tokenData,
      updated_at: new Date().toISOString(),
    });

    if (tokenError) {
      const detail = `${tokenError.code || "?"}:${tokenError.message || ""}`;
      console.error("[email-oauth-callback] lit_oauth_tokens insert failed:", detail);
      throw new Error(`db_write_failed:token:${detail}`);
    }

    return redirectSuccess(provider);
  } catch (error) {
    console.error("email-oauth-callback error:", error);
    const reason =
      error instanceof Error ? error.message.slice(0, 200) : "callback_failed";
    return redirectError(reason, provider);
  }
});
