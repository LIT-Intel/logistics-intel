// update-company — persist user-driven corrections back to `lit_companies`.
//
// Enrichment Phase 2 (R3). The Apollo contact search lets the user edit the
// company name / domain inline, but those edits were LOCAL REACT STATE ONLY
// — they reverted on the next page load. Real broken records in production
// (Razor USA, Werma USA, E G O North America, Rivian, Dell, Clorox, NCR,
// Apple Tree International) sit in `lit_companies` with NULL domain/website
// and can never enrich because we never persist the correction.
//
// This function:
//   1. Requires an authed user (verify_jwt=true).
//   2. Authorizes the write via the saved-company ownership chain — the
//      caller must either have the company saved in `lit_saved_companies`
//      under their own user_id, OR share an org with a user who does, OR
//      be a platform admin. Direct access to a `lit_companies` row alone
//      is NOT enough (those rows are read-public for search).
//   3. Validates each field: domain via RFC-1035-ish hostname, website via
//      URL parser, name length 1–200, headcount free-text ≤ 50 chars,
//      industry free-text ≤ 100 chars.
//   4. Writes ONLY the provided fields to `lit_companies`.
//   5. Logs a `company_updated` row in `lit_activity_events` with the
//      before/after diff for audit.
//
// Returns `{ ok: true, company: <updated row> }` or `{ ok, error }`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger } from "../_shared/logger.ts";
import { corsHeaders, handlePreflight, json, requireUser } from "../_shared/auth.ts";

interface UpdateCompanyRequest {
  company_id?: string;
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  headcount?: string | number | null;
}

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function normalizeDomain(input: string): string {
  let s = String(input).trim().toLowerCase();
  // Strip protocol/www and trailing path/slash so users can paste a URL.
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0];
  s = s.split("?")[0];
  s = s.replace(/\.$/, "");
  return s;
}

function validateDomain(input: string): { ok: true; value: string } | { ok: false; error: string } {
  const cleaned = normalizeDomain(input);
  if (!cleaned) return { ok: false, error: "Domain is empty" };
  if (cleaned.length > 253) return { ok: false, error: "Domain too long" };
  if (!HOSTNAME_RE.test(cleaned)) {
    return { ok: false, error: "Domain is not a valid hostname" };
  }
  return { ok: true, value: cleaned };
}

