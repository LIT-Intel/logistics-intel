// Builds the 8 campaign email templates (2 segments x 4-touch sequence)
// and emits an UPSERT SQL block for lit_marketing_email_templates.
//
// Usage:
//   node scripts/build-campaign-templates.cjs           # prints SQL
//   node scripts/build-campaign-templates.cjs --json    # prints JSON
//
// Design: warm-paper palette (matches the digest template), single hero
// image per email, one pill CTA, founder voice on intros, brand voice on
// follow-ups. No exclamation points. One {{first_name}} per email.

const SHELL_BG = "#F1F0EC";      // outer warm paper
const SURFACE = "#FFFBF6";       // shell interior, slight cream
const CARD = "#FFFFFF";
const NAVY = "#0B1220";
const NAVY_MID = "#111B2E";
const NAVY_HI = "#1A2540";
const CYAN = "#00F0FF";
const TEXT = "#0F172A";
const TEXT_MUTED = "#475569";
const TEXT_FAINT = "#94A3B8";
const HAIRLINE = "#E2E8F0";

const HERO_BASE = "https://app.logisticintel.com/campaign-heroes";
const HEROES = {
  search: `${HERO_BASE}/lit-pulse-search-hero.png`,        // F1, B1
  account: `${HERO_BASE}/lit-account-card-hero.png`,       // F2, B2
  velocity: `${HERO_BASE}/lit-velocity-hero.png`,          // F3, B3
};

function htmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderEmail({ heroUrl, intro, bullets, ctaLabel, ctaUrl, closing, signoff }) {
  // bullets is optional; if present rendered as small inline list under intro
  const bulletBlock = bullets && bullets.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0 0 0;">${bullets.map((b) => `
            <tr><td style="padding:6px 0; font-size:15px; line-height:1.55; color:${TEXT}; vertical-align:top;">
              <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${CYAN}; vertical-align:middle; margin-right:10px;"></span>${b}
            </td></tr>`).join("")}
          </table>`
    : "";

  const heroBlock = heroUrl ? `
        <tr>
          <td class="lit-pad-x" style="padding:0 28px;">
            <img src="${heroUrl}" alt="Logistics Intel" width="544" height="306" style="display:block; width:100%; max-width:544px; height:auto; border:0; outline:1px solid rgba(15,23,42,0.04); outline-offset:0; border-radius:12px; margin:18px 0 4px 0;">
          </td>
        </tr>` : "";

  const closingBlock = closing ? `
              <p style="font-size:15px; line-height:1.55; color:${TEXT}; margin:18px 0 0 0;">${closing}</p>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Logistics Intel</title>
<style>
  @media only screen and (max-width: 600px) {
    .lit-shell { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
    .lit-pad-x { padding-left: 18px !important; padding-right: 18px !important; }
    .lit-cta { width: 100% !important; }
  }
  a { text-decoration: none; }
  img { -ms-interpolation-mode: bicubic; border: 0; line-height: 100%; outline: none; }
</style>
</head>
<body style="margin:0; padding:0; background:${SHELL_BG}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${SHELL_BG};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="lit-shell" style="width:100%; max-width:600px; background:${SURFACE}; border-radius:16px; box-shadow:0 1px 2px rgba(15,23,42,0.04), 0 2px 12px rgba(15,23,42,0.05); overflow:hidden;">

        <tr>
          <td class="lit-pad-x" style="padding:24px 28px 0 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="vertical-align:middle;">
                  <img src="https://app.logisticintel.com/logo_email.png" alt="Logistics Intel" width="130" height="29" style="display:block; height:29px; width:auto; max-width:130px;">
                </td>
              </tr>
            </table>
            <div style="height:2px; background:${CYAN}; width:48px; margin:14px 0 0 0; border-radius:2px;"></div>
          </td>
        </tr>

        ${heroBlock}

        <tr>
          <td class="lit-pad-x" style="padding:18px 28px 0 28px;">
            <p style="font-size:15px; line-height:1.55; color:${TEXT}; margin:0;">${intro}</p>
            ${bulletBlock}
            ${closingBlock}
          </td>
        </tr>

        <tr>
          <td class="lit-pad-x" align="left" style="padding:24px 28px 8px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="lit-cta" style="background:${NAVY}; border-radius:8px;">
                  <a href="${ctaUrl}" style="display:inline-block; padding:12px 22px; font-size:14px; font-weight:600; color:#ffffff; line-height:20px; letter-spacing:0.01em;">${htmlEscape(ctaLabel)}&nbsp;&rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="lit-pad-x" style="padding:6px 28px 26px 28px;">
            <p style="font-size:14px; line-height:1.55; color:${TEXT_MUTED}; margin:18px 0 0 0;">${signoff}</p>
          </td>
        </tr>

        <tr>
          <td class="lit-pad-x" style="padding:18px 28px 22px 28px; border-top:1px solid ${HAIRLINE}; background:${SHELL_BG};">
            <p style="font-size:11px; line-height:1.55; color:${TEXT_FAINT}; margin:0;">Logistics Intel &middot; Atlanta, GA &middot; <a href="https://app.logisticintel.com/unsubscribe?token={{unsubscribe_token}}" style="color:${TEXT_FAINT}; text-decoration:underline;">unsubscribe</a></p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Email content — 8 templates. Tone: human peer, no exclamation points,
// one first_name reference per email, no sales-speak.
// ---------------------------------------------------------------------------

const TRIAL_URL = "https://app.logisticintel.com/auth/signup?utm_source=campaign&utm_medium=email&utm_campaign=";

const EMAILS = [
  // ─── Forwarders track ───────────────────────────────────────────────────
  {
    template_key: "fwd_intro_founder",
    sector: "freight-forwarders",
    persona_key: "founder",
    sort_order: 10,
    name: "Forwarders — founder intro",
    subject: "the shipper data hiding in plain sight",
    use_case: "Day 0 of the forwarder sequence. Founder voice. Sets up why LIT exists.",
    description: "Day 0 founder intro for freight forwarders.",
    hero: HEROES.search,
    intro: `Hi {{first_name}},<br><br>I spent six years quoting freight at a forwarder in Atlanta. Every Monday morning I'd open ZoomInfo, Apollo, Sales Navigator, and four other tabs trying to figure out who was actually moving freight that week. The lists were always wrong by a quarter.`,
    closing: `So I built Logistics Intel. Every U.S. bill of lading, joined to verified ops contacts, refreshed daily. You filter by lane, see who's moving freight right now, and stop chasing companies that haven't imported in two years.<br><br>Worth a 30-second look?`,
    cta_label: "Start your 14-day free trial",
    cta_url: `${TRIAL_URL}fwd_intro_founder`,
    signoff: "&mdash; founder, Logistics Intel",
  },
  {
    template_key: "fwd_followup_account_card",
    sector: "freight-forwarders",
    persona_key: "lit_team",
    sort_order: 20,
    name: "Forwarders — what an account looks like",
    subject: "what 30 seconds of research looks like",
    use_case: "Day +3 follow-up. Shows concrete output, not features.",
    description: "Day +3 follow-up for freight forwarders — concrete proof.",
    hero: HEROES.account,
    intro: `{{first_name}}, this is what an account profile looks like inside Logistics Intel &mdash; one card, one click.`,
    bullets: [
      `<strong>Trailing 12m volume</strong>: 18.9K TEU`,
      `<strong>Top lane</strong>: TR → US, 4 new origin ports activated`,
      `<strong>Top carrier</strong>: Hapag-Lloyd, growing single-carrier reliance`,
      `<strong>CRM stage</strong>: synced to your pipeline`,
    ],
    closing: `Every claim cited to a public source, refreshed weekly, no hallucinated facts. Run it on your own top 25 accounts and tell us if anything looks off.`,
    cta_label: "See it on your accounts",
    cta_url: `${TRIAL_URL}fwd_followup_account_card`,
    signoff: "&mdash; the Logistics Intel team",
  },
  {
    template_key: "fwd_followup_velocity",
    sector: "freight-forwarders",
    persona_key: "lit_team",
    sort_order: 30,
    name: "Forwarders — search to campaign in 20 min",
    subject: "from a search bar to a campaign in 20 minutes",
    use_case: "Day +7 follow-up. Capability proof. The compression story.",
    description: "Day +7 follow-up for freight forwarders — workflow compression.",
    hero: HEROES.velocity,
    intro: `{{first_name}}, the work that used to take a sales team five days now takes twenty minutes.`,
    bullets: [
      `Search "EV battery importers shipping from Korea" &mdash; Pulse finds 27 matches`,
      `Pulse Coach flags 8 with volume up month-over-month`,
      `Auto-save companies, queue verified ops contacts`,
      `Launch a Day-1 sequence to all 12 buyers from inside the same tab`,
    ],
    closing: `One workspace, one round of research, one launch. The free trial gets you the full thing for fourteen days.`,
    cta_label: "Try it free for 14 days",
    cta_url: `${TRIAL_URL}fwd_followup_velocity`,
    signoff: "&mdash; the Logistics Intel team",
  },
  {
    template_key: "fwd_followup_close",
    sector: "freight-forwarders",
    persona_key: "lit_team",
    sort_order: 40,
    name: "Forwarders — quiet close",
    subject: "one last note",
    use_case: "Day +14 final touch. Short, no image, soft close.",
    description: "Day +14 final follow-up for freight forwarders — quiet close.",
    hero: null,
    intro: `{{first_name}}, last note from us.<br><br>If the shipper feed isn't useful, that's a fair answer and we won't keep pinging. The trial is fourteen days, no card, no auto-renew. If you'd like to see it on your own top three lanes, it's right here.`,
    closing: `Either way &mdash; appreciate you reading this far.`,
    cta_label: "Start your 14-day free trial",
    cta_url: `${TRIAL_URL}fwd_followup_close`,
    signoff: "&mdash; the Logistics Intel team",
  },

  // ─── Brokers track ──────────────────────────────────────────────────────
  {
    template_key: "brk_intro_founder",
    sector: "freight-brokers",
    persona_key: "founder",
    sort_order: 50,
    name: "Brokers — founder intro",
    subject: "your reps and the tab problem",
    use_case: "Day 0 of the broker sequence. Founder voice, broker pain framing.",
    description: "Day 0 founder intro for freight brokers.",
    hero: HEROES.search,
    intro: `Hi {{first_name}},<br><br>I spent six years at a forwarder in Atlanta watching the brokerage team chase the same companies as every other broker in the market. Eight hours of tab-switching for two real conversations.`,
    closing: `So we built Logistics Intel: every U.S. bill of lading joined to verified ops contacts, with the buying signals already surfaced. Your reps walk into every call knowing the shipper's lanes, current carrier, and volume direction.<br><br>Worth a 30-second look?`,
    cta_label: "Start your 14-day free trial",
    cta_url: `${TRIAL_URL}brk_intro_founder`,
    signoff: "&mdash; founder, Logistics Intel",
  },
  {
    template_key: "brk_followup_account_card",
    sector: "freight-brokers",
    persona_key: "lit_team",
    sort_order: 60,
    name: "Brokers — first 30 seconds of research",
    subject: "the first 30 seconds of account research, done",
    use_case: "Day +3 follow-up. Concrete account-card example.",
    description: "Day +3 follow-up for freight brokers — concrete proof.",
    hero: HEROES.account,
    intro: `{{first_name}}, this is what your reps see when they open any account inside Logistics Intel.`,
    bullets: [
      `<strong>Trailing 12m</strong>: 18.9K TEU on TR → US`,
      `<strong>Trigger</strong>: 4 new origin ports activated, volume up 18% &mdash; capacity expansion`,
      `<strong>Trigger</strong>: rising single-carrier reliance &mdash; pricing-leverage moment`,
      `<strong>CRM stage</strong>: pushes to your Command Center or external CRM`,
    ],
    closing: `Every signal cited to a public source. Refreshed weekly. Ninety-five percent confidence. No hallucinated facts.`,
    cta_label: "See your accounts",
    cta_url: `${TRIAL_URL}brk_followup_account_card`,
    signoff: "&mdash; the Logistics Intel team",
  },
  {
    template_key: "brk_followup_velocity",
    sector: "freight-brokers",
    persona_key: "lit_team",
    sort_order: 70,
    name: "Brokers — signal-based selling",
    subject: "stop guessing who's shipping right now",
    use_case: "Day +7 follow-up. Comparison frame: blind prospecting vs signals.",
    description: "Day +7 follow-up for freight brokers — workflow compression.",
    hero: HEROES.velocity,
    intro: `{{first_name}}, the difference between a broker who hits quota and one who chases lists comes down to two things: targeting and timing.`,
    bullets: [
      `Live shipment patterns and trailing-12m volume on every importer`,
      `Carrier shifts, new origin ports, and lane launches surfaced as buying signals`,
      `"Saw your VN → US volume spike 18% this quarter" beats "just checking in"`,
      `One workspace built for logistics, not a generic CRM`,
    ],
    closing: `The free trial gets your team the full workspace for fourteen days. Bring your top accounts and tell us what's missing.`,
    cta_label: "Try it free for 14 days",
    cta_url: `${TRIAL_URL}brk_followup_velocity`,
    signoff: "&mdash; the Logistics Intel team",
  },
  {
    template_key: "brk_followup_close",
    sector: "freight-brokers",
    persona_key: "lit_team",
    sort_order: 80,
    name: "Brokers — quiet close",
    subject: "one quick question",
    use_case: "Day +14 final touch. Short, no image, question-led close.",
    description: "Day +14 final follow-up for freight brokers — quiet close.",
    hero: null,
    intro: `{{first_name}}, one quick question and then we'll get out of your inbox.<br><br>What's the hardest part of finding new accounts for your team right now? Stale lists, no signal, contact data drift, something else?<br><br>One sentence is enough. We read every reply.`,
    closing: `If it's easier to just poke around, the trial is fourteen days, no card.`,
    cta_label: "Start your 14-day free trial",
    cta_url: `${TRIAL_URL}brk_followup_close`,
    signoff: "&mdash; the Logistics Intel team",
  },
];

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function render(e) {
  return renderEmail({
    heroUrl: e.hero,
    intro: e.intro,
    bullets: e.bullets,
    ctaLabel: e.cta_label,
    ctaUrl: e.cta_url,
    closing: e.closing,
    signoff: e.signoff,
  });
}

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

