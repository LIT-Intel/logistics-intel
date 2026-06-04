/// <reference lib="deno.ns" />

// pulse-attio-sync — Supabase edge function
//
// Called by a Postgres trigger (via pg_net) whenever a row is INSERT-ed into
// pulse_list_contacts or pulse_list_companies for a list that has
// `syncs_to_attio = true`.
//
// Auth: X-Internal-Cron header checked against LIT_CRON_SECRET.
// verify_jwt must be FALSE in config.toml — called by Postgres, not users.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

const ATTIO_BASE = "https://api.attio.com/v2";

// System list IDs — used to resolve which Attio list env var to look up.
const LIST_FORWARDERS = "71df54d9-56d3-4ba3-823d-d367f7e9affd";
const LIST_BROKERS = "99b046f1-1885-449f-9441-2128be55895f";

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "msn.com",
  "ymail.com",
  "me.com",
  "mac.com",
]);

// ─── Types ───────────────────────────────────────────────────────────────────

interface RequestBody {
  list_id: string;
  membership_type: "contact" | "company";
  membership_id: string;
  list_name?: string;
}

interface SyncResult {
  status: "succeeded" | "failed" | "skipped";
  attioRecordId: string | null;
  attioObjectType: string | null;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveDomainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const d = email.slice(at + 1).trim().toLowerCase();
  return PERSONAL_DOMAINS.has(d) ? null : d;
}

function splitName(full: string | undefined): { first: string; last: string } {
  const s = (full ?? "").trim();
  if (!s) return { first: "", last: "" };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  const last = parts.pop()!;
  return { first: parts.join(" "), last };
}

function attioListEnvVar(listId: string): string | undefined {
  if (listId === LIST_FORWARDERS) return Deno.env.get("ATTIO_LIST_PULSE_FORWARDERS");
  if (listId === LIST_BROKERS) return Deno.env.get("ATTIO_LIST_PULSE_BROKERS");
  return undefined;
}

// ─── Attio REST helpers ───────────────────────────────────────────────────────