function validateWebsite(input: string): { ok: true; value: string } | { ok: false; error: string } {
  let s = String(input).trim();
  if (!s) return { ok: false, error: "Website is empty" };
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname || !HOSTNAME_RE.test(u.hostname)) {
      return { ok: false, error: "Website hostname is invalid" };
    }
    return { ok: true, value: u.toString().replace(/\/$/, "") };
  } catch {
    return { ok: false, error: "Website is not a valid URL" };
  }
}

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const requestId = crypto.randomUUID();
  const log = createLogger("update-company").child({ request_id: requestId });

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, admin } = auth;

  let body: UpdateCompanyRequest;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const companyId = (body.company_id || "").trim();
  if (!companyId) {
    return json({ ok: false, error: "company_id is required" }, 400);
  }

  // ── Authorize: caller must be tied to this company via saved-company
  //   ownership OR be a platform admin. We never trust the frontend.
  const [platformAdminRow, mySave, orgMember] = await Promise.all([
    admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    admin.from("lit_saved_companies")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle(),
    admin.from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const isPlatformAdmin = Boolean(platformAdminRow.data);

  let authorized = isPlatformAdmin || Boolean(mySave.data);

  if (!authorized && orgMember.data?.org_id) {
    // Same-org coworker saved this company? Allow the correction.
    const { data: orgPeers } = await admin
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgMember.data.org_id);
    const peerIds = (orgPeers || []).map((r) => r.user_id);
    if (peerIds.length > 0) {
      const { data: peerSave } = await admin
        .from("lit_saved_companies")
        .select("id")
        .eq("company_id", companyId)
        .in("user_id", peerIds)
        .limit(1)
        .maybeSingle();
      if (peerSave) authorized = true;
    }
  }

  if (!authorized) {
    log.warn("forbidden_no_ownership", { user_id: user.id, company_id: companyId });
    return json(
      { ok: false, error: "You can only edit companies in your saved list." },
      403,
    );
  }

  // ── Validate inputs and build a strictly-typed update.
  const update: Record<string, unknown> = {};
  const validationErrors: string[] = [];

  if (body.name !== undefined && body.name !== null) {
    const trimmed = String(body.name).trim();
    if (trimmed.length === 0) {
      validationErrors.push("name is empty");
    } else if (trimmed.length > 200) {
      validationErrors.push("name must be 1–200 characters");
    } else {
      update.name = trimmed;
      update.normalized_name = trimmed.toLowerCase();
    }
  }

  if (body.domain !== undefined && body.domain !== null) {
    const raw = String(body.domain).trim();
    if (raw.length === 0) {
      // Explicit clear allowed.
      update.domain = null;
    } else {
      const r = validateDomain(raw);
      if (!r.ok) validationErrors.push(`domain: ${r.error}`);
      else update.domain = r.value;
    }
  }

  if (body.website !== undefined && body.website !== null) {
    const raw = String(body.website).trim();
    if (raw.length === 0) {
      update.website = null;
    } else {
      const r = validateWebsite(raw);
      if (!r.ok) validationErrors.push(`website: ${r.error}`);
      else update.website = r.value;
    }
  }

  if (body.industry !== undefined && body.industry !== null) {
    const raw = String(body.industry).trim();
    if (raw.length > 100) {
      validationErrors.push("industry must be ≤ 100 characters");
    } else {
      update.industry = raw.length === 0 ? null : raw;
    }
  }

  if (body.headcount !== undefined && body.headcount !== null) {
    const raw = String(body.headcount).trim();
    if (raw.length > 50) {
      validationErrors.push("headcount must be ≤ 50 characters");
    } else {
      update.headcount = raw.length === 0 ? null : raw;
    }
  }

  if (validationErrors.length > 0) {
    return json({ ok: false, error: validationErrors.join("; ") }, 400);
  }
  if (Object.keys(update).length === 0) {
    return json({ ok: false, error: "No editable fields provided" }, 400);
  }

  // Read the BEFORE snapshot so we can log a diff.
  const { data: before, error: beforeErr } = await admin
    .from("lit_companies")
    .select("id, name, domain, website, industry, headcount")
    .eq("id", companyId)
    .maybeSingle();
  if (beforeErr) {
    log.error("read_before_failed", { err: beforeErr.message, company_id: companyId });
    return json({ ok: false, error: "Failed to read company" }, 500);
  }
  if (!before) {
    return json({ ok: false, error: "Company not found" }, 404);
  }

  update.updated_at = new Date().toISOString();

  const { data: after, error: updateErr } = await admin
    .from("lit_companies")
    .update(update)
    .eq("id", companyId)
    .select("*")
    .single();
  if (updateErr) {
    log.error("update_failed", { err: updateErr.message, company_id: companyId });
    return json({ ok: false, error: updateErr.message || "Update failed" }, 500);
  }

  // Build a compact diff of only the fields we touched.
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of Object.keys(update)) {
    if (k === "updated_at" || k === "normalized_name") continue;
    const b = (before as Record<string, unknown>)[k] ?? null;
    const a = (update as Record<string, unknown>)[k] ?? null;
    if (b !== a) diff[k] = { before: b, after: a };
  }

  try {
    await admin.from("lit_activity_events").insert({
      user_id: user.id,
      event_type: "company_updated",
      company_id: companyId,
      metadata: {
        description: `Updated ${before.name ?? "company"} profile`,
        company_name: after.name ?? before.name ?? null,
        diff,
        request_id: requestId,
      },
    });
  } catch (e: any) {
    // Audit insert is best-effort; do not fail the user's write.
    log.warn("activity_event_failed", { err: e?.message, company_id: companyId });
  }

  log.info("company_updated", {
    user_id: user.id,
    company_id: companyId,
    fields: Object.keys(diff),
  });

  return json({ ok: true, company: after });
});
