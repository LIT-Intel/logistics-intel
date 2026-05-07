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

const BATCH_SIZE = 25;
const DEFAULT_DAILY_CAP = 50;

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const startedAt = Date.now();
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
    console.error("[send-campaign-email] pick failed", pickErr);
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
  // Cache keyed by sender email_account_id for the daily-cap gate.
  const capCache = new Map<string, { sentToday: number; dailyCap: number }>();
  // Cache keyed by user_id — saved sender signature pulled from
  // lit_user_preferences. Loaded lazily the first time we encounter a
  // step with include_signature !== false.
  const signatureCache = new Map<string, { html: string | null; text: string | null }>();

  // ─── 2. Process each recipient ───────────────────────────────────────────
  for (const r of recipients) {
    try {
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

      // 2e. Email step. Suppression gate first — catches anyone the
      //     org has marked unsubscribe / bounce / complaint without
      //     paying for an OAuth token refresh + send roundtrip.
      const { data: supRows } = await admin
        .from("lit_email_suppression_list")
        .select("reason, org_id")
        .eq("email", r.email)
        .limit(5);
      const matchedSup = (supRows ?? []).find(
        (s: any) => s.org_id === null || s.org_id === r.org_id,
      );
      if (matchedSup) {
        await admin.from("lit_outreach_history").insert({
          user_id: r.user_id, campaign_id: r.campaign_id, campaign_step_id: step.id,
          company_id: r.company_id, contact_id: r.contact_id,
          channel: "email", event_type: "suppressed", status: "skipped",
          subject: step.subject, provider: null,
          occurred_at: new Date().toISOString(),
          metadata: { recipient_email: r.email, reason: matchedSup.reason },
        });
        await admin.from("lit_campaign_contacts").update({
          status: "skipped", next_send_at: null,
          last_error: `suppressed:${matchedSup.reason}`,
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
                console.error("[send-campaign-email] resend gate lookup failed", e);
              }
            }
            if (!allowed) {
              console.warn("[send-campaign-email] resend send blocked for non-superadmin", camp.user_id);
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

      // 2g. Daily cap gate. If this mailbox has hit the configured (or
      //     default) per-day quota, re-queue this recipient for next
      //     UTC midnight and continue to the next batch entry.
      let cap = capCache.get(sender.id);
      if (!cap) {
        const { data: countRow } = await admin.rpc("lit_inbox_sent_count_today", {
          p_account: sender.id,
        });
        const { data: capRow } = await admin
          .from("lit_inbox_sender_caps")
          .select("daily_cap")
          .eq("email_account_id", sender.id)
          .maybeSingle();
        cap = {
          sentToday: Number(countRow ?? 0),
          dailyCap: capRow?.daily_cap != null ? Number(capRow.daily_cap) : DEFAULT_DAILY_CAP,
        };
        capCache.set(sender.id, cap);
      }
      if (cap.sentToday >= cap.dailyCap) {
        const tomorrow = new Date();
        tomorrow.setUTCHours(24, 0, 0, 0);
        await admin.from("lit_campaign_contacts").update({
          status: "queued",
          next_send_at: tomorrow.toISOString(),
          last_error: `throttled:${cap.dailyCap}`,
          updated_at: new Date().toISOString(),
        }).eq("id", r.id);
        summary.throttled += 1;
        continue;
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
        if (linkErr) console.warn("[send-campaign-email] link insert warned", linkErr.code, linkErr.message);
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

      // 2h. Refresh + send.
      // Resend doesn't use OAuth — the API key is set as an Edge
      // Function env. For Gmail / Outlook we still refresh as before.
      let accessToken = "";
      if (sender.provider !== "resend") {
        const tokenRes = await getAccessToken(admin, sender);
        if (!tokenRes.ok) {
          await fail(admin, r, `token:${tokenRes.error}`);
          summary.failed += 1;
          continue;
        }
        accessToken = tokenRes.accessToken;
      }
      const sendRes = await sendEmail({
        provider: sender.provider,
        accessToken,
        from: sender,
        to: r.email,
        subject,
        body,
      });

      // 2i. Persist history row + advance/fail recipient.
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
        },
      });

      if (sendRes.ok) {
        await advance(admin, r, step, steps[stepIndex + 1] ?? null, /* sent */ true);
        cap.sentToday += 1;
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
      console.error("[send-campaign-email] recipient threw", r.id, e);
      await fail(admin, r, e instanceof Error ? e.message.slice(0, 200) : "exception");
      summary.failed += 1;
    }
  }

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
  const update: Record<string, unknown> = {
    current_step_id: step.id,
    next_send_at: nextSendAt,
    status: "queued",
    last_error: null,
    updated_at: new Date().toISOString(),
  };
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
      console.error("[send-campaign-email] gmail refresh threw", e);
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
      console.error("[send-campaign-email] outlook refresh threw", e);
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
}): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const { provider, accessToken, from, to, subject, body } = args;
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
    const raw = [
      `From: ${fromLine}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=UTF-8`,
      ``,
      body,
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
      return { ok: true, messageId: respJson.id ?? null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "gmail_threw" };
    }
  }
  // Outlook / Microsoft Graph
  const outlookIsHtml = /^<[a-z!]/i.test(body.trim()) || /<table|<div|<p[\s>]/i.test(body);
  try {
    const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: outlookIsHtml ? "HTML" : "Text", content: body },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
    });
    if (!resp.ok) {
      let errBody: any = {};
      try { errBody = await resp.json(); } catch { /* empty */ }
      return {
        ok: false,
        error: `outlook_${resp.status}:${errBody?.error?.message || ""}`,
      };
    }
    return { ok: true, messageId: resp.headers.get("client-request-id") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "outlook_threw" };
  }
}
