/**
 * Supabase Edge Function: enrich-campaign-contacts
 *
 * Phase D-0a — given a campaign_id, find people for the campaign's
 * attached companies and persist them into `lit_contacts`. This
 * function is the bridge between Phase B/C (companies attached) and
 * Phase D-1 (recipient roster table). It does NOT write recipients —
 * only contacts. The roster table comes later.
 *
 * Provider order
 *   1. Apollo (`/v1/mixed_people/search`) — primary people search by
 *      domain.
 *   2. Hunter (`/v2/email-finder`) — only when Apollo returns a hit
 *      with first/last name + domain but no real email.
 *   3. Lusha — reported as `skipped` in this revision (the existing
 *      `lusha-contact-search` writer is a separate function and is
 *      not safe to invoke inline; it can be invoked separately or
 *      added later as a fallback).
 *   4. Tavily / PhantomBuster — out of scope for D-0a.
 *
 * Credit-burn safeguards
 *   - Skip companies with no domain and no website.
 *   - Skip companies that already have ≥3 rows in `lit_contacts`
 *     unless `force=true`.
 *   - Daily guard: if a `campaign_contact_enrichment` activity event
 *     was written for this campaign in the last 24h, refuse with
 *     `ok:false, code:'ALREADY_RAN_TODAY'` unless `force=true`.
 *   - Concurrency capped at 3 companies in flight at once.
 *   - Per-company `limit_per_company` (default 5, max 25).
 *   - Apollo placeholder emails (`email_not_unlocked@…`) are filtered
 *     before write.
 *
 * Auth
 *   - Requires `Authorization: Bearer <user_jwt>`.
 *   - Service-role Supabase client is used server-side (matches the
 *     pattern in `lusha-contact-search`) so contacts table inserts
 *     bypass RLS for the dispatcher path. The user JWT is still
 *     verified and the campaign ownership check enforces tenancy:
 *     the function refuses unless `lit_campaigns.user_id = auth.uid()`.
 *
 * Idempotency
 *   - Contacts are upserted on the existing
 *     UNIQUE(source, source_contact_key) constraint with a stable
 *     key:
 *       apollo:<lowercase email>                     ← when email present
 *       apollo:<domain>:<first>:<last>               ← when email is absent
 *   - A unique-violation race is treated as `contacts_existing`.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APOLLO_API_BASE =
  Deno.env.get("APOLLO_API_BASE") || "https://api.apollo.io";
const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") || "";
const HUNTER_API_KEY = Deno.env.get("HUNTER_API_KEY") || "";
const LUSHA_API_KEY = Deno.env.get("LUSHA_API_KEY") || "";

const DEFAULT_LIMIT_PER_COMPANY = 5;
const MAX_LIMIT_PER_COMPANY = 25;
const ALREADY_ENRICHED_THRESHOLD = 3;
const MAX_CONCURRENCY = 3;
const APOLLO_LOCKED_EMAIL_PREFIX = "email_not_unlocked@";
const DAILY_GUARD_MS = 24 * 60 * 60 * 1000;

interface Persona {
  departments?: string[];
  seniorities?: string[];
  titles?: string[];
}

interface RequestBody {
  campaign_id?: string;
  company_ids?: string[];
  limit_per_company?: number;
  persona?: Persona;
  force?: boolean;
}

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  email?: string | null;
  linkedin_url?: string;
  departments?: string[];
  seniority?: string;
  city?: string;
  state?: string;
  country?: string;
  organization?: { name?: string; primary_domain?: string };
  [k: string]: unknown;
}

interface CompanyRow {
  id: string;
  name: string | null;
  domain: string | null;
  website: string | null;
}

interface ProcessResult {
  apolloHits: number;
  hunterHits: number;
  contactsInserted: number;
  contactsExisting: number;
  skipReason?: "no_domain" | "already_enriched";
  errors: Array<{ stage: string; message: string }>;
}

interface SummaryError {
  company_id?: string;
  stage: string;
  message: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function logFn(payload: Record<string, unknown>): void {
  try {
    console.log(
      JSON.stringify({ fn: "enrich-campaign-contacts", ...payload }),
    );
  } catch {
    // ignore log failures
  }
}

function isPlaceholderEmail(email?: string | null): boolean {
  if (!email) return true;
  return email.toLowerCase().startsWith(APOLLO_LOCKED_EMAIL_PREFIX);
}

function safeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const cleaned = trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .trim()
    .toLowerCase();
  if (!cleaned || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleaned)) return null;
  return cleaned;
}

function clampLimit(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT_PER_COMPANY;
  return Math.min(MAX_LIMIT_PER_COMPANY, Math.max(1, Math.floor(n)));
}

async function apolloPeopleSearch(args: {
  domain: string;
  perPage: number;
  persona?: Persona;
}): Promise<{
  people: ApolloPerson[];
  status: number;
  rawError?: string;
}> {
  if (!APOLLO_API_KEY) {
    return { people: [], status: 0, rawError: "APOLLO_API_KEY not configured" };
  }
  const body: Record<string, unknown> = {
    q_organization_domains: args.domain,
    page: 1,
    per_page: args.perPage,
  };
  if (args.persona?.titles?.length) body.person_titles = args.persona.titles;
  if (args.persona?.seniorities?.length) {
    body.person_seniorities = args.persona.seniorities;
  }
  if (args.persona?.departments?.length) {
    body.person_departments = args.persona.departments;
  }

  let res: Response;
  try {
    res = await fetch(`${APOLLO_API_BASE}/api/v1/mixed_people/api_search`, {
      method: "POST",
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        "X-Api-Key": APOLLO_API_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      people: [],
      status: 0,
      rawError: err instanceof Error ? err.message : String(err),
    };
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      people: [],
      status: res.status,
      rawError: text.slice(0, 240),
    };
  }
  let parsed: { people?: ApolloPerson[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    return { people: [], status: res.status, rawError: "Apollo: malformed JSON" };
  }
  const people = Array.isArray(parsed?.people) ? parsed.people : [];
  return { people, status: res.status };
}

async function hunterEmailFinder(args: {
  domain: string;
  first_name: string;
  last_name: string;
}): Promise<{
  email: string | null;
  confidence?: number;
  verification?: unknown;
  raw?: unknown;
  status: number;
  rawError?: string;
}> {
  if (!HUNTER_API_KEY) {
    return { email: null, status: 0, rawError: "HUNTER_API_KEY not configured" };
  }
  const url =
    `https://api.hunter.io/v2/email-finder?domain=${
      encodeURIComponent(args.domain)
    }&first_name=${encodeURIComponent(args.first_name)}&last_name=${
      encodeURIComponent(args.last_name)
    }&api_key=${encodeURIComponent(HUNTER_API_KEY)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET" });
  } catch (err) {
    return {
      email: null,
      status: 0,
      rawError: err instanceof Error ? err.message : String(err),
    };
  }
  if (!res.ok) {
    return { email: null, status: res.status };
  }
  const parsed = await res.json().catch(() => null);
  const email = (parsed as any)?.data?.email || null;
  const confidence = (parsed as any)?.data?.score;
  const verification = (parsed as any)?.data?.verification ?? null;
  return {
    email,
    confidence,
    verification,
    raw: (parsed as any)?.data ?? null,
    status: res.status,
  };
}

function buildSourceContactKey(
  domain: string,
  email: string | null,
  firstName: string | null,
  lastName: string | null,
): string {
  if (email) return `apollo:${email.toLowerCase()}`;
  return `apollo:${domain}:${(firstName || "").toLowerCase()}:${
    (lastName || "").toLowerCase()
  }`;
}

async function processCompany(
  supabase: ReturnType<typeof createClient>,
  company: CompanyRow,
  opts: {
    limitPerCompany: number;
    persona?: Persona;
    force: boolean;
  },
): Promise<ProcessResult> {
  const result: ProcessResult = {
    apolloHits: 0,
    hunterHits: 0,
    contactsInserted: 0,
    contactsExisting: 0,
    errors: [],
  };

  const domain = safeDomain(company.domain) || safeDomain(company.website);
  if (!domain) {
    result.skipReason = "no_domain";
    return result;
  }

  if (!opts.force) {
    const { count, error: countError } = await supabase
      .from("lit_contacts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id);
    if (countError) {
      result.errors.push({
        stage: "count_existing_contacts",
        message: countError.message,
      });
    } else if ((count ?? 0) >= ALREADY_ENRICHED_THRESHOLD) {
      result.skipReason = "already_enriched";
      return result;
    }
  }

  const apollo = await apolloPeopleSearch({
    domain,
    perPage: opts.limitPerCompany,
    persona: opts.persona,
  });
  if (apollo.status !== 200 && apollo.rawError) {
    result.errors.push({
      stage: "apollo",
      message: `Apollo ${apollo.status}: ${apollo.rawError}`.trim(),
    });
  }
  result.apolloHits = apollo.people.length;

  for (const person of apollo.people) {
    let email =
      person.email && !isPlaceholderEmail(person.email) ? person.email : null;
    let hunterRaw: unknown = null;
    let hunterConfidence: number | undefined;
    let hunterVerification: unknown = null;

    if (
      !email &&
      person.first_name &&
      person.last_name &&
      HUNTER_API_KEY
    ) {
      const hunter = await hunterEmailFinder({
        domain,
        first_name: person.first_name,
        last_name: person.last_name,
      });
      if (hunter.email) {
        email = hunter.email;
        hunterRaw = hunter.raw;
        hunterConfidence = hunter.confidence;
        hunterVerification = hunter.verification;
        result.hunterHits += 1;
      } else if (hunter.status >= 400) {
        result.errors.push({
          stage: "hunter",
          message: `Hunter ${hunter.status}`,
        });
      }
    }

    const fullName =
      person.name ||
      [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
    if (!fullName && !email) {
      // Nothing useful to persist
      continue;
    }

    const sourceContactKey = buildSourceContactKey(
      domain,
      email,
      person.first_name ?? null,
      person.last_name ?? null,
    );

    const rawPayload: Record<string, unknown> = { apollo: person };
    if (hunterRaw || hunterConfidence !== undefined) {
      rawPayload.hunter = {
        confidence: hunterConfidence,
        verification: hunterVerification,
        raw: hunterRaw,
      };
    }

    const { data: existing, error: existingErr } = await supabase
      .from("lit_contacts")
      .select("id")
      .eq("source", "apollo")
      .eq("source_contact_key", sourceContactKey)
      .maybeSingle();
    if (existingErr) {
      result.errors.push({
        stage: "lit_contacts.select",
        message: existingErr.message,
      });
      continue;
    }

    const row = {
      source: "apollo",
      source_contact_key: sourceContactKey,
      company_id: company.id,
      full_name: fullName || email || sourceContactKey,
      first_name: person.first_name || null,
      last_name: person.last_name || null,
      title: person.title || null,
      department: Array.isArray(person.departments) && person.departments.length
        ? person.departments[0]
        : null,
      seniority: person.seniority || null,
      email,
      phone: null,
      linkedin_url: person.linkedin_url || null,
      city: person.city || null,
      state: person.state || null,
      country_code: person.country || null,
      raw_payload: rawPayload,
    };

    if (existing?.id) {
      const { error: updateErr } = await supabase
        .from("lit_contacts")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateErr) {
        result.errors.push({
          stage: "lit_contacts.update",
          message: updateErr.message,
        });
      } else {
        result.contactsExisting += 1;
      }
    } else {
      const { error: insertErr } = await supabase
        .from("lit_contacts")
        .insert(row);
      if (insertErr) {
        if ((insertErr as { code?: string }).code === "23505") {
          // SELECT-then-INSERT race: another worker just inserted the
          // same (source, source_contact_key). Treat as existing.
          result.contactsExisting += 1;
        } else {
          result.errors.push({
            stage: "lit_contacts.insert",
            message: insertErr.message,
          });
        }
      } else {
        result.contactsInserted += 1;
      }
    }
  }

  return result;
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  const queue = items.slice();
  const running: Array<Promise<void>> = [];

  async function next(): Promise<void> {
    const item = queue.shift();
    if (item === undefined) return;
    await worker(item);
    return next();
  }

  for (let i = 0; i < Math.min(concurrency, queue.length || 1); i += 1) {
    running.push(next());
  }
  await Promise.all(running);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { ok: false, error: "Supabase env not configured" },
        500,
      );
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return jsonResponse(
        { ok: false, error: "Missing authorization header" },
        401,
      );
    }
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse({ ok: false, error: "Empty bearer token" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      token,
    );
    if (userErr || !userData?.user) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }
    const user = userData.user;

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }
    if (!body || typeof body.campaign_id !== "string" || !body.campaign_id) {
      return jsonResponse(
        { ok: false, error: "campaign_id is required" },
        400,
      );
    }

    const force = Boolean(body.force);
    const limitPerCompany = clampLimit(body.limit_per_company);
    const persona = body.persona;

    // Verify campaign ownership.
    const { data: campaign, error: campaignErr } = await supabase
      .from("lit_campaigns")
      .select("id, user_id, name")
      .eq("id", body.campaign_id)
      .maybeSingle();
    if (campaignErr) {
      return jsonResponse(
        { ok: false, error: `Campaign lookup failed: ${campaignErr.message}` },
        500,
      );
    }
    if (!campaign) {
      return jsonResponse({ ok: false, error: "Campaign not found" }, 404);
    }
    if (campaign.user_id !== user.id) {
      return jsonResponse(
        { ok: false, error: "You do not own this campaign" },
        403,
      );
    }

    // Daily guard.
    if (!force) {
      const since = new Date(Date.now() - DAILY_GUARD_MS).toISOString();
      const { data: priorEvents } = await supabase
        .from("lit_activity_events")
        .select("id, metadata, created_at")
        .eq("user_id", user.id)
        .eq("event_type", "campaign_contact_enrichment")
        .gte("created_at", since);
      const matched = (priorEvents ?? []).find(
        (e: any) => e?.metadata?.campaign_id === body.campaign_id,
      );
      if (matched) {
        return jsonResponse({
          ok: false,
          code: "ALREADY_RAN_TODAY",
          error:
            "This campaign was already enriched in the last 24 hours. Pass force=true to re-run.",
          campaign_id: body.campaign_id,
          last_run_at: (matched as any)?.created_at ?? null,
        });
      }
    }

    // Resolve target company ids.
    let targetCompanyIds: string[] = [];
    if (Array.isArray(body.company_ids) && body.company_ids.length > 0) {
      targetCompanyIds = body.company_ids.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      );
    } else {
      const { data: rows, error: ccErr } = await supabase
        .from("lit_campaign_companies")
        .select("company_id")
        .eq("campaign_id", body.campaign_id);
      if (ccErr) {
        return jsonResponse(
          {
            ok: false,
            error: `Failed to load campaign companies: ${ccErr.message}`,
          },
          500,
        );
      }
      targetCompanyIds = (rows ?? [])
        .map((r: any) => r.company_id)
        .filter((id: any): id is string => typeof id === "string" && !!id);
    }

    if (targetCompanyIds.length === 0) {
      return jsonResponse({
        ok: true,
        campaign_id: body.campaign_id,
        companies_attempted: 0,
        companies_skipped_no_domain: 0,
        companies_skipped_already_enriched: 0,
        providers_used: { apollo: 0, hunter: 0, lusha: 0 },
        contacts_inserted: 0,
        contacts_existing: 0,
        errors: [],
        notes: ["No companies attached to this campaign"],
      });
    }

    // Load company rows once, then process with bounded concurrency.
    const { data: companiesRaw, error: companiesErr } = await supabase
      .from("lit_companies")
      .select("id, name, domain, website")
      .in("id", targetCompanyIds);
    if (companiesErr) {
      return jsonResponse(
        { ok: false, error: `Failed to load companies: ${companiesErr.message}` },
        500,
      );
    }
    const companies: CompanyRow[] = (companiesRaw ?? []) as CompanyRow[];

    const summary = {
      campaign_id: body.campaign_id,
      companies_attempted: 0,
      companies_skipped_no_domain: 0,
      companies_skipped_already_enriched: 0,
      providers_used: { apollo: 0, hunter: 0, lusha: 0 },
      contacts_inserted: 0,
      contacts_existing: 0,
      errors: [] as SummaryError[],
      notes: [] as string[],
    };

    if (!APOLLO_API_KEY) {
      summary.notes.push("APOLLO_API_KEY not configured — Apollo skipped.");
    }
    if (!HUNTER_API_KEY) {
      summary.notes.push("HUNTER_API_KEY not configured — Hunter skipped.");
    }
    if (LUSHA_API_KEY) {
      summary.notes.push(
        "LUSHA_API_KEY present but Lusha fallback intentionally skipped in D-0a; use lusha-contact-search separately if needed.",
      );
    } else {
      summary.notes.push("LUSHA_API_KEY not configured — Lusha skipped.");
    }

    await runWithConcurrency(
      companies,
      async (company) => {
        summary.companies_attempted += 1;
        try {
          const r = await processCompany(supabase, company, {
            limitPerCompany,
            persona,
            force,
          });
          summary.providers_used.apollo += r.apolloHits;
          summary.providers_used.hunter += r.hunterHits;
          summary.contacts_inserted += r.contactsInserted;
          summary.contacts_existing += r.contactsExisting;
          if (r.skipReason === "no_domain") {
            summary.companies_skipped_no_domain += 1;
          } else if (r.skipReason === "already_enriched") {
            summary.companies_skipped_already_enriched += 1;
          }
          for (const err of r.errors) {
            summary.errors.push({
              company_id: company.id,
              stage: err.stage,
              message: err.message,
            });
          }
        } catch (err) {
          summary.errors.push({
            company_id: company.id,
            stage: "process",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      },
      MAX_CONCURRENCY,
    );

    // Activity log (best-effort; failure does not break the response).
    try {
      const { error: logErr } = await supabase
        .from("lit_activity_events")
        .insert({
          user_id: user.id,
          event_type: "campaign_contact_enrichment",
          metadata: {
            campaign_id: body.campaign_id,
            limit_per_company: limitPerCompany,
            force,
            persona: persona ?? null,
            summary: {
              companies_attempted: summary.companies_attempted,
              companies_skipped_no_domain: summary.companies_skipped_no_domain,
              companies_skipped_already_enriched:
                summary.companies_skipped_already_enriched,
              providers_used: summary.providers_used,
              contacts_inserted: summary.contacts_inserted,
              contacts_existing: summary.contacts_existing,
              error_count: summary.errors.length,
            },
          },
        });
      if (logErr) {
        summary.notes.push(
          `lit_activity_events insert warning: ${logErr.message}`,
        );
      }
    } catch (err) {
      summary.notes.push(
        `lit_activity_events insert warning: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return jsonResponse({ ok: true, ...summary });
  } catch (err) {
    logFn({
      stage: "fatal",
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(
      {
        ok: false,
        error: "Internal server error",
        detail: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});
