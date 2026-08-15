// lead-magnet-fulfillment — CRON edge function (verify_jwt=false; cron-auth via
// X-Internal-Cron / LIT_CRON_SECRET). Registered in .verify-jwt-manifest.json
// no_verify_jwt.
// ---------------------------------------------------------------------------
// "The cron that automatically runs the report and emails the subscriber."
//
// Sweeps lit_lead_magnet_sessions where a lead submitted their email but the
// result email has not yet been sent, regenerates the result using the SAME
// shared builders the public edge fns use (lead_magnet_builders.ts), emails it
// with the SAME shared branded template + Resend + suppression gate
// (lead_magnet_email.ts), then stamps report_emailed_at / increments
// email_send_attempts / records last_email_error.
//
// Idempotent (report_emailed_at gate), batched (BATCH/run), retry-capped
// (email_send_attempts < MAX_ATTEMPTS). 0 provider credits — directory /
// snapshot reads only. Transactional email only (the lead explicitly asked).
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger } from "../_shared/logger.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { sendLeadMagnetEmail } from "../_shared/lead_magnet_email.ts";
import {
  parseFilters,
  resolveProspectList,
  buildListResult,
  buildReport,
  buildRisk,
  lmSlugify,
} from "../_shared/lead_magnet_builders.ts";

const log = createLogger("lead-magnet-fulfillment");

const BATCH = 50;
const MAX_ATTEMPTS = 3;

const LIST_MAGNETS = new Set(["top-shippers", "free-freight-prospects"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Rebuild the exact result payload for a session (per magnet), reusing the
// shared builders so the email matches the on-page result. Returns null when
// the result can't be regenerated (e.g. company snapshot gone) — the caller
// records that and moves on.
async function buildPayload(
  admin: SupabaseClient,
  magnetSlug: string,
  metadata: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  // ---- list magnets: regenerate the ranked list from saved_query filters ----
  if (LIST_MAGNETS.has(magnetSlug)) {
    const savedQuery = (metadata?.saved_query && typeof metadata.saved_query === "object"
      ? (metadata.saved_query as any)
      : {}) as Record<string, unknown>;
    const raw = (savedQuery.raw && typeof savedQuery.raw === "object" ? savedQuery.raw : {}) as Record<string, unknown>;
    const filters = parseFilters(raw);
    const { rows } = await resolveProspectList(admin, filters);
    const result = buildListResult(rows);
    if (result.visible.length === 0) return null;
    return {
      visible: result.visible,
      locked_count: result.locked_count,
      total_count: result.total_count,
      saved_query: savedQuery,
    };
  }

  // ---- freight-revenue-calculator: pure estimate echo ----
  if (magnetSlug === "freight-revenue-calculator") {
    return { estimate: metadata?.estimate ?? null };
  }

  // ---- report / risk: regenerate from the cached snapshot ----
  const companyKeyRaw = (metadata?.last_company_key ?? metadata?.company_key) as string | undefined;
  if (!companyKeyRaw) return null;
  const companyKey = lmSlugify(String(companyKeyRaw));
  const { data: snap } = await admin
    .from("lit_importyeti_company_snapshot")
    .select("company_id, parsed_summary, updated_at")
    .eq("company_id", companyKey)
    .maybeSingle();
  const ps = (snap as any)?.parsed_summary as Record<string, unknown> | null | undefined;
  if (!snap || !ps || typeof ps !== "object") return null;
  const snapDate = (snap as any).updated_at ? String((snap as any).updated_at).slice(0, 10) : null;

  if (magnetSlug === "import-risk-scanner") {
    const declared = {
      commodity: (metadata?.commodity as string) ?? null,
      hs_code: (metadata?.hs_code as string) ?? null,
      origin_country: (metadata?.origin_country as string) ?? null,
    };
    const risk = buildRisk(companyKey, ps, snapDate, declared);
    return { visible: risk.visible };
  }

  // default: free-shipper-report
  const report = buildReport(companyKey, ps, snapDate);
  return { visible: report.visible };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    log.error("missing_env", {});
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  // Pending fulfillment: captured an email, not yet emailed, under the retry cap.
  const { data: sessions, error } = await admin
    .from("lit_lead_magnet_sessions")
    .select("id, magnet_slug, email, metadata, email_send_attempts")
    .not("email_captured_at", "is", null)
    .is("report_emailed_at", null)
    .lt("email_send_attempts", MAX_ATTEMPTS)
    .order("email_captured_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    log.error("sweep_query_failed", { err: error.message });
    return json({ ok: false, error: error.message }, 500);
  }

  let sent = 0, skipped = 0, failed = 0, noPayload = 0;

  for (const s of sessions ?? []) {
    const id = (s as any).id as string;
    const magnetSlug = String((s as any).magnet_slug ?? "");
    const email = String((s as any).email ?? "").trim().toLowerCase();
    const metadata = ((s as any).metadata && typeof (s as any).metadata === "object" ? (s as any).metadata : {}) as Record<string, unknown>;
    const attempts = Number((s as any).email_send_attempts ?? 0);
    const firstName = (metadata?.first_name as string) ?? null;

    if (!email) {
      await admin.from("lit_lead_magnet_sessions")
        .update({ email_send_attempts: attempts + 1, last_email_error: "no_email" })
        .eq("id", id);
      failed++;
      continue;
    }

    try {
      const payload = await buildPayload(admin, magnetSlug, metadata);
      if (!payload) {
        noPayload++;
        await admin.from("lit_lead_magnet_sessions")
          .update({ email_send_attempts: attempts + 1, last_email_error: "no_payload" })
          .eq("id", id);
        continue;
      }

      const res = await sendLeadMagnetEmail(admin, { magnetSlug, email, firstName, payload });
      if (res.skipped) {
        // Suppressed/internal — mark emailed so we stop retrying, record why.
        await admin.from("lit_lead_magnet_sessions")
          .update({
            report_emailed_at: new Date().toISOString(),
            email_send_attempts: attempts + 1,
            last_email_error: `skipped:${res.reason}`,
          })
          .eq("id", id);
        skipped++;
      } else {
        await admin.from("lit_lead_magnet_sessions")
          .update({
            report_emailed_at: new Date().toISOString(),
            email_send_attempts: attempts + 1,
            last_email_error: null,
          })
          .eq("id", id);
        sent++;
        await admin.from("lit_lead_magnet_events").insert({
          session_id: id,
          magnet_slug: magnetSlug,
          event_name: "lead_report_emailed",
          anonymous_id: null,
          metadata: { message_id: res.message_id ?? null, channel: "fulfillment_cron" },
        }).then(() => {}, () => {});
      }
    } catch (err) {
      failed++;
      await admin.from("lit_lead_magnet_sessions")
        .update({ email_send_attempts: attempts + 1, last_email_error: String(err).slice(0, 500) })
        .eq("id", id);
      log.warn("fulfillment_send_failed", { session_id: id, magnet: magnetSlug, err: String(err) });
    }
  }

  log.info("fulfillment_run", { scanned: (sessions ?? []).length, sent, skipped, failed, noPayload });
  return json({ ok: true, scanned: (sessions ?? []).length, sent, skipped, failed, no_payload: noPayload });
});
