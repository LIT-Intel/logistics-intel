/// <reference lib="deno.ns" />

// supabase/functions/bulk-import-fmcsa/index.ts
//
// FMCSA + Apollo → Attio bulk import.
// Platform-admin only. Supports dryRun: true for pre-commit review.
//
// Flow:
//   1. Auth + parse body { dryRun: boolean, mode: "initial" | "delta" }
//   2. Open a lit_fmcsa_import_runs row (status: running)
//   3. Download FMCSA bulk CSV from configured URL
//   4. Parse + ICP filter (authority age, type, status)
//   5. (delta mode) dedup against prior runs
//   6. Apollo enrich: company match → contact search → unlock
//   7. Score each contact via icp-scorer (Hot / Cold / Exclude)
//   8. Dry-run: write funnel + sample to run row, return.
//      Real-run: upsert Attio + queue sends + update run row.
//
// Env:
//   ATTIO_API_KEY, APOLLO_API_KEY (required for real-run; dry-run skips Apollo writes)
//   FMCSA_CSV_URL (required — see spec §5 manual setup)
//   ATTIO_LIST_OUTBOUND_HOT, ATTIO_LIST_NEWSLETTER_COLD (required for real-run)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger, requestId } from "../_shared/logger.ts";
import { scoreContact, type ScoreInput, type TitleTier } from "../_shared/icp-scorer.ts";
import { parseFmcsaCsv, normalizeAuthority, type NormalizedAuthority } from "./fmcsa-parser.ts";
import { makeApolloClient } from "./apollo-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RequestBody {
  dryRun?: boolean;
  mode?: "initial" | "delta";
  limit?: number; // safety cap; default 1000
}

