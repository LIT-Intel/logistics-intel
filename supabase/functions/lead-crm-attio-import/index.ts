/// <reference lib="deno.ns" />

// lead-crm-attio-import — Lead-CRM Phase 4 Attio → LIT migration importer.
//
// The GOAL of Phase 4 is to REMOVE Attio: run the team entirely on LIT's own
// Lead-CRM. This function ingests an Attio export and upserts each record into
// lit_admin_leads (via the SECURITY DEFINER lit_leadcrm_attio_upsert RPC), so
// the owner can move their book of business across in one paste/upload.
//
// Two input modes:
//   1. { records: [...] }  — a JSON array the owner exports from Attio (people /
//      companies / deals). We normalize each record's email / name / company /
//      stage / notes from the common Attio shapes, then upsert. This is the
//      primary path (no Attio API key needed).
//   2. { mode: "api" }     — if ATTIO_API_KEY is configured, pull people +
//      their linked company + deal stage straight from the Attio API and upsert.
//      A convenience so the owner doesn't have to hand-export.
//
// Idempotent: the upsert dedupes on email → company name and note-dedupes on a
// content hash, so re-running the same import is safe (updates, never doubles).
//
// Auth: user JWT (verify_jwt=true — NOT listed in .verify-jwt-manifest). Gated
// to platform admins: the upsert RPC self-checks is_platform_admin(auth.uid()),
// and we short-circuit with a friendly 403 up front too.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ATTIO_KEY = Deno.env.get("ATTIO_API_KEY") || "";
const ATTIO_BASE = "https://api.attio.com/v2";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** A flat, LIT-shaped record ready for lit_leadcrm_attio_upsert. */
type FlatRecord = {
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  stage_name: string | null;
  notes: { body: string; occurred_at?: string | null }[];
  attio_id: string | null;
};

const s = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
};

/**
 * Pull the first sensible value out of an Attio attribute array. Attio stores
 * attribute values as arrays of objects; we defensively read the common shapes
 * (value / email_address / full_name / domain / first "target" title).
 */
function attioAttr(rec: any, key: string): string | null {
  const v = rec?.values?.[key] ?? rec?.[key];
  if (v == null) return null;
  if (typeof v === "string") return s(v);
  if (Array.isArray(v)) {
    const first = v[0];
    if (first == null) return null;
    if (typeof first === "string") return s(first);
    return s(
      first.value ?? first.email_address ?? first.full_name ?? first.domain ??
      first.option?.title ?? first.status?.title ?? first.target_record_id ?? null,
    );
  }
  if (typeof v === "object") {
    return s((v as any).value ?? (v as any).full_name ?? (v as any).email_address ?? null);
  }
  return null;
}

/** Normalize one export record (Attio-shaped OR already flat) → FlatRecord. */
function normalize(rec: any): FlatRecord {
  // Already-flat shape (owner may pre-flatten). Accept it directly.
  const flatEmail = s(rec?.email) ?? s(rec?.email_address);
  const flatName = s(rec?.full_name) ?? s(rec?.name);
  const flatCompany = s(rec?.company_name) ?? s(rec?.company);
  const flatStage = s(rec?.stage) ?? s(rec?.stage_name);

  const email = flatEmail ?? attioAttr(rec, "email_addresses") ?? attioAttr(rec, "email");
  const name =
    flatName ??
    attioAttr(rec, "name") ??
    [attioAttr(rec, "first_name"), attioAttr(rec, "last_name")].filter(Boolean).join(" ") ||
    null;
  const company =
    (typeof flatCompany === "string" ? flatCompany : null) ??
    attioAttr(rec, "company") ??
    attioAttr(rec, "company_name") ??
    attioAttr(rec, "name_company") ??
    (rec?.object === "companies" ? attioAttr(rec, "name") : null);
  const stage = flatStage ?? attioAttr(rec, "stage") ?? attioAttr(rec, "status");

  // Notes: accept an array of strings, {body}, {content}, or {note}.
  const rawNotes = Array.isArray(rec?.notes) ? rec.notes : [];
  const notes = rawNotes
    .map((n: any) => {
      const body = typeof n === "string" ? s(n) : s(n?.body ?? n?.content ?? n?.note ?? n?.text);
      const occurred_at = s(n?.occurred_at ?? n?.created_at ?? null);
      return body ? { body, occurred_at } : null;
    })
    .filter(Boolean) as FlatRecord["notes"];

  return {
    email,
    full_name: name ? (name as string) : null,
    company_name: company,
    stage_name: stage,
    notes,
    attio_id: s(rec?.id?.record_id ?? rec?.record_id ?? rec?.id ?? null),
  };
}

/** Pull people (with company + a best-effort stage) from the Attio API. */
async function pullFromAttio(): Promise<FlatRecord[]> {
  const out: FlatRecord[] = [];
  const resp = await fetch(`${ATTIO_BASE}/objects/people/records/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ATTIO_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 500 }),
  });
  if (!resp.ok) {
    throw new Error(`attio_people_query_failed ${resp.status}`);
  }
  const data = await resp.json().catch(() => ({}));
  const records = Array.isArray(data?.data) ? data.data : [];
  for (const rec of records) {
    out.push(normalize({ ...rec, object: "people" }));
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, 401);

    // Platform-admin gate (also enforced inside the RPC).
    const { data: isAdmin } = await userClient.rpc("is_platform_admin", { p_user_id: user.id });
    if (isAdmin !== true) {
      return json({ ok: false, error: "Platform admin required", code: "NOT_ADMIN" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "records");

    let flat: FlatRecord[] = [];
    if (mode === "api") {
      if (!ATTIO_KEY) {
        return json({ ok: false, error: "ATTIO_API_KEY not configured; paste an export instead.", code: "NO_API_KEY" }, 422);
      }
      try {
        flat = await pullFromAttio();
      } catch (e) {
        return json({ ok: false, error: String((e as any)?.message ?? e), code: "ATTIO_PULL_FAILED" }, 502);
      }
    } else {
      const records = Array.isArray(body?.records) ? body.records : [];
      if (records.length === 0) {
        return json({ ok: false, error: "No records provided.", code: "EMPTY" }, 400);
      }
      flat = records.map(normalize);
    }

    // Upsert each record. Skip records with neither email nor company (nothing to key on).
    let created = 0, updated = 0, skipped = 0, notesAdded = 0, failed = 0;
    const errors: string[] = [];
    for (const r of flat) {
      if (!r.email && !r.company_name) { skipped++; continue; }
      const { data, error } = await userClient.rpc("lit_leadcrm_attio_upsert", {
        p_email: r.email,
        p_full_name: r.full_name,
        p_company_name: r.company_name,
        p_stage_name: r.stage_name,
        p_notes: r.notes,
        p_attio_id: r.attio_id,
      });
      if (error) { failed++; if (errors.length < 5) errors.push(error.message); continue; }
      const row = (Array.isArray(data) ? data[0] : data) as any;
      if (row?.ok !== true) { skipped++; continue; }
      if (row.created) created++; else updated++;
      notesAdded += Number(row.notes_added ?? 0) || 0;
    }

    return json({
      ok: true,
      mode,
      total: flat.length,
      created,
      updated,
      skipped,
      failed,
      notes_added: notesAdded,
      errors,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message ?? e), code: "UNHANDLED" }, 500);
  }
});
