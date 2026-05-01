// Phase A — Gmail OAuth start.
//
// Authenticated POST. Returns { url } pointing at Google's consent
// screen. The caller (frontend) does `window.location.href = url`.
//
// State is HMAC-signed with OAUTH_STATE_SECRET so the callback can
// extract the original user_id without a DB lookup or trusting the
// query string. See _shared/oauth-state.ts.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { signState } from "../_shared/oauth-state.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const clientId = Deno.env.get("GMAIL_CLIENT_ID");
    // Tolerate either secret name; GMAIL_REDIRECT_URI is the canonical name,
    // GMAIL_REDIRECT_URL kept as fallback for environments still using that.
    const redirectUri =
      Deno.env.get("GMAIL_REDIRECT_URI") ?? Deno.env.get("GMAIL_REDIRECT_URL");
    const stateSecret = Deno.env.get("OAUTH_STATE_SECRET");

    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: "Missing Supabase environment variables" }, 500);
    }
    if (!clientId || !redirectUri) {
      return json({ error: "Missing Gmail redirect URI. Set GMAIL_REDIRECT_URI or GMAIL_REDIRECT_URL." }, 500);
    }
    if (!stateSecret) return json({ error: "Missing OAUTH_STATE_SECRET" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const state = await signState(user.id, "gmail", stateSecret);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return json({ url });
  } catch (e) {
    console.error("[oauth-gmail-start] fatal", e);
    return json({ error: "Internal error" }, 500);
  }
});