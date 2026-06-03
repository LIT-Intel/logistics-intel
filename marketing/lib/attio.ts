// Attio REST client — used by inbound lead capture routes
// (/api/leads/resend, /api/demo-request) to fan out every form submission
// into the LIT Attio workspace as a Person + Company + Deal triple.
//
// Design rules:
//   - Best-effort: caller wraps in try/catch + logs. Never blocks the
//     primary response if Attio is slow or down.
//   - Upserts by stable keys (email for People, domain for Companies)
//     so re-submissions don't fan out duplicates.
//   - Auto-creates a Lead-stage Deal on first contact, attaches a note
//     with source + UTM attribution + raw message body.
//   - All field slugs match the LIT Attio workspace as of 2026-06-03.
//     If you add/rename attributes in Attio, update this file.
//
// Env vars required (Vercel / .env):
//   ATTIO_API_KEY        — generated in Attio Settings → Apps → API
//   ATTIO_WORKSPACE_ID   — Attio Settings → Workspace ID (optional, only
//                          used in log messages; the API key already
//                          scopes to the right workspace)
//
// Pipeline stage IDs (verified via MCP 2026-06-03):
//   Lead              c6c86573-aa20-4223-984d-44fd67258304
//   Qualified         984f4e8b-5f31-4854-9bf5-2b0f978b9fdf
//   Demo Scheduled    1b835bac-2c91-44a7-a416-f02765cc2869
//   Trial Started     db795dc0-7213-4916-8637-7b5a7d4cb104
//   Trial Active      41b2542b-9ffa-40bb-a95d-faadfd735ff5
//   Negotiation       9fd300be-2e86-40be-8124-d37bf6fa5e4e
//   Won               4482077b-0d11-4365-bcc8-94a41289da5b
//   Lost              bbaa4f25-e0f8-48ee-9327-0d007db08bde
//
// Workspace member ID for default deal owner (Valesco):
//   7970dcda-936b-4837-8666-06a22c6dc788

const ATTIO_BASE = "https://api.attio.com/v2";

export type AttioInboundLead = {
  /** Required. Used as unique key on Attio People (email_addresses). */
  email: string;
  /** Person's full name (optional but recommended). */
  name?: string;
  /** Company name. If absent, we derive from email domain. */
  companyName?: string;
  /** Company website / primary domain. If absent, we derive from email. */
  companyDomain?: string;
  /** Job title (free-text). */
  jobTitle?: string;
  /** Phone number, E.164 preferred. */
  phone?: string;
  /** Free-text message from the form (we put this in a note on the deal). */
  message?: string;
  /** Lead source identifier — Website / Demo Request / Newsletter / etc. */
  source: string;
  /** UTM + attribution snapshot for the note body. */
  attribution?: Record<string, string | undefined | null>;
  /** When set, used as the deal name. Defaults to "{Company} — Inbound". */
  dealName?: string;
};

export type AttioUpsertResult = {
  ok: boolean;
  personRecordId?: string;
  companyRecordId?: string;
  dealRecordId?: string;
  errors?: string[];
};

const STAGE_LEAD_ID = "c6c86573-aa20-4223-984d-44fd67258304";
const DEFAULT_DEAL_OWNER_MEMBER_ID = "7970dcda-936b-4837-8666-06a22c6dc788";

