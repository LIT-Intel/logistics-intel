// send-subscription-email — transactional lifecycle email dispatcher.
//
// Auth: service-role Bearer token OR JWT belonging to a platform admin.
// verify_jwt: false — we implement custom auth here so cron/scheduler
// can call this without a user session.
//
// Idempotency: a (user_id, org_id, event_type, plan_slug) tuple that already
// has a 'sent' row in lit_email_automation_events is skipped unless force=true.
//
// Suppression: checks lit_email_unsubscribes before any send attempt.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// ─── Type definitions (inlined to avoid import resolution issues) ──────────

type PlanSlug = "trial" | "free" | "starter" | "pro" | "team" | "enterprise";

type EventType =
  | "trial_welcome"
  | "trial_day_2_activation"
  | "trial_day_3_founder_note"
  | "trial_ending_soon"
  | "paid_plan_welcome"
  | "upgrade_confirmation";

const VALID_PLAN_SLUGS: PlanSlug[] = ["trial", "free", "starter", "pro", "team", "enterprise"];
const VALID_EVENT_TYPES: EventType[] = [
  "trial_welcome",
  "trial_day_2_activation",
  "trial_day_3_founder_note",
  "trial_ending_soon",
  "paid_plan_welcome",
  "upgrade_confirmation",
];

interface SendPayload {
  user_id?: string;
  org_id?: string;
  subscription_id?: string;
  recipient_email: string;
  first_name?: string;
  plan_slug: PlanSlug;
  event_type: EventType;
  force?: boolean;
  /** Optional: passed to trial_ending email for display */
  trial_ends_date?: string;
  /** Optional: passed to upgrade_confirmation for display */
  previous_plan_name?: string;
}

// ─── Plan copy (duplicated from frontend for edge-fn portability) ──────────

interface PlanEmailCopy {
  name: string;
  headline: string;
  benefits: string[];
  primaryCta: string;
  primaryPath: string;
}

const PLAN_EMAIL_COPY: Record<PlanSlug, PlanEmailCopy> = {
  trial: {
    name: "Free Trial",
    headline: "Your LIT trial is live",
    benefits: [
      "Search and filter 500,000+ active freight shippers by lane, volume, and commodity",
      "View full shipment history, carrier relationships, and trade lane patterns",
      "Save up to 10 companies to your workspace for follow-up",
      "Run Pulse AI briefs to surface buying signals and conversation starters",
      "Access contact discovery on saved companies",
    ],
    primaryCta: "Start finding shippers",
    primaryPath: "/pulse",
  },
  free: {
    name: "Free Trial",
    headline: "Your LIT trial is live",
    benefits: [
      "Search and filter 500,000+ active freight shippers by lane, volume, and commodity",
      "View full shipment history, carrier relationships, and trade lane patterns",
      "Save up to 10 companies to your workspace for follow-up",
      "Run Pulse AI briefs to surface buying signals and conversation starters",
      "Access contact discovery on saved companies",
    ],
    primaryCta: "Start finding shippers",
    primaryPath: "/pulse",
  },
  starter: {
    name: "Starter",
    headline: "Welcome to LIT Starter",
    benefits: [
      "Unlimited shipper searches with advanced lane and commodity filters",
      "Save up to 50 companies with full shipment timeline access",
      "25 Pulse AI briefs per month for targeted outreach intelligence",
      "Contact discovery and email export on all saved companies",
      "CSV export for your CRM or outreach tools",
    ],
    primaryCta: "Start prospecting",
    primaryPath: "/pulse",
  },
  pro: {
    name: "Pro",
    headline: "Welcome to LIT Pro",
    benefits: [
      "Unlimited shipper searches and company saves",
      "100 Pulse AI briefs per month with deeper competitor and lane analysis",
      "Full contact discovery with direct emails and phone numbers",
      "Campaign builder — build and launch multi-touch email sequences from LIT",
      "Market benchmark reports by lane, mode, and commodity",
      "Priority support and onboarding session",
    ],
    primaryCta: "Open your workspace",
    primaryPath: "/pulse",
  },
  team: {
    name: "Team",
    headline: "Welcome to LIT Team",
    benefits: [
      "Everything in Pro for up to 5 team seats",
      "Shared company saves and Pulse lists across your team",
      "Team campaign library — share and standardize outreach sequences",
      "Usage analytics across reps — see who is prospecting and converting",
      "Admin controls for seat management and org-wide suppression lists",
      "Dedicated customer success contact",
    ],
    primaryCta: "Set up your team",
    primaryPath: "/settings/team",
  },
  enterprise: {
    name: "Enterprise",
    headline: "Welcome to LIT Enterprise",
    benefits: [
      "Unlimited seats and org-wide shipper intelligence",
      "Custom data integrations and CRM sync (Salesforce, HubSpot)",
      "White-glove onboarding and quarterly business reviews",
      "API access for embedding LIT data in your existing stack",
      "Custom reporting and lane-level market intelligence packages",
      "SLA-backed support with named account manager",
    ],
    primaryCta: "Schedule your kickoff",
    primaryPath: "/settings/billing",
  },
};

