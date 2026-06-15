import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") || "";
// People Enrichment endpoints. We prefer bulk_match for batches; fall
// back to single match when only one target is provided.
const APOLLO_MATCH_URL = "https://api.apollo.io/api/v1/people/match";
const APOLLO_BULK_MATCH_URL = "https://api.apollo.io/api/v1/people/bulk_match";
const BULK_MAX = 10;

// Plan-based monthly enrichment caps. Super-admins bypass.
const PLAN_ENRICH_MONTHLY: Record<string, number> = {
  free_trial: 0,
  starter: 50,
  pro: 250,
  growth: 500,
  scale: 2000,
  enterprise: 999999,
};

interface ApolloEnrichTarget {
  // Either Apollo person id OR a richer identification block. The
  // edge function passes whichever fields are available.
  id?: string | null;
  apollo_id?: string | null;
  apollo_person_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  domain?: string | null;
  organization_name?: string | null;
  title?: string | null;
  company_id?: string | null;
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
}

interface ApolloEnrichRequest {
  contacts?: ApolloEnrichTarget[];
  contact?: ApolloEnrichTarget;
  company_id?: string | null;
  domain?: string | null;
  company_name?: string | null;
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
  /** Phase 3 — frontend alias for reveal_phone_number. When true,
   *  Apollo enrichment is requested with reveal_phone_number=true,
   *  charges 10 credits per contact, and (because Apollo's phone
   *  pipeline is async) returns a pending status until the
   *  apollo-phone-webhook delivers the number. */
  unlock_phone?: boolean;
}

