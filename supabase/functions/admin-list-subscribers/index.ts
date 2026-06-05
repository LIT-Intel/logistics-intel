// admin-list-subscribers — cross-tool moat panel data source.
//
// Joins three systems so a platform admin can see, per user, the full
// lifecycle picture without bouncing between dashboards:
//
//   1. Supabase auth — id, email, last_sign_in_at, created_at
//   2. LIT product usage — lit_saved_companies (saves) + lit_pulse_search_events
//   3. Attio CRM — Person → Deal stage + last_touch
//
// This is the "moat" view: a single user row tells you they're trial,
// they searched 14 times last week, they saved 3 companies, and their
// Attio deal is sitting at Demo Scheduled. That cross-tool join is what
// sales would otherwise stitch by hand.
//
// Auth: platform_admin only (verified server-side via platform_admins
// table). Falls back to 403 for org-admins.
//
// Cost shape: one auth.admin.listUsers, two indexed SELECTs against
// LIT tables, one POST to Attio People query, one POST to Attio Deals
// query. All bounded to 500 rows. Acceptable for v1 — when subscriber
// list exceeds ~200, paginate the Attio queries (out of scope here).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger, requestId } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const ATTIO_BASE = "https://api.attio.com/v2";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SubscriberRow = {
  userId: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  plan: string;
  orgName: string | null;
  saves: number;
  lastSaveAt: string | null;
  searches: number;
  lastSearchAt: string | null;
  attio: {
    personId: string | null;
    dealId: string | null;
    dealName: string | null;
    stage: string | null;
    lastTouchAt: string | null;
  };
};

type AuthUser = {
  id: string;
  email?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
};

function attioHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

/**
 * Batch-fetch Attio People records whose email_addresses match the given
 * list. Attio's query API accepts up to ~500 records per page; we cap the
 * batch size at 100 emails per request to keep individual payloads small.
 */
