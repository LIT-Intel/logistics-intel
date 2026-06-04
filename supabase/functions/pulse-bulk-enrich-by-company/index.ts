// pulse-bulk-enrich-by-company — Phase 4b outbound edge fn
//
// When the user saves companies from Pulse Search to a syncable system list
// (Forwarders / Brokers — pulse_lists.syncs_to_attio = true), this function:
//   1. Fetches each company's domain from lit_companies
//   2. Queries Apollo mixed_people/search for decision-maker contacts
//      (batched up to 25 org domains per call to save credits)
//   3. Filters by HOT_TITLE_REGEX + deliverable email
//   4. Upserts into lit_contacts (by email)
//   5. Inserts into pulse_list_contacts with the list_id
//      → the existing Postgres trigger fires pulse-attio-sync per contact
//
// Auth: platform_admin only (syncable lists are admin-owned system lists).
//
// Request:  { company_ids: string[], list_id: string }
// Response: { ok: true, added_contacts, skipped, failed_companies, contact_ids }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger } from "../_shared/logger.ts";
import { requireUser, json, handlePreflight } from "../_shared/auth.ts";

const log = createLogger("pulse-bulk-enrich-by-company");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") || "";
const APOLLO_API_BASE = Deno.env.get("APOLLO_API_BASE") || "https://api.apollo.io";

// ─────────────────────────────────────────────────────────────────────
// Title matching — HOT decision-maker titles, JUNIOR exclusions
// Duplicated inline (Deno-safe, avoids cross-module dep on Node lib)
// ─────────────────────────────────────────────────────────────────────
const HOT_TITLE_REGEX =
  /\b(president|ceo|chief executive|owner|founder|managing partner|proprietor|(vp|vice president|svp|evp)\s+(sales|business development|bd|operations|ops|commercial|revenue)|director\s+of\s+(sales|business development|bd|operations|ops|logistics)|(sales|business development|bd)\s+manager)\b/i;

const JUNIOR_REGEX =
  /\b(assistant|coordinator|specialist|analyst|intern|trainee|floor manager|assistant manager|account executive|sdr|bdr|inside sales rep)\b/i;

function isHotTitle(t: string): boolean {
  const s = (t || "").toLowerCase().trim();
  if (!s) return false;
  if (JUNIOR_REGEX.test(s)) return false; // trap junior titles first
  return HOT_TITLE_REGEX.test(s);
}

function isDeliverable(emailStatus: string | null | undefined): boolean {
  const s = (emailStatus || "").toLowerCase();
  return s === "verified" || s === "likely_to_engage" || s === "likely to engage";
}

// ─────────────────────────────────────────────────────────────────────
// Apollo people search (batched)
// ─────────────────────────────────────────────────────────────────────
const HOT_TITLES_FOR_APOLLO = [
  "president", "ceo", "chief executive officer", "owner", "founder",
  "managing partner", "proprietor",
  "vp sales", "vice president sales", "svp sales", "evp sales",
  "vp business development", "vice president business development",
  "vp operations", "vice president operations",
  "vp commercial", "vp revenue",
  "director of sales", "director of business development",
  "director of operations", "director of logistics",
  "sales manager", "business development manager",
];

interface ApolloContact {
  apolloId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string | null;
  emailStatus: string | null;
  linkedinUrl: string | null;
  department: string | null;
  seniority: string | null;
  organizationDomain: string | null;
}