interface NormalizedContact {
  source: "apollo";
  source_contact_key: string;
  apollo_person_id: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  department: string | null;
  seniority: string | null;
  email: string | null;
  email_status: string | null;
  phone: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  country_code: string | null;
  organization_name: string | null;
  organization_domain: string | null;
  enriched_at: string;
  raw_payload: Record<string, unknown>;
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

function deriveFullName(p: Record<string, any>): string | null {
  const candidate =
    p?.name ||
    p?.full_name ||
    [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
    [p?.firstName, p?.lastName].filter(Boolean).join(" ").trim() ||
    null;
  return candidate || null;
}

// Apollo returns locked-email markers with the literal "domain.com"
// suffix on free/older plans, but the actual company domain
// substituted on others — e.g. `email_not_unlocked@olddominion.com`.
// Match the prefix only so we never store a fake email.
const APOLLO_LOCKED_EMAIL_PREFIX = "email_not_unlocked@";
function isLockedEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.startsWith(APOLLO_LOCKED_EMAIL_PREFIX);
}

function normalizeApolloPerson(p: Record<string, any>): NormalizedContact {
  const firstName = p.first_name || p.firstName || null;
  const lastName = p.last_name || p.lastName || null;
  const fullName = deriveFullName(p);
  const org = p.organization || {};
  const domain = normalizeDomain(org.primary_domain || org.website_url || null);
  const apolloId = p.id || p.person_id || null;
  const rawEmail = p.email;
  const lockedEmail = isLockedEmail(rawEmail);
  return {
    source: "apollo",
    apollo_person_id: apolloId ? String(apolloId) : null,
    source_contact_key: String(apolloId || `${fullName}-${domain || ""}`),
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    title: p.title || null,
    department: Array.isArray(p.departments) ? p.departments[0] : p.departments || null,
    seniority: p.seniority || null,
    email: rawEmail && !lockedEmail ? rawEmail : null,
    email_status: lockedEmail ? "locked" : (p.email_status || null),
    phone:
      (Array.isArray(p.phone_numbers) && p.phone_numbers[0]?.sanitized_number) ||
      p.phone || null,
    linkedin_url: p.linkedin_url || null,
    city: p.city || null,
    state: p.state || null,
    country_code: p.country || null,
    organization_name: org.name || null,
    organization_domain: domain,
    enriched_at: new Date().toISOString(),
    raw_payload: p,
  };
}

async function isSuperAdmin(adminClient: any, user: any): Promise<boolean> {
  if (!user) return false;
  try {
    const { data: row } = await adminClient
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (row?.user_id) return true;
  } catch (_) {}
  const email = String(user.email || "").trim().toLowerCase();
  if (email) {
    const envList = (Deno.env.get("SUPER_ADMIN_EMAILS") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (envList.includes(email)) return true;
  }
  const appMeta = user.app_metadata || {};
  if (appMeta.is_super_admin === true) return true;
  const appRole = String(appMeta.role || "").toLowerCase();
  if (appRole === "super_admin" || appRole === "platform_admin") return true;
  for (const t of ["org_members", "org_memberships"] as const) {
    try {
      const { data } = await adminClient.from(t).select("role").eq("user_id", user.id);
      if (Array.isArray(data)) {
        for (const r of data) {
          const rr = String(r?.role || "").toLowerCase();
          if (rr === "owner" || rr === "admin" || rr === "super_admin") return true;
        }
      }
    } catch (_) {}
  }
  try {
    const { data } = await adminClient
      .from("organization_memberships")
      .select("org_role")
      .eq("user_id", user.id);
    if (Array.isArray(data)) {
      for (const r of data) {
        const rr = String(r?.org_role || "").toLowerCase();
        if (rr === "owner" || rr === "admin" || rr === "super_admin") return true;
      }
    }
  } catch (_) {}
  return false;
}

async function getOrgIdAndPlan(
  adminClient: any,
  userId: string,
): Promise<{ orgId: string | null; plan: string }> {
  for (const t of ["org_members", "org_memberships"] as const) {
    try {
      const { data: row } = await adminClient
        .from(t)
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (row?.org_id) {
        const { data: org } = await adminClient
          .from("organizations")
          .select("plan")
          .eq("id", row.org_id)
          .maybeSingle();
        const plan = org?.plan ? String(org.plan).toLowerCase() : "free_trial";
        return { orgId: row.org_id, plan };
      }
    } catch (_) {}
  }
  return { orgId: null, plan: "free_trial" };
}

function buildIdentifierBlock(t: ApolloEnrichTarget, fallbackDomain: string | null, fallbackOrgName: string | null): Record<string, unknown> | null {
  const id = t.id || t.apollo_id || t.apollo_person_id || null;
  const firstName = t.first_name || null;
  const lastName = t.last_name || null;
  const name =
    t.name ||
    t.full_name ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    null;
  const domain = normalizeDomain(t.domain) || fallbackDomain;
  const linkedin = t.linkedin_url || null;
  const orgName = t.organization_name || fallbackOrgName;

  // Apollo doc: enrichment works best with full name + company domain.
  // Refuse weak identifiers (first-name only, title only, name only)
  // before we waste a credit.
  const hasStrongId = !!(
    id ||
    linkedin ||
    (name && (domain || orgName)) ||
    (firstName && lastName && (domain || orgName))
  );
  if (!hasStrongId) return null;

  const block: Record<string, unknown> = {};
  if (id) block.id = String(id);
  if (firstName) block.first_name = firstName;
  if (lastName) block.last_name = lastName;
  if (name) block.name = name;
  if (t.email) block.email = t.email;
  if (linkedin) block.linkedin_url = linkedin;
  if (domain) block.domain = domain;
  if (orgName) block.organization_name = orgName;
  if (t.title) block.title = t.title;
  if (t.reveal_personal_emails) block.reveal_personal_emails = true;
  if (t.reveal_phone_number) block.reveal_phone_number = true;
  return block;
}

async function apolloPost(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": APOLLO_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (_) {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, raw };
}

async function bulkMatch(
  identifiers: Array<Record<string, unknown>>,
  shared: { reveal_personal_emails?: boolean; reveal_phone_number?: boolean },
): Promise<{
  ok: boolean;
  status: number;
  people: any[];
  raw: string;
  phone_request_ids?: Array<string | null>;
  phone_queued?: boolean;
}> {
  if (identifiers.length === 0) {
    return { ok: true, status: 200, people: [], raw: "" };
  }
  const body: Record<string, unknown> = { details: identifiers };
  if (shared.reveal_personal_emails) body.reveal_personal_emails = true;
  if (shared.reveal_phone_number) body.reveal_phone_number = true;
  const r = await apolloPost(APOLLO_BULK_MATCH_URL, body);
  if (!r.ok) {
    return { ok: false, status: r.status, people: [], raw: r.raw };
  }
  // Apollo's bulk_match shape: { matches: [...] } or { people: [...] }.
  const arr: any[] = Array.isArray(r.data?.matches)
    ? r.data.matches
    : Array.isArray(r.data?.people)
      ? r.data.people
      : [];
  // Each entry may itself be { person: {...} } or the person directly.
  const people = arr.map((m) => (m && m.person ? m.person : m)).filter(Boolean);
  // Phase 3 — collect per-person phone request_ids when async phone unlock is on.
  const phoneRequestIds = people.map(
    (p: any) =>
      (p?.phone_numbers_request_id as string | undefined) ||
      (p?.request_id as string | undefined) ||
      null,
  );
  const phoneQueued =
    shared.reveal_phone_number === true &&
    (r.data?.status === "queued" || phoneRequestIds.some((id) => !!id));
  return {
    ok: true,
    status: r.status,
    people,
    raw: r.raw,
    phone_request_ids: phoneRequestIds,
    phone_queued: phoneQueued,
  };
}

async function singleMatch(
  identifier: Record<string, unknown>,
  shared: { reveal_personal_emails?: boolean; reveal_phone_number?: boolean },
): Promise<{
  ok: boolean;
  status: number;
  person: any | null;
  raw: string;
  phone_request_id?: string | null;
  phone_queued?: boolean;
}> {
  const body: Record<string, unknown> = { ...identifier };
  // Default ON for email reveal (cheap). Phone reveal only when caller asks
  // because it kicks Apollo into the async pipeline and changes the response shape.
  if (shared.reveal_personal_emails !== false) {
    body.reveal_personal_emails = true;
  }
  if (shared.reveal_phone_number === true) {
    body.reveal_phone_number = true;
  }
  const r = await apolloPost(APOLLO_MATCH_URL, body);
  if (!r.ok) return { ok: false, status: r.status, person: null, raw: r.raw };
  const person = r.data?.person || r.data?.match || null;
  // Phase 3 — Apollo's async phone pipeline returns the person record
  // immediately but adds `phone_numbers_request_id` (or `request_id` at
  // the top level for fully async responses) until the phone webhook
  // fires. Surface it so we can persist phone_unlock_request_id.
  const phoneRequestId: string | null =
    (person?.phone_numbers_request_id as string | undefined) ||
    (r.data?.phone_numbers_request_id as string | undefined) ||
    (r.data?.request_id as string | undefined) ||
    null;
  const phoneQueued =
    shared.reveal_phone_number === true &&
    (r.data?.status === "queued" || !!phoneRequestId);
  return {
    ok: true,
    status: r.status,
    person,
    raw: r.raw,
    phone_request_id: phoneRequestId,
    phone_queued: phoneQueued,
  };
}

/**
 * Resolve a `company_id` payload into a real `lit_companies.id` UUID.
 * Accepts either a UUID directly or a `source_company_key` slug like
 * "company/old-navy". Returns null when neither matches a row, so the
 * caller can decide whether to insert with a null company_id (still
 * valid) or short-circuit.
 */
async function resolveCompanyUuid(
  adminClient: any,
  raw: string | null | undefined,
): Promise<string | null> {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  if (isUuid) return value;
  // Treat anything non-UUID as a source_company_key slug. Add the
  // legacy "company/" prefix when the caller forgot it.
  const candidates = [value];
  if (!value.startsWith("company/")) candidates.push(`company/${value}`);
  for (const cand of candidates) {
    try {
      const { data } = await adminClient
        .from("lit_companies")
        .select("id")
        .eq("source_company_key", cand)
        .maybeSingle();
      if (data?.id) return String(data.id);
    } catch (_) {}
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing authorization header", code: "UNAUTHENTICATED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!APOLLO_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "Contact enrichment is not configured.", code: "APOLLO_NOT_CONFIGURED" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: ApolloEnrichRequest = await req.json().catch(() => ({}));
    const targets: ApolloEnrichTarget[] = Array.isArray(body.contacts)
      ? body.contacts
      : body.contact
        ? [body.contact]
        : [];

    if (!targets.length) {
      return new Response(
        JSON.stringify({ ok: false, error: "No contacts provided to enrich", code: "NO_TARGETS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fallbackDomain = normalizeDomain(body.domain ?? null);
    const fallbackOrgName = body.company_name?.trim() || null;
    // Phase 3 — `unlock_phone` is the new frontend flag for phone unlocks.
    // Treat as alias for `reveal_phone_number`; either upgrades the
    // request to async phone delivery (10 credits each).
    const phoneUnlockRequested =
      body.unlock_phone === true || body.reveal_phone_number === true;
    // reveal_personal_emails = true: cheap unlock, returns email inline.
    // reveal_phone_number = ASYNC on Apollo's side — the response no
    // longer contains the person record directly, just a request_id
    // that has to be polled. Default OFF so the immediate response
    // still parses; phone numbers Apollo already has on file come
    // through `phone_numbers[]` regardless of this flag.
    const sharedReveal = {
      reveal_personal_emails: body.reveal_personal_emails !== false,
      reveal_phone_number: phoneUnlockRequested,
    };

    // Resolve company_id slug ("company/old-navy") to a real lit_companies
    // UUID before we insert. Without this, the row gets stored with a
    // string that listContacts() can never find on reload.
    const resolvedCompanyId = await resolveCompanyUuid(supabase, body.company_id ?? null);

    // Auto-save the company to lit_saved_companies for this user.
    // Without this, a user who enriches a contact for a company they
    // haven't explicitly saved will lose visibility into the resulting
    // row — lit_contacts SELECT RLS only allows reads when the
    // contact's company is in the user's saved list. The user
    // demonstrably cares about the company (they just spent a credit
    // enriching it), so saving it makes the workflow work end-to-end.
    if (resolvedCompanyId && user?.id) {
      try {
        await supabase
          .from("lit_saved_companies")
          .upsert(
            {
              user_id: user.id,
              company_id: resolvedCompanyId,
              last_activity_at: new Date().toISOString(),
            },
            { onConflict: "user_id,company_id" },
          );
      } catch (err) {
        // Non-fatal — the contact still got enriched even if the
        // saved-company upsert hits a missing constraint or RLS.
        console.warn(
          "[apollo-contact-enrich] auto-save company failed",
          (err as any)?.message || err,
        );
      }
    }

    // Plan + super-admin bypass for monthly enrichment cap.
    const bypassLimits = await isSuperAdmin(supabase, user);
    const { orgId, plan } = await getOrgIdAndPlan(supabase, user.id);
    const monthlyLimit = bypassLimits
      ? PLAN_ENRICH_MONTHLY.enterprise
      : PLAN_ENRICH_MONTHLY[plan] ?? PLAN_ENRICH_MONTHLY.free_trial;

    // Phase 3 — phone unlocks cost 10 credits each on top of the 1-credit
    // email-unlock baseline. Phones go through Apollo's async pipeline.
    const PHONE_UNLOCK_CREDITS = 10;
    const EMAIL_UNLOCK_CREDITS = 1;
    const perContactCost = phoneUnlockRequested
      ? EMAIL_UNLOCK_CREDITS + PHONE_UNLOCK_CREDITS
      : EMAIL_UNLOCK_CREDITS;
    const creditAction = phoneUnlockRequested ? "enrich_phone" : "enrich_email";

    // Phase 3 R4 — per-user daily phone-unlock cap. Apollo's plan quota is
    // shared org-wide. Without per-USER limits a single seat could burn
    // the entire org budget on day 1, so we add a per-user safeguard on
    // top of the existing org-wide quota check.
    if (phoneUnlockRequested && !bypassLimits) {
      try {
        // Resolve the user's plan-tier daily cap.
        let userDailyLimit = 30;
        try {
          const { data: planRow } = await supabase
            .from("plans")
            .select("user_phone_daily_limit")
            .eq("code", plan)
            .maybeSingle();
          const cap = (planRow as any)?.user_phone_daily_limit;
          if (typeof cap === "number") userDailyLimit = cap;
        } catch (_) {}

        // Count this user's phone unlocks in the last 24h from the credit ledger.
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: phoneUnlocksUsed } = await supabase
          .from("lit_credit_ledger")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("action", "enrich_phone")
          .gte("created_at", since24h);
        const usedToday = typeof phoneUnlocksUsed === "number" ? phoneUnlocksUsed : 0;

        if (usedToday + targets.length > userDailyLimit) {
          // Compute next reset: 24h after the oldest counted insert (close-enough).
          const retryAfter = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          return new Response(
            JSON.stringify({
              ok: false,
              code: "USER_RATE_LIMITED",
              reason: "user_rate_limited",
              feature: "enrich_phone",
              user_phone_unlocks_used_24h: usedToday,
              user_phone_daily_limit: userDailyLimit,
              requested: targets.length,
              retry_after: retryAfter,
              plan,
              message: `Per-user phone unlock cap reached on the ${plan} plan (${usedToday} of ${userDailyLimit} used in last 24h).`,
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (_) {
        // If the ledger check fails, fall through — org-wide quota still applies.
      }
    }

    // Enrichment Phase 1: credit-based pre-flight. Email unlock = 1 credit.
    // Phase 3 (phones) charges 10 extra per contact. Super-admins bypass.
    // We pre-flight before the Apollo call so we don't burn provider credits
    // we can't bill back. Per-contact ledger insert happens after each success.
    if (!bypassLimits) {
      try {
        const { data: pre, error: preErr } = await supabase.rpc(
          "lit_get_credit_usage",
          { p_org_id: orgId, p_user_id: user.id },
        );
        if (!preErr && pre && typeof pre === "object") {
          const quota = (pre as any).quota as number | null;
          const used = ((pre as any).used_this_month as number | undefined) ?? 0;
          const willCost = targets.length * perContactCost;
          if (quota !== null && quota !== undefined && used + willCost > quota) {
            return new Response(
              JSON.stringify({
                ok: false,
                code: "CREDIT_QUOTA_EXCEEDED",
                feature: creditAction,
                credits_used: used,
                credits_quota: quota,
                credits_requested: willCost,
                plan,
                message: `Enrichment credit cap reached on the ${plan} plan (${used} of ${quota} used this month).`,
              }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      } catch (_) {
        // RPC not deployed in this env — fall through to legacy gate below.
      }
    }

    // Pre-flight: refuse if requested batch exceeds remaining cap.
    if (!bypassLimits && monthlyLimit !== PLAN_ENRICH_MONTHLY.enterprise) {
      // Try to count this month via consume_usage tables. Falls back to 0.
      const since = new Date();
      since.setUTCDate(1);
      since.setUTCHours(0, 0, 0, 0);
      let used = 0;
      try {
        const { count } = await supabase
          .from("lit_usage_ledger")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("feature_key", "contact_enrichment")
          .gte("created_at", since.toISOString());
        used = typeof count === "number" ? count : 0;
      } catch (_) {}
      if (used + targets.length > monthlyLimit) {
        return new Response(
          JSON.stringify({
            ok: false,
            code: "LIMIT_EXCEEDED",
            feature: "contact_enrichment",
            used,
            limit: monthlyLimit,
            requested: targets.length,
            plan,
            message: `Contact enrichment limit reached on the ${plan} plan (${used} of ${monthlyLimit} used this period).`,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Build identifier blocks; skip targets too weak to match.
    const ids: Array<{ block: Record<string, unknown>; idx: number }> = [];
    const skipped: Array<{ index: number; reason: string }> = [];
    targets.forEach((t, i) => {
      const block = buildIdentifierBlock(t, fallbackDomain, fallbackOrgName);
      if (!block) {
        skipped.push({ index: i, reason: "INSUFFICIENT_IDENTIFIERS" });
        return;
      }
      ids.push({ block, idx: i });
    });

    // Chunk into batches of BULK_MAX.
    const results: NormalizedContact[] = [];
    // Phase 3 — track per-result phone request_id for the lit_contacts row.
    const phoneRequestIdByKey = new Map<string, string | null>();
    const errors: Array<{ index: number; error: string; status?: number }> = [];

    for (let i = 0; i < ids.length; i += BULK_MAX) {
      const chunk = ids.slice(i, i + BULK_MAX);
      if (chunk.length === 1) {
        // Single-target → /people/match (cheaper, simpler payload).
        const r = await singleMatch(chunk[0].block, sharedReveal);
        if (!r.ok) {
          errors.push({ index: chunk[0].idx, error: r.raw.slice(0, 200) || "match_failed", status: r.status });
          continue;
        }
        if (!r.person) {
          errors.push({ index: chunk[0].idx, error: "no_match", status: 404 });
          continue;
        }
        const norm = normalizeApolloPerson(r.person);
        if (phoneUnlockRequested) {
          phoneRequestIdByKey.set(norm.source_contact_key, r.phone_request_id ?? null);
        }
        results.push(norm);
      } else {
        const r = await bulkMatch(chunk.map((c) => c.block), sharedReveal);
        if (!r.ok) {
          chunk.forEach((c) => errors.push({ index: c.idx, error: r.raw.slice(0, 200) || "bulk_match_failed", status: r.status }));
          continue;
        }
        // bulk_match returns matches in the same order as the input
        // details[]. Pair them so unmatched slots become "no_match".
        chunk.forEach((c, j) => {
          const person = r.people[j];
          if (!person) {
            errors.push({ index: c.idx, error: "no_match", status: 404 });
            return;
          }
          const norm = normalizeApolloPerson(person);
          if (phoneUnlockRequested) {
            const reqId = (r.phone_request_ids && r.phone_request_ids[j]) || null;
            phoneRequestIdByKey.set(norm.source_contact_key, reqId);
          }
          results.push(norm);
        });
      }
    }

    // Persist enriched contacts into lit_contacts. Upsert by
    // (source, source_contact_key) which is unique. Falls back to
    // (company_id + linkedin_url) when no apollo id.
    const persistErrors: Array<{ apollo_person_id: string | null; error: string }> = [];
    const persisted: NormalizedContact[] = [];
    for (const c of results) {
      // lit_contacts.full_name is NOT NULL. Compute a real fallback
      // so partial enrichment (Apollo returns no name) doesn't blow
      // up the insert silently.
      const safeFullName =
        c.full_name ||
        [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
        c.first_name ||
        c.last_name ||
        "Unknown contact";
      // Stick to columns that actually exist on lit_contacts. Past
      // versions tried to insert source_provider / enriched_at which
      // don't exist — every upsert silently failed in the catch and
      // the contact disappeared on reload.
      // Phase 3 — when phone unlock is requested, the phone usually arrives
      // later via apollo-phone-webhook. Persist phone_unlock_status:
      //   - 'pending'   → unlock requested, Apollo accepted the request
      //   - 'delivered' → phone already present in the immediate response
      //   - null        → no unlock requested
      const phoneReqId = phoneRequestIdByKey.get(c.source_contact_key) ?? null;
      let phoneUnlockStatus: string | null = null;
      if (phoneUnlockRequested) {
        if (c.phone) {
          phoneUnlockStatus = "delivered";
        } else {
          phoneUnlockStatus = "pending";
        }
      }
      const row: Record<string, unknown> = {
        company_id: resolvedCompanyId,
        source: c.source,
        source_contact_key: c.source_contact_key,
        full_name: safeFullName,
        first_name: c.first_name,
        last_name: c.last_name,
        title: c.title,
        department: c.department,
        seniority: c.seniority,
        email: c.email,
        phone: c.phone,
        linkedin_url: c.linkedin_url,
        city: c.city,
        state: c.state,
        country_code: c.country_code,
        email_verification_status: c.email_status,
        email_verified:
          typeof c.email_status === "string" &&
          ["verified", "valid", "deliverable"].includes(c.email_status.toLowerCase()),
        verified_by_provider:
          typeof c.email_status === "string" &&
          ["verified", "valid", "deliverable"].includes(c.email_status.toLowerCase()),
        phone_unlock_status: phoneUnlockStatus,
        phone_unlock_request_id: phoneReqId,
        raw_payload: c.raw_payload,
      };
      try {
        const { data: saved, error: upsertError } = await supabase
          .from("lit_contacts")
          .upsert(row, { onConflict: "source,source_contact_key" })
          .select()
          .single();
        if (upsertError) {
          persistErrors.push({
            apollo_person_id: c.apollo_person_id,
            error: upsertError.message || String(upsertError),
          });
          persisted.push({ ...c, full_name: safeFullName });
        } else {
          persisted.push({
            ...c,
            full_name: safeFullName,
            ...(saved ? { id: (saved as any).id } : {}),
          } as NormalizedContact);
        }
      } catch (err: any) {
        persistErrors.push({ apollo_person_id: c.apollo_person_id, error: err?.message || String(err) });
        persisted.push({ ...c, full_name: safeFullName });
      }

      // Log credit consumption per-contact (lit_usage_ledger).
      try {
        await supabase.rpc("consume_usage", {
          p_org_id: orgId,
          p_user_id: user.id,
          p_feature_key: "contact_enrichment",
          p_quantity: 1,
          p_metadata: {
            provider: "apollo",
            source_contact_key: c.source_contact_key,
            super_admin_bypass: bypassLimits,
            email_unlocked: !!c.email,
            phone_unlocked: !!c.phone,
          },
        });
      } catch (_) {
        // RPC may not exist in some environments; persist still ran.
      }

      // Enrichment Phase 1+3: credit ledger inserts. Email unlock = 1 credit,
      // Apollo phone unlock = 10 additional credits per contact (charged at
      // request time, not delivery — the user committed by clicking unlock).
      if (!bypassLimits) {
        try {
          await supabase.rpc("lit_consume_credits", {
            p_action: "enrich_email",
            p_credits: EMAIL_UNLOCK_CREDITS,
            p_metadata: {
              user_id: user.id,
              org_id: orgId,
              provider: "apollo",
              source_contact_key: c.source_contact_key,
              email_unlocked: !!c.email,
              phone_unlocked: !!c.phone,
            },
          });
        } catch (_) {
          // RPC not deployed yet — pre-flight gate above already covered it.
        }
        if (phoneUnlockRequested) {
          try {
            await supabase.rpc("lit_consume_credits", {
              p_action: "enrich_phone",
              p_credits: PHONE_UNLOCK_CREDITS,
              p_metadata: {
                user_id: user.id,
                org_id: orgId,
                provider: "apollo",
                source_contact_key: c.source_contact_key,
                phone_unlock_status: phoneUnlockStatus,
                phone_unlock_request_id: phoneReqId,
              },
            });
          } catch (_) {
            // RPC not deployed yet — pre-flight gate above already covered it.
          }
        }
      }
    }

    await supabase.from("lit_activity_events").insert({
      user_id: user.id,
      event_type: "apollo_contact_enrich",
      company_id: resolvedCompanyId,
      metadata: {
        provider: "apollo",
        endpoint: targets.length === 1 ? "people/match" : "people/bulk_match",
        requested: targets.length,
        enriched: persisted.length,
        failed: errors.length,
        skipped: skipped.length,
        plan,
        super_admin_bypass: bypassLimits,
      },
    });

    // Phase 3 — decorate persisted contacts with phone unlock status so
    // the frontend can render a "Phone pending" pill before the webhook fires.
    const persistedWithPhoneStatus = persisted.map((c) => {
      if (!phoneUnlockRequested) return c;
      const reqId = phoneRequestIdByKey.get(c.source_contact_key) ?? null;
      return {
        ...c,
        phone_unlock_status: c.phone ? "delivered" : "pending",
        phone_unlock_request_id: reqId,
      };
    });

    return new Response(
      JSON.stringify({
        ok: true,
        provider: "apollo",
        contacts: persistedWithPhoneStatus,
        count: persisted.length,
        phone_unlock_requested: phoneUnlockRequested,
        errors: errors.length ? errors : undefined,
        skipped: skipped.length ? skipped : undefined,
        persist_errors: persistErrors.length ? persistErrors : undefined,
        plan,
        super_admin_bypass: bypassLimits,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error(JSON.stringify({ fn: "apollo-contact-enrich", error: error?.message || String(error) }));
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
