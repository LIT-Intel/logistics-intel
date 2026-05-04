// queue-campaign-recipients — called when the user clicks Launch on a
// campaign. Builds the recipient roster from the campaign's attached
// companies (lit_campaign_companies → lit_contacts) and writes one
// lit_campaign_contacts row per contact-with-email, status='pending',
// next_send_at=now() so the dispatcher picks them up on the next tick.
//
// Authenticated POST. Body: { campaign_id: uuid }.
// Returns: { ok, queued: number, skipped: number, errors: string[] }
//
// Uses service-role for the insert because lit_campaign_contacts RLS
// checks org_id IN org_members — caller's session may not satisfy that
// for every contact (e.g., a contact owned by a different org member).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ ok: false, error: "missing_auth" }, 401);

  // Validate the user owns / can launch this campaign via their session.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ ok: false, error: "unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const campaignId = String(body?.campaign_id || "").trim();
  if (!campaignId) return json({ ok: false, error: "missing_campaign_id" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // 1. Verify the campaign belongs to the caller (lit_campaigns.user_id).
  const { data: camp, error: campErr } = await admin
    .from("lit_campaigns")
    .select("id, user_id, name")
    .eq("id", campaignId)
    .maybeSingle();
  if (campErr || !camp) return json({ ok: false, error: "campaign_not_found" }, 404);
  if (camp.user_id !== user.id) return json({ ok: false, error: "forbidden" }, 403);

  // 2. Resolve the caller's org_id (RLS on the new roster table requires it).
  const { data: member } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const orgId = member?.org_id ?? null;

  // 3. Pull attached companies.
  const { data: campCompanies, error: ccErr } = await admin
    .from("lit_campaign_companies")
    .select("company_id")
    .eq("campaign_id", campaignId);
  if (ccErr) return json({ ok: false, error: ccErr.message }, 500);

  const companyIds = (campCompanies ?? []).map((c: any) => c.company_id).filter(Boolean);
  if (companyIds.length === 0) {
    return json({ ok: true, queued: 0, skipped: 0, errors: [] });
  }

  // 4. Pull contacts for those companies that have an email address.
  const { data: contacts, error: contactErr } = await admin
    .from("lit_contacts")
    .select("id, company_id, email, first_name, last_name, full_name, title, linkedin_url, phone")
    .in("company_id", companyIds)
    .not("email", "is", null);
  if (contactErr) return json({ ok: false, error: contactErr.message }, 500);

  if (!contacts || contacts.length === 0) {
    return json({ ok: true, queued: 0, skipped: 0, errors: ["no_contacts_with_email"] });
  }

  // 5. Build roster rows.
  const now = new Date().toISOString();
  const rows = contacts
    .filter((c: any) => typeof c.email === "string" && c.email.includes("@"))
    .map((c: any) => ({
      org_id: orgId,
      user_id: user.id,
      campaign_id: campaignId,
      contact_id: c.id,
      company_id: c.company_id,
      email: String(c.email).trim().toLowerCase(),
      first_name: c.first_name ?? null,
      last_name: c.last_name ?? null,
      display_name: c.full_name ?? null,
      title: c.title ?? null,
      linkedin_url: c.linkedin_url ?? null,
      phone: c.phone ?? null,
      status: "pending",
      next_send_at: now,
      merge_vars: {},
    }));

  if (rows.length === 0) {
    return json({ ok: true, queued: 0, skipped: 0, errors: ["no_valid_emails"] });
  }

  // 6. Upsert. Conflict on (campaign_id, email) — re-launching the
  //    campaign re-queues anyone whose status was failed/skipped/completed.
  const { error: insertErr, data: inserted } = await admin
    .from("lit_campaign_contacts")
    .upsert(rows, { onConflict: "campaign_id,email" })
    .select("id");
  if (insertErr) return json({ ok: false, error: insertErr.message }, 500);

  // 7. Flip campaign to active.
  await admin
    .from("lit_campaigns")
    .update({ status: "active", updated_at: now })
    .eq("id", campaignId);

  return json({
    ok: true,
    queued: inserted?.length ?? rows.length,
    skipped: contacts.length - rows.length,
    errors: [],
  });
});