async function upsertAttioCompany(
  attioKey: string,
  name: string,
  domain: string,
): Promise<string | null> {
  const headers = {
    Authorization: `Bearer ${attioKey}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(
    `${ATTIO_BASE}/objects/companies/records?matching_attribute=domains`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        data: {
          values: {
            name: [{ value: name }],
            domains: [{ domain }],
          },
        },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Attio upsert company ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return json?.data?.id?.record_id ?? null;
}

async function upsertAttioPerson(
  attioKey: string,
  email: string,
  firstName: string,
  lastName: string,
  jobTitle: string | null,
  companyRecordId: string | null,
): Promise<string | null> {
  const headers = {
    Authorization: `Bearer ${attioKey}`,
    "Content-Type": "application/json",
  };
  const values: Record<string, unknown> = {
    email_addresses: [{ email_address: email }],
    name: [{
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
    }],
  };
  if (jobTitle) values.job_title = [{ value: jobTitle }];
  if (companyRecordId) {
    values.company = [{ target_object: "companies", target_record_id: companyRecordId }];
  }

  const res = await fetch(
    `${ATTIO_BASE}/objects/people/records?matching_attribute=email_addresses`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ data: { values } }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Attio upsert person ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return json?.data?.id?.record_id ?? null;
}

async function addToAttioList(
  attioKey: string,
  listId: string,
  parentObject: "people" | "companies",
  recordId: string,
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${attioKey}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(`${ATTIO_BASE}/lists/${listId}/entries`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      data: {
        parent_object: parentObject,
        parent_record_id: recordId,
        entry_values: {},
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 409 = already in list — treat as OK
    if (res.status !== 409) {
      throw new Error(`Attio list add ${res.status}: ${text.slice(0, 200)}`);
    }
  }
  await res.text().catch(() => ""); // consume body to prevent connection leak
}

async function attachAttioNote(
  attioKey: string,
  parentObject: "people" | "companies",
  recordId: string,
  title: string,
  content: string,
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${attioKey}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(`${ATTIO_BASE}/notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      data: {
        parent_object: parentObject,
        parent_record_id: recordId,
        title,
        format: "plaintext",
        content,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Attio note create ${res.status}: ${text.slice(0, 200)}`);
  }
  await res.text().catch(() => ""); // consume body to prevent connection leak
}

// ─── Sync logic ───────────────────────────────────────────────────────────────

async function syncContact(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  attioKey: string,
  membershipId: string,
  listId: string,
  listName: string,
): Promise<SyncResult> {
  // 1. Fetch contact record
  const { data: contact, error: contactErr } = await supabase
    .from("lit_contacts")
    .select("id, full_name, first_name, last_name, title, email, company_id")
    .eq("id", membershipId)
    .single();
  if (contactErr || !contact) {
    throw new Error(`Contact not found: ${contactErr?.message ?? "null"}`);
  }

  const email: string = contact.email ?? "";
  if (!email) throw new Error("Contact has no email — cannot upsert to Attio");

  // 2. Derive company domain from email (no PII in logs — use domain only)
  const domain = deriveDomainFromEmail(email);

  // 3. Resolve full name parts
  const fullName: string = contact.full_name ?? "";
  const { first: firstName, last: lastName } = splitName(fullName) ??
    { first: contact.first_name ?? "", last: contact.last_name ?? "" };

  const jobTitle: string | null = contact.title ?? null;

  // 4. Upsert Attio Company (if we have a non-personal domain)
  let attioCompanyId: string | null = null;
  if (domain) {
    // Try to get the company name from lit_companies via company_id
    let companyName = domain; // fallback
    if (contact.company_id) {
      const { data: co } = await supabase
        .from("lit_companies")
        .select("name, domain")
        .eq("id", contact.company_id)
        .single();
      if (co?.name) companyName = co.name;
    }
    attioCompanyId = await upsertAttioCompany(attioKey, companyName, domain);
  }

  // 5. Upsert Attio Person
  const personId = await upsertAttioPerson(
    attioKey,
    email,
    firstName,
    lastName,
    jobTitle,
    attioCompanyId,
  );
  if (!personId) throw new Error("Attio upsert person returned no record_id");

  // 6. Add to Attio list if configured
  const attioListId = attioListEnvVar(listId);
  if (attioListId) {
    await addToAttioList(attioKey, attioListId, "people", personId);
  }

  // 7. Attach attribution note
  const noteLines = [
    `Source: Pulse — ${listName}`,
    `LIT list_id: ${listId}`,
    `LIT contact_id: ${membershipId}`,
    ...(domain ? [`Email domain: ${domain}`] : []),
    ...(jobTitle ? [`Title: ${jobTitle}`] : []),
  ];
  await attachAttioNote(
    attioKey,
    "people",
    personId,
    `Pulse sync — ${listName}`,
    noteLines.join("\n"),
  );

  return { status: "succeeded", attioRecordId: personId, attioObjectType: "people" };
}

async function syncCompany(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  attioKey: string,
  membershipId: string,
  listId: string,
  listName: string,
): Promise<SyncResult> {
  // 1. Fetch company record
  const { data: companyRaw, error: companyErr } = await supabase
    .from("lit_companies")
    .select("id, name, domain, website, city, state, country_code, industry")
    .eq("id", membershipId)
    .single();
  if (companyErr || !companyRaw) {
    throw new Error(`Company not found: ${companyErr?.message ?? "null"}`);
  }
  // deno-lint-ignore no-explicit-any
  const company = companyRaw as any;

  const domain: string = company.domain ?? "";
  const name: string = company.name ?? domain;
  if (!domain && !name) throw new Error("Company has no domain or name — cannot upsert to Attio");

  // 2. Upsert Attio Company
  // If no domain, Attio won't match by domain; we fall back to name-only upsert.
  let attioCompanyId: string | null = null;
  if (domain) {
    attioCompanyId = await upsertAttioCompany(attioKey, name, domain);
  } else {
    // Name-only upsert (no domain matching) — use name as matching attribute
    const headers = {
      Authorization: `Bearer ${attioKey}`,
      "Content-Type": "application/json",
    };
    const res = await fetch(
      `${ATTIO_BASE}/objects/companies/records?matching_attribute=name`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ data: { values: { name: [{ value: name }] } } }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Attio upsert company (name-only) ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    attioCompanyId = json?.data?.id?.record_id ?? null;
  }
  if (!attioCompanyId) throw new Error("Attio upsert company returned no record_id");

  // 3. Add to Attio list if configured
  const attioListId = attioListEnvVar(listId);
  if (attioListId) {
    await addToAttioList(attioKey, attioListId, "companies", attioCompanyId);
  }

  // 4. Attach attribution note
  const noteLines = [
    `Source: Pulse — ${listName}`,
    `LIT list_id: ${listId}`,
    `LIT company_id: ${membershipId}`,
    ...(domain ? [`Domain: ${domain}`] : []),
    ...(company.city || company.state ? [`Location: ${[company.city, company.state].filter(Boolean).join(", ")}`] : []),
    ...(company.industry ? [`Industry: ${company.industry}`] : []),
  ];
  await attachAttioNote(
    attioKey,
    "companies",
    attioCompanyId,
    `Pulse sync — ${listName}`,
    noteLines.join("\n"),
  );

  return { status: "succeeded", attioRecordId: attioCompanyId, attioObjectType: "companies" };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const rid = requestId();
  const log = createLogger("pulse-attio-sync", { request_id: rid });

  // 1. Auth
  const authResult = verifyCronAuth(req);
  if (!authResult.ok) {
    log.warn("auth_failed", { status: authResult.response.status });
    return authResult.response;
  }

  // 2. Parse body
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    log.error("parse_body_failed");
    return new Response(JSON.stringify({ ok: false, error: "invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { list_id, membership_type, membership_id, list_name } = body;
  if (!list_id || !membership_type || !membership_id) {
    log.error("missing_required_fields", { list_id, membership_type, membership_id });
    return new Response(JSON.stringify({ ok: false, error: "missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  log.info("sync_started", { list_id, membership_type, membership_id });

  // 3. Setup Supabase client (service role for full read access)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const attioKey = Deno.env.get("ATTIO_API_KEY");
  if (!attioKey) {
    log.error("missing_attio_api_key");
    return new Response(JSON.stringify({ ok: false, error: "ATTIO_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 4. Confirm list has syncs_to_attio = true (defense in depth)
  const { data: list, error: listErr } = await supabase
    .from("pulse_lists")
    .select("id, syncs_to_attio, name")
    .eq("id", list_id)
    .single();
  if (listErr || !list) {
    log.error("list_not_found", { list_id, err: listErr?.message });
    return new Response(JSON.stringify({ ok: false, error: "list not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!list.syncs_to_attio) {
    log.info("list_not_syncable", { list_id });
    return new Response(
      JSON.stringify({ ok: true, status: "skipped", reason: "syncs_to_attio is false" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  const effectiveListName = list_name ?? list.name ?? list_id;

  // 5. Idempotency check
  const { data: existingLog } = await supabase
    .from("pulse_attio_sync_log")
    .select("id, status")
    .eq("membership_id", membership_id)
    .eq("membership_type", membership_type)
    .eq("status", "succeeded")
    .maybeSingle();
  if (existingLog) {
    log.info("already_synced", { membership_id, membership_type });
    return new Response(
      JSON.stringify({ ok: true, status: "skipped", reason: "already_synced" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 6. Execute sync
  let result: SyncResult = { status: "failed", attioRecordId: null, attioObjectType: null };
  try {
    if (membership_type === "contact") {
      result = await syncContact(supabase, attioKey, membership_id, list_id, effectiveListName);
    } else if (membership_type === "company") {
      result = await syncCompany(supabase, attioKey, membership_id, list_id, effectiveListName);
    } else {
      throw new Error(`Unknown membership_type: ${membership_type}`);
    }
    log.info("sync_succeeded", {
      membership_type,
      membership_id,
      attio_object_type: result.attioObjectType,
      // attioRecordId intentionally omitted from logs — not PII but not useful
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error("sync_failed", { membership_id, membership_type, err: errorMsg });
    result = { status: "failed", attioRecordId: null, attioObjectType: null, error: errorMsg };

    // Write failure to log before returning 500 so pg_net can retry
    await supabase.from("pulse_attio_sync_log").insert({
      list_id,
      membership_type,
      membership_id,
      attio_record_id: null,
      attio_object_type: membership_type === "contact" ? "people" : "companies",
      status: "failed",
      error: errorMsg.slice(0, 500),
    });

    return new Response(JSON.stringify({ ok: false, error: errorMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 7. Write success log
  await supabase.from("pulse_attio_sync_log").insert({
    list_id,
    membership_type,
    membership_id,
    attio_record_id: result.attioRecordId,
    attio_object_type: result.attioObjectType,
    status: "succeeded",
    error: null,
  });

  return new Response(
    JSON.stringify({ ok: true, status: result.status, attioRecordId: result.attioRecordId }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