async function apolloPeopleSearchByDomains(domains: string[]): Promise<ApolloContact[]> {
  if (!APOLLO_API_KEY || domains.length === 0) return [];

  const body = {
    q_organization_domains_list: domains,
    person_titles: HOT_TITLES_FOR_APOLLO,
    include_similar_titles: true,
    contact_email_status: ["verified", "likely_to_engage"],
    page: 1,
    per_page: Math.min(domains.length * 5, 100),
  };

  const resp = await fetch(`${APOLLO_API_BASE}/api/v1/mixed_people/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": APOLLO_API_KEY,
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    log.warn("apollo_people_search_non_ok", { status: resp.status, body: txt.slice(0, 200) });
    return [];
  }

  const data = await resp.json();
  const people: any[] = data?.people || data?.contacts || [];

  return people
    .filter((p: any) => p?.id)
    .map((p: any) => ({
      apolloId: p.id,
      fullName: p.name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "",
      firstName: p.first_name || "",
      lastName: p.last_name || "",
      title: p.title || "",
      email: p.email || null,
      emailStatus: p.email_status || null,
      linkedinUrl: p.linkedin_url || null,
      department: Array.isArray(p.departments) ? p.departments[0] : (p.department || null),
      seniority: p.seniority || null,
      organizationDomain:
        p?.organization?.primary_domain ||
        (p?.organization?.website_url
          ? String(p.organization.website_url)
              .replace(/^https?:\/\//i, "")
              .replace(/^www\./, "")
              .split("/")[0]
          : null),
    }));
}

// ─────────────────────────────────────────────────────────────────────
// Serve
// ─────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  // Auth — platform_admin only
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, admin } = auth;

  // Verify platform_admin
  const { data: adminRow } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    return json({ ok: false, error: "forbidden", message: "Platform admin required" }, 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const companyIds: string[] = Array.isArray(body?.company_ids) ? body.company_ids : [];
  const listId: string = String(body?.list_id || "").trim();

  if (companyIds.length === 0 || !listId) {
    return json({ ok: false, error: "company_ids and list_id are required" }, 400);
  }

  // Verify list exists and syncs_to_attio = true
  const { data: list, error: listErr } = await admin
    .from("pulse_lists")
    .select("id, syncs_to_attio, name")
    .eq("id", listId)
    .maybeSingle();

  if (listErr || !list) {
    return json({ ok: false, error: "list_not_found" }, 404);
  }
  if (!list.syncs_to_attio) {
    return json({ ok: false, error: "list_not_syncable", message: "List does not have syncs_to_attio=true" }, 400);
  }

  // Fetch company rows (domain + name + apollo org id if we have it)
  const { data: companies, error: compErr } = await admin
    .from("lit_companies")
    .select("id, name, domain, website")
    .in("id", companyIds);

  if (compErr || !companies) {
    log.error("fetch_companies_failed", { err: String(compErr?.message ?? compErr) });
    return json({ ok: false, error: "failed to fetch companies" }, 500);
  }

  const skipped = {
    no_domain: 0,
    no_apollo_match: 0,
    no_decision_maker: 0,
    no_deliverable_email: 0,
  };

  const failedCompanies: { company_id: string; reason: string }[] = [];

  // Build domain → company_id map; skip companies without a domain.
  const domainToCompanyId = new Map<string, string>();
  const domainsToSearch: string[] = [];

  for (const co of companies) {
    let domain = co.domain ||
      (co.website
        ? String(co.website).replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0].trim()
        : null);
    if (!domain) {
      skipped.no_domain++;
      continue;
    }
    domain = domain.toLowerCase().trim();
    domainToCompanyId.set(domain, co.id);
    domainsToSearch.push(domain);
  }

  if (domainsToSearch.length === 0) {
    return json({
      ok: true,
      added_contacts: 0,
      skipped,
      failed_companies: failedCompanies,
      contact_ids: [],
    });
  }

  // Batch: Apollo supports up to 25 domains per mixed_people/search call.
  // We process in batches of 25 to stay within rate limits.
  const BATCH_SIZE = 25;
  const allContacts: ApolloContact[] = [];

  for (let i = 0; i < domainsToSearch.length; i += BATCH_SIZE) {
    const batch = domainsToSearch.slice(i, i + BATCH_SIZE);
    try {
      const contacts = await apolloPeopleSearchByDomains(batch);
      allContacts.push(...contacts);
    } catch (err) {
      log.warn("apollo_batch_failed", { batch_start: i, err: String(err) });
      for (const d of batch) {
        const cid = domainToCompanyId.get(d);
        if (cid) failedCompanies.push({ company_id: cid, reason: "apollo_call_failed" });
      }
    }
  }

  if (allContacts.length === 0) {
    skipped.no_apollo_match += domainsToSearch.length;
    return json({
      ok: true,
      added_contacts: 0,
      skipped,
      failed_companies: failedCompanies,
      contact_ids: [],
    });
  }

  // Filter: hot title + deliverable email
  const hotContacts = allContacts.filter(
    (c) => isHotTitle(c.title) && c.email && isDeliverable(c.emailStatus),
  );

  const coldWithNoTitle = allContacts.filter((c) => !isHotTitle(c.title)).length;
  const coldWithNoEmail = allContacts.filter(
    (c) => isHotTitle(c.title) && (!c.email || !isDeliverable(c.emailStatus)),
  ).length;
  skipped.no_decision_maker += coldWithNoTitle;
  skipped.no_deliverable_email += coldWithNoEmail;

  if (hotContacts.length === 0) {
    return json({
      ok: true,
      added_contacts: 0,
      skipped,
      failed_companies: failedCompanies,
      contact_ids: [],
    });
  }

  // Upsert into lit_contacts and insert into pulse_list_contacts.
  // We upsert by (source='apollo', source_contact_key=apolloId).
  const contactIds: string[] = [];

  for (const c of hotContacts) {
    try {
      // Resolve company_id from domain match
      const domain = (c.organizationDomain || "").toLowerCase().trim();
      const companyId = domainToCompanyId.get(domain) || null;

      if (!c.email) continue;

      // Upsert into lit_contacts
      const { data: contact, error: upsertErr } = await admin
        .from("lit_contacts")
        .upsert(
          {
            source: "apollo",
            source_contact_key: c.apolloId,
            company_id: companyId,
            full_name: c.fullName || `${c.firstName} ${c.lastName}`.trim() || "Unknown",
            first_name: c.firstName || null,
            last_name: c.lastName || null,
            title: c.title || null,
            department: c.department || null,
            seniority: c.seniority || null,
            email: c.email,
            linkedin_url: c.linkedinUrl || null,
          },
          {
            onConflict: "source,source_contact_key",
            ignoreDuplicates: false,
          },
        )
        .select("id")
        .single();

      if (upsertErr || !contact) {
        log.warn("contact_upsert_failed", { apollo_id: c.apolloId, err: String(upsertErr?.message ?? upsertErr) });
        continue;
      }

      contactIds.push(contact.id);

      // Insert into pulse_list_contacts (fires pulse-attio-sync trigger)
      const { error: listErr } = await admin
        .from("pulse_list_contacts")
        .upsert(
          {
            list_id: listId,
            contact_id: contact.id,
            added_by: user.id,
          },
          { onConflict: "list_id,contact_id" },
        );

      if (listErr) {
        log.warn("pulse_list_contacts_insert_failed", { contact_id: contact.id, err: String(listErr?.message ?? listErr) });
      }
    } catch (err) {
      log.warn("contact_insert_error", { apollo_id: c.apolloId, err: String(err) });
    }
  }

  log.info("enrich_complete", {
    company_count: companyIds.length,
    domain_count: domainsToSearch.length,
    apollo_contacts: allContacts.length,
    hot_contacts: hotContacts.length,
    inserted: contactIds.length,
  });

  return json({
    ok: true,
    added_contacts: contactIds.length,
    skipped,
    failed_companies: failedCompanies,
    contact_ids: contactIds,
  });
});
