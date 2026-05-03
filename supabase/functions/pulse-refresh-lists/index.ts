// pulse-refresh-lists — cache-only auto-refresh worker for Pulse
// Saved Lists. Designed to be invoked by pg_cron on a schedule.
//
// Two invocation modes:
//   1. Service role (cron / admin) → loops every list with
//      auto_refresh_cadence != 'off' that's due for a refresh
//      based on its cadence + last_auto_refresh_at.
//   2. User auth (manual UI trigger) → only refreshes lists owned
//      by the calling user with auto_refresh_cadence != 'off'.
//
// Cache-only: searches lit_companies via ILIKE on tokenized query
// keywords. Apollo (paid) is NOT invoked here — manual Refresh in
// the UI keeps the full cascade. This keeps the cron cost-free.
//
// For each list:
//   - Tokenize the saved query_text (drop common stopwords)
//   - SELECT from lit_companies WHERE name/city/state/etc ILIKE %tok%
//     respecting any structured destination filters baked into the
//     stored filter_recipe (countries, states)
//   - Diff against existing pulse_list_companies + pulse_list_inbox
//   - Insert new matches into pulse_list_inbox with status='pending'
//   - Stamp last_auto_refresh_at + last_auto_refresh_added

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Per-list match cap so a list with a generic query can't flood
// the inbox with thousands of rows.
const MAX_MATCHES_PER_LIST = 50;
// Per-run list cap so the worker has bounded latency even if the
// queue grows large.
const MAX_LISTS_PER_RUN = 100;

const STOPWORDS = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "by", "companies",
  "company", "find", "for", "from", "give", "have", "i", "in", "is",
  "it", "large", "list", "me", "near", "of", "or", "show", "similar",
  "some", "that", "the", "their", "to", "top", "us", "use", "who",
  "with", "want", "need", "looking", "importing", "exporting", "shipping",
  "importer", "importers", "exporter", "exporters", "shipper", "shippers",
  "automotive", "parts", "industries", "products",
]);

function tokenize(query: string): string[] {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t && t.length > 2 && !STOPWORDS.has(t));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ListRow {
  id: string;
  user_id: string;
  query_text: string | null;
  filter_recipe: { countries?: string[]; states?: string[] } | null;
  auto_refresh_cadence: "off" | "daily" | "weekly";
  last_auto_refresh_at: string | null;
}

function isDue(list: ListRow): boolean {
  if (list.auto_refresh_cadence === "off") return false;
  if (!list.last_auto_refresh_at) return true;
  const last = new Date(list.last_auto_refresh_at).getTime();
  const ageHours = (Date.now() - last) / 3600_000;
  if (list.auto_refresh_cadence === "daily") return ageHours >= 22; // ~daily, allow 2h slack
  if (list.auto_refresh_cadence === "weekly") return ageHours >= 24 * 6.5;
  return false;
}

async function refreshOneList(
  admin: ReturnType<typeof createClient>,
  list: ListRow,
): Promise<{ added: number; status: string }> {
  if (!list.query_text) {
    return { added: 0, status: "skipped: no source query" };
  }
  const tokens = tokenize(list.query_text);
  if (!tokens.length) {
    return { added: 0, status: "skipped: no actionable tokens" };
  }

  // Build OR ILIKE filter (mirrors the client-side cache-first lookup).
  const cols = ["name", "city", "state", "country_code", "address_line1", "domain"];
  const orParts: string[] = [];
  for (const t of tokens) {
    const safe = t.replace(/[%,]/g, " ");
    for (const c of cols) orParts.push(`${c}.ilike.%${safe}%`);
  }
  const orFilter = orParts.join(",");

  let q = admin
    .from("lit_companies")
    .select("id, name, city, state, country_code")
    .or(orFilter)
    .order("shipments_12m", { ascending: false, nullsFirst: false })
    .limit(MAX_MATCHES_PER_LIST);

  // Apply structured filters from filter_recipe if present.
  if (list.filter_recipe?.countries?.length) {
    q = q.in("country_code", list.filter_recipe.countries);
  }
  if (list.filter_recipe?.states?.length) {
    q = q.in("state", list.filter_recipe.states);
  }

  const { data: matches, error } = await q;
  if (error) {
    console.error(`[pulse-refresh-lists] match query failed for ${list.id}:`, error);
    return { added: 0, status: `error: ${error.message}` };
  }
  if (!matches?.length) {
    return { added: 0, status: "no matches" };
  }

  // Fetch existing membership + inbox rows for this list to dedupe.
  const matchIds = matches.map((m) => m.id);
  const { data: existingMembers } = await admin
    .from("pulse_list_companies")
    .select("company_id")
    .eq("list_id", list.id)
    .in("company_id", matchIds);
  const { data: existingInbox } = await admin
    .from("pulse_list_inbox")
    .select("company_id")
    .eq("list_id", list.id)
    .in("company_id", matchIds);

  const seen = new Set<string>([
    ...(existingMembers || []).map((r: any) => r.company_id),
    ...(existingInbox || []).map((r: any) => r.company_id),
  ]);

  const newRows = matches
    .filter((m) => !seen.has(m.id))
    .map((m) => ({
      list_id: list.id,
      company_id: m.id,
      status: "pending",
      match_reason: buildMatchReason(m, tokens),
    }));

  if (!newRows.length) {
    return { added: 0, status: "no new matches" };
  }

  const { error: insertErr } = await admin
    .from("pulse_list_inbox")
    .upsert(newRows, { onConflict: "list_id,company_id" });
  if (insertErr) {
    console.error(`[pulse-refresh-lists] inbox insert failed for ${list.id}:`, insertErr);
    return { added: 0, status: `error: ${insertErr.message}` };
  }

  return { added: newRows.length, status: "ok" };
}

