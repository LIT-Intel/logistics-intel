// pulse-map-selections-list — list the authenticated user's saved Pulse
// Explorer map views, newest first.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: "supabase_env_missing" }, 500);
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  const token = auth.replace(/^Bearer\s+/i, "").trim();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let userId: string | null = null;
  try {
    const { data: u } = await admin.auth.getUser(token);
    userId = u?.user?.id ?? null;
  } catch {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }
  if (!userId) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const { data, error } = await admin
    .from("lit_pulse_map_selections")
    .select("id, name, filters, selection_ids, map_state, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[pulse-map-selections-list] read failed", error);
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
  return jsonResponse({ ok: true, selections: data ?? [] });
});
