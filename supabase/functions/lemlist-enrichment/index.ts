// lemlist-enrichment - async contact enrichment provider.
//
// Lemlist enrichment is asynchronous when accepted. This function submits up
// to 500 enrichment requests, records lit_contact_enrichment_jobs, and returns
// pending=true only when at least one provider request was accepted.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const log = {
  info: (event: string, data?: unknown) => console.log(JSON.stringify({ level: "info", scope: "lemlist-enrichment", event, data })),
  warn: (event: string, data?: unknown) => console.warn(JSON.stringify({ level: "warn", scope: "lemlist-enrichment", event, data })),
  error: (event: string, data?: unknown) => console.error(JSON.stringify({ level: "error", scope: "lemlist-enrichment", event, data })),
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LEMLIST_API_KEY = Deno.env.get("LEMLIST_API") || Deno.env.get("LEMLIST_API_KEY") || Deno.env.get("Lemlist_API") || "";
const LEMLIST_BASE_URL = "https://api.lemlist.com/api";

type Target = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  domain?: string | null;
  organization_name?: string | null;
  company_name?: string | null;
  title?: string | null;
  company_id?: string | null;
};

type RequestBody = {
  contacts?: Target[];
  contact?: Target;
  source_context?: string;
  source_entity_type?: string;
  source_entity_id?: string;
  enrichment_requests?: string[];
  reveal_phone_number?: boolean;
};

type LemlistSubmitResult = { res: Response; raw: any; rawText: string; authMode: "bearer" | "basic" };
type PollResult = { completed: boolean; raw: any; contact: Record<string, unknown> | null; error?: string | null };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function basicAuthHeader(apiKey: string): string {
  return `Basic ${btoa(`:${apiKey}`)}`;
}

async function parseProviderResponse(res: Response): Promise<{ raw: any; rawText: string }> {
  const rawText = await res.text().catch(() => "");
  let raw: any = null;
  try { raw = rawText ? JSON.parse(rawText) : null; } catch { raw = rawText; }
  return { raw, rawText };
}

async function submitToLemlist(payload: unknown): Promise<LemlistSubmitResult> {
  const authorization = basicAuthHeader(LEMLIST_API_KEY);
  const endpoints = [
    `${LEMLIST_BASE_URL}/v2/enrichments/bulk`,
    `${LEMLIST_BASE_URL}/enrich/bulk`,
  ];
  let last: LemlistSubmitResult | null = null;

  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify(payload),
    });
    const parsed = await parseProviderResponse(res);
    last = { res, raw: parsed.raw, rawText: parsed.rawText, authMode: "basic" };
    if (res.status !== 404 && res.status !== 405) return last;
  }

  return last!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readString(raw: any, keys: string[]): string | null {
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], raw);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function contactFromResult(raw: any): Record<string, unknown> | null {
  const source = raw?.result || raw?.data || raw?.lead || raw?.contact || raw;
  const email = readString(raw, [
    "data.email.email",
    "data.find_email.email",
    "data.findEmail.email",
    "result.data.email.email",
    "email",
    "professionalEmail",
    "workEmail",
    "result.email",
    "data.email",
  ]);
  const linkedinUrl = readString(raw, [
    "data.linkedin.linkedinUrl",
    "data.linkedin.url",
    "data.linkedinUrl",
    "input.linkedinUrl",
    "linkedinUrl",
    "linkedin_url",
    "linkedin",
    "result.linkedinUrl",
  ]);
  const fullName = readString(source, ["fullName", "full_name", "name"]);
  const firstName = readString(source, ["firstName", "first_name"]);
  const lastName = readString(source, ["lastName", "last_name"]);
  const title = readString(source, ["jobTitle", "title", "currentTitle"]);
  const phone = readString(source, ["phone", "phoneNumber", "mobilePhone"]);
  const patch: Record<string, unknown> = {};
  if (email) {
    patch.email = email;
    patch.email_verified = true;
    patch.verified_by_provider = true;
    patch.email_verification_status = "verified";
  }
  if (linkedinUrl) patch.linkedin_url = linkedinUrl;
  if (fullName) patch.full_name = fullName;
  if (firstName) patch.first_name = firstName;
  if (lastName) patch.last_name = lastName;
  if (title) patch.title = title;
  if (phone) patch.phone = phone;
  return Object.keys(patch).length ? patch : null;
}