async function fetchAttioPeopleByEmail(
  apiKey: string,
  emails: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>(); // email (lowercase) → person record_id
  if (!emails.length) return out;

  const BATCH = 100;
  for (let i = 0; i < emails.length; i += BATCH) {
    const slice = emails.slice(i, i + BATCH);
    const body = {
      filter: {
        $or: slice.map((e) => ({ email_addresses: { $eq: e } })),
      },
      limit: 500,
    };
    const res = await fetch(`${ATTIO_BASE}/objects/people/records/query`, {
      method: "POST",
      headers: attioHeaders(apiKey),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Attio people query ${res.status}: ${text.slice(0, 240)}`);
    }
    const data = (await res.json()) as {
      data?: Array<{
        id?: { record_id?: string };
        values?: { email_addresses?: Array<{ email_address?: string }> };
      }>;
    };
    for (const row of data.data ?? []) {
      const pid = row.id?.record_id;
      if (!pid) continue;
      for (const ea of row.values?.email_addresses ?? []) {
        const addr = (ea.email_address || "").toLowerCase();
        if (addr) out.set(addr, pid);
      }
    }
  }
  return out;
}

/**
 * Fetch every deal in the workspace (up to 500) and build a personId → deal
 * map. For users with multiple deals, the highest-priority active deal wins
 * (Negotiation > Trial Active > Trial Started > Demo Scheduled > Qualified
 * > Lead). Won/Lost are kept as terminal states but rank lowest so an
 * active deal always shadows a closed one.
 */
const STAGE_PRIORITY: Record<string, number> = {
  "Negotiation": 60,
  "Trial Active": 50,
  "Trial Started": 40,
  "Demo Scheduled": 30,
  "Qualified": 20,
  "Lead": 10,
  "Won": 5,
  "Lost": 1,
};

type AttioDealSummary = {
  dealId: string;
  dealName: string;
  stage: string;
  lastTouchAt: string | null;
};

async function fetchAttioDealsByPerson(
  apiKey: string,
): Promise<Map<string, AttioDealSummary>> {
  const out = new Map<string, AttioDealSummary>();
  const body = { limit: 500, sorts: [{ attribute: "created_at", direction: "desc" }] };
  const res = await fetch(`${ATTIO_BASE}/objects/deals/records/query`, {
    method: "POST",
    headers: attioHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Attio deals query ${res.status}: ${text.slice(0, 240)}`);
  }
  const data = (await res.json()) as {
    data?: Array<{
      id?: { record_id?: string };
      values?: {
        name?: Array<{ value?: string }>;
        stage?: Array<{ status?: { title?: string } }>;
        last_touch?: Array<{ value?: string | null }>;
        associated_people?: Array<{ target_record_id?: string }>;
      };
    }>;
  };
  for (const row of data.data ?? []) {
    const dealId = row.id?.record_id;
    if (!dealId) continue;
    const dealName = row.values?.name?.[0]?.value ?? "Unnamed deal";
    const stage = row.values?.stage?.[0]?.status?.title ?? "Unknown";
    const lastTouchAt = row.values?.last_touch?.[0]?.value ?? null;
    const linkedPeople = row.values?.associated_people ?? [];
    const summary: AttioDealSummary = { dealId, dealName, stage, lastTouchAt };
    for (const link of linkedPeople) {
      const pid = link.target_record_id;
      if (!pid) continue;
      const existing = out.get(pid);
      if (!existing || (STAGE_PRIORITY[stage] ?? 0) > (STAGE_PRIORITY[existing.stage] ?? 0)) {
        out.set(pid, summary);
      }
    }
  }
  return out;
}

serve(async (req) => {
  const log = createLogger("admin-list-subscribers", { request_id: requestId() });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const attioApiKey = Deno.env.get("ATTIO_API_KEY");

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    log.error("server_misconfigured", { err: "missing Supabase env" });
    return json({ error: "Server misconfigured" }, 500);
  }

  // Auth — validate JWT then verify platform_admins membership.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    log.warn("unauthorized", { err: authError?.message });
    return json({ error: "Unauthorized" }, 401);
  }
  const { data: adminRow } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) {
    log.warn("forbidden_non_admin", { user_id: user.id });
    return json({ error: "Forbidden: platform admin required" }, 403);
  }

  // 1. Auth users — first page covers up to 1000; tighten when scale demands.
  const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });
  if (listErr) {
    log.error("auth_list_failed", { err: listErr.message });
    return json({ error: "Failed to list users" }, 500);
  }
  const users: AuthUser[] = (usersPage.users ?? []) as AuthUser[];
  const userIds = users.map((u) => u.id);
  const emails = users
    .map((u) => (u.email || "").toLowerCase())
    .filter((e) => e.length > 0);

  // 2. LIT usage signals — single grouped fetches, aggregate client-side.
  // `lit_saved_companies` and `lit_pulse_search_events` are both indexed on
  // user_id; the row counts here are typically in the low thousands, so
  // pulling rows and aggregating in JS is simpler than juggling RPC.
  // Org membership: org_members → organizations (FK on org_id). Subscriptions
  // are keyed to organizations (FK on organization_id), so we fetch them
  // separately by org_id rather than relying on PostgREST to infer a
  // 3-table chain through org_members → organizations → subscriptions.
  const [savesRes, searchesRes, orgsRes] = await Promise.all([
    admin
      .from("lit_saved_companies")
      .select("user_id, created_at")
      .in("user_id", userIds)
      .limit(5000),
    admin
      .from("lit_pulse_search_events")
      .select("user_id, created_at")
      .in("user_id", userIds)
      .limit(5000),
    admin
      .from("org_members")
      .select("user_id, org_id, organizations(name)")
      .in("user_id", userIds),
  ]);

  const orgIds = Array.from(
    new Set(
      ((orgsRes.data as Array<{ org_id: string }>) ?? [])
        .map((r) => r.org_id)
        .filter(Boolean),
    ),
  );
  const subsRes = orgIds.length
    ? await admin
        .from("subscriptions")
        .select("organization_id, plan_code")
        .in("organization_id", orgIds)
    : { data: [] as Array<{ organization_id: string; plan_code: string }>, error: null };
  const planByOrg = new Map<string, string>();
  for (const row of (subsRes.data as Array<{ organization_id: string; plan_code: string }>) ?? []) {
    if (row.plan_code && !planByOrg.has(row.organization_id)) {
      planByOrg.set(row.organization_id, row.plan_code);
    }
  }

  const savesByUser = new Map<string, { count: number; latest: string | null }>();
  for (const row of (savesRes.data as Array<{ user_id: string; created_at: string }>) ?? []) {
    const cur = savesByUser.get(row.user_id) ?? { count: 0, latest: null };
    cur.count += 1;
    if (!cur.latest || row.created_at > cur.latest) cur.latest = row.created_at;
    savesByUser.set(row.user_id, cur);
  }

  const searchesByUser = new Map<string, { count: number; latest: string | null }>();
  for (const row of (searchesRes.data as Array<{ user_id: string; created_at: string }>) ?? []) {
    if (!row.user_id) continue;
    const cur = searchesByUser.get(row.user_id) ?? { count: 0, latest: null };
    cur.count += 1;
    if (!cur.latest || row.created_at > cur.latest) cur.latest = row.created_at;
    searchesByUser.set(row.user_id, cur);
  }

  const orgByUser = new Map<string, string>();
  const orgIdByUser = new Map<string, string>();
  for (const row of (orgsRes.data as Array<{ user_id: string; org_id: string; organizations: { name?: string } | null }>) ?? []) {
    const name = row.organizations?.name;
    if (name && !orgByUser.has(row.user_id)) orgByUser.set(row.user_id, name);
    if (row.org_id && !orgIdByUser.has(row.user_id)) orgIdByUser.set(row.user_id, row.org_id);
  }
  const planByUser = new Map<string, string>();
  for (const [userId, orgId] of orgIdByUser.entries()) {
    const plan = planByOrg.get(orgId);
    if (plan) planByUser.set(userId, plan);
  }

  // 3. Attio enrichment — best-effort. If the API key is missing or the
  // call fails, we still return the LIT-side data so the page renders.
  let attioPeople = new Map<string, string>();
  let attioDealsByPerson = new Map<string, AttioDealSummary>();
  let attioError: string | null = null;
  if (attioApiKey && emails.length > 0) {
    try {
      [attioPeople, attioDealsByPerson] = await Promise.all([
        fetchAttioPeopleByEmail(attioApiKey, emails),
        fetchAttioDealsByPerson(attioApiKey),
      ]);
    } catch (e) {
      attioError = e instanceof Error ? e.message : String(e);
      log.warn("attio_enrichment_failed", { err: attioError });
    }
  } else if (!attioApiKey) {
    attioError = "ATTIO_API_KEY not configured";
  }

  // 4. Compose rows.
  const rows: SubscriberRow[] = users.map((u) => {
    const email = (u.email || "").toLowerCase() || null;
    const saves = savesByUser.get(u.id);
    const searches = searchesByUser.get(u.id);
    const personId = email ? attioPeople.get(email) ?? null : null;
    const deal = personId ? attioDealsByPerson.get(personId) : undefined;
    return {
      userId: u.id,
      email,
      createdAt: u.created_at ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
      plan: planByUser.get(u.id) ?? "free_trial",
      orgName: orgByUser.get(u.id) ?? null,
      saves: saves?.count ?? 0,
      lastSaveAt: saves?.latest ?? null,
      searches: searches?.count ?? 0,
      lastSearchAt: searches?.latest ?? null,
      attio: {
        personId,
        dealId: deal?.dealId ?? null,
        dealName: deal?.dealName ?? null,
        stage: deal?.stage ?? null,
        lastTouchAt: deal?.lastTouchAt ?? null,
      },
    };
  });

  // Sort: most-recently-signed-in first; users who never signed in go last.
  rows.sort((a, b) => {
    const at = a.lastSignInAt ? Date.parse(a.lastSignInAt) : 0;
    const bt = b.lastSignInAt ? Date.parse(b.lastSignInAt) : 0;
    return bt - at;
  });

  log.info("list_completed", {
    user_count: rows.length,
    with_attio_person: rows.filter((r) => r.attio.personId).length,
    with_attio_deal: rows.filter((r) => r.attio.dealId).length,
    attio_error: attioError,
  });

  return json({
    ok: true,
    rows,
    meta: {
      totalUsers: rows.length,
      attioPersonMatches: rows.filter((r) => r.attio.personId).length,
      attioDealMatches: rows.filter((r) => r.attio.dealId).length,
      attioError,
      generatedAt: new Date().toISOString(),
    },
  });
});
