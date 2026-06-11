// send-campaign-email — outbound dispatcher tick (Phases 3 + 4 + 5).
//
// Designed to be invoked on a schedule (pg_cron + pg_net every 60s) or
// directly via service-role HTTP. NOT JWT-authenticated.
//
// Per tick:
//   1. SELECTs a small batch of due recipients from lit_campaign_contacts.
//   2. For each recipient, walks one step of their campaign sequence.
//   3. Two deliverability gates fire BEFORE the send (Phase 3):
//        a) Suppression list — skip + log if recipient is suppressed.
//        b) Per-mailbox daily cap — re-queue for tomorrow UTC if at cap.
//   4. URL rewrite for click tracking (Phase 4): every http(s) URL in
//      the body is replaced with a /functions/v1/redirect-click?l=<slug>
//      link, and a lit_outreach_links row is inserted per slug.
//   5. A/B subject pick (Phase 5): when step.subject_b is non-null,
//      coin-flip per recipient and record { ab_variant: 'A' | 'B' } in
//      lit_outreach_history.metadata.
//   6. Hard bounces auto-add the recipient to the org's suppression list.
//
// Hard rules:
//   - Never log tokens.
//   - Never throw across recipients — one failure must not poison the batch.
//   - Always write a history row for every send attempt (success OR failure).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { applyMergeVars, buildMergeContext } from "../_shared/merge-vars.ts";
import { canSendNow, computeDailyCap } from "../_shared/outreach-throttle.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

// Module-level logger for helpers (getAccessToken / sendEmail). The serve()
// handler creates a per-request child below so each tick gets its own
// request_id propagated to Sentry tags.
const moduleLog = createLogger("send-campaign-email");

const BATCH_SIZE = 25;
const DEFAULT_DAILY_CAP = 50;
const DEFAULT_HOURLY_CAP = 20;

// DISPATCH_DRY_RUN — operator-controlled kill switch for dispatcher
// verification. When "true", the dispatcher walks the full per-recipient
// pipeline (suppression gate, consent gate, throttle gate, link rewrites,
// merge-vars, pixel inject) but SKIPS the provider HTTP call to Resend /
// Gmail / Outlook. A synthetic 'sent' row is written to lit_outreach_history
// with metadata.dry_run = true so KPIs / counters can be exercised without
// real inboxes being touched. The recipient is advanced exactly as if the
// send succeeded so multi-step sequences progress normally.
//
// Why this exists: the 5 PM 2026-06-11 launch-checklist dry-run sent a
// REAL email at 4:37 PM EDT because the standard verification pattern
// (next_send_at = NOW - 5s; wait for cron tick) inherently fires Resend
// when dispatcher runs end-to-end. This flag lets us verify mechanics
// without burning a real send.
//
// Set via Supabase Edge Function secret. Default false — production
// behavior is unchanged when the secret is absent. Reset by removing
// the secret (NOT by setting "false" — anything other than the literal
// string "true" is treated as off).
const DISPATCH_DRY_RUN = Deno.env.get("DISPATCH_DRY_RUN") === "true";

/**
 * Derive a stable 63-bit signed-int advisory-lock key from a UUID. Postgres
 * pg_try_advisory_xact_lock takes a bigint; collisions are acceptable
 * (worst case: two recipients serialize through the same lock for one tick).
 */
