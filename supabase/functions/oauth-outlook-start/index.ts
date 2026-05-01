// Phase A — Outlook OAuth start.
//
// Authenticated POST. Returns { url } pointing at Microsoft's consent
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

const OUTLOOK_SCOPES = [
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
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
    const clientId = Deno.env.get("OUTLOOK_CLIENT_ID");
    const redirectUri = Deno.env.get("OUTLOOK_REDIRECT_URI");
    const tenant = Deno.env.get("OUTLOOK_TENANT") || "common";
    const stateSecret = Deno.env.get("OAUTH_STATE_SECRET");

    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: "Missing Supabase environment variables" }, 500);
    }
    if (!clientId || !redirectUri) {
      return json({ error: "Missing OUTLOOK_CLIENT_ID / OUTLOOK_REDIRECT_URI" }, 500);
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

    const state = await signState(user.id, "outlook", stateSecret);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OUTLOOK_SCOPES.join(" "),
      response_mode: "query",
      prompt: "consent",
      state,
    });
    const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params.toString()}`;

    return json({ url });
  } catch (e) {
    console.error("[oauth-outlook-start] fatal", e);
    return json({ error: "Internal error" }, 500);
  }
});