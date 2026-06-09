// pulse-bulk-enrich-by-company — Phase 4b outbound edge fn
//
// When the user saves companies from Pulse Search to a syncable system list
// (Forwarders / Brokers — pulse_lists.syncs_to_attio = true), this function:
//   1. Fetches each company's domain from lit_companies
//   2. Resolves each domain to an Apollo org_id via mixed_companies/search
//   3. Queries Apollo mixed_people/api_search (same endpoint as manual path)
//      by organization_ids (primary) with domain fallback, batched per company
//   4. Filters by HOT_TITLE_REGEX or seniority match; accepts any non-null email
//      (deliverability left to downstream — same as manual path)
//   5. Upserts into lit_contacts (by source+source_contact_key)
//   6. Inserts into pulse_list_contacts with the list_id
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
// Apollo migrated people-search from /mixed_people/search → /mixed_people/api_search.
// API keys require the api_search path. Request/response shape is unchanged.
const APOLLO_PEOPLE_URL = `${APOLLO_API_BASE}/api/v1/mixed_people/api_search`;
const APOLLO_ORG_URL = `${APOLLO_API_BASE}/api/v1/mixed_companies/search`;
const APOLLO_BULK_MATCH_URL = `${APOLLO_API_BASE}/api/v1/people/bulk_match`;
const APOLLO_MATCH_URL = `${APOLLO_API_BASE}/api/v1/people/match`;
// Cap unlocks per company to control Apollo credit spend.
const MAX_UNLOCKS_PER_COMPANY = 5;
const BULK_MATCH_MAX = 10;

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

// Accept any non-null, non-locked email — same policy as apollo-contact-search
// (deliverability decisions are left to downstream consumers). Only hard-reject
// the Apollo locked-email placeholder.
const APOLLO_LOCKED_EMAIL_PREFIX = "email_not_unlocked@";
function isLockedEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith(APOLLO_LOCKED_EMAIL_PREFIX);
}

// HOT seniority tags Apollo uses — mirrors what the frontend sends to
// apollo-contact-search when clicking "Find decision-makers".
const HOT_SENIORITIES = new Set([
  "c_suite", "vp", "director", "manager", "partner", "owner",
]);

function isHotSeniority(s: string | null | undefined): boolean {
  if (!s) return false;
  return HOT_SENIORITIES.has(s.toLowerCase().trim());
}

// ─────────────────────────────────────────────────────────────────────
// Apollo people search — mirrors apollo-contact-search strategy exactly
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

// Seniority tags — primary filter, dramatically more accurate than title regex.
// Matches exactly what the frontend sends when the user clicks "Find decision-makers".
const HOT_SENIORITIES_FOR_APOLLO = ["c_suite", "vp", "director", "manager", "partner", "owner"];

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

function normalizeDomain(input: unknown): string | null {
  if (!input) return null;
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0] || null;
}

function mapPerson(p: any): ApolloContact {
  return {
    apolloId: p.id,
    fullName: p.name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "",
    firstName: p.first_name || "",
    lastName: p.last_name || "",
    title: p.title || "",
    email: (p.email && !isLockedEmail(p.email)) ? p.email : null,
    emailStatus: isLockedEmail(p.email) ? "locked" : (p.email_status || null),
    linkedinUrl: p.linkedin_url || null,
    department: Array.isArray(p.departments) ? p.departments[0] : (p.department || null),
    seniority: p.seniority || null,
    organizationDomain:
      normalizeDomain(p?.organization?.primary_domain || p?.organization?.website_url),
  };
}