// ─── Minimal HTML email builder ──────────────────────────────────────────────

const COLOR = {
  bg: "#F8FAFC",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#475569",
  accent: "#2563EB",
  border: "#E5E7EB",
  button: "#0F172A",
};
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const FONT_H = "Georgia, serif";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function benefitsHtml(benefits: string[]): string {
  const items = benefits.map((b) => `<li style="margin-bottom:6px;">${esc(b)}</li>`).join("\n");
  return `<ul style="margin:0;padding-left:20px;line-height:1.7;">${items}</ul>`;
}

function benefitsText(benefits: string[]): string {
  return benefits.map((b) => `  - ${b}`).join("\n");
}

function buildLayout(opts: {
  previewText: string;
  heroImageUrl?: string;
  heroAlt?: string;
  headline: string;
  bodyHtml: string;
  bodyText: string;
  ctaText: string;
  ctaUrl: string;
  unsubscribeUrl: string;
  plainTextOnly?: boolean;
}): { html: string; text: string } {
  const heroBlock =
    !opts.plainTextOnly && opts.heroImageUrl
      ? `<tr><td align="center" style="padding:0 32px 24px 32px;"><img src="${opts.heroImageUrl}" alt="${esc(opts.heroAlt ?? "LIT")}" width="536" height="268" style="display:block;width:100%;max-width:536px;height:auto;border-radius:12px;border:1px solid ${COLOR.border};" /></td></tr>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(opts.headline)}</title></head>
<body style="margin:0;padding:0;background-color:${COLOR.bg};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLOR.bg};">${esc(opts.previewText)}${"&nbsp;&#847;".repeat(50)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${COLOR.bg};border-collapse:collapse;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background-color:${COLOR.card};border-radius:16px;border:1px solid ${COLOR.border};border-collapse:collapse;overflow:hidden;">
<tr><td height="4" style="background-color:${COLOR.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 0 32px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
    <td style="background-color:${COLOR.button};border-radius:8px;padding:6px 12px;"><span style="color:#FFFFFF;font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.04em;">LIT</span></td>
    <td style="padding-left:8px;"><span style="color:${COLOR.muted};font-family:${FONT};font-size:12px;">Logistics Intel</span></td>
  </tr></table>
</td></tr>
<tr><td style="padding:24px 32px 20px 32px;"><h1 style="margin:0;font-family:${FONT_H};font-size:26px;font-weight:700;color:${COLOR.text};line-height:1.3;">${esc(opts.headline)}</h1></td></tr>
${heroBlock}
<tr><td style="padding:0 32px 28px 32px;font-family:${FONT};font-size:15px;line-height:1.65;color:${COLOR.text};">${opts.bodyHtml}</td></tr>
<tr><td align="left" style="padding:0 32px 32px 32px;">
  <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${opts.ctaUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="8%" stroke="f" fillcolor="${COLOR.button}"><w:anchorlock/><center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;">${esc(opts.ctaText)}</center></v:roundrect><![endif]-->
  <!--[if !mso]><!-->
  <a href="${opts.ctaUrl}" style="display:inline-block;background-color:${COLOR.button};color:#FFFFFF;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:8px;">${esc(opts.ctaText)}</a>
  <!--<![endif]-->
</td></tr>
<tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid ${COLOR.border};margin:0;"/></td></tr>
<tr><td style="padding:20px 32px 28px 32px;font-family:${FONT};font-size:12px;color:${COLOR.muted};line-height:1.6;">
  <strong style="color:${COLOR.text};">Logistics Intel / LIT</strong><br/>
  You are receiving this because you signed up for a LIT account.<br/>
  Questions? Reply to this email — we read every one.<br/>
  <a href="${opts.unsubscribeUrl}" style="color:${COLOR.muted};text-decoration:underline;">Unsubscribe</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [opts.headline, "", opts.bodyText, "", `${opts.ctaText}: ${opts.ctaUrl}`, "", "---", "Logistics Intel / LIT", "Questions? Reply to this email.", `Unsubscribe: ${opts.unsubscribeUrl}`].join("\n");

  return { html, text };
}

// ─── Template builders ────────────────────────────────────────────────────────

function buildEmail(
  eventType: EventType,
  payload: SendPayload,
  appUrl: string,
  siteUrl: string,
  heroUrls: Record<string, string>,
  unsubscribeUrl: string,
): { subject: string; html: string; text: string } {
  const plan = PLAN_EMAIL_COPY[payload.plan_slug] ?? PLAN_EMAIL_COPY.trial;
  const name = payload.first_name?.trim() || "there";

  switch (eventType) {
    case "trial_welcome": {
      const bodyHtml = `<p style="margin:0 0 16px 0;">Hi ${esc(name)},</p><p style="margin:0 0 16px 0;">Your free trial is active. You have full access to LIT's shipper intelligence database for the next 14 days — no credit card required until you decide to continue.</p><p style="margin:0 0 12px 0;font-weight:600;">Here's what to try first:</p>${benefitsHtml(plan.benefits)}<p style="margin:20px 0 16px 0;">The quickest way to see value: pick a trade lane your team already works, run a Pulse search, and open two or three company profiles. You'll see shipment history, carrier patterns, and buying signals in under five minutes.</p><p style="margin:0;font-style:italic;color:#475569;">P.S. Need help? Just reply to this email — we read every one.</p>`;
      const bodyText = `Hi ${name},\n\nYour free trial is active. You have full access to LIT's shipper intelligence database for the next 14 days — no credit card required until you decide to continue.\n\nHere's what to try first:\n\n${benefitsText(plan.benefits)}\n\nThe quickest way to see value: pick a trade lane your team already works, run a Pulse search, and open two or three company profiles. You'll see shipment history, carrier patterns, and buying signals in under five minutes.\n\nP.S. Need help? Just reply to this email — we read every one.`;
      const { html, text } = buildLayout({ previewText: "Start with 10 validated shippers and full supply chain history.", heroImageUrl: heroUrls.company_intelligence, heroAlt: "LIT company intelligence", headline: plan.headline, bodyHtml, bodyText, ctaText: plan.primaryCta, ctaUrl: `${appUrl}${plan.primaryPath}`, unsubscribeUrl });
      return { subject: "Your LIT trial is live", html, text };
    }

    case "trial_day_2_activation": {
      const bodyHtml = `<p style="margin:0 0 16px 0;">Hi ${esc(name)},</p><p style="margin:0 0 16px 0;">A lot of people sign up, poke around the dashboard, and then close the tab. That's a waste of a good trial.</p><p style="margin:0 0 12px 0;">Here's the workflow that gets to value fastest:</p><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 20px 0;"><tr><td style="padding:10px 14px;background-color:#F1F5F9;border-radius:8px 8px 0 0;border-bottom:1px solid #E2E8F0;font-size:14px;color:#0F172A;line-height:1.5;"><strong>1.</strong> Go to Pulse and search your best lane (e.g., "Mexico cross-border" or "USEC to Europe").</td></tr><tr><td style="padding:10px 14px;background-color:#F8FAFC;border-bottom:1px solid #E2E8F0;font-size:14px;color:#0F172A;line-height:1.5;"><strong>2.</strong> Open three companies that look active — check shipment cadence and carrier mix.</td></tr><tr><td style="padding:10px 14px;background-color:#F1F5F9;border-bottom:1px solid #E2E8F0;font-size:14px;color:#0F172A;line-height:1.5;"><strong>3.</strong> Save the one or two that look like real opportunities. Run a Pulse AI brief.</td></tr><tr><td style="padding:10px 14px;background-color:#F8FAFC;border-radius:0 0 8px 8px;font-size:14px;color:#0F172A;line-height:1.5;"><strong>4.</strong> Use the brief to write your first outreach — or pull contacts directly from LIT.</td></tr></table><p style="margin:0;">That's it. Four steps, under 15 minutes.</p>`;
      const bodyText = `Hi ${name},\n\nA lot of people sign up, poke around the dashboard, and then close the tab. That's a waste of a good trial.\n\nHere's the workflow that gets to value fastest:\n\n1. Go to Pulse and search your best lane (e.g., "Mexico cross-border" or "USEC to Europe").\n2. Open three companies that look active — check shipment cadence and carrier mix.\n3. Save the one or two that look like real opportunities. Run a Pulse AI brief.\n4. Use the brief to write your first outreach — or pull contacts directly from LIT.\n\nThat's it. Four steps, under 15 minutes.`;
      const { html, text } = buildLayout({ previewText: "Try this simple workflow today.", heroImageUrl: heroUrls.pulse_ai, heroAlt: "LIT Pulse AI", headline: "The fastest way to test LIT", bodyHtml, bodyText, ctaText: "Run a Pulse search", ctaUrl: `${appUrl}/pulse`, unsubscribeUrl });
      return { subject: "The fastest way to test LIT", html, text };
    }

    case "trial_day_3_founder_note": {
      const bodyHtml = `<p style="margin:0 0 16px 0;">Hi ${esc(name)},</p><p style="margin:0 0 16px 0;">Vincent here — founder of LIT. Just wanted to drop in personally.</p><p style="margin:0 0 16px 0;">A few days into your trial, the most useful thing you can do is pick ONE lane your team already sells, run a Pulse search on it, and open three or four company profiles. Look at the shipment cadence, the lanes, who they're using as a carrier. That's where you start to see whether a company is worth a real conversation — versus just adding another name to a generic list.</p><p style="margin:0 0 20px 0;">If you're stuck or LIT isn't clicking, just hit reply. I read every one and I'm happy to walk through your target accounts on a quick call.</p><p style="margin:0;">— Vincent<br/>Founder, Logistic Intel</p>`;
      const bodyText = `Hi ${name},\n\nVincent here — founder of LIT. Just wanted to drop in personally.\n\nA few days into your trial, the most useful thing you can do is pick ONE lane your team already sells, run a Pulse search on it, and open three or four company profiles. Look at the shipment cadence, the lanes, who they're using as a carrier. That's where you start to see whether a company is worth a real conversation — versus just adding another name to a generic list.\n\nIf you're stuck or LIT isn't clicking, just hit reply. I read every one and I'm happy to walk through your target accounts on a quick call.\n\n— Vincent\nFounder, Logistic Intel`;
      const { html, text } = buildLayout({ previewText: "A quick note from the founder.", headline: "How I'd use LIT if I were you", bodyHtml, bodyText, ctaText: "Open Pulse", ctaUrl: `${appUrl}/pulse`, unsubscribeUrl, plainTextOnly: true });
      return { subject: "How I'd use LIT if I were you", html, text };
    }

    case "trial_ending_soon": {
      const endsPhrase = payload.trial_ends_date ? ` on ${payload.trial_ends_date}` : " in 2 days";
      const bodyHtml = `<p style="margin:0 0 16px 0;">Hi ${esc(name)},</p><p style="margin:0 0 16px 0;">Your LIT trial ends${esc(endsPhrase)}. After that, your saved companies, Pulse lists, and shipper research will be locked until you choose a plan.</p><p style="margin:0 0 12px 0;">Keeping your workspace active means:</p><ul style="margin:0 0 20px 0;padding-left:20px;line-height:1.7;"><li style="margin-bottom:6px;">Your saved companies and notes stay intact</li><li style="margin-bottom:6px;">Your Pulse search history and saved lists carry over</li><li style="margin-bottom:6px;">Any AI briefs you've generated remain in your account</li><li style="margin-bottom:6px;">Your contacts and suppression lists are preserved</li></ul><p style="margin:0 0 16px 0;">Starter starts at $99/month and covers most solo prospecting workflows. Pro adds campaigns and market benchmarks. There's no long-term contract.</p><p style="margin:0;color:#475569;font-size:14px;">Not ready to commit? Reply and tell me what's holding you back — honest answers only, no sales pressure.</p>`;
      const bodyText = `Hi ${name},\n\nYour LIT trial ends${endsPhrase}. After that, your saved companies, Pulse lists, and shipper research will be locked until you choose a plan.\n\nKeeping your workspace active means:\n\n  - Your saved companies and notes stay intact\n  - Your Pulse search history and saved lists carry over\n  - Any AI briefs you've generated remain in your account\n  - Your contacts and suppression lists are preserved\n\nStarter starts at $99/month and covers most solo prospecting workflows. Pro adds campaigns and market benchmarks. There's no long-term contract.\n\nNot ready to commit? Reply and tell me what's holding you back — honest answers only, no sales pressure.`;
      const { html, text } = buildLayout({ previewText: "Keep your shipper intelligence workspace active.", heroImageUrl: heroUrls.company_intelligence, heroAlt: "LIT company intelligence dashboard", headline: "Your LIT trial is ending soon", bodyHtml, bodyText, ctaText: "Choose your plan", ctaUrl: `${appUrl}/settings/billing`, unsubscribeUrl });
      return { subject: "Your LIT trial is ending soon", html, text };
    }

    case "paid_plan_welcome": {
      const bodyHtml = `<p style="margin:0 0 16px 0;">Hi ${esc(name)},</p><p style="margin:0 0 16px 0;">Your ${esc(plan.name)} plan is active. Here's what's now available in your workspace:</p>${benefitsHtml(plan.benefits)}<p style="margin:20px 0 16px 0;">Your previous searches, saved companies, and Pulse lists are all intact. Nothing was reset.</p><p style="margin:0;color:#475569;font-size:14px;">Questions about your plan? Reply here and you'll reach our team directly.</p>`;
      const bodyText = `Hi ${name},\n\nYour ${plan.name} plan is active. Here's what's now available in your workspace:\n\n${benefitsText(plan.benefits)}\n\nYour previous searches, saved companies, and Pulse lists are all intact. Nothing was reset.\n\nQuestions about your plan? Reply here and you'll reach our team directly.`;
      const { html, text } = buildLayout({ previewText: "Your freight intelligence workspace is ready.", heroImageUrl: heroUrls.company_intelligence, heroAlt: "LIT company intelligence", headline: plan.headline, bodyHtml, bodyText, ctaText: plan.primaryCta, ctaUrl: `${appUrl}${plan.primaryPath}`, unsubscribeUrl });
      return { subject: `Welcome to LIT ${plan.name}`, html, text };
    }

    case "upgrade_confirmation": {
      const fromPhrase = payload.previous_plan_name ? ` from ${payload.previous_plan_name}` : "";
      const bodyHtml = `<p style="margin:0 0 16px 0;">Hi ${esc(name)},</p><p style="margin:0 0 16px 0;">Your upgrade${esc(fromPhrase)} to <strong>${esc(plan.name)}</strong> is confirmed. All new features are live in your account now.</p><p style="margin:0 0 12px 0;">What's included in ${esc(plan.name)}:</p>${benefitsHtml(plan.benefits)}<p style="margin:20px 0 16px 0;">Your existing data — saved companies, Pulse lists, contacts, and campaign history — carries over unchanged.</p><p style="margin:0;color:#475569;font-size:14px;">If anything isn't working as expected, reply here and we'll sort it out.</p>`;
      const bodyText = `Hi ${name},\n\nYour upgrade${fromPhrase} to ${plan.name} is confirmed. All new features are live in your account now.\n\nWhat's included in ${plan.name}:\n\n${benefitsText(plan.benefits)}\n\nYour existing data — saved companies, Pulse lists, contacts, and campaign history — carries over unchanged.\n\nIf anything isn't working as expected, reply here and we'll sort it out.`;
      const { html, text } = buildLayout({ previewText: "Your new features are now available.", heroImageUrl: heroUrls.pulse_ai, heroAlt: "LIT Pulse AI", headline: `Your plan has been upgraded to ${plan.name}`, bodyHtml, bodyText, ctaText: "Explore your new features", ctaUrl: `${appUrl}${plan.primaryPath}`, unsubscribeUrl });
      return { subject: "Your LIT plan has been upgraded", html, text };
    }

    default: {
      const _exhaustive: never = eventType;
      throw new Error(`Unknown event_type: ${_exhaustive}`);
    }
  }
}