function buildSql() {
  const upserts = EMAILS.map((e) => {
    const body_html = render(e);
    // body_text — strip tags + collapse whitespace
    const body_text = body_html
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&middot;/g, "·")
      .replace(/&mdash;/g, "—")
      .replace(/&rarr;/g, "→")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return `('${sqlEscape(e.template_key)}', '${sqlEscape(e.name)}', '${sqlEscape(e.sector)}', '${sqlEscape(e.persona_key)}', '${sqlEscape(e.subject)}', '${sqlEscape(body_html)}', '${sqlEscape(body_text)}', '${sqlEscape(e.description)}', '${sqlEscape(e.use_case)}', true, ${e.sort_order})`;
  });

  return `-- Deactivate ALL existing campaign templates (they fail the founder-approved bar)
UPDATE public.lit_marketing_email_templates SET is_active = false WHERE is_active = true;

-- Upsert the new 8-email sequence (2 segments × intro + 3 follow-ups)
INSERT INTO public.lit_marketing_email_templates
  (template_key, name, sector, persona_key, subject, body_html, body_text, description, use_case, is_active, sort_order)
VALUES
${upserts.join(",\n")}
ON CONFLICT (template_key) DO UPDATE SET
  name = EXCLUDED.name,
  sector = EXCLUDED.sector,
  persona_key = EXCLUDED.persona_key,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  description = EXCLUDED.description,
  use_case = EXCLUDED.use_case,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
`;
}

if (process.argv.includes("--json")) {
  const rows = EMAILS.map((e) => ({
    ...e,
    body_html: render(e),
  }));
  process.stdout.write(JSON.stringify(rows, null, 2));
} else if (process.argv.includes("--sample")) {
  // Print just one rendered email as HTML to stdout for visual review
  const key = process.argv[process.argv.indexOf("--sample") + 1];
  const e = EMAILS.find((x) => x.template_key === key) || EMAILS[0];
  process.stdout.write(render(e));
} else {
  process.stdout.write(buildSql());
}