async function apolloPost(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; people: ApolloContact[]; raw: string }> {
  console.log(`[pulse-bulk-enrich] apolloPost → ${url} body=${JSON.stringify(body)}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": APOLLO_API_KEY,
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(body),
  });
  const raw = await resp.text().catch(() => "");
  if (!resp.ok) {
    console.log(`[pulse-bulk-enrich] apolloPost ← status=${resp.status} error body=${raw.slice(0, 300)}`);
    return { ok: false, status: resp.status, people: [], raw };
  }
  let data: any = null;
  try { data = JSON.parse(raw); } catch (_) {}
  const people: any[] = Array.isArray(data?.people) ? data.people : (Array.isArray(data?.contacts) ? data.contacts : []);
  const mapped = people.filter((p) => p?.id).map(mapPerson);
  const locked = mapped.filter((c) => c.emailStatus === "locked" || (c.email === null && isLockedEmail(people.find((p) => p.id === c.apolloId)?.email))).length;
  console.log(`[pulse-bulk-enrich] apolloPost ← status=${resp.status} total=${mapped.length} locked_placeholder=${locked} has_email=${mapped.filter((c) => c.email).length}`);
  return { ok: true, status: resp.status, people: mapped, raw };
}

async function rawApolloPost(url: string, body: Record<string, unknown>): Promise<any> {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": APOLLO_API_KEY,
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return null;
  const raw = await resp.text().catch(() => "");
  try { return JSON.parse(raw); } catch (_) { return null; }
}

// ─────────────────────────────────────────────────────────────────────
// Email unlock via /people/bulk_match (mirrors apollo-contact-enrich)
// ─────────────────────────────────────────────────────────────────────

/**
 * Unlock real emails for up to BULK_MATCH_MAX contacts per call.
 * Mirrors the bulkMatch() pattern in apollo-contact-enrich exactly:
 *   POST /people/bulk_match  { details: [{ id: "..." }, ...] }
 * Response shape: { matches: [...] } or { people: [...] }
 * Each entry may be { person: {...} } or the person object directly.
 * Returns a Map<apolloId, unlockedEmail> for hits that resolve to a
 * non-locked email.
 */
async function unlockEmails(
  contacts: ApolloContact[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (contacts.length === 0) return result;

  // Build identifier blocks keyed by index so we can pair back to apolloId.
  const identifiers: Array<{ id: string }> = contacts.map((c) => ({ id: c.apolloId }));

  // Chunk into batches of BULK_MATCH_MAX
  for (let i = 0; i < identifiers.length; i += BULK_MATCH_MAX) {
    const chunk = identifiers.slice(i, i + BULK_MATCH_MAX);
    const chunkContacts = contacts.slice(i, i + BULK_MATCH_MAX);
    const body: Record<string, unknown> = {
      details: chunk,
      reveal_personal_emails: true,
    };
    console.log(`[pulse-bulk-enrich] unlock bulk_match batch size=${chunk.length} ids=${chunk.map((c) => c.id).join(",")}`);
    const resp = await fetch(APOLLO_BULK_MATCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": APOLLO_API_KEY,
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    });
    const raw = await resp.text().catch(() => "");
    if (!resp.ok) {
      console.log(`[pulse-bulk-enrich] bulk_match failed status=${resp.status} body=${raw.slice(0, 200)}`);
      continue;
    }
    let data: any = null;
    try { data = JSON.parse(raw); } catch (_) {}
    // Apollo bulk_match shape: { matches: [...] } or { people: [...] }
    const arr: any[] = Array.isArray(data?.matches)
      ? data.matches
      : Array.isArray(data?.people)
        ? data.people
        : [];
    // Each entry may itself be { person: {...} } or the person directly
    const people = arr.map((m) => (m && m.person ? m.person : m)).filter(Boolean);
    let unlocked = 0;
    let stillLocked = 0;
    people.forEach((p: any, j: number) => {
      const apolloId = chunkContacts[j]?.apolloId;
      if (!apolloId) return;
      const email = p?.email;
      if (email && !isLockedEmail(email)) {
        result.set(apolloId, email);
        unlocked++;
      } else {
        stillLocked++;
      }
    });
    console.log(`[pulse-bulk-enrich] bulk_match batch result: unlocked=${unlocked} still_locked=${stillLocked}`);
  }
  return result;
}

function buildPeopleBody(scopeFields: Record<string, unknown>, perPage: number): Record<string, unknown> {
  return {
    page: 1,
    per_page: perPage,
    person_titles: HOT_TITLES_FOR_APOLLO,
    person_seniorities: HOT_SENIORITIES_FOR_APOLLO,
    include_similar_titles: true,
    ...scopeFields,
  };
}

// Per-company enrichment: resolve org_id first (Stage A), then people by org_id
// (Stage B primary), then domain fallback (Stage C). Mirrors apollo-contact-search.
async function apolloPeopleSearchByDomain(domain: string): Promise<ApolloContact[]> {
  if (!APOLLO_API_KEY || !domain) return [];

  const PER_PAGE = 50; // generous per-company fetch; no multi-domain batching

  // Stage A: resolve org_id
  let apolloOrgId: string | null = null;
  const orgData = await rawApolloPost(APOLLO_ORG_URL, {
    q_organization_domains_list: [domain],
    page: 1,
    per_page: 5,
  });
  const orgs: any[] = Array.isArray(orgData?.organizations) ? orgData.organizations
    : Array.isArray(orgData?.accounts) ? orgData.accounts : [];
  if (orgs.length > 0) {
    // Prefer exact domain match, then first hit
    const exact = orgs.find((o) => normalizeDomain(o?.primary_domain) === domain || normalizeDomain(o?.website_url) === domain);
    apolloOrgId = String((exact ?? orgs[0])?.id || "").trim() || null;
  }

  // Stage B: people search by org_id (most accurate)
  if (apolloOrgId) {
    const r = await apolloPost(APOLLO_PEOPLE_URL, buildPeopleBody({ organization_ids: [apolloOrgId] }, PER_PAGE));
    console.log(`[pulse-bulk-enrich] Stage B org_id=${apolloOrgId} domain=${domain} → ${r.people.length} people (status=${r.status})`);
    if (r.ok && r.people.length > 0) return r.people;
  }

  // Stage C: domain-scoped people search as safety net (same fallback as manual path)
  const r2 = await apolloPost(APOLLO_PEOPLE_URL, buildPeopleBody({ q_organization_domains_list: [domain] }, PER_PAGE));
  console.log(`[pulse-bulk-enrich] Stage C domain=${domain} → ${r2.people.length} people (status=${r2.status})`);
  if (r2.ok && r2.people.length > 0) return r2.people;

  log.warn("apollo_no_results", { domain, org_id: apolloOrgId });
  return [];
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
    email_unreachable: 0,
  };

  // Company IDs that had no domain on file — surfaced in the response so the
  // frontend toast can tell the user exactly which companies couldn't be enriched.
  const skippedNoDomainCompanyIds: string[] = [];

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
      skippedNoDomainCompanyIds.push(co.id);
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
      skipped_company_ids: skippedNoDomainCompanyIds,
      failed_companies: failedCompanies,
      contact_ids: [],
    });
  }

  // Per-company enrichment: resolve org_id → people by org_id → domain fallback.
  // This mirrors the proven apollo-contact-search 3-stage strategy exactly.
  const allContacts: ApolloContact[] = [];

  for (const domain of domainsToSearch) {
    try {
      const contacts = await apolloPeopleSearchByDomain(domain);
      allContacts.push(...contacts);
    } catch (err) {
      log.warn("apollo_domain_failed", { domain, err: String(err) });
      const cid = domainToCompanyId.get(domain);
      if (cid) failedCompanies.push({ company_id: cid, reason: "apollo_call_failed" });
    }
  }

  if (allContacts.length === 0) {
    skipped.no_apollo_match += domainsToSearch.length;
    return json({
      ok: true,
      added_contacts: 0,
      skipped,
      skipped_company_ids: skippedNoDomainCompanyIds,
      failed_companies: failedCompanies,
      contact_ids: [],
    });
  }

  // Filter: decision-maker by seniority (primary) OR hot-title regex (fallback).
  // Include decision-makers even with locked emails — we'll attempt to unlock below.
  function isDecisionMaker(c: ApolloContact): boolean {
    if (isHotSeniority(c.seniority)) return true;
    return isHotTitle(c.title);
  }

  const coldWithNoTitle = allContacts.filter((c) => !isDecisionMaker(c)).length;
  skipped.no_decision_maker += coldWithNoTitle;

  // Decision-makers with a real email already — no unlock needed.
  const decisionMakers = allContacts.filter((c) => isDecisionMaker(c));
  const alreadyHaveEmail = decisionMakers.filter((c) => c.email && !isLockedEmail(c.email));
  // Decision-makers with a locked email placeholder — need unlock.
  const needUnlock = decisionMakers.filter((c) => !c.email || isLockedEmail(c.email));

  skipped.no_deliverable_email += needUnlock.length; // will be adjusted down after unlock

  // ── Unlock step: attempt /people/bulk_match per domain, capped at
  // MAX_UNLOCKS_PER_COMPANY per company to control credit spend.
  // Mirrors apollo-contact-enrich's bulkMatch() pattern exactly.
  const unlockedEmailMap = new Map<string, string>(); // apolloId → real email
  if (needUnlock.length > 0 && APOLLO_API_KEY) {
    // Group by company domain so we can enforce per-company cap
    const byDomain = new Map<string, ApolloContact[]>();
    for (const c of needUnlock) {
      const dom = (c.organizationDomain || "").toLowerCase().trim() || "_unknown";
      if (!byDomain.has(dom)) byDomain.set(dom, []);
      byDomain.get(dom)!.push(c);
    }
    const debugPerCompany: Array<{ domain: string; people_returned: number; locked: number; unlocked: number; kept: number }> = [];
    for (const [dom, contacts] of byDomain.entries()) {
      const toUnlock = contacts.slice(0, MAX_UNLOCKS_PER_COMPANY);
      console.log(`[pulse-bulk-enrich] unlock domain=${dom} candidates=${contacts.length} capped_to=${toUnlock.length}`);
      const unlockResult = await unlockEmails(toUnlock);
      let unlockCount = 0;
      for (const [id, email] of unlockResult.entries()) {
        unlockedEmailMap.set(id, email);
        unlockCount++;
      }
      debugPerCompany.push({
        domain: dom,
        people_returned: contacts.length,
        locked: toUnlock.length,
        unlocked: unlockCount,
        kept: unlockCount,
      });
    }
    // Adjust skipped.email_unreachable: contacts that we attempted unlock but still got nothing
    const attempted = needUnlock.length;
    const successfulUnlocks = unlockedEmailMap.size;
    skipped.email_unreachable += attempted - successfulUnlocks;
    // Remove the ones we successfully unlocked from no_deliverable_email counter
    skipped.no_deliverable_email -= attempted;
    skipped.no_deliverable_email += (attempted - successfulUnlocks);
  } else if (needUnlock.length > 0) {
    // No API key — all locked contacts are unreachable
    skipped.email_unreachable += needUnlock.length;
    skipped.no_deliverable_email = 0;
  }

  // Apply unlocked emails back onto the contact objects
  for (const c of needUnlock) {
    const unlocked = unlockedEmailMap.get(c.apolloId);
    if (unlocked) {
      c.email = unlocked;
      c.emailStatus = null; // was "locked", now real
    }
  }

  // Final set: decision-makers with a real email (either already had one, or just unlocked)
  const hotContacts = [
    ...alreadyHaveEmail,
    ...needUnlock.filter((c) => c.email && !isLockedEmail(c.email)),
  ];

  console.log(`[pulse-bulk-enrich] filter summary: total=${allContacts.length} decision_makers=${decisionMakers.length} already_had_email=${alreadyHaveEmail.length} needed_unlock=${needUnlock.length} unlocked=${unlockedEmailMap.size} hot_final=${hotContacts.length}`);

  if (hotContacts.length === 0) {
    return json({
      ok: true,
      added_contacts: 0,
      skipped,
      skipped_company_ids: skippedNoDomainCompanyIds,
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
    unlocked_emails: unlockedEmailMap.size,
    inserted: contactIds.length,
  });

  return json({
    ok: true,
    added_contacts: contactIds.length,
    skipped,
    skipped_company_ids: skippedNoDomainCompanyIds,
    failed_companies: failedCompanies,
    contact_ids: contactIds,
  });
});