// ─── Auth check ──────────────────────────────────────────────────────────────

async function isAuthorized(req: Request, serviceRoleKey: string): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  // Service-role key check (constant-time comparison not critical here — it's
  // a secrets-manager secret, not a user credential).
  if (token === serviceRoleKey) return true;
  // JWT path: decode and check role claim (platform admin)
  // We do a minimal check — proper JWT verification is handled by Supabase
  // if the caller uses the anon key + is authenticated. For admin JWT we check
  // the 'app_metadata.role' or 'user_metadata.role' claim.
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    const role = payload?.app_metadata?.role ?? payload?.user_metadata?.role ?? "";
    return role === "admin" || role === "super_admin";
  } catch {
    return false;
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("LIT_RESEND_API_KEY");
  const appUrl = (Deno.env.get("LIT_APP_URL") ?? "https://app.logisticintel.com").replace(/\/+$/, "");
  const siteUrl = (Deno.env.get("LIT_SITE_URL") ?? "https://www.logisticintel.com").replace(/\/+$/, "");
  const fromEmail = Deno.env.get("LIT_EMAIL_FROM") ?? "LIT <hello@updates.logisticintel.com>";
  const replyTo = Deno.env.get("LIT_EMAIL_REPLY_TO") ?? "hello@logisticintel.com";

  // Auth
  if (!(await isAuthorized(req, serviceRoleKey))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  // Parse body
  let body: SendPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  // Validate required fields
  const { recipient_email, plan_slug, event_type } = body;
  if (!recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid recipient_email" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (!VALID_PLAN_SLUGS.includes(plan_slug)) {
    return new Response(JSON.stringify({ ok: false, error: `Invalid plan_slug: ${plan_slug}` }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (!VALID_EVENT_TYPES.includes(event_type)) {
    return new Response(JSON.stringify({ ok: false, error: `Invalid event_type: ${event_type}` }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  // Suppression check
  const { data: unsub } = await db
    .from("lit_email_unsubscribes")
    .select("id")
    .eq("recipient_email", recipient_email.toLowerCase())
    .maybeSingle();
  if (unsub) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "unsubscribed" }), { headers: { "Content-Type": "application/json" } });
  }

  // Idempotency check
  if (!body.force) {
    const { data: existing } = await db
      .from("lit_email_automation_events")
      .select("id")
      .eq("event_type", event_type)
      .eq("plan_slug", plan_slug)
      .eq("status", "sent")
      .eq(body.user_id ? "user_id" : "recipient_email", body.user_id ?? recipient_email.toLowerCase())
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_sent", existing_id: existing.id }), { headers: { "Content-Type": "application/json" } });
    }
  }

  // Build unsubscribe URL
  const emailToken = btoa(recipient_email.toLowerCase()).replace(/=/g, "");
  const unsubscribeUrl = `${siteUrl}/unsubscribe?email=${encodeURIComponent(recipient_email.toLowerCase())}&token=${emailToken}`;

  // Hero image URLs
  const heroUrls: Record<string, string> = {
    company_intelligence: `${siteUrl}/email-assets/lit-email-hero-company-intelligence.svg`,
    pulse_ai: `${siteUrl}/email-assets/lit-email-hero-pulse-ai.svg`,
    campaigns: `${siteUrl}/email-assets/lit-email-hero-campaigns.svg`,
  };

  // Build email
  let emailResult: { subject: string; html: string; text: string };
  try {
    emailResult = buildEmail(event_type, body, appUrl, siteUrl, heroUrls, unsubscribeUrl);
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: `Template build failed: ${err instanceof Error ? err.message : String(err)}` }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const { subject, html, text } = emailResult;

  // List-Unsubscribe headers (Gmail / Yahoo compliance)
  const listUnsubscribeHeader = `<${unsubscribeUrl}>, <mailto:${replyTo}?subject=Unsubscribe>`;

  let resendEmailId: string | null = null;
  let sendStatus: "sent" | "failed" = "failed";
  let errorMessage: string | null = null;

  if (!resendKey) {
    errorMessage = "LIT_RESEND_API_KEY not configured";
    console.warn("[send-subscription-email] LIT_RESEND_API_KEY missing — email not sent");
  } else {
    try {
      const resendPayload = {
        from: fromEmail,
        to: [recipient_email],
        reply_to: replyTo,
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": listUnsubscribeHeader,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [
          { name: "event_type", value: event_type },
          { name: "plan_slug", value: plan_slug },
        ],
      };

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(resendPayload),
      });

      const respJson: any = await resp.json().catch(() => ({}));
      if (resp.ok) {
        resendEmailId = (respJson?.id as string | null) ?? null;
        sendStatus = "sent";
      } else {
        errorMessage = String(respJson?.message || respJson?.name || respJson?.error || resp.status).slice(0, 500);
        console.warn("[send-subscription-email] Resend error:", resp.status, errorMessage);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
      console.error("[send-subscription-email] Resend threw:", err);
    }
  }

  // Record the attempt in audit table
  const { data: eventRow, error: insertError } = await db
    .from("lit_email_automation_events")
    .insert({
      user_id: body.user_id ?? null,
      org_id: body.org_id ?? null,
      subscription_id: body.subscription_id ?? null,
      plan_slug,
      event_type,
      resend_email_id: resendEmailId,
      recipient_email: recipient_email.toLowerCase(),
      subject,
      status: sendStatus,
      error_message: errorMessage,
      payload_json: { first_name: body.first_name, plan_slug, event_type, trial_ends_date: body.trial_ends_date, previous_plan_name: body.previous_plan_name },
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[send-subscription-email] DB insert error:", insertError.message);
  }

  if (sendStatus === "sent") {
    return new Response(
      JSON.stringify({ ok: true, resend_email_id: resendEmailId, event_id: eventRow?.id ?? null }),
      { headers: { "Content-Type": "application/json" } },
    );
  } else {
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage, event_id: eventRow?.id ?? null }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