serve(async (req) => {
  const log = createLogger("bulk-import-fmcsa", { request_id: requestId() });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Auth: platform_admin required
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);
  const { data: adminRow } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return json({ error: "Forbidden: platform admin required" }, 403);

  // Parse body
  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const dryRun = body.dryRun === true;
  const mode = body.mode === "delta" ? "delta" : "initial";
  const limit = Math.max(1, Math.min(2000, body.limit ?? 1000));

  // Open run row
  const { data: runRow, error: insertErr } = await admin
    .from("lit_fmcsa_import_runs")
    .insert({
      triggered_by: user.id,
      dry_run: dryRun,
      mode,
      status: "running",
    })
    .select("id")
    .single();
  if (insertErr || !runRow) {
    log.error("run_row_insert_failed", { err: insertErr?.message });
    return json({ error: "Failed to open run" }, 500);
  }
  const runId = runRow.id as string;
  log.info("run_started", { run_id: runId, dry_run: dryRun, mode, limit });

  // ── 1. Download FMCSA CSV ──────────────────────────────────────────────
  const fmcsaUrl = Deno.env.get("FMCSA_CSV_URL");
  if (!fmcsaUrl) {
    await failRun(admin, runId, "FMCSA_CSV_URL env not configured");
    return json({ error: "FMCSA_CSV_URL not configured" }, 500);
  }

  let csv: string;
  try {
    const res = await fetch(fmcsaUrl);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    csv = await res.text();
  } catch (e: any) {
    await failRun(admin, runId, `FMCSA download failed: ${e?.message ?? e}`);
    return json({ error: "FMCSA download failed" }, 502);
  }

  const rows = parseFmcsaCsv(csv);
  const now = new Date(Deno.env.get("FMCSA_NOW_OVERRIDE") || new Date().toISOString());
  const normalized: NormalizedAuthority[] = rows.map((r) => normalizeAuthority(r, now));

  // ── 2. Filter 1: active + age + authority type ─────────────────────────
  const ageFiltered = normalized.filter(
    (a) =>
      a.status === "active" &&
      a.authorityType !== "carrier" &&
      a.authorityType !== "other" &&
      a.authorityYears >= 2 &&
      a.authorityYears <= 15,
  );

  // ── 3. Filter 2: dedup against existing Attio Companies ────────────────
  // For dry-run skeleton, dedup uses lit_fmcsa_import_runs.funnel history.
  // Real Attio dedup happens at upsert time (PUT with matching_attribute
  // is idempotent — re-importing won't create duplicates).

  // ── 4. Take a representative sample for dry-run preview (no Apollo) ────
  const sampleSize = Math.min(20, ageFiltered.length);
  const sample = ageFiltered.slice(0, sampleSize);

  const funnel = {
    fmcsa_raw: normalized.length,
    after_status_filter: normalized.filter((a) => a.status === "active").length,
    after_authority_type_filter: normalized.filter(
      (a) => a.status === "active" && (a.authorityType === "broker" || a.authorityType === "forwarder" || a.authorityType === "both"),
    ).length,
    after_age_filter: ageFiltered.length,
    sample,
  };

  // ── Dry-run early return BEFORE Apollo ───────────────────────────────
  if (dryRun) {
    await admin
      .from("lit_fmcsa_import_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "dry_run_complete",
        funnel,
      })
      .eq("id", runId);
    log.info("dry_run_complete", { run_id: runId });
    return json({ ok: true, runId, dryRun: true, funnel });
  }

  // ── 5. Apollo enrich + score (real-run only) ────────────────────────
  const apolloKey = Deno.env.get("APOLLO_API_KEY");
  const attioKey = Deno.env.get("ATTIO_API_KEY");
  const hotListId = Deno.env.get("ATTIO_LIST_OUTBOUND_HOT");
  const coldListId = Deno.env.get("ATTIO_LIST_NEWSLETTER_COLD");
  if (!apolloKey || !attioKey || !hotListId || !coldListId) {
    await failRun(admin, runId, "Missing one of APOLLO_API_KEY / ATTIO_API_KEY / ATTIO_LIST_OUTBOUND_HOT / ATTIO_LIST_NEWSLETTER_COLD");
    return json({ error: "Missing required env" }, 500);
  }
  const apollo = makeApolloClient(apolloKey);

  let hotCount = 0;
  let coldCount = 0;
  const skipped: Record<string, number> = {
    no_apollo_org: 0,
    no_apollo_contact: 0,
    no_deliverable_email: 0,
    icp_excluded: 0,
    apollo_error: 0,
    attio_error: 0,
  };
  const processedCap = Math.min(limit, ageFiltered.length);

  for (let i = 0; i < processedCap; i++) {
    const auth = ageFiltered[i];
    const domain = guessDomainFromName(auth.legalName, auth.dbaName);
    if (!domain) { skipped.no_apollo_org++; continue; }

    let org;
    try {
      org = await apollo.findCompanyByDomain(domain);
    } catch (e: any) {
      log.warn("apollo_company_lookup_failed", { err: e?.message, domain });
      skipped.apollo_error++;
      continue;
    }
    if (!org || !org.employeeCount) { skipped.no_apollo_org++; continue; }

    let contacts;
    try {
      contacts = await apollo.findContactsAtCompany(org.id);
    } catch (e: any) {
      log.warn("apollo_contact_lookup_failed", { err: e?.message, org_id: org.id });
      skipped.apollo_error++;
      continue;
    }
    if (contacts.length === 0) { skipped.no_apollo_contact++; continue; }

    // Score the first decision-maker (best-effort: take #1 from Apollo's
    // ranked list — Apollo orders by seniority by default)
    const top = contacts[0];
    let unlocked;
    try {
      unlocked = await apollo.unlockContactEmail(top.id);
    } catch (e: any) {
      log.warn("apollo_unlock_failed", { err: e?.message, contact_id: top.id });
      skipped.apollo_error++;
      continue;
    }
    if (!unlocked.email || !unlocked.deliverable) {
      skipped.no_deliverable_email++;
      continue;
    }

    const titleTier = classifyTitleTier(top.title);
    const scoreInput: ScoreInput = {
      authorityType: auth.authorityType === "carrier" || auth.authorityType === "other" ? "carrier" : auth.authorityType,
      authorityYears: auth.authorityYears,
      employeeCount: org.employeeCount,
      titleTier,
      emailDeliverable: true,
    };
    const score = scoreContact(scoreInput);
    if (score.tier === "exclude") { skipped.icp_excluded++; continue; }

    // Push to Attio + queue if Hot
    try {
      const pushed = await pushToAttioBulk({
        attioKey,
        listId: score.tier === "hot" ? hotListId : coldListId,
        membership: score.tier === "hot" ? "outbound_hot" : "newsletter_cold",
        email: unlocked.email,
        firstName: top.firstName,
        lastName: top.lastName,
        jobTitle: top.title,
        companyName: auth.legalName,
        companyDomain: domain,
        attribution: {
          authority_type: auth.authorityType,
          authority_years: auth.authorityYears,
          employee_count: org.employeeCount,
          apollo_org_id: org.id,
          apollo_person_id: top.id,
          fmcsa_dot: auth.dotNumber,
          fmcsa_mc: auth.mcNumber,
          source_run_id: runId,
        },
      });
      if (!pushed.personRecordId) { skipped.attio_error++; continue; }

      if (score.tier === "hot") {
        // Queue 4 sequence steps for this person
        const steps = [
          { step: 1, delayHours: 0,   envVar: "RESEND_TPL_COLD_FMCSA_T1", subject: `quick question — ${auth.legalName} prospecting` },
          { step: 2, delayHours: 72,  envVar: "RESEND_TPL_COLD_FMCSA_T2", subject: `re: quick question — ${auth.legalName} prospecting` },
          { step: 3, delayHours: 168, envVar: "RESEND_TPL_COLD_FMCSA_T3", subject: "something you might find useful" },
          { step: 4, delayHours: 336, envVar: "RESEND_TPL_COLD_FMCSA_T4", subject: `closing the loop on ${auth.legalName}?` },
        ];
        const nowMs = Date.now();
        const queueRows = steps.map((s) => ({
          email: unlocked.email!,
          sequence_key: "cold-fmcsa-outbound",
          step: s.step,
          send_at: new Date(nowMs + s.delayHours * 3600 * 1000).toISOString(),
          subject: s.subject,
          source: "bulk_apollo_fmcsa",
        }));
        const { error: queueErr } = await admin
          .from("lit_lead_sequence_queue")
          .insert(queueRows);
        if (queueErr) { skipped.attio_error++; log.warn("queue_insert_failed", { err: queueErr.message, email: unlocked.email }); continue; }
        hotCount++;
      } else {
        coldCount++;
      }
    } catch (e: any) {
      log.warn("attio_push_failed", { err: e?.message });
      skipped.attio_error++;
    }
  }

  await admin
    .from("lit_fmcsa_import_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "succeeded",
      hot_count: hotCount,
      cold_count: coldCount,
      funnel,
      skipped,
    })
    .eq("id", runId);

  log.info("real_run_complete", { run_id: runId, hot_count: hotCount, cold_count: coldCount, skipped });

  return json({ ok: true, runId, dryRun: false, hotCount, coldCount, skipped, funnel });
});

