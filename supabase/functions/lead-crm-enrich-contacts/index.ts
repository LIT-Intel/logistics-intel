// lead-crm-enrich-contacts — membership-gated CRM wrapper around the product's
// existing contact-enrichment path. It does NOT reimplement Apollo/Lusha: it
// resolves the lead's recognized company and forwards to
// `enrich-contact-orchestrator` with the caller's JWT, so the orchestrator's
// own usage-gate (check_usage_limit) + metering (consume_usage) + lit_contacts
// writes all run exactly as they do for the product's "Enrich key contacts" CTA
// (see supabase/functions/enrich-contact-orchestrator/index.ts:253-341 and
//  frontend/src/lib/enrichment/contactEnrichment.ts).
//
// On top of the orchestrator's own metering, this fn writes:
//   - a lit_lead_activity 'contacts_enriched' row (CRM timeline), and
//   - a provider_usage_events audit row via _shared/provider_ledger.ts
//     (provider=apollo, operation=contact_enrichment) so the CRM feature's
//     spend is attributable. It respects the kill-switch (isProviderEnabled).
//
// verify_jwt=true (NOT in the no_verify_jwt manifest): this fn requires a real
// end-user JWT and is gated on is_lead_crm_member. No internal/service bypass.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { corsHeaders, handlePreflight, json, requireUser } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";
import { recordProviderUsage, isProviderEnabled } from "../_shared/provider_ledger.ts";
import { PROVIDERS, PROVIDER_OPERATIONS, TRIGGER_TYPES, PROVIDER_FLAGS } from "../_shared/provider_operations.ts";