function buildMatchReason(
  company: { name: string; city: string | null; state: string | null },
  tokens: string[],
): string {
  // Best-effort: which tokens matched which fields. Capped to keep
  // the column readable in the UI.
  const parts: string[] = [];
  const lc = `${company.name} ${company.city || ""} ${company.state || ""}`.toLowerCase();
  for (const t of tokens.slice(0, 4)) {
    if (lc.includes(t)) parts.push(t);
  }
  return parts.length ? `matched: ${parts.join(", ")}` : "keyword match";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, code: "METHOD_NOT_ALLOWED", message: "POST only." },
      405,
    );
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(
      { ok: false, code: "NOT_CONFIGURED", message: "Server is missing Supabase credentials." },
      500,
    );
  }

  // Parse body — { user_only?: boolean, list_id?: string }
  let body: { user_only?: boolean; list_id?: string } = {};
  try {
    body = (await req.json()) || {};
  } catch {
    body = {};
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // If a JWT is present, scope to that user's lists. Otherwise
  // require the caller to be using the service role (the cron path).
  let scopedUserId: string | null = null;
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token && token !== SERVICE_ROLE_KEY) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userResp } = await userClient.auth.getUser();
      if (!userResp?.user?.id) {
        return jsonResponse(
          { ok: false, code: "UNAUTHORIZED", message: "Invalid token." },
          401,
        );
      }
      scopedUserId = userResp.user.id;
    }
  } else if (body.user_only) {
    return jsonResponse(
      { ok: false, code: "UNAUTHORIZED", message: "Auth required for user_only mode." },
      401,
    );
  }

  // Build the candidate-list query
  let query = admin
    .from("pulse_lists")
    .select("id, user_id, query_text, filter_recipe, auto_refresh_cadence, last_auto_refresh_at")
    .neq("auto_refresh_cadence", "off")
    .limit(MAX_LISTS_PER_RUN);

  if (scopedUserId) query = query.eq("user_id", scopedUserId);
  if (body.list_id) query = query.eq("id", body.list_id);

  const { data: lists, error: listsErr } = await query;
  if (listsErr) {
    console.error("[pulse-refresh-lists] candidate query failed:", listsErr);
    return jsonResponse(
      { ok: false, code: "QUERY_FAILED", message: listsErr.message },
      500,
    );
  }

  const due = (lists || []).filter((l: any) => body.list_id || isDue(l as ListRow));

  const results: Array<{ list_id: string; added: number; status: string }> = [];
  let totalAdded = 0;
  for (const list of due) {
    const out = await refreshOneList(admin, list as ListRow);
    results.push({ list_id: (list as ListRow).id, added: out.added, status: out.status });
    totalAdded += out.added;
    await admin
      .from("pulse_lists")
      .update({
        last_auto_refresh_at: new Date().toISOString(),
        last_auto_refresh_status: out.status,
        last_auto_refresh_added: out.added,
      })
      .eq("id", (list as ListRow).id);
  }

  return jsonResponse({
    ok: true,
    scope: scopedUserId ? "user" : "all",
    lists_considered: lists?.length || 0,
    lists_run: results.length,
    total_added: totalAdded,
    results,
  });
});
