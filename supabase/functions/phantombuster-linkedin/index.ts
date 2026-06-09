// Reverse-engineered from deployed v66 of phantombuster-linkedin on
// 2026-06-09 (drift audit found this hand-deployed version live in
// production with the full PhantomBuster integration — agent launching,
// job-lock concurrency, S3 fallback, contact_enrichment_jobs table —
// that the git source was missing entirely, 52-line stub vs ~830-line
// implementation). Verified deployed EZBR sha256 against this output;
// no behavior changes.
//
// CI gate (.github/workflows/edge-fn-drift-check.yml) will block any
// future PR that introduces drift between deployed and git source.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PHANTOMBUSTER_API_BASE = "https://api.phantombuster.com/api/v2";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const MAX_LINKEDIN_FILTERS = 6;

const LOCK_WINDOW_MINUTES = 5;
const CACHE_WINDOW_HOURS = 24;
const POLL_ATTEMPTS = 4;

const DEFAULT_TITLE_FILTERS = [
  "supply chain",
  "logistics",
  "procurement",
  "operations",
  "import",
  "transportation",
];

type JsonRecord = Record<string, unknown>;

type Contact = {
  name: string;
  title: string;
  linkedin: string;
  company: string;
  location: string;
  email?: string | null;
  phone?: string | null;
};

type RequestBody = {
  action?: string;
  companyName?: string;
  companyDomain?: string;
  titles?: string[];
  limit?: number;
  forceRefresh?: boolean;
  orgId?: string;
  companyId?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function stringifySafe(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return String(value ?? "");
  }
}

function nowIso() {
  return new Date().toISOString();
}