function isCompletedResult(raw: any): boolean {
  const status = String(raw?.enrichmentStatus || raw?.enrichment_status || raw?.status || raw?.state || raw?.result?.status || "").toLowerCase();
  if (["completed", "complete", "done", "success", "succeeded", "finished"].includes(status)) return true;
  return Boolean(contactFromResult(raw));
}

async function pollLemlistResult(providerRequestId: string): Promise<PollResult> {
  const endpoints = [
    `${LEMLIST_BASE_URL}/enrich/${encodeURIComponent(providerRequestId)}`,
    `${LEMLIST_BASE_URL}/v2/enrichments/${encodeURIComponent(providerRequestId)}/result`,
    `${LEMLIST_BASE_URL}/v2/enrichments/${encodeURIComponent(providerRequestId)}`,
    `${LEMLIST_BASE_URL}/enrich/${encodeURIComponent(providerRequestId)}/result`,
  ];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await sleep(5000);
    for (const endpoint of endpoints) {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: { "Accept": "application/json", Authorization: basicAuthHeader(LEMLIST_API_KEY) },
      });
      if (res.status === 404) continue;
      const { raw } = await parseProviderResponse(res);
      if (!res.ok) {
        if (res.status === 202 || res.status === 204) continue;
        return { completed: false, raw, contact: null, error: typeof raw === "string" ? raw : raw?.message || raw?.error || null };
      }
      if (isCompletedResult(raw)) return { completed: true, raw, contact: contactFromResult(raw) };
    }
  }
  return { completed: false, raw: null, contact: null };
}

