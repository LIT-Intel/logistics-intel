// queue-campaign-recipients — called when the user clicks Launch on a
// campaign. Builds the recipient roster from FOUR sources, all merged
// onto lit_campaign_contacts (campaign_id, email) so duplicates dedupe:
//
//   1. Enriched contacts from attached companies
//      (lit_campaign_companies → lit_contacts WHERE email IS NOT NULL)
//   2. Manual emails passed in the request body (manual_emails)
//   3. Manual emails persisted on lit_campaigns.metadata.manual_recipients
//      from a previous edit (so re-launch works without re-entering them)
//   4. Universal Lists — when lit_campaigns.metrics.audience_pulse_list_id
//      is set, the function syncs pulse_list_companies into
//      lit_campaign_companies (additive, never removes) and merges every
//      explicit pulse_list_contacts row into the roster. Re-running this
//      function for an active campaign picks up newly-added list
//      members ("live-bound" audience).
//
// Authenticated POST.
// Body: {
//   campaign_id: uuid,
//   manual_emails?: Array<{ email: string, first_name?: string, last_name?: string, company_name?: string }>
// }
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
  const requestManualEmails: Array<any> = Array.isArray(body?.manual_emails)
    ? body.manual_emails
    : [];

  const admin = createClient(supabaseUrl, serviceKey);

  // 1. Verify the campaign belongs to the caller (lit_campaigns.user_id).
  //    Also pull metadata so we can read previously-saved manual recipients.
  const { data: camp, error: campErr } = await admin
    .from("lit_campaigns")
    .select("id, user_id, name, metrics")
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

  // 2b. If the campaign is bound to a Pulse List, sync the list's
  //     companies into lit_campaign_companies first. This is additive —
  //     existing attachments stay, new list members get pulled in.
  //     Live-binding for active campaigns happens by simply re-calling
  //     this function on a tick or on user action.
  const audiencePulseListId =
    typeof (camp as any)?.metrics?.audience_pulse_list_id === "string"
      ? (camp as any).metrics.audience_pulse_list_id
      : null;
  let listExplicitContactIds: string[] = [];
  if (audiencePulseListId) {
    const { data: listCompanies } = await admin
      .from("pulse_list_companies")
      .select("company_id")
      .eq("list_id", audiencePulseListId);
    const newAttachments = (listCompanies ?? [])
      .map((r: any) => r.company_id)
      .filter(Boolean)
      .map((cid: string) => ({ campaign_id: campaignId, company_id: cid }));
    if (newAttachments.length > 0) {
      await admin
        .from("lit_campaign_companies")
        .upsert(newAttachments, { onConflict: "campaign_id,company_id", ignoreDuplicates: true });
    }
    const { data: listContacts } = await admin
      .from("pulse_list_contacts")
      .select("contact_id")
      .eq("list_id", audiencePulseListId);
    listExplicitContactIds = (listContacts ?? []).map((r: any) => r.contact_id).filter(Boolean);
  }

  // 3. Pull attached companies (may be empty if the user is only sending
  //    to manual emails — that's a valid flow).
  const { data: campCompanies, error: ccErr } = await admin
    .from("lit_campaign_companies")
    .select("company_id")
    .eq("campaign_id", campaignId);
  if (ccErr) return json({ ok: false, error: ccErr.message }, 500);

  const companyIds = (campCompanies ?? []).map((c: any) => c.company_id).filter(Boolean);

  // 4. Pull contacts for those companies that have an email address.
  let contacts: any[] = [];
  if (companyIds.length > 0) {
    const { data: contactRows, error: contactErr } = await admin
      .from("lit_contacts")
      .select("id, company_id, email, first_name, last_name, full_name, title, linkedin_url, phone")
      .in("company_id", companyIds)
      .not("email", "is", null);
    if (contactErr) return json({ ok: false, error: contactErr.message }, 500);
    contacts = contactRows ?? [];
  }

  // 4b. Pull explicit list contacts (pulse_list_contacts.contact_id) that
  //     aren't already in the company-derived set, so a list curated at
  //     contact-level still ships even if its parent company has no
  //     other enriched contacts.
  if (listExplicitContactIds.length > 0) {
    const seenContactIds = new Set(contacts.map((c: any) => c.id));
    const missingIds = listExplicitContactIds.filter((id) => !seenContactIds.has(id));
    if (missingIds.length > 0) {
      const { data: extraRows } = await admin
        .from("lit_contacts")
        .select("id, company_id, email, first_name, last_name, full_name, title, linkedin_url, phone")
        .in("id", missingIds)
        .not("email", "is", null);
      contacts = contacts.concat(extraRows ?? []);
    }
  }

  // 5. Build roster rows from enriched contacts.
  const now = new Date().toISOString();
  const fromContacts = (contacts ?? [])
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

  // 5b. Layer in manual emails (request body + persisted metadata.manual_recipients).
  //     Persist combined list back to lit_campaigns.metrics so subsequent
  //     re-launches don't lose them.
  const persistedManual: Array<any> = Array.isArray((camp as any)?.metrics?.manual_recipients)
    ? (camp as any).metrics.manual_recipients
    : [];
  const manualSet = new Map<string, any>();
  for (const m of [...persistedManual, ...requestManualEmails]) {
    if (!m || typeof m !== "object") continue;
    const email = String(m.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    manualSet.set(email, {
      email,
      first_name: m.first_name ?? null,
      last_name: m.last_name ?? null,
      company_name: m.company_name ?? null,
    });
  }
  const fromManual = [...manualSet.values()].map((m) => ({
    org_id: orgId,
    user_id: user.id,
    campaign_id: campaignId,
    contact_id: null,
    company_id: null,
    email: m.email,
    first_name: m.first_name,
    last_name: m.last_name,
    display_name: [m.first_name, m.last_name].filter(Boolean).join(" ") || null,
    title: null,
    linkedin_url: null,
    phone: null,
    status: "pending",
    next_send_at: now,
    merge_vars: m.company_name ? { company_name: m.company_name } : {},
  }));

  // De-dupe: contact emails win over manual emails (richer metadata).
  const seen = new Set<string>();
  const rows: any[] = [];
  for (const row of [...fromContacts, ...fromManual]) {
    if (seen.has(row.email)) continue;
    seen.add(row.email);
    rows.push(row);
  }

  if (rows.length === 0) {
    return json({ ok: true, queued: 0, skipped: 0, errors: ["no_valid_emails"] });
  }

  // 6. Insert NEW rows only. Existing recipients keep their progress —
  //    if they're mid-sequence we don't want to reset their next_send_at
  //    or current_step_id. ignoreDuplicates=true makes the upsert a
  //    DO NOTHING on (campaign_id, email) conflicts.
  const { error: insertErr, data: inserted } = await admin
    .from("lit_campaign_contacts")
    .upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true })
    .select("id");
  if (insertErr) return json({ ok: false, error: insertErr.message }, 500);

  // 7. Persist manual recipients onto the campaign so re-launch works
  //    without resending them in the request body. Flip status to active.
  const newMetrics = {
    ...((camp as any)?.metrics ?? {}),
    manual_recipients: [...manualSet.values()],
  };
  await admin
    .from("lit_campaigns")
    .update({ status: "active", metrics: newMetrics, updated_at: now })
    .eq("id", campaignId);

  const totalSkipped =
    Math.max(0, (contacts?.length ?? 0) - fromContacts.length) +
    Math.max(0, requestManualEmails.length - fromManual.length);
  return json({
    ok: true,
    queued: inserted?.length ?? rows.length,
    skipped: totalSkipped,
    errors: [],
  });
});