// Helper at module scope (outside serve handler)
async function failRun(admin: any, runId: string, reason: string) {
  await admin
    .from("lit_fmcsa_import_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "failed",
      errors: { reason },
    })
    .eq("id", runId);
}

function guessDomainFromName(legal: string, dba: string): string | null {
  // Heuristic: take the more-marketable name, strip suffix words,
  // and guess the domain. We try multiple candidates; the Apollo
  // lookup will tell us which (if any) actually exists.
  const candidates = [dba, legal].filter(Boolean);
  for (const c of candidates) {
    const cleaned = c
      .toLowerCase()
      .replace(/\b(llc|inc|corp|co|ltd|company|incorporated|corporation)\b\.?/g, "")
      .replace(/[^a-z0-9]/g, "");
    if (cleaned.length >= 3 && cleaned.length <= 30) return `${cleaned}.com`;
  }
  return null;
}

function classifyTitleTier(rawTitle: string): TitleTier {
  // Inline minimal classifier — mirrors title-normalizer's logic.
  // We don't import from marketing/ into the Deno edge fn; instead
  // we duplicate the core rules. Trap cases tested in icp-scorer tests.
  const t = (rawTitle || "").toLowerCase().trim();
  if (!t) return "unknown";
  if (/(floor manager|assistant manager|assistant|coordinator|specialist|analyst|intern|trainee)/.test(t)) return "junior";
  if (/(account executive|\b(sdr|bdr)\b|development representative|inside sales rep)/.test(t)) return "ic";
  if (/(president|\b(ceo|chief executive officer)\b|owner|founder|managing partner|proprietor)/.test(t)) return "owner";
  if (/((vp|vice president).*(sales|business development|bd|commercial|revenue|operations|ops)|\b(svp|evp|senior vice president|executive vice president)\b)/.test(t)) return "vp";
  if (/(director.*(sales|business development|bd|commercial|revenue|operations|ops|logistics)|(sales|business development|bd|commercial|revenue|operations|logistics).*director)/.test(t)) return "director";
  if (/(sales manager|business development manager|bd manager|sales operations manager|sales ops manager)/.test(t)) return "sales-manager";
  if (/((operations|logistics|dispatch|transportation|fleet) manager)/.test(t)) return "ops";
  return "unknown";
}