async function persistCompletedContact(
  admin: ReturnType<typeof createClient>,
  contactId: string | null,
  jobId: string | null,
  providerRequestId: string,
  poll: PollResult,
): Promise<boolean> {
  if (!poll.completed || !poll.contact) return false;
  const patch = {
    ...poll.contact,
    enrichment_status: "enriched",
    enrichment_provider: "lemlist",
    source_provider: "lemlist",
    enriched_at: new Date().toISOString(),
  };
  if (contactId) {
    await admin.from("lit_contacts").update(patch).eq("id", contactId);
  }
  if (jobId) {
    await admin
      .from("lit_contact_enrichment_jobs")
      .update({
        status: "completed",
        result: poll.raw,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", jobId);
  }
  log.info("lemlist_enrichment_completed", { provider_request_id: providerRequestId, contact_id: contactId });
  return true;
}

async function markTargetsFailed(
  admin: ReturnType<typeof createClient>,
  requests: Array<{ target: Target; metadata: Record<string, unknown> }>,
  error: string,
  raw: unknown,
  jobIdsByContactId: Map<string, string | null> = new Map(),
): Promise<void> {
  for (const req of requests) {
    const contactId = String(req.metadata.lit_contact_id || req.target.id || "") || null;
    if (!contactId) continue;
    await admin
      .from("lit_contacts")
      .update({
        enrichment_status: "failed",
        enrichment_job_id: jobIdsByContactId.get(contactId) || null,
        enrichment_result: { error, raw },
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId);
  }
}

function splitName(t: Target): { firstName?: string; lastName?: string } {
  const firstName = t.first_name || undefined;
  const lastName = t.last_name || undefined;
  if (firstName || lastName) return { firstName, lastName };
  const raw = t.full_name || t.name || "";
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined };
}

function workflowsFor(body: RequestBody, target: Target): string[] {
  const requested = Array.isArray(body.enrichment_requests) && body.enrichment_requests.length
    ? body.enrichment_requests
    : ["find_email"];
  const out = new Set<string>();
  for (const workflow of requested) {
    if (workflow === "find_phone" && body.reveal_phone_number !== true) continue;
    if (workflow === "verify") continue;
    if (["find_email", "find_phone", "linkedin_enrichment"].includes(workflow)) out.add(workflow);
  }
  if (body.reveal_phone_number === true) out.add("find_phone");
  return Array.from(out);
}

function toInput(target: Target): Record<string, string> {
  const { firstName, lastName } = splitName(target);
  const input: Record<string, string> = {};
  if (target.linkedin_url) input.linkedinUrl = target.linkedin_url;
  if (target.email) input.email = target.email;
  if (target.organization_name || target.company_name) input.companyName = String(target.organization_name || target.company_name);
  if (target.domain) input.companyDomain = target.domain;
  if (firstName) input.firstName = firstName;
  if (lastName) input.lastName = lastName;
  if (target.title) input.jobTitle = target.title;
  return input;
}

function hasEnoughInput(input: Record<string, string>, workflows: string[]): boolean {
  if (workflows.includes("verify") && input.email) return true;
  if (workflows.includes("find_phone") && input.linkedinUrl) return true;
  if (workflows.includes("linkedin_enrichment")) {
    if (input.linkedinUrl || input.email) return true;
    if (input.firstName && input.lastName && (input.companyName || input.companyDomain)) return true;
  }
  if (workflows.includes("find_email")) {
    if (input.linkedinUrl) return true;
    if (input.firstName && input.lastName && input.companyName && input.companyDomain) return true;
  }
  return false;
}

async function resolveOrgId(admin: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any)?.org_id ?? null;
}

function firstProviderError(raw: any, statusHint = 502): { error: string; code: string; status: number } {
  const rows = Array.isArray(raw) ? raw : [];
  const first = rows.find((row) => row?.error || row?.message) || (raw && typeof raw === "object" ? raw : {});
  const code = String(first.error || first.code || "PROVIDER_ERROR");
  const error = code === "CREDITS_USAGE_FORBIDDEN"
    ? "LIT enrichment is connected, but this workspace is not allowed to spend enrichment credits for the requested workflow. Confirm API credit spending is enabled for this account."
    : String(first.message || first.error || "LIT enrichment submission failed");
  const status = code === "CREDITS_USAGE_FORBIDDEN" ? 403 : statusHint;
  return { error, code, status };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!LEMLIST_API_KEY) return json({ ok: false, error: "LIT contact enrichment is not configured", code: "PROVIDER_NOT_CONFIGURED" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Missing authorization header", code: "UNAUTHENTICATED" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: { user }, error: userError } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !user) return json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, 401);

  const orgId = await resolveOrgId(admin, user.id);
  if (!orgId) return json({ ok: false, error: "No organization found", code: "NO_ORG" }, 400);

  const body: RequestBody = await req.json().catch(() => ({}));
  const targets = (Array.isArray(body.contacts) ? body.contacts : body.contact ? [body.contact] : []).filter(Boolean).slice(0, 500);
  if (!targets.length) return json({ ok: false, error: "No contacts provided", code: "NO_TARGETS" }, 400);

  const requests = targets.map((target) => {
    const workflows = workflowsFor(body, target);
    const input = toInput(target);
    return {
      target,
      workflows,
      input,
      valid: hasEnoughInput(input, workflows),
      metadata: {
        lit_contact_id: target.id || null,
        org_id: orgId,
        source_context: body.source_context || "orchestrator",
        source_entity_type: body.source_entity_type || null,
        source_entity_id: body.source_entity_id || target.company_id || target.id || null,
      },
    };
  });

  const validRequests = requests.filter((r) => r.valid);
  if (!validRequests.length) {
    await markTargetsFailed(
      admin,
      requests,
      "LIT enrichment needs a name plus company, website, or LinkedIn profile.",
      { errors: requests.map((r) => ({ target: r.target.id || r.target.email || r.target.linkedin_url, error: "insufficient_input" })) },
    );
    return json({
      ok: true,
      provider: "lemlist",
      pending: false,
      contacts: [],
      count: 0,
      exhausted: true,
      errors: requests.map((r) => ({ target: r.target.id || r.target.email || r.target.linkedin_url, error: "insufficient_input" })),
    });
  }

  const payload = validRequests.map((r) => ({ input: r.input, enrichmentRequests: r.workflows, metadata: r.metadata }));
  const { res, raw, authMode } = await submitToLemlist(payload);

  if (!res.ok) {
    log.warn("lemlist_submit_failed", { status: res.status, auth_mode: authMode, body: typeof raw === "string" ? raw.slice(0, 240) : raw });
    const providerError = firstProviderError(raw, res.status || 502);
    await markTargetsFailed(admin, validRequests, providerError.error, raw);
    return json({
      ok: false,
      provider: "lemlist",
      error: providerError.error,
      code: providerError.code,
      status: res.status,
      auth_mode: authMode,
      raw,
    }, providerError.status);
  }

  const responseRows = Array.isArray(raw) ? raw : [];
  const jobs: any[] = [];
  const submittedRows: Array<{ job: any; request: (typeof validRequests)[number]; providerRequestId: string }> = [];
  for (let i = 0; i < validRequests.length; i += 1) {
    const reqRow = validRequests[i];
    const result = responseRows[i] || {};
    const providerRequestId = result.id || null;
    const status = providerRequestId ? "submitted" : "failed";
    const { data: job } = await admin
      .from("lit_contact_enrichment_jobs")
      .insert({
        org_id: orgId,
        requested_by: user.id,
        provider: "lemlist",
        source_context: body.source_context || "orchestrator",
        source_entity_type: body.source_entity_type || null,
        source_entity_id: String(reqRow.metadata.source_entity_id || "") || null,
        status,
        workflows: reqRow.workflows,
        request_payload: { input: reqRow.input, metadata: reqRow.metadata, auth_mode: authMode },
        provider_request_id: providerRequestId,
        result: result || {},
        error_message: result.error || result.message || null,
        submitted_at: providerRequestId ? new Date().toISOString() : null,
      })
      .select("id, provider_request_id, status")
      .maybeSingle();
    const jobRow = job || { provider_request_id: providerRequestId, status };
    jobs.push(jobRow);
    if (providerRequestId) submittedRows.push({ job: jobRow, request: reqRow, providerRequestId });
  }

  const submittedCount = jobs.filter((j) => j?.status === "submitted").length;
  if (submittedCount === 0) {
    const providerError = firstProviderError(raw);
    log.warn("lemlist_no_jobs_submitted", { code: providerError.code, count: validRequests.length, auth_mode: authMode });
    const jobIdsByContactId = new Map<string, string | null>();
    for (let i = 0; i < validRequests.length; i += 1) {
      const contactId = String(validRequests[i].metadata.lit_contact_id || validRequests[i].target.id || "") || null;
      if (contactId) jobIdsByContactId.set(contactId, jobs[i]?.id ? String(jobs[i].id) : null);
    }
    await markTargetsFailed(admin, validRequests, providerError.error, raw, jobIdsByContactId);
    return json({
      ok: false,
      provider: "lemlist",
      pending: false,
      submitted: 0,
      jobs,
      error: providerError.error,
      code: providerError.code,
      auth_mode: authMode,
      raw_provider_response: raw,
    }, providerError.status);
  }

  const completedContacts: Record<string, unknown>[] = [];
  for (const row of submittedRows.slice(0, 10)) {
    const poll = await pollLemlistResult(row.providerRequestId);
    const contactId = String(row.request.metadata.lit_contact_id || row.request.target.id || "") || null;
    const jobId = row.job?.id ? String(row.job.id) : null;
    if (poll.completed && !poll.contact) {
      const message = "LIT enrichment completed, but no email was found for this contact.";
      await markTargetsFailed(admin, [row.request], message, poll.raw, new Map([[contactId || "", jobId]]));
      if (jobId) {
        await admin
          .from("lit_contact_enrichment_jobs")
          .update({
            status: "failed",
            result: poll.raw,
            completed_at: new Date().toISOString(),
            error_message: message,
          })
          .eq("id", jobId);
      }
      continue;
    }
    if (poll.error) {
      await markTargetsFailed(admin, [row.request], poll.error, poll.raw, new Map([[contactId || "", jobId]]));
      if (jobId) {
        await admin
          .from("lit_contact_enrichment_jobs")
          .update({
            status: "failed",
            result: poll.raw,
            completed_at: new Date().toISOString(),
            error_message: poll.error,
          })
          .eq("id", jobId);
      }
      continue;
    }
    const completed = await persistCompletedContact(
      admin,
      contactId,
      jobId,
      row.providerRequestId,
      poll,
    );
    if (completed && poll.contact) completedContacts.push({ id: contactId, ...poll.contact });
  }

  const pending = completedContacts.length < submittedCount;
  return json({
    ok: true,
    provider: "lemlist",
    pending,
    contacts: completedContacts,
    count: completedContacts.length,
    submitted: submittedCount,
    completed: completedContacts.length,
    jobs,
    auth_mode: authMode,
    raw_provider_response: raw,
  });
});
