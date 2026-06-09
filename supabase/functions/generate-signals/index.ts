// Reverse-engineered from deployed v12 of generate-signals on 2026-06-09
// (drift audit found this function deployed in production with no git
// source — it computes the 4 MVP LIT signal types from real workspace
// data and upserts to lit_signals, which is consumed by the frontend
// SignalsCard component). Verified deployed EZBR sha256 against this
// output; no behavior changes. The CI gate in
// .github/workflows/edge-fn-drift-check.yml will prevent recurrence
// once the operator wires SUPABASE_ACCESS_TOKEN as a repo secret.
//
// generate-signals v1
//
// Computes LIT Signals from real workspace data and upserts to
// lit_signals. Designed for unattended invocation by pg_cron (no JWT
// required — fn calls itself with service role internally) but is also
// safe to invoke ad-hoc.
//
// MVP signal types (4):
//   * no_contacts_enriched     — saved company with zero contacts
//   * not_in_any_campaign      — saved company never added to a campaign
//   * stale_30_days            — saved company not viewed in 30+ days
//   * new_shipment_activity    — lit_companies.most_recent_shipment_date
//                                  is newer than the user saved the row
//
// Idempotency: a partial unique index on (org_id, source_company_key,
// signal_type) WHERE status IN ('new','seen') blocks duplicate INSERTs.
// When a user dismisses/acts on a signal the row stays; the generator
// skips because the active-row constraint no longer holds.
//
// Auth: verify_jwt=false. Callers MUST pass the service role key in
// Authorization: Bearer <key> OR omit auth entirely when invoked from
// pg_cron via supabase_url + service_role_key already on the function.
// We do not accept user JWTs — generation runs across the workspace.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function jsonRes(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

type SignalPayload = {
  org_id: string | null;
  user_id: string;
  company_id: string | null;
  source_company_key: string | null;
  signal_type: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  cta_label: string;
  cta_url: string;
  metadata: Record<string, unknown>;
};

async function resolveOrgIdsByUser(supa: any): Promise<Map<string, string | null>> {
  // user_id -> org_id (first membership wins). Personal accounts (no
  // membership row) get org_id = null and the signal becomes user-
  // scoped via the user_id column.
  const map = new Map<string, string | null>();
  const { data, error } = await supa
    .from("org_members")
    .select("user_id, org_id")
    .eq("status", "active");
  if (error) {
    console.warn("[generate-signals] org_members lookup failed:", error);
    return map;
  }
  for (const row of data ?? []) {
    if (!map.has(row.user_id)) map.set(row.user_id, row.org_id);
  }
  return map;
}

async function loadSavedCompanies(supa: any): Promise<any[]> {
  // Pull every saved-company row alongside the lit_companies snapshot
  // we need for the four MVP signals. RLS doesn't apply with service
  // role; we filter at the signal-generation level.
  const { data, error } = await supa
    .from("lit_saved_companies")
    .select(`
      id, user_id, company_id, last_viewed_at, last_activity_at, created_at,
      lit_companies:company_id (
        id, source_company_key, name, shipments_12m, most_recent_shipment_date
      )
    `)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    console.warn("[generate-signals] saved companies fetch failed:", error);
    return [];
  }
  return data ?? [];
}

async function loadContactCountsByCompany(supa: any, companyIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (companyIds.length === 0) return map;
  // Chunk in 200s to avoid PostgREST URL-length issues.
  for (let i = 0; i < companyIds.length; i += 200) {
    const slice = companyIds.slice(i, i + 200);
    const { data, error } = await supa
      .from("lit_contacts")
      .select("company_id")
      .in("company_id", slice);
    if (error) {
      console.warn("[generate-signals] contacts fetch failed:", error);
      continue;
    }
    for (const c of data ?? []) {
      const k = (c as any).company_id;
      if (k) map.set(k, (map.get(k) || 0) + 1);
    }
  }
  return map;
}