function minutesAgoIso(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function normalizeDomain(input?: string | null) {
  if (!input) return "";

  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .trim();
}

function normalizeCompanyName(input?: string | null) {
  return (input || "").trim();
}

function safeLimit(input: unknown) {
  const parsed = typeof input === "number" ? input : Number(input);

  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;

  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function normalizeTitleFilters(input: unknown) {
  const titles = Array.isArray(input)
    ? input
        .map((title) => String(title || "").trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_TITLE_FILTERS;

  const unique: string[] = [];

  for (const title of titles.length ? titles : DEFAULT_TITLE_FILTERS) {
    if (unique.includes(title)) continue;
    unique.push(title);
  }

  return unique.slice(0, MAX_LINKEDIN_FILTERS);
}

function buildPositionFilter(titles: string[]) {
  return titles
    .map((title) => title.trim())
    .filter(Boolean)
    .slice(0, MAX_LINKEDIN_FILTERS)
    .join(" OR ");
}

function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Job lock/cache disabled.");
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getPhantomHeaders(apiKey: string, orgId?: string): HeadersInit {
  const headers: HeadersInit = {
    "X-Phantombuster-Key": apiKey,
    "Content-Type": "application/json",
  };

  if (orgId) {
    headers["X-Phantombuster-Org"] = orgId;
  }

  return headers;
}

function pickString(row: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function normalizeContact(row: unknown): Contact | null {
  if (!row || typeof row !== "object") return null;

  const r = row as JsonRecord;

  const firstName = pickString(r, [
    "firstName",
    "first_name",
    "firstname",
    "givenName",
  ]);

  const lastName = pickString(r, [
    "lastName",
    "last_name",
    "lastname",
    "familyName",
  ]);

  const name =
    pickString(r, [
      "name",
      "fullName",
      "full_name",
      "profileName",
      "personName",
    ]) || `${firstName} ${lastName}`.trim();

  const title = pickString(r, [
    "title",
    "headline",
    "jobTitle",
    "job_title",
    "position",
    "currentJobTitle",
  ]);

  const linkedin = pickString(r, [
    "linkedin",
    "linkedIn",
    "linkedinUrl",
    "linkedInUrl",
    "profileUrl",
    "profile_url",
    "url",
  ]);

  const company = pickString(r, [
    "company",
    "companyName",
    "organization",
    "currentCompany",
    "currentCompanyName",
  ]);

  const location = pickString(r, [
    "location",
    "city",
    "geo",
    "country",
    "region",
  ]);

  const email =
    pickString(r, [
      "email",
      "emailAddress",
      "email_address",
      "professionalEmail",
    ]) || null;

  const phone =
    pickString(r, [
      "phone",
      "phoneNumber",
      "phone_number",
      "mobilePhone",
    ]) || null;

  if (!name && !linkedin) return null;

  return {
    name: name || "Unknown",
    title,
    linkedin,
    company,
    location,
    email,
    phone,
  };
}

function uniqueContacts(contacts: Contact[]) {
  const seen = new Set<string>();
  const unique: Contact[] = [];

  for (const contact of contacts) {
    const key = [
      contact.linkedin || "",
      contact.name || "",
      contact.title || "",
      contact.company || "",
    ]
      .join("|")
      .toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    unique.push(contact);
  }

  return unique;
}

function normalizeContacts(payload: unknown): Contact[] {
  if (Array.isArray(payload)) {
    return uniqueContacts(payload.map(normalizeContact).filter(Boolean) as Contact[]);
  }

  if (!payload || typeof payload !== "object") return [];

  const p = payload as JsonRecord;

  const candidates =
    (Array.isArray(p.data) && p.data) ||
    (Array.isArray(p.rows) && p.rows) ||
    (Array.isArray(p.result) && p.result) ||
    (Array.isArray(p.results) && p.results) ||
    (Array.isArray(p.output) && p.output) ||
    (Array.isArray(p.contacts) && p.contacts) ||
    [];

  return uniqueContacts(
    candidates.map(normalizeContact).filter(Boolean) as Contact[],
  );
}

function payloadText(payload: unknown) {
  return typeof payload === "string" ? payload : stringifySafe(payload);
}

function isMaxParallelismError(payload: unknown) {
  const raw = payloadText(payload).toLowerCase();

  return (
    raw.includes("maxparallelismreached") ||
    raw.includes("maximum parallel executions") ||
    raw.includes("parallel executions limit")
  );
}

function isRateLimitError(status: number, payload: unknown) {
  const raw = payloadText(payload).toLowerCase();

  return (
    status === 429 ||
    raw.includes("rate limit") ||
    raw.includes("daily api rate limit") ||
    raw.includes("too many requests")
  );
}

function isAlreadyProcessedMessage(payload: unknown) {
  const raw = payloadText(payload).toLowerCase();

  return (
    raw.includes("input already processed") ||
    raw.includes("already scraped") ||
    raw.includes("company list is already scraped") ||
    raw.includes("provided company list is already scraped")
  );
}

function isTooManyFiltersMessage(payload: unknown) {
  const raw = payloadText(payload).toLowerCase();

  return (
    raw.includes("more than 6 filters") ||
    raw.includes("using more than 6 filters") ||
    raw.includes("doesn't work on linkedin") ||
    raw.includes("does not work on linkedin")
  );
}

async function markJob(
  supabase: ReturnType<typeof createClient> | null,
  jobId: string | null,
  values: JsonRecord,
) {
  if (!supabase || !jobId) return;

  await supabase
    .from("contact_enrichment_jobs")
    .update({
      ...values,
      updated_at: nowIso(),
    })
    .eq("id", jobId);
}

async function findRecentCachedJob(args: {
  supabase: ReturnType<typeof createClient> | null;
  companyDomain: string;
  companyName: string;
}) {
  const { supabase, companyDomain, companyName } = args;
  if (!supabase) return null;

  let query = supabase
    .from("contact_enrichment_jobs")
    .select("id, status, company_name, company_domain, result_count, raw_debug, created_at, completed_at")
    .eq("provider", "phantombuster")
    .eq("status", "completed")
    .gte("created_at", hoursAgoIso(CACHE_WINDOW_HOURS))
    .order("created_at", { ascending: false })
    .limit(1);

  if (companyDomain) {
    query = query.eq("company_domain", companyDomain);
  } else {
    query = query.eq("company_name", companyName);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) return null;

  const rawDebug = data.raw_debug as JsonRecord | null;
  const contacts = normalizeContacts(rawDebug?.contacts ?? []);

  if (!contacts.length) return null;

  return {
    job: data,
    contacts,
  };
}

async function findActiveJob(args: {
  supabase: ReturnType<typeof createClient> | null;
  companyDomain: string;
  companyName: string;
}) {
  const { supabase, companyDomain, companyName } = args;
  if (!supabase) return null;

  let query = supabase
    .from("contact_enrichment_jobs")
    .select("id, status, company_name, company_domain, created_at, started_at")
    .eq("provider", "phantombuster")
    .in("status", ["queued", "running"])
    .gte("created_at", minutesAgoIso(LOCK_WINDOW_MINUTES))
    .order("created_at", { ascending: false })
    .limit(1);

  if (companyDomain) {
    query = query.eq("company_domain", companyDomain);
  } else {
    query = query.eq("company_name", companyName);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) return null;

  return data;
}

async function createRunningJob(args: {
  supabase: ReturnType<typeof createClient> | null;
  orgId?: string;
  companyId?: string;
  companyName: string;
  companyDomain: string;
  requestDebug: JsonRecord;
}) {
  const { supabase, orgId, companyId, companyName, companyDomain, requestDebug } = args;

  if (!supabase) return null;

  const insertPayload: JsonRecord = {
    provider: "phantombuster",
    company_name: companyName || null,
    company_domain: companyDomain || null,
    status: "running",
    started_at: nowIso(),
    raw_debug: {
      request: requestDebug,
    },
  };

  if (orgId) insertPayload.org_id = orgId;
  if (companyId) insertPayload.company_id = companyId;

  const { data, error } = await supabase
    .from("contact_enrichment_jobs")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("Failed to create contact enrichment job", error);
    return null;
  }

  return String(data.id);
}

function buildLinkedInCompanyUrl(companyName: string, companyDomain: string) {
  const cleanDomain = normalizeDomain(companyDomain);

  if (cleanDomain) {
    const domainRoot = cleanDomain.split(".")[0];
    if (domainRoot) {
      return `https://www.linkedin.com/company/${domainRoot}/`;
    }
  }

  const slug = String(companyName || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug ? `https://www.linkedin.com/company/${slug}/` : "";
}

function buildLaunchBonusArgument(args: {
  companyName: string;
  companyDomain: string;
  titles: string[];
  limit: number;
}) {
  const { companyName, companyDomain, titles, limit } = args;

  const safeTitles = normalizeTitleFilters(titles);
  const positionFilter = buildPositionFilter(safeTitles);
  const linkedinCompanyUrl = buildLinkedInCompanyUrl(companyName, companyDomain);

  return {
    spreadsheetUrl: linkedinCompanyUrl,
    numberOfResultsPerCompany: Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT),
    numberOfCompaniesPerLaunch: 1,
    positionFilter,
    requestedAt: nowIso(),

    // Debug only. PhantomBuster ignores these unless the Phantom uses them.
    companyName,
    companyDomain,
    titles: safeTitles,
  };
}

async function launchPhantom(args: {
  apiKey: string;
  agentId: string;
  phantomOrgId?: string;
  companyName: string;
  companyDomain: string;
  titles: string[];
  limit: number;
}) {
  const {
    apiKey,
    agentId,
    phantomOrgId,
    companyName,
    companyDomain,
    titles,
    limit,
  } = args;

  const bonusArgument = buildLaunchBonusArgument({
    companyName,
    companyDomain,
    titles,
    limit,
  });

  const launchPayload: JsonRecord = {
    id: String(agentId),
    bonusArgument,
  };

  const res = await fetch(`${PHANTOMBUSTER_API_BASE}/agents/launch`, {
    method: "POST",
    headers: getPhantomHeaders(apiKey, phantomOrgId),
    body: JSON.stringify(launchPayload),
  });

  const text = await res.text();
  const data = safeJsonParse(text);

  return {
    ok: res.ok,
    status: res.status,
    data,
    payload: launchPayload,
    bonusArgument,
  };
}

async function fetchOutput(args: {
  apiKey: string;
  agentId: string;
  phantomOrgId?: string;
}) {
  const { apiKey, agentId, phantomOrgId } = args;

  const res = await fetch(
    `${PHANTOMBUSTER_API_BASE}/agents/fetch-output?id=${encodeURIComponent(
      String(agentId),
    )}`,
    {
      method: "GET",
      headers: getPhantomHeaders(apiKey, phantomOrgId),
    },
  );

  const text = await res.text();
  const data = safeJsonParse(text);

  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

async function fetchResultJsonFallback(args: {
  apiKey: string;
  agentId: string;
  phantomOrgId?: string;
}) {
  const { apiKey, agentId, phantomOrgId } = args;

  const agentRes = await fetch(
    `${PHANTOMBUSTER_API_BASE}/agents/fetch?id=${encodeURIComponent(
      String(agentId),
    )}`,
    {
      method: "GET",
      headers: getPhantomHeaders(apiKey, phantomOrgId),
    },
  );

  const agentText = await agentRes.text();
  const agentData = safeJsonParse(agentText);

  if (!agentRes.ok || !agentData || typeof agentData !== "object") {
    return {
      ok: false,
      agentStatus: agentRes.status,
      agentRaw: agentData,
      resultStatus: null,
      resultUrl: null,
      resultRaw: null,
      contacts: [],
    };
  }

  const agent = agentData as JsonRecord;

  const orgS3Folder =
    typeof agent.orgS3Folder === "string" ? agent.orgS3Folder : "";

  const s3Folder =
    typeof agent.s3Folder === "string" ? agent.s3Folder : "";

  if (!orgS3Folder || !s3Folder) {
    return {
      ok: false,
      agentStatus: agentRes.status,
      agentRaw: agentData,
      resultStatus: null,
      resultUrl: null,
      resultRaw: null,
      contacts: [],
    };
  }

  const resultUrl =
    `https://phantombuster.s3.amazonaws.com/${orgS3Folder}/${s3Folder}/result.json`;

  const resultRes = await fetch(resultUrl);
  const resultText = await resultRes.text();
  const resultRaw = safeJsonParse(resultText);
  const contacts = resultRes.ok ? normalizeContacts(resultRaw) : [];

  return {
    ok: resultRes.ok,
    agentStatus: agentRes.status,
    agentRaw: agentData,
    resultStatus: resultRes.status,
    resultUrl,
    resultRaw,
    contacts,
  };
}

function noContactsMessage(args: {
  outputRaw: unknown;
  fallbackRaw: unknown;
}) {
  const { outputRaw, fallbackRaw } = args;

  if (isAlreadyProcessedMessage(outputRaw) || isAlreadyProcessedMessage(fallbackRaw)) {
    return {
      reason: "already_processed",
      message:
        "PhantomBuster launched successfully, but this company/input was already processed and returned no new contacts.",
    };
  }

  if (isTooManyFiltersMessage(outputRaw) || isTooManyFiltersMessage(fallbackRaw)) {
    return {
      reason: "too_many_filters",
      message:
        "PhantomBuster launched successfully, but LinkedIn rejected the search because too many filters were used.",
    };
  }

  return {
    reason: "no_contacts_returned",
    message: "PhantomBuster launched successfully, but no contacts were returned yet.",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(
      {
        ok: false,
        source: "phantombuster",
        message: "Method not allowed",
        contacts: [],
      },
      405,
    );
  }

  const supabase = getSupabaseAdmin();

  let jobId: string | null = null;

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const action = body.action;
    const companyName = normalizeCompanyName(body.companyName);
    const companyDomain = normalizeDomain(body.companyDomain);
    const titles = normalizeTitleFilters(body.titles);
    const positionFilter = buildPositionFilter(titles);
    const limit = safeLimit(body.limit);
    const forceRefresh = Boolean(body.forceRefresh);
    const orgId = body.orgId ? String(body.orgId) : undefined;
    const companyId = body.companyId ? String(body.companyId) : undefined;

    if (action !== "company_contacts_search") {
      return json(
        {
          ok: false,
          source: "phantombuster",
          message: "Unsupported action",
          contacts: [],
        },
        400,
      );
    }

    if (!companyName && !companyDomain) {
      return json(
        {
          ok: false,
          source: "phantombuster",
          message: "companyName or companyDomain is required",
          contacts: [],
        },
        400,
      );
    }

    const apiKey =
      Deno.env.get("PHANTOMBUSTER_API_KEY") ||
      Deno.env.get("PHANTOM_API_KEY");

    const agentId =
      Deno.env.get("PHANTOMBUSTER_AGENT_ID") ||
      Deno.env.get("PHANTOM_ID");

    const phantomOrgId =
      Deno.env.get("PHANTOMBUSTER_ORG_ID") ||
      Deno.env.get("PHANTOM_ORG_ID") ||
      undefined;

    if (!apiKey) {
      return json(
        {
          ok: false,
          source: "phantombuster",
          message: "Missing PHANTOMBUSTER_API_KEY",
          contacts: [],
        },
        500,
      );
    }

    if (!agentId) {
      return json(
        {
          ok: false,
          source: "phantombuster",
          message: "Missing PHANTOMBUSTER_AGENT_ID",
          contacts: [],
        },
        500,
      );
    }

    if (!forceRefresh) {
      const cached = await findRecentCachedJob({
        supabase,
        companyDomain,
        companyName,
      });

      if (cached?.contacts?.length) {
        return json({
          ok: true,
          source: "phantombuster",
          message: "Contacts loaded from cache",
          contacts: cached.contacts.slice(0, limit),
          debug: {
            cacheHit: true,
            cachedJobId: cached.job.id,
            usedAgentId: String(agentId),
            usedOrgHeader: phantomOrgId || null,
            requestedCompanyName: companyName || null,
            requestedCompanyDomain: companyDomain || null,
            requestedTitles: titles,
            requestedPositionFilter: positionFilter,
          },
        });
      }
    }

    const activeJob = await findActiveJob({
      supabase,
      companyDomain,
      companyName,
    });

    if (activeJob) {
      return json({
        ok: true,
        source: "phantombuster",
        message: "Contact enrichment already running. Please wait before launching again.",
        contacts: [],
        debug: {
          skipped: "launch_locked",
          existingJobId: activeJob.id,
          existingJobStatus: activeJob.status,
          existingJobCreatedAt: activeJob.created_at,
          lockWindowMinutes: LOCK_WINDOW_MINUTES,
          usedAgentId: String(agentId),
          usedOrgHeader: phantomOrgId || null,
          requestedCompanyName: companyName || null,
          requestedCompanyDomain: companyDomain || null,
          requestedTitles: titles,
          requestedPositionFilter: positionFilter,
        },
      });
    }

    jobId = await createRunningJob({
      supabase,
      orgId,
      companyId,
      companyName,
      companyDomain,
      requestDebug: {
        action,
        companyName,
        companyDomain,
        titles,
        positionFilter,
        limit,
        forceRefresh,
        agentId: String(agentId),
        phantomOrgId: phantomOrgId || null,
      },
    });

    const launch = await launchPhantom({
      apiKey,
      agentId: String(agentId),
      phantomOrgId,
      companyName,
      companyDomain,
      titles,
      limit,
    });

    if (!launch.ok) {
      const parallelismBlocked = isMaxParallelismError(launch.data);
      const rateLimited = isRateLimitError(launch.status, launch.data);
      const alreadyProcessed = isAlreadyProcessedMessage(launch.data);
      const tooManyFilters = isTooManyFiltersMessage(launch.data);

      const status = parallelismBlocked || rateLimited
        ? "rate_limited"
        : alreadyProcessed || tooManyFilters
          ? "completed"
          : "failed";

      await markJob(supabase, jobId, {
        status,
        completed_at: nowIso(),
        result_count: 0,
        error_text: payloadText(launch.data),
        raw_debug: {
          launchStatus: launch.status,
          launchRaw: launch.data,
          launchPayload: launch.payload,
          launchBonusArgument: launch.bonusArgument,
          blockedReason: parallelismBlocked
            ? "maxParallelismReached"
            : rateLimited
              ? "rateLimit"
              : alreadyProcessed
                ? "alreadyProcessed"
                : tooManyFilters
                  ? "tooManyFilters"
                  : "launchFailed",
        },
      });

      return json({
        ok: false,
        source: "phantombuster",
        message: parallelismBlocked
          ? "PhantomBuster is already running this agent. Please wait for the current run to finish."
          : rateLimited
            ? "PhantomBuster rate limit reached. Please wait and try again."
            : alreadyProcessed
              ? "PhantomBuster says this company/input was already processed and returned no new contacts."
              : tooManyFilters
                ? "PhantomBuster says LinkedIn searches cannot use more than 6 filters."
                : "Failed to launch PhantomBuster agent",
        contacts: [],
        debug: {
          launchStatus: launch.status,
          launchRaw: launch.data,
          usedAgentId: String(agentId),
          usedOrgHeader: phantomOrgId || null,
          jobId,
          requestedCompanyName: companyName || null,
          requestedCompanyDomain: companyDomain || null,
          requestedTitles: titles,
          requestedPositionFilter: positionFilter,
          launchBonusArgument: launch.bonusArgument,
        },
      });
    }

    let contacts: Contact[] = [];
    let outputStatus: number | null = null;
    let outputRaw: unknown = null;
    let attempts = 0;

    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
      attempts = attempt;

      await sleep(attempt === 1 ? 6000 : 5000);

      const output = await fetchOutput({
        apiKey,
        agentId: String(agentId),
        phantomOrgId,
      });

      outputStatus = output.status;
      outputRaw = output.data;
      contacts = output.ok ? normalizeContacts(output.data) : [];

      if (contacts.length > 0) {
        await markJob(supabase, jobId, {
          status: "completed",
          completed_at: nowIso(),
          result_count: contacts.length,
          raw_debug: {
            launchStatus: launch.status,
            launchRaw: launch.data,
            launchBonusArgument: launch.bonusArgument,
            outputStatus,
            outputRaw,
            contacts,
            attempts,
          },
        });

        return json({
          ok: true,
          source: "phantombuster",
          message: "Contacts retrieved",
          contacts: contacts.slice(0, limit),
          debug: {
            launchStatus: launch.status,
            outputStatus,
            attempts,
            jobId,
            usedAgentId: String(agentId),
            usedOrgHeader: phantomOrgId || null,
            requestedCompanyName: companyName || null,
            requestedCompanyDomain: companyDomain || null,
            requestedTitles: titles,
            requestedPositionFilter: positionFilter,
          },
        });
      }

      if (isAlreadyProcessedMessage(outputRaw) || isTooManyFiltersMessage(outputRaw)) {
        break;
      }
    }

    const fallback = await fetchResultJsonFallback({
      apiKey,
      agentId: String(agentId),
      phantomOrgId,
    });

    contacts = fallback.contacts;

    if (contacts.length > 0) {
      await markJob(supabase, jobId, {
        status: "completed",
        completed_at: nowIso(),
        result_count: contacts.length,
        raw_debug: {
          launchStatus: launch.status,
          launchRaw: launch.data,
          launchBonusArgument: launch.bonusArgument,
          outputStatus,
          lastOutputRaw: outputRaw,
          fallbackStatus: fallback.resultStatus,
          fallbackResultUrl: fallback.resultUrl,
          fallbackRaw: fallback.resultRaw,
          contacts,
          attempts,
        },
      });

      return json({
        ok: true,
        source: "phantombuster",
        message: "Contacts retrieved",
        contacts: contacts.slice(0, limit),
        debug: {
          launchStatus: launch.status,
          outputStatus,
          fallbackStatus: fallback.resultStatus,
          fallbackResultUrl: fallback.resultUrl,
          attempts,
          jobId,
          usedAgentId: String(agentId),
          usedOrgHeader: phantomOrgId || null,
          requestedCompanyName: companyName || null,
          requestedCompanyDomain: companyDomain || null,
          requestedTitles: titles,
          requestedPositionFilter: positionFilter,
        },
      });
    }

    const emptyResult = noContactsMessage({
      outputRaw,
      fallbackRaw: fallback.resultRaw,
    });

    await markJob(supabase, jobId, {
      status: "completed",
      completed_at: nowIso(),
      result_count: 0,
      raw_debug: {
        launchStatus: launch.status,
        launchRaw: launch.data,
        launchBonusArgument: launch.bonusArgument,
        outputStatus,
        lastOutputRaw: outputRaw,
        fallbackAgentStatus: fallback.agentStatus,
        fallbackResultStatus: fallback.resultStatus,
        fallbackResultUrl: fallback.resultUrl,
        fallbackResultRaw: fallback.resultRaw,
        noContactsReason: emptyResult.reason,
        attempts,
      },
    });

    return json({
      ok: true,
      source: "phantombuster",
      message: emptyResult.message,
      contacts: [],
      debug: {
        reason: emptyResult.reason,
        launchStatus: launch.status,
        outputStatus,
        fallbackAgentStatus: fallback.agentStatus,
        fallbackResultStatus: fallback.resultStatus,
        fallbackResultUrl: fallback.resultUrl,
        attempts,
        jobId,
        usedAgentId: String(agentId),
        usedOrgHeader: phantomOrgId || null,
        requestedCompanyName: companyName || null,
        requestedCompanyDomain: companyDomain || null,
        requestedTitles: titles,
        requestedPositionFilter: positionFilter,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await markJob(supabase, jobId, {
      status: "failed",
      completed_at: nowIso(),
      error_text: message,
      raw_debug: {
        error: message,
      },
    });

    return json(
      {
        ok: false,
        source: "phantombuster",
        message,
        contacts: [],
        debug: {
          jobId,
        },
      },
      500,
    );
  }
});