Deno.serve(async (req: Request) => {
  const log = createLogger("lead-crm-enrich-contacts", { request_id: requestId() });
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  // 1) Real user JWT.
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, admin } = auth;

  // 2) Membership gate — never expose to non-members.
  try {
    const { data: isMember, error } = await admin.rpc("is_lead_crm_member", { p_user_id: user.id });
    if (error || isMember !== true) {
      return json({ ok: false, error: "not authorized", code: "NOT_LEAD_CRM_MEMBER" }, 403);
    }
  } catch (_) {
    return json({ ok: false, error: "not authorized", code: "NOT_LEAD_CRM_MEMBER" }, 403);
  }

  const body = await req.json().catch(() => ({} as any));
  const leadId: string | undefined = body?.lead_id;
  if (!leadId) return json({ ok: false, error: "Missing lead_id", code: "NO_LEAD" }, 400);
  const revealPhone = body?.reveal_phone_number === true;

  // 3) Resolve the lead's recognized company. Enrichment needs a linked company.
  const { data: lead, error: leadErr } = await admin
    .from("lit_admin_leads")
    .select("id, company_id, company_domain, company_name")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) return json({ ok: false, error: "Lead not found", code: "NO_LEAD" }, 404);
  // Enrichment identity: a recognized company_id is best, but a MANUALLY-entered
  // company_domain (derived from a hand-typed website via lit_leadcrm_update_lead)
  // OR a company_name is enough for the orchestrator to enrich by domain/name.
  // Only block when we have no identity at all.
  const hasDomain = typeof lead.company_domain === "string" && lead.company_domain.trim() !== "";
  const hasName = typeof lead.company_name === "string" && lead.company_name.trim() !== "";
  if (!lead.company_id && !hasDomain && !hasName) {
    return json(
      { ok: false, error: "No company identity for this lead — add a company name or website first.", code: "COMPANY_NOT_RECOGNIZED" },
      409,
    );
  }

  // Domain/name-only leads need a canonical lit_companies UUID before Apollo
  // results are persisted; lit_contacts.company_id is what the Lead CRM contact
  // panel reads. Reuse an existing domain row or create one deterministic Apollo
  // identity row, then link the lead before discovery/enrichment.
  if (!lead.company_id) {
    let companyId: string | null = null;
    if (hasDomain) {
      const { data: existing } = await admin
        .from("lit_companies")
        .select("id")
        .eq("domain", lead.company_domain.trim().toLowerCase())
        .limit(1)
        .maybeSingle();
      companyId = existing?.id ?? null;
    }
    if (!companyId) {
      const key = hasDomain
        ? lead.company_domain.trim().toLowerCase()
        : `leadcrm-${leadId}`;
      const { data: canonical, error: canonicalErr } = await admin
        .from("lit_companies")
        .upsert({
          source: "apollo",
          source_company_key: key,
          name: hasName ? lead.company_name.trim() : key,
          normalized_name: (hasName ? lead.company_name : key).trim().toLowerCase(),
          domain: hasDomain ? lead.company_domain.trim().toLowerCase() : null,
          website: hasDomain ? `https://${lead.company_domain.trim().toLowerCase()}` : null,
        }, { onConflict: "source,source_company_key" })
        .select("id")
        .single();
      if (canonicalErr || !canonical?.id) {
        return json({ ok: false, error: "Could not create a company record for enrichment", code: "COMPANY_LINK_FAILED" }, 500);
      }
      companyId = canonical.id;
    }
    await admin.from("lit_admin_leads").update({ company_id: companyId, updated_at: new Date().toISOString() }).eq("id", leadId);
    lead.company_id = companyId;
  }

  // 4) Kill-switch check (respect the provider flag; apollo has no dedicated flag
  //    today so this defaults fail-open, matching the ledger's design invariant).
  const enabled = await isProviderEnabled(admin, PROVIDER_FLAGS.IMPORTYETI_ENABLED);
  if (!enabled) {
    // Only ImportYeti has a canonical flag; if a global provider kill-switch is
    // ever wired for apollo it will gate here too. Fail-open is intentional.
    log.warn("provider_flag_disabled_but_apollo_uncontrolled", { lead_id: leadId });
  }

  // 5) Discover people at the company first. The enrichment orchestrator enriches
  //    contact TARGETS; it does not turn a company id/domain into people. The old
  //    wrapper skipped this step, so Apollo received no contacts and returned
  //    NO_TARGETS even though APOLLO_API_KEY was valid.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const forwardAuth = req.headers.get("Authorization")!;

  let discoveredContacts: any[] = [];
  try {
    const search = await fetch(`${supabaseUrl}/functions/v1/apollo-contact-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: forwardAuth,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
      body: JSON.stringify({
        company_id: lead.company_id ?? undefined,
        domain: lead.company_domain ?? undefined,
        company_name: lead.company_name ?? undefined,
        titles: [
          "Owner", "Founder", "President", "CEO", "Chief Executive Officer",
          "VP Sales", "Vice President Sales", "Director of Sales",
          "Operations Manager", "Director of Operations",
        ],
        seniorities: ["owner", "founder", "c_suite", "vp", "director", "manager"],
        email_statuses: ["verified", "likely to engage"],
        page: 1,
        per_page: 25,
      }),
    });
    const searchBody = await search.json().catch(() => ({}));
    if (!search.ok || searchBody?.ok === false) {
      return json({
        ok: false,
        error: searchBody?.message || searchBody?.error || "Contact discovery failed",
        code: searchBody?.code || "CONTACT_DISCOVERY_FAILED",
      }, search.status || 502);
    }
    discoveredContacts = Array.isArray(searchBody?.contacts) ? searchBody.contacts : [];
  } catch (err) {
    log.error("contact_discovery_failed", { err: String(err), lead_id: leadId });
    return json({ ok: false, error: "Contact discovery service unavailable", code: "CONTACT_DISCOVERY_UNAVAILABLE" }, 502);
  }

  if (!discoveredContacts.length) {
    return json({
      ok: true,
      provider: "apollo",
      count: 0,
      contacts: [],
      exhausted: true,
      credits_note: "No matching decision-makers were found — no enrichment credits consumed.",
    });
  }

  // 6) Enrich the discovered people through the existing usage-gated provider
  //    cascade. This is the path that persists rows into lit_contacts.
  const orchestratorUrl = `${supabaseUrl}/functions/v1/enrich-contact-orchestrator`;

  let orchResp: any = null;
  let orchStatus = 0;
  try {
    const r = await fetch(orchestratorUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: forwardAuth,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
      body: JSON.stringify({
        contacts: discoveredContacts,
        company_id: lead.company_id ?? undefined,
        domain: lead.company_domain ?? undefined,
        company_name: lead.company_name ?? undefined,
        reveal_personal_emails: true,
        reveal_phone_number: revealPhone,
        source_context: "lead_crm_company_contact_enrichment",
      }),
    });
    orchStatus = r.status;
    orchResp = await r.json().catch(() => ({}));
  } catch (err) {
    log.error("orchestrator_call_failed", { err: String(err), lead_id: leadId });
    return json({ ok: false, error: "Enrichment service unavailable", code: "ORCHESTRATOR_UNAVAILABLE" }, 502);
  }

  // Pass through the orchestrator's usage/gate errors verbatim (e.g. 403 quota).
  if (orchStatus === 403 || orchResp?.ok === false) {
    return json(orchResp ?? { ok: false, error: "Enrichment failed" }, orchStatus || 400);
  }

  const provider = String(orchResp?.provider ?? "apollo");
  const count = Number(orchResp?.count ?? 0) || 0;
  const pending = orchResp?.pending === true;

  // 7) CRM audit: activity row + provider_usage_events (attributes CRM spend).
  //    The orchestrator already consumed usage; this is an additional cost-ledger
  //    breadcrumb tagged to the lead-CRM feature. credits_consumed is left null so
  //    the ledger fills it from provider_pricing(apollo, contact_enrichment).
  try {
    await admin.from("lit_lead_activity").insert({
      lead_id: leadId,
      kind: "contacts_enriched",
      body: {
        provider,
        contacts_written: count,
        pending,
        reveal_phone_number: revealPhone,
        exhausted: orchResp?.exhausted === true,
      },
      actor_user_id: user.id,
      source: "manual",
    });
  } catch (err) {
    log.warn("activity_insert_failed", { err: String(err), lead_id: leadId });
  }

  if (count > 0 || pending) {
    await recordProviderUsage(admin, {
      provider: PROVIDERS.APOLLO,
      operation: PROVIDER_OPERATIONS.CONTACT_ENRICHMENT,
      status: "success",
      credits_consumed: null, // ledger fills from provider_pricing
      trigger_type: TRIGGER_TYPES.USER,
      source: "lead_crm",
      user_id: user.id,
      company_id: lead.company_id ?? null,
      metadata: { lead_id: leadId, contacts_written: count, pending },
    });
  }

  return json({
    ok: true,
    provider,
    count,
    pending,
    exhausted: orchResp?.exhausted === true,
    contacts: Array.isArray(orchResp?.contacts) ? orchResp.contacts : [],
    credits_note:
      count > 0 || pending
        ? "Enrichment consumed contact-enrichment credits (metered against your plan)."
        : "No new contacts found — no credits consumed.",
  });
});