function getApiKey(): string | null {
  const v = process.env.ATTIO_API_KEY;
  return v && v.length > 10 ? v : null;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/** Derive domain from email when companyDomain wasn't provided. */
function deriveDomainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const d = email.slice(at + 1).trim().toLowerCase();
  // Skip personal / generic providers — they're not company domains.
  const personal = new Set([
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
  if (personal.has(d)) return null;
  return d;
}

function splitName(full: string | undefined): { first: string; last: string } {
  const s = (full || "").trim();
  if (!s) return { first: "", last: "" };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Upsert a Company by domain (Attio enforces unique on `domains`). */
async function upsertCompany(
  apiKey: string,
  params: { name?: string; domain?: string | null; shipperType?: string },
): Promise<string | null> {
  const { name, domain, shipperType } = params;
  if (!name && !domain) return null;

  // When we have a domain, use Attio's upsert (matching_attribute=domains).
  // When we don't, create-only by name (no dedup key available).
  const values: Record<string, unknown> = {};
  if (name) values.name = [{ value: name }];
  if (domain) values.domains = [{ domain }];
  if (shipperType) values.shipper_type = [{ value: shipperType }];

  const url = domain
    ? `${ATTIO_BASE}/objects/companies/records?matching_attribute=domains`
    : `${ATTIO_BASE}/objects/companies/records`;

  const res = await fetch(url, {
    method: domain ? "PUT" : "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ data: { values } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Attio upsertCompany ${res.status}: ${body.slice(0, 240)}`);
  }
  const json = (await res.json()) as { data?: { id?: { record_id?: string } } };
  return json.data?.id?.record_id ?? null;
}

/** Upsert a Person by email (Attio enforces unique on `email_addresses`). */
async function upsertPerson(
  apiKey: string,
  params: {
    email: string;
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    phone?: string;
    companyRecordId?: string | null;
  },
): Promise<string | null> {
  const { email, firstName, lastName, jobTitle, phone, companyRecordId } = params;

  const values: Record<string, unknown> = {
    email_addresses: [{ email_address: email }],
  };
  if (firstName || lastName) {
    values.name = [
      {
        first_name: firstName || "",
        last_name: lastName || "",
        full_name: [firstName, lastName].filter(Boolean).join(" "),
      },
    ];
  }
  if (jobTitle) values.job_title = [{ value: jobTitle }];
  if (phone) values.phone_numbers = [{ original_phone_number: phone }];
  if (companyRecordId) {
    values.company = [
      {
        target_object: "companies",
        target_record_id: companyRecordId,
      },
    ];
  }

  const res = await fetch(
    `${ATTIO_BASE}/objects/people/records?matching_attribute=email_addresses`,
    {
      method: "PUT",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ data: { values } }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Attio upsertPerson ${res.status}: ${body.slice(0, 240)}`);
  }
  const json = (await res.json()) as { data?: { id?: { record_id?: string } } };
  return json.data?.id?.record_id ?? null;
}

/**
 * Create a Deal at the Lead stage. Always creates a new record — we do NOT
 * upsert deals because a person/company can have multiple deals over time.
 */
async function createDeal(
  apiKey: string,
  params: {
    dealName: string;
    personRecordId?: string | null;
    companyRecordId?: string | null;
  },
): Promise<string | null> {
  const { dealName, personRecordId, companyRecordId } = params;

  const values: Record<string, unknown> = {
    name: [{ value: dealName }],
    stage: [{ status: STAGE_LEAD_ID }],
    owner: [
      {
        referenced_actor_type: "workspace-member",
        referenced_actor_id: DEFAULT_DEAL_OWNER_MEMBER_ID,
      },
    ],
  };
  if (personRecordId) {
    values.associated_people = [
      {
        target_object: "people",
        target_record_id: personRecordId,
      },
    ];
  }
  if (companyRecordId) {
    values.associated_company = [
      {
        target_object: "companies",
        target_record_id: companyRecordId,
      },
    ];
  }

  const res = await fetch(`${ATTIO_BASE}/objects/deals/records`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ data: { values } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Attio createDeal ${res.status}: ${body.slice(0, 240)}`);
  }
  const json = (await res.json()) as { data?: { id?: { record_id?: string } } };
  return json.data?.id?.record_id ?? null;
}

/**
 * Attach an inbound note to the deal carrying the lead source, raw message,
 * and UTM attribution snapshot. This is the v1 stand-in for the missing
 * `Source` custom attribute — sales rep reads the note to see attribution.
 */
async function attachNote(
  apiKey: string,
  params: {
    dealRecordId: string;
    lead: AttioInboundLead;
  },
): Promise<void> {
  const { dealRecordId, lead } = params;
  const lines: string[] = [];
  lines.push(`Source: ${lead.source}`);
  if (lead.companyName) lines.push(`Company: ${lead.companyName}`);
  if (lead.jobTitle) lines.push(`Job title: ${lead.jobTitle}`);
  if (lead.phone) lines.push(`Phone: ${lead.phone}`);
  if (lead.message) {
    lines.push("");
    lines.push("Message:");
    lines.push(lead.message);
  }
  if (lead.attribution && Object.values(lead.attribution).some(Boolean)) {
    lines.push("");
    lines.push("Attribution:");
    for (const [k, v] of Object.entries(lead.attribution)) {
      if (v) lines.push(`  ${k}: ${v}`);
    }
  }

  const res = await fetch(`${ATTIO_BASE}/notes`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      data: {
        parent_object: "deals",
        parent_record_id: dealRecordId,
        title: `Inbound: ${lead.source}`,
        format: "plaintext",
        content: lines.join("\n"),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Attio attachNote ${res.status}: ${body.slice(0, 240)}`);
  }
}

/**
 * Single entry point used by inbound routes. Wraps the full
 * Company → Person → Deal → Note flow. All steps are tried in sequence
 * and a partial failure still returns the record IDs that did succeed.
 */
export async function pushInboundLeadToAttio(
  lead: AttioInboundLead,
): Promise<AttioUpsertResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      errors: ["ATTIO_API_KEY not configured"],
    };
  }

  const errors: string[] = [];
  const result: AttioUpsertResult = { ok: false };

  const domain = lead.companyDomain || deriveDomainFromEmail(lead.email);
  const companyName =
    lead.companyName || (domain ? domain.split(".")[0] : undefined);

  try {
    result.companyRecordId =
      (await upsertCompany(apiKey, { name: companyName, domain })) ?? undefined;
  } catch (e: any) {
    errors.push(e?.message || "upsertCompany failed");
  }

  const { first, last } = splitName(lead.name);
  try {
    result.personRecordId =
      (await upsertPerson(apiKey, {
        email: lead.email,
        firstName: first,
        lastName: last,
        jobTitle: lead.jobTitle,
        phone: lead.phone,
        companyRecordId: result.companyRecordId,
      })) ?? undefined;
  } catch (e: any) {
    errors.push(e?.message || "upsertPerson failed");
  }

  const dealName =
    lead.dealName ||
    `${companyName || lead.email} — ${lead.source}`.slice(0, 200);
  try {
    result.dealRecordId =
      (await createDeal(apiKey, {
        dealName,
        personRecordId: result.personRecordId,
        companyRecordId: result.companyRecordId,
      })) ?? undefined;
  } catch (e: any) {
    errors.push(e?.message || "createDeal failed");
  }

  if (result.dealRecordId) {
    try {
      await attachNote(apiKey, {
        dealRecordId: result.dealRecordId,
        lead,
      });
    } catch (e: any) {
      errors.push(e?.message || "attachNote failed");
    }
  }

  result.ok = !!(result.dealRecordId || result.personRecordId);
  if (errors.length) result.errors = errors;
  return result;
}
