// email-oauth-start — provider-agnostic OAuth kickoff.
//
// Authenticated POST. Body: { provider: 'gmail'|'outlook', org_id }.
// Returns { ok:true, provider, auth_url } pointing at the provider's
// consent screen. The frontend does `window.location.href = auth_url`.
//
// Secret names (Supabase project secrets):
//   Gmail:   GMAIL_CLIENT_ID, GMAIL_REDIRECT_URI (preferred) or
//            GMAIL_REDIRECT_URL (fallback)
//   Outlook: OUTLOOK_CLIENT_ID, OUTLOOK_REDIRECT_URI, OUTLOOK_TENANT
//
// Do not use GOOGLE_* or MICROSOFT_* names — those are not read here.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Provider = "gmail" | "outlook";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64UrlEncode(input: string) {
  return btoa(input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildGmailAuthUrl(state: string) {
  const gmailClientId = Deno.env.get("GMAIL_CLIENT_ID");
  // Tolerate either secret name. GMAIL_REDIRECT_URI is canonical;
  // GMAIL_REDIRECT_URL is kept as a fallback during the secret-name
  // normalization rollout.
  const gmailRedirectUri =
    Deno.env.get("GMAIL_REDIRECT_URI") ?? Deno.env.get("GMAIL_REDIRECT_URL");

  const missing: string[] = [];
  if (!gmailClientId) missing.push("GMAIL_CLIENT_ID");
  if (!gmailRedirectUri) missing.push("GMAIL_REDIRECT_URI (or GMAIL_REDIRECT_URL)");
  if (missing.length) {
    throw new Error(`Missing Gmail env: ${missing.join(", ")}`);
  }

  const params = new URLSearchParams({
    client_id: gmailClientId,
    redirect_uri: gmailRedirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.send",
    ].join(" "),
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function buildOutlookAuthUrl(state: string) {
  const outlookClientId = Deno.env.get("OUTLOOK_CLIENT_ID");
  const outlookRedirectUri = Deno.env.get("OUTLOOK_REDIRECT_URI");
  const outlookTenant = Deno.env.get("OUTLOOK_TENANT") || "common";

  const missing: string[] = [];
  if (!outlookClientId) missing.push("OUTLOOK_CLIENT_ID");
  if (!outlookRedirectUri) missing.push("OUTLOOK_REDIRECT_URI");
  if (missing.length) {
    throw new Error(`Missing Outlook env: ${missing.join(", ")}`);
  }

  const params = new URLSearchParams({
    client_id: outlookClientId,
    redirect_uri: outlookRedirectUri,
    response_type: "code",
    response_mode: "query",
    scope: [
      "openid",
      "email",
      "profile",
      "offline_access",
      "User.Read",
      "Mail.Send",
    ].join(" "),
    state,
  });

  return `https://login.microsoftonline.com/${outlookTenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ ok: false, error: "Missing Supabase env vars" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ ok: false, error: "Missing Authorization header" }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const provider = body.provider as Provider;
    const orgId = body.org_id || body.orgId;

    if (!provider || !["gmail", "outlook"].includes(provider)) {
      return json({ ok: false, error: "Invalid provider" }, 400);
    }
    if (!orgId || typeof orgId !== "string") {
      return json({ ok: false, error: "Missing org_id" }, 400);
    }

    const statePayload = {
      user_id: user.id,
      org_id: orgId,
      provider,
      nonce: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    const state = base64UrlEncode(JSON.stringify(statePayload));

    const authUrl =
      provider === "gmail"
        ? buildGmailAuthUrl(state)
        : buildOutlookAuthUrl(state);

    return json({ ok: true, provider, auth_url: authUrl });
  } catch (error) {
    console.error("email-oauth-start error", error);
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "OAuth start failed",
      },
      500,
    );
  }
});
