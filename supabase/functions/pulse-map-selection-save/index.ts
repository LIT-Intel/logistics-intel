// pulse-map-selection-save — persist a saved Pulse Explorer map view.
//
// Stores filters + selection IDs + map_state (zoom/center/color/size modes)
// under lit_pulse_map_selections. Auto-suffixes names that collide for the
// same user. Returns the saved row.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

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

  let body: any = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const { id, name, filters, selection_ids, map_state, org_id } = body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return jsonResponse({ ok: false, error: "name_required" }, 400);
  }

  // Auto-suffix on name collision (per-user uniqueness; skip if updating
  // the same id with the same name).
  let attemptName = name.trim();
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await admin
      .from("lit_pulse_map_selections")
      .select("id")
      .eq("user_id", userId)
      .eq("name", attemptName)
      .maybeSingle();
    if (!existing || existing.id === id) break;
    attemptName = `${name.trim()} (${i + 2})`;
  }

  const payload = {
    user_id: userId,
    org_id: org_id ?? null,
    name: attemptName,
    filters: filters ?? {},
    selection_ids: Array.isArray(selection_ids) ? selection_ids : [],
    map_state: map_state ?? {},
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? admin.from("lit_pulse_map_selections").update(payload).eq("id", id).eq("user_id", userId)
    : admin.from("lit_pulse_map_selections").insert(payload);
  const { data, error } = await query.select().single();
  if (error) {
    console.error("[pulse-map-selection-save] write failed", error);
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
  return jsonResponse({ ok: true, selection: data });
});