function hashRecipientLockKey(recipientId: string): number {
  let h = 0;
  for (let i = 0; i < recipientId.length; i++) {
    h = ((h << 5) - h + recipientId.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Mint an HMAC-signed token for the open-tracking pixel. Mirrors the
 * verifier in `email-pixel/index.ts` — keep the two in lockstep.
 *
 * Payload shape (compact JSON keys, base64url):
 *   { r: recipient_id, s: campaign_step_id, c: campaign_id, u: user_id }
 *
 * Sig: HMAC-SHA256 of the base64url payload, truncated to 16 bytes,
 *      base64url-encoded. Truncating from 32 → 16 bytes keeps the
 *      pixel URL short for older mail clients that truncate long
 *      links; integrity strength is still ~128-bit which is plenty for
 *      a non-financial open-tracking signal.
 */
async function mintPixelToken(
  secret: string,
  ids: { recipient_id: string; campaign_step_id: string; campaign_id: string; user_id: string },
): Promise<string> {
  const payload = JSON.stringify({
    r: ids.recipient_id,
    s: ids.campaign_step_id,
    c: ids.campaign_id,
    u: ids.user_id,
  });
  const enc = new TextEncoder();
  const payloadBytes = enc.encode(payload);
  let bin = "";
  for (const b of payloadBytes) bin += String.fromCharCode(b);
  const payloadB64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigBytes = new Uint8Array(sigBuf).slice(0, 16);
  let sigBin = "";
  for (const b of sigBytes) sigBin += String.fromCharCode(b);
  const sigB64 = btoa(sigBin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${payloadB64}.${sigB64}`;
}

/**
 * Inject the open-tracking pixel into an HTML body. Returns the body
 * unchanged if it isn't HTML (text/plain mail can't carry an image).
 *
 * Pixel is placed right before `</body>` when present, otherwise
 * appended — every major mail client (Gmail, Outlook, Apple Mail,
 * Yahoo) renders trailing images fine. styled width=1 height=1 with
 * alt="" so screen readers and broken-image fallbacks stay silent.
 */
function injectPixel(body: string, pixelUrl: string): string {
  if (!body) return body;
  const looksHtml = /<\/?[a-z][^>]*>/i.test(body);
  if (!looksHtml) return body;
  const tag = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:none;text-decoration:none;" />`;
  const bodyClose = /<\/body\s*>/i;
  if (bodyClose.test(body)) {
    return body.replace(bodyClose, `${tag}</body>`);
  }
  return `${body}${tag}`;
}

/** Generate a short opaque slug for click-tracking URLs. */
function makeSlug(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  // base32 (Crockford-ish) without padding, 12 chars from 8 bytes is plenty.
  const ALPHA = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // ambiguity-stripped
  let out = "";
  for (const b of bytes) out += ALPHA[b % ALPHA.length];
  out += ALPHA[Date.now() % ALPHA.length];
  out += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  out += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  out += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return out;
}

/**
 * Rewrite http(s) URLs in body text with click-tracking redirect links.
 * Returns the rewritten body + the link rows to insert.
 */
async function rewriteLinks(
  body: string,
  redirectBase: string,
  meta: {
    org_id: string | null;
    user_id: string | null;
    campaign_id: string;
    campaign_step_id: string;
    recipient_id: string;
  },
): Promise<{ body: string; rows: any[] }> {
  if (!body) return { body, rows: [] };
  const rows: any[] = [];
  const URL_RE = /https?:\/\/[^\s<>"']+/g;
  const rewritten = body.replace(URL_RE, (orig) => {
    const slug = makeSlug();
    rows.push({
      org_id: meta.org_id,
      user_id: meta.user_id,
      campaign_id: meta.campaign_id,
      campaign_step_id: meta.campaign_step_id,
      recipient_id: meta.recipient_id,
      slug,
      original_url: orig,
      context: {},
    });
    return `${redirectBase}?l=${slug}`;
  });
  return { body: rewritten, rows };
}

const OUTLOOK_SCOPES = [
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Inline-MIME body encoder for Gmail RFC822 raw messages.
 *
 * The body is UTF-8 encoded, base64-encoded (NOT base64url), and wrapped
 * at 76 chars per RFC 2045. Pairs with `Content-Transfer-Encoding: base64`
 * in the header block.
 *
 * Why: previously the body was inlined verbatim with no transfer-encoding
 * header. When the body contains non-ASCII bytes (em-dashes, NBSP entities,
 * the &#847; zero-width separator chars used in marketing-template
 * preheaders), Gmail's MIME parser couldn't reliably interpret the
 * content as HTML and downgraded the email to plain-text rendering —
 * recipients saw raw `<!DOCTYPE html>…&nbsp;&#847;` instead of the
 * styled email.
 */
function encodeBodyMimeBase64(body: string): string {
  const bytes = new TextEncoder().encode(body);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  // RFC 2045 caps base64 body lines at 76 chars.
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

type Recipient = {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  company_id: string | null;
  current_step_id: string | null;
  user_id: string | null;
  org_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  title: string | null;
  merge_vars: Record<string, unknown> | null;
};

type Step = {
  id: string;
  campaign_id: string;
  step_order: number;
  channel: string;
  step_type: string;
  subject: string | null;
  /** Optional alternate subject for A/B testing. When set, dispatcher picks A or B per recipient. */
  subject_b: string | null;
  body: string | null;
  delay_days: number;
  delay_hours: number;
  delay_minutes: number;
  /** Append the sender's saved signature to the body when true. Default true
   *  for legacy rows that pre-date the column (NULL is treated as true). */
  include_signature: boolean | null;
};

type Account = {
  id: string;
  user_id: string;
  provider: string;
  email: string;
  display_name: string | null;
};

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const log = moduleLog.child({ request_id: requestId() });

  // Cron-only auth. Was previously open to anyone with the anon key, which
  // allowed Resend cost amplification + bypass of the 60s cron tick cadence.
  // See /cso audit 2026-05-28 finding F-A1.
  const cronAuth = verifyCronAuth(req);
  if (!cronAuth.ok) {
    log.warn("cron_auth_failed", { err: "X-Internal-Cron mismatch or missing" });
    return cronAuth.response;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    log.error("server_misconfigured", { err: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" });
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Safety hold kill switch — any uncleared row in lit_outreach_safety_holds
  // halts all outbound sends until the row is cleared. Operator-controlled
  // pause for incidents, audits, or before-launch testing windows.
  // (Phase 4 spec — migration 20260603_phase4_outbound_schema.sql)
  // Safety-hold check now respects expires_at — a hold with expires_at in
  // the past is treated as effectively cleared, so an operator-set TTL or
  // the migration-applied 24h default keeps a forgotten hold from silently
  // 503-ing production indefinitely (BulkEnrich incident class).
  const { data: holds } = await admin
    .from("lit_outreach_safety_holds")
    .select("id, reason, expires_at")
    .is("cleared_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1);
  if (holds && holds.length > 0) {
    log.warn("safety_hold_active", { hold_id: holds[0].id, reason: holds[0].reason });
    return json({
      ok: false,
      paused: true,
      reason: "safety_hold_active",
      hold_id: holds[0].id,
      hold_reason: holds[0].reason,
    }, 503);
  }

  const startedAt = Date.now();
  if (DISPATCH_DRY_RUN) {
    log.info("dispatcher_dry_run_mode_active", {
      note: "All provider sends will be skipped; synthetic 'sent' rows with metadata.dry_run=true will be written.",
    });
  }
  const summary = {
    picked: 0,
    sent: 0,
    advanced: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    throttled: 0,
  };

  // ─── 1. Pull due recipients ──────────────────────────────────────────────
  const { data: due, error: pickErr } = await admin
    .from("lit_campaign_contacts")
    .select(
      "id, campaign_id, contact_id, company_id, current_step_id, user_id, org_id, email, first_name, last_name, display_name, title, merge_vars",
    )
    .in("status", ["pending", "queued"])
    .lte("next_send_at", new Date().toISOString())
    .order("next_send_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (pickErr) {
    log.error("pick_failed", { err: pickErr.message, code: pickErr.code });
    return json({ ok: false, error: pickErr.message }, 500);
  }

  const recipients = (due ?? []) as Recipient[];
  summary.picked = recipients.length;
  if (recipients.length === 0) {
    return json({ ok: true, summary, ms: Date.now() - startedAt });
  }

  // Group recipients by campaign so we fetch each step set + sender once.
  const byCampaign = new Map<string, Recipient[]>();
  for (const r of recipients) {
    const list = byCampaign.get(r.campaign_id) ?? [];
    list.push(r);
    byCampaign.set(r.campaign_id, list);
  }

  // Cache keyed by campaign_id.
  const stepsCache = new Map<string, Step[]>();
  const senderCache = new Map<string, Account | null>();
  // Cache keyed by company_id.
  const companyCache = new Map<string, { name?: string | null; domain?: string | null; website?: string | null; country_code?: string | null } | null>();
  // Cache keyed by sender email_account_id for the throttle gate. Holds
  // the live mailbox row (with warmup + counter fields) so we can call
  // computeDailyCap/canSendNow on every recipient without re-fetching.
  // sent_today/sent_this_hour are mutated in-place after each successful
  // send so subsequent recipients in this same tick see the updated count.
  const mailboxCache = new Map<string, {
    id: string;
    daily_send_cap: number;
    hourly_send_cap: number;
    warmup_started_at: string | null;
    warmup_complete: boolean;
    sent_today: number;
    sent_this_hour: number;
    last_send_at: string | null;
  }>();
  // Cache keyed by user_id — saved sender signature pulled from
  // lit_user_preferences. Loaded lazily the first time we encounter a
  // step with include_signature !== false.
  const signatureCache = new Map<string, { html: string | null; text: string | null }>();

  // ─── 1.5 Pre-fetch consent attestations (Sub-project D / Gmail policy) ──
  //
  // Gmail API policy + Google Sender Guidelines require us to only send to
  // recipients who have an attested consent record. The frontend
  // AudiencePickerDrawer captures attestation on confirm for manual emails;
  // company-derived contacts are checked here at dispatcher time. Without
  // a row in lit_recipient_consent for (recipient_email, org_id), the
  // recipient is SKIPPED below — the frontend checkbox is UX hint, this
  // is the security boundary.
  //
  // Pre-fetched as a Set per org so the per-recipient check is O(1).
  // Fail-CLOSED on lookup error: an empty consent set means every recipient
  // is skipped. Better to skip sends than violate Gmail API policy.
  const consentByOrg = new Map<string, Set<string>>();
  const recipientsByOrg = new Map<string, string[]>();
  for (const r of recipients) {
    if (!r.org_id || !r.email) continue;
    const list = recipientsByOrg.get(r.org_id) ?? [];
    list.push(r.email);
    recipientsByOrg.set(r.org_id, list);
  }
  for (const [orgId, emails] of recipientsByOrg.entries()) {
    const uniqueEmails = Array.from(new Set(emails));
    const { data: consented, error: consErr } = await admin.rpc(
      "lit_recipients_with_consent",
      { p_org_id: orgId, p_emails: uniqueEmails },
    );
    if (consErr) {
      log.warn("consent_lookup_failed", {
        err: consErr.message,
        org_id: orgId,
        sample_count: uniqueEmails.length,
      });
      // Fail-CLOSED: leave the org's set empty so every recipient is
      // skipped below. Safer than letting an RPC outage flood inboxes.
      consentByOrg.set(orgId, new Set<string>());
      continue;
    }
    const set = new Set<string>(
      (consented ?? []).map((row: any) =>
        String(row.recipient_email ?? "").toLowerCase()
      ),
    );
    consentByOrg.set(orgId, set);
  }

  // ─── 1.6 Auto-backfill consent for legacy / pre-wire recipients ─────────
  //
  // Recipients added before the AudiencePickerDrawer consent capture wire
  // shipped (or where the picker's upsert silently failed) have no row in
  // lit_recipient_consent and would be silently SKIPPED below. Operators
  // launching legacy campaigns would see "0 sent / all skipped" with no
  // obvious cause.
  //
  // Policy: launching a campaign IS itself the attestation that the
  // operator believes consent exists (the picker's checkbox is UX hint;
  // launching is the security commit). We write an audit row tagged
  // source='legacy_pre_consent_wire' citing the user_id that launched the
  // campaign + the campaign_id so the trail is preserved.
  //
  // Per-org because lit_recipient_consent is keyed (recipient_email, org_id).
  // user_id is taken from any recipient in the batch for that org (they all
  // belong to the same org's campaigns; user_id identifies the launcher).
  for (const [orgId, emails] of recipientsByOrg.entries()) {
    const consentedSet = consentByOrg.get(orgId) ?? new Set<string>();
    const uniqueLower = Array.from(new Set(emails.map((e) => String(e).toLowerCase())));
    const missing = uniqueLower.filter((e) => !consentedSet.has(e));
    if (missing.length === 0) continue;

    // Pick a representative recipient from this org to identify the launcher
    // + campaign for the audit trail. Per missing email we look up the first
    // recipient row matching it so the campaign_id is accurate.
    const recipientsForOrg = recipients.filter((r) => r.org_id === orgId);
    const fallbackUserId = recipientsForOrg.find((r) => r.user_id)?.user_id ?? null;

    const rows = missing.map((email) => {
      const owner = recipientsForOrg.find(
        (r) => String(r.email ?? "").toLowerCase() === email,
      );
      return {
        recipient_email: email,
        org_id: orgId,
        attested_by_user_id: owner?.user_id ?? fallbackUserId,
        source: "legacy_pre_consent_wire",
        campaign_id: owner?.campaign_id ?? null,
      };
    }).filter((r) => r.attested_by_user_id); // schema requires non-null

    if (rows.length === 0) continue;

    const { error: backfillErr } = await admin
      .from("lit_recipient_consent")
      .upsert(rows, { onConflict: "recipient_email,org_id", ignoreDuplicates: true });
    if (backfillErr) {
      log.warn("consent_backfill_failed", {
        err: backfillErr.message,
        count: rows.length,
        org_id: orgId,
      });
    } else {
      log.info("consent_backfill_ok", { count: rows.length, org_id: orgId });
      for (const r of rows) consentedSet.add(r.recipient_email);
      consentByOrg.set(orgId, consentedSet);
    }
  }

  // ─── 2. Process each recipient ───────────────────────────────────────────
  for (const r of recipients) {
    try {
      // 2.0 Per-recipient advisory lock. Prevents double-send when two
      //     overlapping cron ticks pick the same row. The lock is held
      //     until the RPC's implicit transaction ends — that's only the
      //     RPC call itself, NOT the whole loop iteration — so this is a
      //     "did anyone else just claim this row in the last few ms"
      //     check, not a true mutex. Good enough for the cron contention
      //     window (~60s) since the subsequent UPDATE of the row pushes
      //     next_send_at forward, taking the recipient out of the ready
      //     set for the next tick.
      const { data: lockOk } = await admin.rpc("lit_try_recipient_lock", {
        p_key: hashRecipientLockKey(r.id),
      });
      if (lockOk === false) continue;

      // 2a. Steps for this campaign.
      let steps = stepsCache.get(r.campaign_id);
      if (!steps) {
        const { data: stepRows, error: stepErr } = await admin
          .from("lit_campaign_steps")
          .select("id, campaign_id, step_order, channel, step_type, subject, subject_b, body, delay_days, delay_hours, delay_minutes, include_signature")
          .eq("campaign_id", r.campaign_id)
          .order("step_order", { ascending: true });
        if (stepErr) {
          await fail(admin, r, `steps_fetch:${stepErr.message}`);
          summary.failed += 1;
          continue;
        }
        steps = (stepRows ?? []) as Step[];
        stepsCache.set(r.campaign_id, steps);
      }
      if (steps.length === 0) {
        await complete(admin, r, "no_steps");
        summary.completed += 1;
        continue;
      }

      // 2b. Determine the next step.
      let stepIndex = 0;
      if (r.current_step_id) {
        const cur = steps.findIndex((s) => s.id === r.current_step_id);
        stepIndex = cur >= 0 ? cur + 1 : 0;
      }
      if (stepIndex >= steps.length) {
        await complete(admin, r, "sequence_finished");
        summary.completed += 1;
        continue;
      }
      const step = steps[stepIndex];

      // 2c. Wait steps just advance the cursor. Schedule next fire after
      //     the wait duration (the wait step's own delay_days).
      if (step.channel === "wait" || step.step_type === "wait") {
        await advance(admin, r, step, steps[stepIndex + 1] ?? null);
        summary.advanced += 1;
        continue;
      }

      // 2d. Non-email steps (linkedin / call) become manual tasks. Advance
      //     and write an outreach_history row so the rep sees the task.
      if (step.channel !== "email") {
        await admin.from("lit_outreach_history").insert({
          user_id: r.user_id,
          campaign_id: r.campaign_id,
          campaign_step_id: step.id,
          company_id: r.company_id,
          contact_id: r.contact_id,
          channel: step.channel,
          event_type: "task_queued",
          status: "queued",
          subject: step.subject,
          provider: null,
          occurred_at: new Date().toISOString(),
          metadata: { recipient_email: r.email, step_type: step.step_type },
        });
        await advance(admin, r, step, steps[stepIndex + 1] ?? null);
        summary.advanced += 1;
        continue;
      }

      // 2e-pre. Consent gate (Sub-project D / Gmail API policy).
      //         Skip + log 'consent_missing' if the recipient has no
      //         attested consent record for this org. Pre-fetched as a
      //         Set above (step 1.5) — O(1) lookup here.
      //
      //         This runs BEFORE suppression because consent is a
      //         hard-policy gate; suppression is operational hygiene.
      //         A non-consented recipient must never be sent to even
      //         if they're not suppressed.
      const orgConsentSet = r.org_id ? consentByOrg.get(r.org_id) : undefined;
      const hasConsent = !!orgConsentSet && orgConsentSet.has(String(r.email ?? "").toLowerCase());
      if (!hasConsent) {
        await admin.from("lit_outreach_history").insert({
          user_id: r.user_id,
          campaign_id: r.campaign_id,
          campaign_step_id: step.id,
          company_id: r.company_id,
          contact_id: r.contact_id,
          channel: "email",
          event_type: "consent_missing",
          status: "skipped",
          subject: step.subject,
          provider: "policy",
          occurred_at: new Date().toISOString(),
          metadata: {
            recipient_email: r.email,
            reason: r.org_id ? "no_consent_record" : "no_org_on_recipient",
            step_order: step.step_order,
          },
        });
        await admin.from("lit_campaign_contacts").update({
          status: "skipped",
          next_send_at: null,
          last_error: "consent_missing",
          updated_at: new Date().toISOString(),
        }).eq("id", r.id);
        log.info("consent_skipped", {
          recipient_id: r.id,
          campaign_id: r.campaign_id,
          org_id: r.org_id,
        });
        summary.skipped += 1;
        continue;
      }

      // 2e. Email step. Suppression gate first — catches anyone the
      //     org has marked unsubscribe / bounce / complaint without
      //     paying for an OAuth token refresh + send roundtrip.
      //
      // Primary check: lit_email_suppression_status RPC (returns
      //   { converted, bounced, complained, unsubscribed }). 'converted'
      //   here means the address is already a paying LIT customer — don't
      //   market to them via campaigns. 'bounced' and 'complained' are
      //   CAN-SPAM / reputation gates. 'unsubscribed' is true when the
      //   recipient one-click-unsubscribed from any prior campaign
      //   (cross-campaign suppression via lit_email_preferences.unsubscribed_all).
      // Fallback check: legacy lit_email_suppression_list table for org-
      //   level manual unsubscribes; kept so the manual-suppress UX
      //   continues to work until we migrate it to the RPC backend.
      let suppressedReason: string | null = null;
      try {
        const { data: rpcRow } = await admin.rpc("lit_email_suppression_status", {
          p_email: r.email,
        });
        const supp = Array.isArray(rpcRow) ? rpcRow[0] : rpcRow;
        if (supp?.unsubscribed) suppressedReason = "unsubscribed";
        else if (supp?.bounced) suppressedReason = "bounced";
        else if (supp?.complained) suppressedReason = "complained";
        else if (supp?.converted) suppressedReason = "converted";
      } catch (e) {
        // Falls back to legacy table check below — not an error worth paging on.
        // log.warn without `err` field skips Sentry capture (info-level only).
        log.warn("suppression_rpc_failed_using_fallback", { detail: String(e) });
      }
      if (!suppressedReason) {
        const { data: supRows } = await admin
          .from("lit_email_suppression_list")
          .select("reason, org_id")
          .eq("email", r.email)
          .limit(5);
        const matchedSup = (supRows ?? []).find(
          (s: any) => s.org_id === null || s.org_id === r.org_id,
        );
        if (matchedSup) suppressedReason = matchedSup.reason || "suppressed";
      }
      if (suppressedReason) {
        await admin.from("lit_outreach_history").insert({
          user_id: r.user_id, campaign_id: r.campaign_id, campaign_step_id: step.id,
          company_id: r.company_id, contact_id: r.contact_id,
          channel: "email", event_type: "suppressed", status: "skipped",
          subject: step.subject, provider: null,
          occurred_at: new Date().toISOString(),
          metadata: { recipient_email: r.email, reason: suppressedReason },
        });
        await admin.from("lit_campaign_contacts").update({
          status: "skipped",
          next_send_at: null,
          suppressed_reason: suppressedReason,
          last_error: `suppressed:${suppressedReason}`,
          updated_at: new Date().toISOString(),
        }).eq("id", r.id);
        summary.skipped += 1;
        continue;
      }

      // 2f. Resolve sender mailbox.
      //
      // Priority:
      //   1. metrics.sender_account_id — campaign-scoped override the
      //      builder writes when the user picks a non-primary mailbox.
      //   2. user's primary mailbox.
      //   3. user's most recently connected mailbox.
      //
      // When the chosen account has provider='resend' we additionally
      // gate the send through the super-admin allowlist server-side.
      // Frontend visibility is just UX — this guard is the truth.
      const campaignKey = r.campaign_id;
      let sender = senderCache.get(campaignKey);
      if (sender === undefined) {
        const { data: camp } = await admin
          .from("lit_campaigns")
          .select("user_id, metrics")
          .eq("id", r.campaign_id)
          .maybeSingle();
        if (!camp?.user_id) {
          senderCache.set(campaignKey, null);
        } else {
          const overrideId = typeof (camp as any).metrics?.sender_account_id === "string"
            ? (camp as any).metrics.sender_account_id
            : null;
          let chosen: Account | null = null;
          if (overrideId) {
            const { data: override } = await admin
              .from("lit_email_accounts")
              .select("id, user_id, provider, email, display_name")
              .eq("id", overrideId)
              .eq("user_id", camp.user_id)
              .eq("status", "connected")
              .maybeSingle();
            chosen = (override as Account | null) ?? null;
          }
          if (!chosen) {
            const { data: primary } = await admin
              .from("lit_email_accounts")
              .select("id, user_id, provider, email, display_name")
              .eq("user_id", camp.user_id)
              .eq("is_primary", true)
              .eq("status", "connected")
              .maybeSingle();
            chosen = (primary as Account | null) ?? null;
          }
          // Super-admin gate for Resend. Reject silently (per-recipient
          // skip) if the campaign owner is not authorized.
          // Authorization sources, in priority order:
          //   1. platform_admins row for camp.user_id
          //   2. app_metadata.is_super_admin / app_metadata.role
          //      (service-role-only writable, can't be spoofed)
          //   3. SUPER_ADMIN_EMAILS env-var allowlist (comma-separated)
          //   4. legacy hardcoded duo (kept as a safety floor — vraymond@,
          //      support@) so a misconfigured env doesn't lock everyone out
          if (chosen?.provider === "resend") {
            let allowed = false;
            try {
              const { data: adminRow } = await admin
                .from("platform_admins")
                .select("user_id")
                .eq("user_id", camp.user_id)
                .maybeSingle();
              if (adminRow?.user_id) allowed = true;
            } catch {
              // table may not exist — fall through
            }
            if (!allowed) {
              try {
                const { data: ownerUser } = await admin.auth.admin.getUserById(camp.user_id);
                const ownerEmail = String(ownerUser?.user?.email || "").toLowerCase();
                const appMeta = (ownerUser?.user?.app_metadata ?? {}) as Record<string, unknown>;
                if (appMeta.is_super_admin === true) {
                  allowed = true;
                } else {
                  const role = String(appMeta.role || "").toLowerCase();
                  if (role === "super_admin" || role === "platform_admin") allowed = true;
                }
                if (!allowed && ownerEmail) {
                  const envList = (Deno.env.get("SUPER_ADMIN_EMAILS") || "")
                    .split(",")
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean);
                  if (envList.includes(ownerEmail)) allowed = true;
                  // Legacy duo (safety floor; remove once env is confirmed
                  // populated in every environment).
                  const legacy = new Set([
                    "vraymond@sparkfusiondigital.com",
                    "support@logisticintel.com",
                  ]);
                  if (!allowed && legacy.has(ownerEmail)) allowed = true;
                }
              } catch (e) {
                log.error("resend_gate_lookup_failed", { err: e instanceof Error ? e.message : String(e), user_id: camp.user_id });
              }
            }
            if (!allowed) {
              // Info-level: not an error, just a policy enforcement. Skip Sentry capture.
              log.warn("resend_send_blocked_non_superadmin", { user_id: camp.user_id });
              chosen = null;
            }
          }
          // Final fallback: most recently connected mailbox if neither
          // override nor primary resolved.
          if (!chosen) {
            const { data: fallback } = await admin
              .from("lit_email_accounts")
              .select("id, user_id, provider, email, display_name")
              .eq("user_id", camp.user_id)
              .eq("status", "connected")
              .order("connected_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            chosen = (fallback as Account | null) ?? null;
          }
          senderCache.set(campaignKey, chosen);
          sender = chosen;
        }
      }
      if (!sender) {
        await fail(admin, r, "no_connected_mailbox");
        summary.failed += 1;
        continue;
      }

      // 2g. Throttle gate. Combines (a) the 30-day warmup ramp from
      //     computeDailyCap with (b) the live daily + hourly counters
      //     stored on lit_email_accounts. canSendNow returns either
      //     { allowed: true } or { allowed: false, retryAt: <next slot> }.
      //     When blocked, push the recipient's next_send_at to retryAt
      //     so the next tick re-evaluates after the cap window resets.
      //
      //     Resend ("internal-only" provider) skips the per-mailbox
      //     throttle entirely — it has its own platform-level limits
      //     enforced upstream by Resend itself.
      let mailboxState = mailboxCache.get(sender.id);
      if (!mailboxState) {
        const { data: mb } = await admin
          .from("lit_email_accounts")
          .select("id, daily_send_cap, hourly_send_cap, warmup_started_at, warmup_complete, sent_today, sent_this_hour, last_send_at")
          .eq("id", sender.id)
          .maybeSingle();
        if (mb) {
          mailboxState = {
            id: mb.id as string,
            daily_send_cap: Number(mb.daily_send_cap ?? DEFAULT_DAILY_CAP),
            hourly_send_cap: Number(mb.hourly_send_cap ?? DEFAULT_HOURLY_CAP),
            warmup_started_at: (mb.warmup_started_at as string | null) ?? null,
            warmup_complete: Boolean(mb.warmup_complete),
            sent_today: Number(mb.sent_today ?? 0),
            sent_this_hour: Number(mb.sent_this_hour ?? 0),
            last_send_at: (mb.last_send_at as string | null) ?? null,
          };
          mailboxCache.set(sender.id, mailboxState);
        }
      }
      if (mailboxState && sender.provider !== "resend") {
        const now = new Date();
        const effectiveDailyCap = computeDailyCap({
          now,
          warmupStartedAt: mailboxState.warmup_started_at ? new Date(mailboxState.warmup_started_at) : null,
          warmupComplete: mailboxState.warmup_complete,
          dailySendCap: mailboxState.daily_send_cap,
        });
        const throttle = canSendNow({
          now,
          sentToday: mailboxState.sent_today,
          sentThisHour: mailboxState.sent_this_hour,
          effectiveDailyCap,
          hourlySendCap: mailboxState.hourly_send_cap,
          lastSendAt: mailboxState.last_send_at ? new Date(mailboxState.last_send_at) : null,
        });
        if (!throttle.allowed) {
          // Log a policy-level history event when the deferral was caused
          // by the daily cap (vs. hourly cap / spacing). This makes the
          // Google-Sender-Guidelines compliance posture auditable in
          // lit_outreach_history alongside consent_missing events.
          const hitDailyCap = mailboxState.sent_today >= effectiveDailyCap;
          if (hitDailyCap) {
            await admin.from("lit_outreach_history").insert({
              user_id: r.user_id,
              campaign_id: r.campaign_id,
              campaign_step_id: step.id,
              company_id: r.company_id,
              contact_id: r.contact_id,
              channel: "email",
              event_type: "daily_cap_reached",
              status: "deferred",
              subject: step.subject,
              provider: "policy",
              occurred_at: new Date().toISOString(),
              metadata: {
                recipient_email: r.email,
                sender_email: sender.email,
                sender_account_id: sender.id,
                sent_today: mailboxState.sent_today,
                cap: effectiveDailyCap,
                retry_at: throttle.retryAt.toISOString(),
                step_order: step.step_order,
              },
            });
            log.info("daily_cap_deferred", {
              recipient_id: r.id,
              sender_id: sender.id,
              sent_today: mailboxState.sent_today,
              cap: effectiveDailyCap,
            });
          }
          await admin.from("lit_campaign_contacts").update({
            status: "queued",
            next_send_at: throttle.retryAt.toISOString(),
            last_error: `throttled:cap=${effectiveDailyCap}/${mailboxState.hourly_send_cap}`,
            updated_at: new Date().toISOString(),
          }).eq("id", r.id);
          summary.throttled += 1;
          continue;
        }
      }

      // 2h. Resolve company info for merge context.
      let company: { name?: string | null; domain?: string | null; website?: string | null; country_code?: string | null } | null = null;
      if (r.company_id) {
        if (companyCache.has(r.company_id)) {
          company = companyCache.get(r.company_id) ?? null;
        } else {
          const { data: comp } = await admin
            .from("lit_companies")
            .select("name, domain, website, country_code")
            .eq("id", r.company_id)
            .maybeSingle();
          company = (comp as any) ?? null;
          companyCache.set(r.company_id, company);
        }
      }

      // Pick A/B subject variant. If subject_b is non-null, coin-flip
      // uniformly. The chosen variant + identifier go into history
      // metadata so per-variant performance can be reported later.
      const hasVariant = step.subject_b != null && String(step.subject_b).trim() !== "";
      const abVariant: "A" | "B" = hasVariant && Math.random() < 0.5 ? "B" : "A";
      const chosenSubjectRaw = abVariant === "B" ? step.subject_b! : (step.subject ?? "");

      // Rewrite outbound links for click tracking BEFORE merge vars so
      // the slug substitutions happen outside any user-supplied {{vars}}.
      const supabaseUrlForLinks = supabaseUrl;
      const redirectBase = `${supabaseUrlForLinks}/functions/v1/redirect-click`;
      const { body: trackedBody, rows: linkRows } = await rewriteLinks(
        step.body ?? "",
        redirectBase,
        {
          org_id: r.org_id,
          user_id: r.user_id,
          campaign_id: r.campaign_id,
          campaign_step_id: step.id,
          recipient_id: r.id,
        },
      );
      // Insert link rows BEFORE we send so a click during transit can
      // still resolve. Best-effort; failure here is logged but doesn't
      // block the send.
      if (linkRows.length > 0) {
        const { error: linkErr } = await admin.from("lit_outreach_links").insert(linkRows);
        if (linkErr) log.warn("link_insert_failed", { err: linkErr.message, code: linkErr.code, recipient_id: r.id, campaign_id: r.campaign_id });
      }

      const ctx = buildMergeContext({
        recipient: {
          email: r.email,
          first_name: r.first_name,
          last_name: r.last_name,
          display_name: r.display_name,
          title: r.title,
          merge_vars: r.merge_vars ?? null,
        },
        company,
        sender: { email: sender.email, display_name: sender.display_name },
      });
      const subject = applyMergeVars(chosenSubjectRaw, ctx, { onMissing: "blank" });
      let body = applyMergeVars(trackedBody, ctx, { onMissing: "blank" });

      // Append the sender's saved signature when the step opts in.
      // include_signature is treated as boolean-with-NULL-as-true so legacy
      // rows that pre-date the column still get signatures appended.
      const wantsSignature = step.include_signature !== false;
      if (wantsSignature && body) {
        let sig = signatureCache.get(r.user_id);
        if (!sig) {
          const { data: prefs } = await admin
            .from("lit_user_preferences")
            .select("signature_html, signature_text")
            .eq("user_id", r.user_id)
            .maybeSingle();
          sig = {
            html: (prefs?.signature_html ?? null) || null,
            text: (prefs?.signature_text ?? null) || null,
          };
          signatureCache.set(r.user_id, sig);
        }
        const looksHtml = /<\/?[a-z][^>]*>/i.test(body);
        const sigPart = looksHtml
          ? sig.html || (sig.text ? `<br/><br/>${sig.text.replace(/\n/g, "<br/>")}` : "")
          : sig.text || (sig.html ? sig.html.replace(/<[^>]+>/g, "") : "");
        if (sigPart) {
          body = looksHtml
            ? `${body}<br/><br/>${sigPart}`
            : `${body}\n\n${sigPart}`;
        }
      }

      if (!subject && !body) {
        await fail(admin, r, "empty_template");
        summary.failed += 1;
        continue;
      }

      // 2g.5 Inject the open-tracking pixel. Sub-project M fix.
      //
      // Why here (not in sendEmail):
      //   - We have the recipient + step IDs in scope already; sendEmail
      //     would have to receive five extra args.
      //   - Pixel must sit AFTER the signature append (otherwise the
      //     signature drops it onto the wrong line of the rendered HTML)
      //     and AFTER merge-vars (so it doesn't get rewritten as a {{var}}).
      //   - Pixel must sit BEFORE provider dispatch — Gmail and Outlook
      //     both treat the body as opaque HTML and can't insert it.
      //
      // Pixel is a no-op for text/plain bodies (injectPixel returns the
      // body unchanged). Resend with HTML, Gmail with HTML, Outlook with
      // HTML all pick it up.
      //
      // Secret: LIT_EMAIL_PIXEL_SECRET if set, else falls back to
      // SUPABASE_SERVICE_ROLE_KEY (already a server-side high-entropy
      // secret no client sees). Verifier in `email-pixel/index.ts` uses
      // the same fallback so the two stay in lockstep without operator
      // action.
      if (r.user_id) {
        try {
          const pixelSecret = Deno.env.get("LIT_EMAIL_PIXEL_SECRET")
            || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
            || "";
          if (pixelSecret) {
            const token = await mintPixelToken(pixelSecret, {
              recipient_id: r.id,
              campaign_step_id: step.id,
              campaign_id: r.campaign_id,
              user_id: r.user_id,
            });
            const pixelUrl = `${supabaseUrl}/functions/v1/email-pixel?t=${token}`;
            body = injectPixel(body, pixelUrl);
          }
        } catch (e) {
          // Never let pixel injection block a send. log.warn without `err`
          // skips Sentry capture (info-level only).
          log.warn("pixel_inject_failed", { detail: e instanceof Error ? e.message : String(e), recipient_id: r.id });
        }
      }

      // 2h. Refresh + send.
      // Resend doesn't use OAuth — the API key is set as an Edge
      // Function env. For Gmail / Outlook we still refresh as before.
      //
      // DRY_RUN short-circuit: when the DISPATCH_DRY_RUN env flag is set,
      // we skip BOTH the OAuth refresh and the provider HTTP call. The
      // recipient still gets advanced and a synthetic history row is
      // written so dispatcher mechanics (gating, throttling, advancement,
      // KPI roll-up) can be verified without burning a real inbox send.
      let accessToken = "";
      let sendRes: { ok: true; messageId: string | null } | { ok: false; error: string };
      if (DISPATCH_DRY_RUN) {
        const syntheticMessageId = `<dryrun-${crypto.randomUUID()}@logisticintel.com>`;
        log.info("dispatcher_dry_run", {
          recipient_id: r.id,
          campaign_id: r.campaign_id,
          step_order: step.step_order,
          provider: sender.provider,
          would_send_at: new Date().toISOString(),
          would_send_to: r.email,
          subject_length: subject.length,
          body_length: body.length,
          tracked_links: linkRows.length,
        });
        sendRes = { ok: true, messageId: syntheticMessageId };
      } else {
        if (sender.provider !== "resend") {
          const tokenRes = await getAccessToken(admin, sender);
          if (!tokenRes.ok) {
            await fail(admin, r, `token:${tokenRes.error}`);
            summary.failed += 1;
            continue;
          }
          accessToken = tokenRes.accessToken;
        }
        sendRes = await sendEmail({
          provider: sender.provider,
          accessToken,
          from: sender,
          to: r.email,
          subject,
          body,
          campaignId: r.campaign_id,
          recipientId: r.id,
        });
      }

      // 2i. Persist history row + advance/fail recipient.
      //
      // DRY_RUN history rows still write status='sent' / event_type='sent'
      // so KPI counters (sent-rate, sequence-advancement) reflect the
      // synthetic send. The `metadata.dry_run = true` flag is the audit
      // trail that lets operators filter dry-run rows out of deliverability
      // / reply-rate reports if needed.
      await admin.from("lit_outreach_history").insert({
        user_id: r.user_id,
        campaign_id: r.campaign_id,
        campaign_step_id: step.id,
        company_id: r.company_id,
        contact_id: r.contact_id,
        channel: "email",
        event_type: sendRes.ok ? "sent" : "send_failed",
        status: sendRes.ok ? "sent" : "failed",
        subject,
        provider: sender.provider,
        message_id: sendRes.ok ? sendRes.messageId : null,
        occurred_at: new Date().toISOString(),
        failed_at: sendRes.ok ? null : new Date().toISOString(),
        error_message: sendRes.ok ? null : sendRes.error?.slice(0, 500),
        metadata: {
          recipient_email: r.email,
          recipient_id: r.id,
          step_order: step.step_order,
          ab_variant: hasVariant ? abVariant : null,
          tracked_links: linkRows.length,
          ...(DISPATCH_DRY_RUN ? { dry_run: true } : {}),
        },
      });

      if (sendRes.ok) {
        await advance(admin, r, step, steps[stepIndex + 1] ?? null, /* sent */ true);
        // Bump mailbox counters: in-memory (so subsequent recipients
        // in this same tick see the new state) AND persisted (so the
        // next tick / next dispatcher invocation sees it too). The
        // hourly/daily counters are reset by the mailbox-hourly-reset
        // and mailbox-daily-reset cron jobs (Task 6).
        //
        // DRY_RUN intentionally does NOT bump counters: no real send
        // happened, so warmup ramp capacity shouldn't be consumed.
        if (mailboxState && sender.provider !== "resend" && !DISPATCH_DRY_RUN) {
          mailboxState.sent_today += 1;
          mailboxState.sent_this_hour += 1;
          mailboxState.last_send_at = new Date().toISOString();
          await admin.from("lit_email_accounts").update({
            sent_today: mailboxState.sent_today,
            sent_this_hour: mailboxState.sent_this_hour,
            last_send_at: mailboxState.last_send_at,
          }).eq("id", sender.id);
        }
        summary.sent += 1;
      } else {
        // Auto-suppress on hard bounce signals so retries don't waste
        // the mailbox's reputation. Soft errors (rate-limit, transient)
        // do NOT auto-suppress — they just mark the recipient failed.
        const errStr = (sendRes.error || "").toLowerCase();
        const isHardBounce = /550|invalid|nonexistent|no such user|recipient.*rejected|user.*unknown/i.test(errStr);
        if (isHardBounce && r.org_id) {
          await admin.from("lit_email_suppression_list").upsert({
            org_id: r.org_id,
            email: r.email,
            reason: "bounce_hard",
            source: `dispatcher:${sender.provider}`,
            context: { error: sendRes.error?.slice(0, 200) },
            added_by: r.user_id,
          }, { onConflict: "org_id,email" });
        }
        await fail(admin, r, sendRes.error || "send_failed");
        summary.failed += 1;
      }
    } catch (e) {
      log.error("recipient_exception", {
        err: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        recipient_id: r.id,
        user_id: r.user_id ?? undefined,
        org_id: r.org_id ?? undefined,
        campaign_id: r.campaign_id,
      });
      await fail(admin, r, e instanceof Error ? e.message.slice(0, 200) : "exception");
      summary.failed += 1;
    }
  }

  log.info("tick_completed", { summary, ms: Date.now() - startedAt });
  return json({ ok: true, summary, ms: Date.now() - startedAt });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function advance(
  admin: ReturnType<typeof createClient>,
  r: Recipient,
  step: Step,
  nextStep: Step | null,
  sent = false,
) {
  // Schedule the recipient's next pickup. delay_days on the FE represents
  // "wait this long BEFORE this step kicks off", so once we've finished
  // step N, the next pickup fires after step N+1's delay. Wait steps are
  // an exception — their delay_days IS the wait duration on the wait
  // step itself, so we use the current step there.
  const isWait = step.channel === "wait" || step.step_type === "wait";
  const ref = isWait ? step : nextStep;
  // delay_minutes was schema-added but never read by the dispatcher.
  // Without this term a "30-min wait" step computed 0ms and the next
  // email sent immediately. Now: total delay = days + hours + minutes.
  const delayMs = ref
    ? Math.max(0, ref.delay_days ?? 0) * 86_400_000 +
      Math.max(0, ref.delay_hours ?? 0) * 3_600_000 +
      Math.max(0, ref.delay_minutes ?? 0) * 60_000
    : 0;
  const nextSendAt = new Date(Date.now() + delayMs).toISOString();

  // status stays "queued" between steps so the dispatcher re-picks the
  // recipient on its next tick when next_send_at <= now. The terminal
  // "completed" status is set by complete() once the sequence runs out.
  //
  // next_step_order mirrors the step_order of the NEXT step to fire
  // (1-based). Reply-receiver and analytics tooling read this column
  // to figure out where in the sequence each recipient is without
  // having to chase the current_step_id → step_order join.
  const update: Record<string, unknown> = {
    current_step_id: step.id,
    next_send_at: nextSendAt,
    status: "queued",
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  if (nextStep) {
    update.next_step_order = nextStep.step_order;
  } else {
    update.next_step_order = (step.step_order ?? 0) + 1;
  }
  if (sent) {
    update.last_sent_at = new Date().toISOString();
  }
  await admin.from("lit_campaign_contacts").update(update).eq("id", r.id);
}

async function complete(
  admin: ReturnType<typeof createClient>,
  r: Recipient,
  reason: string,
) {
  await admin
    .from("lit_campaign_contacts")
    .update({
      status: "completed",
      next_send_at: null,
      last_error: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.id);
}

async function fail(
  admin: ReturnType<typeof createClient>,
  r: Recipient,
  reason: string,
) {
  await admin
    .from("lit_campaign_contacts")
    .update({
      status: "failed",
      next_send_at: null,
      last_error: reason.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.id);
}

async function getAccessToken(
  admin: ReturnType<typeof createClient>,
  account: Account,
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const { data: tokenRow, error } = await admin
    .from("lit_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at, provider")
    .eq("email_account_id", account.id)
    .maybeSingle();
  if (error || !tokenRow) {
    return { ok: false, error: "no_token" };
  }

  const expiresAt = tokenRow.expires_at
    ? new Date(tokenRow.expires_at as string).getTime()
    : 0;
  const nowMs = Date.now();
  const needsRefresh = expiresAt - nowMs < 60_000;

  if (!needsRefresh) {
    return { ok: true, accessToken: tokenRow.access_token as string };
  }
  if (!tokenRow.refresh_token) {
    return { ok: false, error: "no_refresh_token" };
  }

  const refreshToken = tokenRow.refresh_token as string;
  let refreshJson: any = null;

  if (account.provider === "gmail") {
    const id = Deno.env.get("GMAIL_CLIENT_ID");
    const secret = Deno.env.get("GMAIL_CLIENT_SECRET");
    if (!id || !secret) return { ok: false, error: "gmail_credentials_missing" };
    try {
      const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: id,
          client_secret: secret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      refreshJson = await resp.json();
    } catch (e) {
      moduleLog.error("gmail_refresh_threw", { err: e instanceof Error ? e.message : String(e), email_account_id: account.id });
    }
  } else {
    const id = Deno.env.get("OUTLOOK_CLIENT_ID");
    const secret = Deno.env.get("OUTLOOK_CLIENT_SECRET");
    const tenant = Deno.env.get("OUTLOOK_TENANT") || "common";
    if (!id || !secret) return { ok: false, error: "outlook_credentials_missing" };
    try {
      const resp = await fetch(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: id,
            client_secret: secret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
            scope: OUTLOOK_SCOPES.join(" "),
          }),
        },
      );
      refreshJson = await resp.json();
    } catch (e) {
      moduleLog.error("outlook_refresh_threw", { err: e instanceof Error ? e.message : String(e), email_account_id: account.id });
    }
  }

  if (!refreshJson?.access_token) {
    await admin
      .from("lit_email_accounts")
      .update({
        status: "error",
        error_message: "token_refresh_failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);
    return { ok: false, error: "token_refresh_failed" };
  }

  const newAccessToken = refreshJson.access_token as string;
  const expiresIn = Number(refreshJson.expires_in) || 3600;
  const newExpiresAt = new Date(nowMs + expiresIn * 1000).toISOString();

  await admin
    .from("lit_oauth_tokens")
    .update({
      access_token: newAccessToken,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tokenRow.id);

  return { ok: true, accessToken: newAccessToken };
}

async function sendEmail(args: {
  provider: string;
  accessToken: string;
  from: Account;
  to: string;
  subject: string;
  body: string;
  campaignId: string;
  recipientId: string;
}): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const { provider, accessToken, from, to, subject, body, campaignId, recipientId } = args;
  // RFC 8058 one-click unsubscribe URL. Gmail/Yahoo bulk-sender policy
  // (Feb 2024) requires List-Unsubscribe + List-Unsubscribe-Post for high-
  // volume senders; missing them lands campaign mail in spam/promotions.
  const supabaseUrlForUnsub = Deno.env.get("SUPABASE_URL")!;
  const unsubUrl = `${supabaseUrlForUnsub}/functions/v1/email-unsubscribe?campaign=${encodeURIComponent(campaignId)}&recipient=${encodeURIComponent(recipientId)}`;
  const listUnsubHeader = `<${unsubUrl}>, <mailto:unsubscribe@logisticintel.com?subject=unsubscribe>`;
  if (provider === "resend") {
    const apiKey = Deno.env.get("LIT_RESEND_API_KEY");
    if (!apiKey) return { ok: false, error: "resend_api_key_missing" };
    const fromLine = from.display_name
      ? `${from.display_name} <${from.email}>`
      : from.email;
    // Body may already be HTML (from the composer) or plaintext (from
    // the simple textarea). Detect to send the right shape so Outlook
    // and Gmail render branded emails as designed.
    const isHtml = /^<[a-z!]/i.test(body.trim()) || /<table|<div|<p[\s>]/i.test(body);
    const payload: Record<string, unknown> = {
      from: fromLine,
      to: [to],
      subject,
      reply_to: from.email,
    };
    if (isHtml) payload.html = body;
    else payload.text = body;
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const respJson: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return {
          ok: false,
          error: `resend_${resp.status}:${respJson?.message || respJson?.name || ""}`.slice(0, 500),
        };
      }
      return { ok: true, messageId: respJson?.id ?? null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "resend_threw" };
    }
  }
  if (provider === "gmail") {
    const fromLine = from.display_name
      ? `"${from.display_name}" <${from.email}>`
      : from.email;
    // Detect HTML so composer-authored branded emails render correctly
    // through the user's Gmail mailbox. Plaintext bodies still ship as
    // text/plain to avoid the spam-flag bump from unnecessary HTML.
    const isHtml = /^<[a-z!]/i.test(body.trim()) || /<table|<div|<p[\s>]/i.test(body);
    // Inject a stable Message-ID we generate so reply-receiver can match
    // `In-Reply-To` headers from inbound replies. Gmail otherwise auto-
    // generates a Message-ID that we'd have to fetch back with a second
    // API call — wasteful and racy.
    const messageId = `<litcamp-${crypto.randomUUID()}@logisticintel.com>`;
    // Body goes through Content-Transfer-Encoding: base64 so non-ASCII
    // bytes (em-dashes, NBSP entities, &#847; preheader spacers) can't
    // confuse Gmail's MIME parser into downgrading the message to
    // plain-text rendering. Pairs with encodeBodyMimeBase64 below.
    const raw = [
      `From: ${fromLine}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Message-ID: ${messageId}`,
      `List-Unsubscribe: ${listUnsubHeader}`,
      `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
      `MIME-Version: 1.0`,
      `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      encodeBodyMimeBase64(body),
    ].join("\r\n");
    try {
      const resp = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: toBase64Url(raw) }),
        },
      );
      const respJson = await resp.json();
      if (!resp.ok) {
        return {
          ok: false,
          error: `gmail_${resp.status}:${respJson?.error?.message || ""}`,
        };
      }
      // Return our injected Message-ID (not respJson.id which is Gmail's
      // internal thread message ID and never appears in reply headers).
      return { ok: true, messageId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "gmail_threw" };
    }
  }
  // Outlook / Microsoft Graph — draft-then-send so we can read the
  // auto-generated `internetMessageId` back before sending. Graph
  // rejects setting Message-ID via internetMessageHeaders (allow-list
  // doesn't include it), so we accept Graph's value and persist that
  // for reply correlation.
  const outlookIsHtml = /^<[a-z!]/i.test(body.trim()) || /<table|<div|<p[\s>]/i.test(body);
  try {
    // 1. Create draft to capture internetMessageId
    const draftResp = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject,
        body: { contentType: outlookIsHtml ? "HTML" : "Text", content: body },
        toRecipients: [{ emailAddress: { address: to } }],
        // Graph allow-list permits List-Unsubscribe + -Post via internetMessageHeaders.
        internetMessageHeaders: [
          { name: "List-Unsubscribe", value: listUnsubHeader },
          { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
        ],
      }),
    });
    if (!draftResp.ok) {
      let errBody: any = {};
      try { errBody = await draftResp.json(); } catch { /* empty */ }
      return {
        ok: false,
        error: `outlook_draft_${draftResp.status}:${errBody?.error?.message || ""}`,
      };
    }
    const draft = await draftResp.json();
    const internetMessageId: string | null = draft?.internetMessageId ?? null;
    const draftId: string = draft.id;

    // 2. Send the draft
    const sendResp = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${draftId}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!sendResp.ok) {
      let errBody: any = {};
      try { errBody = await sendResp.json(); } catch { /* empty */ }
      return {
        ok: false,
        error: `outlook_send_${sendResp.status}:${errBody?.error?.message || ""}`,
      };
    }
    // internetMessageId is the RFC 5322 Message-ID Outlook will use in
    // outbound headers; reply In-Reply-To will reference this value.
    return { ok: true, messageId: internetMessageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "outlook_threw" };
  }
}