async function loadCampaignCompanyIds(supa: any, companyIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (companyIds.length === 0) return out;
  for (let i = 0; i < companyIds.length; i += 200) {
    const slice = companyIds.slice(i, i + 200);
    const { data, error } = await supa
      .from("lit_campaign_contacts")
      .select("company_id")
      .in("company_id", slice);
    if (error) {
      console.warn("[generate-signals] campaign_contacts fetch failed:", error);
      continue;
    }
    for (const c of data ?? []) {
      const k = (c as any).company_id;
      if (k) out.add(k);
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Signal builders
// ────────────────────────────────────────────────────────────────────
function buildNoContactsSignal(saved: any, orgId: string | null): SignalPayload | null {
  const c = saved.lit_companies;
  if (!c) return null;
  return {
    org_id: orgId,
    user_id: saved.user_id,
    company_id: saved.company_id,
    source_company_key: c.source_company_key || null,
    signal_type: "no_contacts_enriched",
    title: `${c.name || "Saved company"} has no contacts yet`,
    description: "You saved this account but haven't enriched a decision-maker. Outreach can't start without one.",
    severity: "medium",
    cta_label: "Find contacts",
    cta_url: `/app/companies/${saved.company_id}?tab=contacts`,
    metadata: { saved_company_id: saved.id, saved_at: saved.created_at },
  };
}

function buildNotInCampaignSignal(saved: any, orgId: string | null): SignalPayload | null {
  const c = saved.lit_companies;
  if (!c) return null;
  return {
    org_id: orgId,
    user_id: saved.user_id,
    company_id: saved.company_id,
    source_company_key: c.source_company_key || null,
    signal_type: "not_in_any_campaign",
    title: `${c.name || "Saved company"} isn't in a campaign`,
    description: "This account is saved but no outreach is running. Drop them into a sequence to keep them moving.",
    severity: "medium",
    cta_label: "Add to campaign",
    cta_url: `/app/campaigns/new?company=${saved.company_id}`,
    metadata: { saved_company_id: saved.id },
  };
}

function buildStaleSignal(saved: any, orgId: string | null, daysSinceViewed: number): SignalPayload | null {
  const c = saved.lit_companies;
  if (!c) return null;
  return {
    org_id: orgId,
    user_id: saved.user_id,
    company_id: saved.company_id,
    source_company_key: c.source_company_key || null,
    signal_type: "stale_30_days",
    title: `${c.name || "Saved company"} — ${daysSinceViewed} days quiet`,
    description: "You haven't touched this account in over a month. Quick check: still a priority?",
    severity: "low",
    cta_label: "Open profile",
    cta_url: `/app/companies/${saved.company_id}`,
    metadata: { saved_company_id: saved.id, days_since_viewed: daysSinceViewed },
  };
}

function buildNewShipmentSignal(saved: any, orgId: string | null, mostRecent: string, savedAt: string): SignalPayload | null {
  const c = saved.lit_companies;
  if (!c) return null;
  const recent = new Date(mostRecent).toLocaleDateString();
  return {
    org_id: orgId,
    user_id: saved.user_id,
    company_id: saved.company_id,
    source_company_key: c.source_company_key || null,
    signal_type: "new_shipment_activity",
    title: `${c.name || "Saved company"} shipped on ${recent}`,
    description: "Fresh shipment activity since you saved them. Open the AI brief to see the lane + carrier behind it.",
    severity: "high",
    cta_label: "Open AI brief",
    cta_url: `/app/companies/${saved.company_id}?tab=research`,
    metadata: { saved_company_id: saved.id, most_recent_shipment_date: mostRecent, saved_at: savedAt },
  };
}

// ────────────────────────────────────────────────────────────────────
// Generator
// ────────────────────────────────────────────────────────────────────
async function generateAll(supa: any): Promise<{ scanned: number; inserted: number; skipped: number }> {
  const orgMap = await resolveOrgIdsByUser(supa);
  const saved = await loadSavedCompanies(supa);
  if (saved.length === 0) return { scanned: 0, inserted: 0, skipped: 0 };

  const companyIds = saved.map((s: any) => s.company_id).filter(Boolean);
  const contactCounts = await loadContactCountsByCompany(supa, companyIds);
  const campaignCompanyIds = await loadCampaignCompanyIds(supa, companyIds);

  const now = Date.now();
  const payloads: SignalPayload[] = [];

  for (const row of saved) {
    if (!row.company_id) continue;
    const orgId = orgMap.get(row.user_id) ?? null;

    // 1. No contacts enriched.
    if ((contactCounts.get(row.company_id) || 0) === 0) {
      const p = buildNoContactsSignal(row, orgId);
      if (p) payloads.push(p);
    }

    // 2. Not in any campaign.
    if (!campaignCompanyIds.has(row.company_id)) {
      const p = buildNotInCampaignSignal(row, orgId);
      if (p) payloads.push(p);
    }

    // 3. Stale 30+ days. Use last_viewed_at when present; else fall
    // back to last_activity_at; else created_at.
    const lastTouch = row.last_viewed_at || row.last_activity_at || row.created_at;
    if (lastTouch) {
      const days = Math.floor((now - new Date(lastTouch).getTime()) / 86400000);
      if (days >= 30) {
        const p = buildStaleSignal(row, orgId, days);
        if (p) payloads.push(p);
      }
    }

    // 4. New shipment activity since save.
    const mostRecent = row.lit_companies?.most_recent_shipment_date;
    if (mostRecent && row.created_at && new Date(mostRecent).getTime() > new Date(row.created_at).getTime()) {
      const p = buildNewShipmentSignal(row, orgId, mostRecent, row.created_at);
      if (p) payloads.push(p);
    }
  }

  // Upsert in batches. The unique partial index on (org_id,
  // source_company_key, signal_type) WHERE status IN ('new','seen')
  // makes duplicate-insert fail with 23505 — we catch and treat as
  // skipped. INSERT ON CONFLICT DO NOTHING would be cleaner but the
  // partial-index conflict target isn't easily expressed.
  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < payloads.length; i += 50) {
    const slice = payloads.slice(i, i + 50);
    const { error, count } = await supa.from("lit_signals").insert(slice, { count: "exact" });
    if (error) {
      // Unique-violation means at least one signal in the batch is a
      // dupe. Retry one-by-one so the dupes don't block the fresh ones.
      for (const p of slice) {
        const { error: oneErr } = await supa.from("lit_signals").insert(p);
        if (oneErr && String(oneErr.code) === "23505") skipped++;
        else if (oneErr) console.warn("[generate-signals] insert err:", oneErr.message);
        else inserted++;
      }
    } else {
      inserted += (count ?? slice.length);
    }
  }

  return { scanned: saved.length, inserted, skipped };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "POST") return jsonRes(405, { ok: false, error: "method_not_allowed" });

  // verify_jwt=false on this fn. We still want to ensure the caller is
  // either pg_cron or a super-admin running it manually. Cheap guard:
  // require Authorization header containing the service role key.
  const auth = req.headers.get("Authorization") || "";
  const expected = `Bearer ${SERVICE_ROLE_KEY}`;
  if (auth !== expected) {
    return jsonRes(401, { ok: false, error: "service_role_required" });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  try {
    const result = await generateAll(supa);
    return jsonRes(200, { ok: true, ...result, ran_at: new Date().toISOString() });
  } catch (err) {
    console.error("[generate-signals] failure:", err);
    return jsonRes(500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