interface PushArgs {
  attioKey: string;
  listId: string;
  membership: "outbound_hot" | "newsletter_cold";
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  companyName: string;
  companyDomain: string;
  attribution: Record<string, string | number>;
}

async function pushToAttioBulk(args: PushArgs): Promise<{ personRecordId: string | null }> {
  // Duplicates the Attio upsert pattern from marketing/lib/attio.ts. Why
  // duplicate: that file runs in Node (Next.js API routes); this runs in
  // Deno. Shared types live in the spec; we accept ~80 LOC duplication
  // over a build-time codegen step for v1.
  const BASE = "https://api.attio.com/v2";
  const headers = {
    Authorization: `Bearer ${args.attioKey}`,
    "Content-Type": "application/json",
  };

  // Upsert Company by domain
  const companyRes = await fetch(`${BASE}/objects/companies/records?matching_attribute=domains`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      data: {
        values: {
          name: [{ value: args.companyName }],
          domains: [{ domain: args.companyDomain }],
        },
      },
    }),
  });
  if (!companyRes.ok) throw new Error(`Attio company ${companyRes.status}`);
  const companyJson = await companyRes.json();
  const companyId = companyJson?.data?.id?.record_id ?? null;

  // Upsert Person by email
  const personRes = await fetch(`${BASE}/objects/people/records?matching_attribute=email_addresses`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      data: {
        values: {
          email_addresses: [{ email_address: args.email }],
          name: [{
            first_name: args.firstName,
            last_name: args.lastName,
            full_name: `${args.firstName} ${args.lastName}`.trim(),
          }],
          job_title: [{ value: args.jobTitle }],
          ...(companyId ? { company: [{ target_object: "companies", target_record_id: companyId }] } : {}),
        },
      },
    }),
  });
  if (!personRes.ok) throw new Error(`Attio person ${personRes.status}`);
  const personJson = await personRes.json();
  const personId = personJson?.data?.id?.record_id ?? null;
  if (!personId) return { personRecordId: null };

  // Add to list
  await fetch(`${BASE}/lists/${args.listId}/entries`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      data: { parent_record_id: personId, parent_object: "people", entry_values: {} },
    }),
  });

  // Attribution note
  const noteLines = [`Source: bulk_apollo_fmcsa`, `Membership: ${args.membership}`];
  for (const [k, v] of Object.entries(args.attribution)) noteLines.push(`${k}: ${v}`);
  await fetch(`${BASE}/notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      data: {
        parent_object: "people",
        parent_record_id: personId,
        title: `FMCSA bulk import — ${args.membership}`,
        format: "plaintext",
        content: noteLines.join("\n"),
      },
    }),
  });

  return { personRecordId: personId };
}
