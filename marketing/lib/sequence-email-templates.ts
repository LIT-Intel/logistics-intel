/**
 * Code-defined lead-nurture emails — LIT house layout + copy per
 * (sequence, step). The dispatch cron prefers these over Resend-hosted
 * templates: git-versioned copy, consistent branding with the in-app
 * lifecycle emails (send-subscription-email), and no "template in draft
 * status" failure mode.
 *
 * Deliberately NOT covered (fall through to Resend template / stub):
 *  - cold-fmcsa-outbound: cold touches perform better as plain personal
 *    notes — a branded hero screams "marketing blast".
 *  - partner-onboarding: low volume, operator-managed in Resend.
 *
 * Layout is a port of the house layout in
 * supabase/functions/send-subscription-email (navy hero, LIT wordmark,
 * single CTA, quiet footer) with the preferences link required for
 * marketing sends.
 */

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const LIT_ICON_URL =
  "https://raw.githubusercontent.com/LIT-Intel/logistics-intel/main/frontend/public/icon_256.png";
const C = {
  text: "#0F172A",
  subtle: "#475569",
  muted: "#94A3B8",
  divider: "#E2E8F0",
  ctaBg: "#2563EB",
  ctaBgDark: "#1E40AF",
  pageBg: "#F1F5F9",
  heroBg: "#0A1024",
  tipBg: "#EFF6FF",
  tipBorder: "#DBEAFE",
  tipLabel: "#1E40AF",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SequenceEmailVars = {
  firstName: string;
  competitor: string;
  offer: string;
  preferencesUrl: string;
};

type BuiltEmail = { subject: string; html: string; text: string };

type EmailDef = {
  subject: string;
  previewText: string;
  headline: string;
  subtitle?: string;
  /** Paragraphs (plain strings — escaped; use *bold* nothing, keep plain). */
  paragraphs: string[];
  /** Optional bullet list rendered between paragraphs and CTA. */
  bullets?: string[];
  tip?: string;
  ctaText: string;
  ctaUrl: string;
  signoff?: string;
};

function layout(def: EmailDef, vars: SequenceEmailVars): BuiltEmail {
  const paras = def.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 18px 0;font-family:${FONT};font-size:16px;line-height:1.65;color:${C.text};">${esc(p)}</p>`,
    )
    .join("");
  const bullets = def.bullets?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 18px 0;">${def.bullets
        .map(
          (b) =>
            `<tr><td valign="top" style="padding:5px 12px 5px 0;font-family:${FONT};font-size:15px;color:${C.ctaBg};font-weight:700;">✓</td><td valign="top" style="padding:5px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.text};">${esc(b)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const tip = def.tip
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:6px 0 18px 0;width:100%;"><tr><td bgcolor="${C.tipBg}" style="background-color:${C.tipBg};border:1px solid ${C.tipBorder};border-radius:12px;padding:14px 18px;"><div style="font-family:${FONT};font-size:11px;font-weight:700;color:${C.tipLabel};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Pro tip</div><div style="font-family:${FONT};font-size:14.5px;line-height:1.55;color:${C.text};">${esc(def.tip)}</div></td></tr></table>`
    : "";
  const signoff = def.signoff
    ? `<p style="margin:6px 0 0 0;font-family:${FONT};font-style:italic;color:${C.subtle};font-size:14px;line-height:1.6;">${esc(def.signoff)}</p>`
    : "";
  const subtitle = def.subtitle
    ? `<p style="margin:0;font-family:${FONT};font-size:17px;font-weight:500;line-height:1.4;color:${C.subtle};">${esc(def.subtitle)}</p>`
    : "";
  const preview = `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#FFFFFF;mso-hide:all;">${esc(def.previewText)}${"&nbsp;&#847;".repeat(60)}</div>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(def.headline)}</title></head><body style="margin:0;padding:0;background-color:${C.pageBg};color:${C.text};font-family:${FONT};">${preview}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.pageBg}" style="background-color:${C.pageBg};border-collapse:collapse;"><tr><td align="center" valign="top" style="padding:40px 16px 56px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#FFFFFF" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:18px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);"><tr><td bgcolor="${C.heroBg}" style="background-color:${C.heroBg};padding:28px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td valign="middle" style="padding-right:13px;"><img src="${LIT_ICON_URL}" width="38" height="38" alt="LIT" style="display:block;width:38px;height:38px;border-radius:9px;border:0;outline:none;" /></td><td valign="middle" style="font-family:${FONT};font-size:21px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;line-height:1;">Logistic Intel</td></tr></table></td></tr><tr><td style="padding:34px 40px 4px 40px;"><h1 style="margin:0 0 8px 0;font-family:${FONT};font-size:27px;font-weight:800;color:${C.text};line-height:1.2;letter-spacing:-0.02em;">${esc(def.headline)}</h1>${subtitle}</td></tr><tr><td style="padding:22px 40px 8px 40px;">${paras}${bullets}${tip}${signoff}</td></tr><tr><td style="padding:10px 40px 36px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="${C.ctaBg}" valign="middle" style="background-color:${C.ctaBg};border-radius:10px;mso-padding-alt:15px 30px;border-bottom:2px solid ${C.ctaBgDark};"><a href="${def.ctaUrl}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15.5px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;letter-spacing:0.01em;line-height:1;">${esc(def.ctaText)} →</a></td></tr></table></td></tr><tr><td style="padding:0 40px;"><div style="height:1px;background-color:${C.divider};font-size:0;line-height:0;">&nbsp;</div></td></tr><tr><td style="padding:22px 40px 30px 40px;font-family:${FONT};font-size:12.5px;line-height:1.7;color:${C.muted};"><span style="color:${C.subtle};font-weight:600;">Logistic Intel</span> — freight revenue intelligence for logistics sales teams.<br/><a href="${vars.preferencesUrl}" style="color:${C.muted};text-decoration:underline;">Email preferences</a> &middot; <a href="mailto:hello@logisticintel.com" style="color:${C.muted};text-decoration:underline;">hello@logisticintel.com</a></td></tr></table></td></tr></table></body></html>`;

  const text = [
    def.headline,
    def.subtitle ?? "",
    "",
    ...def.paragraphs,
    "",
    ...(def.bullets ?? []).map((b) => `  ✓ ${b}`),
    def.tip ? `\nPRO TIP: ${def.tip}` : "",
    def.signoff ? `\n${def.signoff}` : "",
    "",
    `${def.ctaText}: ${def.ctaUrl}`,
    "",
    "—",
    "Logistic Intel — freight revenue intelligence for logistics sales teams.",
    `Email preferences: ${vars.preferencesUrl}`,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();

  return { subject: def.subject, html, text };
}

const hi = (v: SequenceEmailVars) =>
  v.firstName && v.firstName !== "there" ? `Hi ${v.firstName},` : "Hi there,";

const comp = (v: SequenceEmailVars, fallback = "your current tool") =>
  v.competitor || fallback;

/** Copy per sequence:step. Keys are `${sequence_key}:${step}`. */
const CONTENT: Record<string, (v: SequenceEmailVars) => EmailDef> = {
  /* ── trial-welcome (marketing leads → free account) ─────────────── */
  "trial-welcome:1": (v) => ({
    subject: "Your LIT trial is ready — unlimited search, free",
    previewText: "Unlimited shipper search + 10 verified contacts. No card.",
    headline: "Your trial is ready.",
    subtitle: "Unlimited search. 10 account unlocks. 10 verified contacts.",
    paragraphs: [
      hi(v),
      "You asked for freight leads — here's the engine behind them. Search 524,000+ active US importers by lane, port, carrier, or product, free and unlimited. Your trial adds 10 deep account unlocks (full shipment history) and 10 verified decision-maker contacts.",
    ],
    tip: "Start with a shipper you already know. Seeing their real lanes and volumes in 30 seconds is the fastest way to trust the data.",
    ctaText: "Start searching free",
    ctaUrl: "https://logisticintel.com/signup",
    signoff: "Hit reply if anything's unclear — I read every one. — Gabriel",
  }),
  "trial-welcome:2": (v) => ({
    subject: "How forwarders book 4× more meetings with LIT",
    previewText: "Reply rates jump when you open with the prospect's own lanes.",
    headline: "The 4× meeting pattern.",
    paragraphs: [
      hi(v),
      "The forwarders getting 4× more first meetings on LIT all do the same thing: they stop opening with capabilities and start opening with the prospect's own freight.",
      "“Saw your Ningbo → Savannah volume doubled last quarter” outperforms every generic pitch, because it proves you did the work before you asked for time.",
    ],
    bullets: [
      "Search your lane, sort by volume",
      "Unlock an account — read its lanes, carriers, cadence",
      "Email the verified contact with one specific observation",
    ],
    ctaText: "Try it on your lane",
    ctaUrl: "https://logisticintel.com/signup",
    signoff: "— Gabriel",
  }),
  "trial-welcome:3": (v) => ({
    subject: "Your trial perks expire in 9 days",
    previewText: "Search stays free forever. The unlocks don't.",
    headline: "9 days left on your unlocks.",
    paragraphs: [
      hi(v),
      "Quick heads-up: searching LIT stays free forever, but your trial's 10 account unlocks and 10 contact enrichments expire with the trial.",
      "If you haven't burned them yet, spend them on your top prospects this week — every unlock is a full shipment history plus the person who buys freight there.",
    ],
    ctaText: "Use your unlocks",
    ctaUrl: "https://logisticintel.com/signup",
    signoff: "— Gabriel",
  }),
  "trial-welcome:4": (v) => ({
    subject: "Want a 30-min walkthrough on your lanes?",
    previewText: "Bring your target lanes; leave with a prospect list.",
    headline: "Let's work your actual lanes.",
    paragraphs: [
      hi(v),
      "Most people get more out of LIT in one guided session than a week of poking around. Bring your target lanes and verticals; we'll build a live prospect list together and you keep it either way.",
    ],
    ctaText: "Book a 15-min walkthrough",
    ctaUrl: "https://logisticintel.com/book-a-demo",
    signoff: "No pitch, just reps. — Gabriel",
  }),
  "trial-welcome:5": (v) => ({
    subject: "Your trial ended — here's what stays free",
    previewText: "Unlimited search is still yours. Here's what paid adds.",
    headline: "The trial ended. Search didn't.",
    paragraphs: [
      hi(v),
      "Your trial wrapped up — but unlimited shipper search is still free on your account, forever. What paid plans add: deep account unlocks, verified contacts, Pulse AI briefs, and outreach from your own mailbox.",
      "If LIT found you even one real prospect, Starter pays for itself on the first closed load.",
    ],
    ctaText: "See plans",
    ctaUrl: "https://logisticintel.com/pricing",
    signoff:
      "Not ready? Keep searching free — and reply anytime with your lane; I'll pull targets for you. — Gabriel",
  }),

  /* ── top-100-followup (lead magnet PDF) ─────────────────────────── */
  "top-100-followup:1": (v) => ({
    subject: "Your Top 100 active shippers list (this week's data)",
    previewText: "The list is attached to your account — and it goes stale.",
    headline: "Your Top 100 list is ready.",
    paragraphs: [
      hi(v),
      "Here's your Top 100 active shippers list, built from this week's customs filings. Every company on it moved freight in the last 30 days — no dead entries, no stale contacts.",
      "One thing to know: shipper behavior moves weekly. The list is a snapshot; the live database underneath refreshes daily.",
    ],
    ctaText: "Open the live version",
    ctaUrl: "https://logisticintel.com/freight-leads",
    signoff: "— Gabriel",
  }),
  "top-100-followup:2": (v) => ({
    subject: "The 6 things top reps do with a shipper list",
    previewText: "A list is only as good as the motion behind it.",
    headline: "6 plays for your Top 100.",
    paragraphs: [hi(v), "A list alone books nothing. Here's what the best freight reps do with theirs:"],
    bullets: [
      "Rank by estimated freight spend, not alphabet",
      "Cut it to the 20 that fit your strongest lane",
      "Check each one's current provider mix before calling",
      "Open with their lane data, not your capabilities",
      "Save the rest to a watchlist for weekly change alerts",
      "Track replies against volume tier — big fish reply slower, close bigger",
    ],
    ctaText: "Run the plays in LIT",
    ctaUrl: "https://logisticintel.com/signup",
    signoff: "— Gabriel",
  }),
  "top-100-followup:3": (v) => ({
    subject: "What if this list refreshed itself every Monday?",
    previewText: "Static lists decay ~5% a month. Live ones don't.",
    headline: "Lists decay. Feeds don't.",
    paragraphs: [
      hi(v),
      "The Top 100 you downloaded is already aging — shippers switch lanes, providers, and volumes every week. Inside LIT, that same list is a living feed: Pulse watches your saved accounts and emails you every Monday with what changed.",
      "New lane activated. Volume up 40%. Forwarder displaced. Each one is a reason to call this week instead of “checking in.”",
    ],
    ctaText: "Turn your list live — free",
    ctaUrl: "https://logisticintel.com/signup",
    signoff: "— Gabriel",
  }),

  /* ── comparison-nurture (vs / alternatives pages) ───────────────── */
  "comparison-nurture:1": (v) => ({
    subject: `LIT vs ${comp(v, "the tools you're comparing")} — the honest version`,
    previewText: "Where they win, where we win, and how to test it in a day.",
    headline: "The honest comparison.",
    paragraphs: [
      hi(v),
      `Since you were comparing us with ${comp(v)}, here's the version we don't put on the website: they're genuinely better at some things. Broader horizontal contact coverage, more integrations, longer track record.`,
      "Where LIT wins is the thing that decides freight deals: we know who actually ships. Live customs data joined to verified logistics contacts — so your reps never again pitch a company that hasn't moved a container in three years.",
      "The honest test: run 10 of your live prospects through both. Whichever tool tells you more about their freight wins your money.",
    ],
    ctaText: "Run the 10-prospect test free",
    ctaUrl: "https://logisticintel.com/signup",
    signoff: "— Gabriel",
  }),
  "comparison-nurture:2": (v) => ({
    subject: `Why teams leave ${comp(v, "generic sales tools")} after 6 months`,
    previewText: "The pattern is always the same: right person, wrong company.",
    headline: "Right person. Wrong company.",
    paragraphs: [
      hi(v),
      `The churn story we hear from teams leaving ${comp(v)} is always the same: the contact data was fine — the targeting wasn't. Reps emailed perfectly-titled logistics managers at companies with no meaningful freight.`,
      "Freight sales isn't a persona problem, it's an activity problem. The question isn't “who is the VP of Supply Chain?” — it's “who moved 400 TEU through Savannah last quarter and just switched forwarders?”",
      "That's the question LIT answers on every search.",
    ],
    ctaText: "See it on your prospects",
    ctaUrl: "https://logisticintel.com/signup",
    signoff: "— Gabriel",
  }),

  /* ── re-engagement (dormant leads/users) ────────────────────────── */
  "re-engagement:1": (v) => ({
    subject: "We've been quiet — quick question",
    previewText: "One question, honest answer appreciated.",
    headline: "One quick question.",
    paragraphs: [
      hi(v),
      "You checked out LIT a while back and we've stayed out of your inbox since. One genuine question: what were you hoping it would do that it didn't?",
      "If the answer is “nothing, timing was just wrong” — good news: searching is now free and unlimited, no trial clock. If something was missing, reply and tell me; there's a decent chance we've built it since.",
    ],
    ctaText: "See what's new — free",
    ctaUrl: "https://logisticintel.com/signup",
    signoff: "I read every reply. — Gabriel",
  }),
  "re-engagement:2": (v) => ({
    subject: "Last email from us — unless you say otherwise",
    previewText: "We'd rather be useful or be gone.",
    headline: "We'll take the hint.",
    paragraphs: [
      hi(v),
      "This is the last nurture email we'll send you — we'd rather be useful or be gone.",
      "Before we go quiet: unlimited free shipper search is live on your account, no strings. If freight prospecting is ever back on your plate, that's where to start. And if you'd rather never hear from us, the preferences link below makes it permanent.",
    ],
    ctaText: "Keep my free access",
    ctaUrl: "https://logisticintel.com/signup",
    signoff: "Thanks for giving us a look either way. — Gabriel",
  }),

  /* ── post-signup-demo (24h after email confirm) ─────────────────── */
  "post-signup-demo:1": (v) => ({
    subject: "Want to see LIT on your lanes? 15 minutes",
    previewText: "Bring a lane, leave with a target list.",
    headline: "15 minutes, your lanes.",
    paragraphs: [
      hi(v),
      "You're in and searching — the fastest way to compound that is one short working session. Bring a lane or vertical you sell into; we'll build a live target list together, and you keep it whether or not you ever pay us.",
    ],
    ctaText: "Grab a 15-min slot",
    ctaUrl: "https://logisticintel.com/book-a-demo",
    signoff: "Calendar's first-come. — Gabriel",
  }),

  /* ── meeting-no-show (Cal.com no-show → recovery) ───────────────── */
  "meeting-no-show:1": (v) => ({
    subject: "We missed you — want to grab another time?",
    previewText: "No worries — calendars collide. Here's the link to rebook.",
    headline: "We missed you today.",
    paragraphs: [
      hi(v),
      "Our demo time came and went — no worries at all, calendars collide. The slot was yours, so the offer still stands: bring a lane or a vertical you sell into, and in 15 minutes we'll pull the actual importers moving freight on it, with the people who buy logistics there.",
      "Grab any time that works — same link, zero judgment.",
    ],
    ctaText: "Pick a new time",
    ctaUrl: "https://logisticintel.com/book-a-demo",
    signoff: "Or just reply with two windows and I'll send an invite. — Gabriel",
  }),
  "meeting-no-show:2": (v) => ({
    subject: "The 5-minute version of what we were going to show you",
    previewText: "Skip the meeting — here's the self-serve version, free.",
    headline: "Skip the meeting entirely.",
    paragraphs: [
      hi(v),
      "If a live call isn't happening, here's the honest shortcut: everything I was going to demo, you can do yourself in about five minutes. Search any US import lane free — no card, no meeting.",
      "Type a product or a company you already know, and watch its real lanes, carriers, and monthly cadence appear. That moment is the whole pitch.",
    ],
    bullets: [
      "Search 524,000+ active importers — free, unlimited",
      "Open one account for full shipment history",
      "Unlock the verified contact who buys freight there",
    ],
    ctaText: "Try the 5-minute version",
    ctaUrl: "https://logisticintel.com/signup",
    signoff: "The rebook link works anytime too. — Gabriel",
  }),

  /* ── lit-weekly (evergreen thought-leadership floor; steps rotate
        by ISO week so every audience gets one branded touch/week) ──── */
  "lit-weekly:1": (v) => ({
    subject: "The 30-second teardown that books freight meetings",
    previewText: "One account, three data points, one email. Weekly play #1.",
    headline: "This week's play: the 30-second teardown.",
    subtitle: "LIT Signals Weekly — one field-tested play per week.",
    paragraphs: [
      hi(v),
      "The highest-reply cold email in freight isn't clever — it's specific. Reps who win first meetings open with the prospect's own operation: their top lane, their carrier mix, their shipment cadence.",
      "The play: pick one target importer, pull three facts about their freight, and lead with the most surprising one. “Your Ningbo → Savannah volume doubled last quarter — who's covering the overflow?” beats any pitch deck, because it proves you did the work before asking for time.",
    ],
    tip: "Volume changes beat volume totals. “Doubled since Q1” starts conversations; “you ship a lot” doesn't.",
    ctaText: "Run a teardown free",
    ctaUrl: "https://logisticintel.com/search",
    signoff: "One play a week, always under 90 seconds to read. — Gabriel",
  }),
  "lit-weekly:2": (v) => ({
    subject: "Why Q4 freight contracts are won in August",
    previewText: "RFP season timing, and the window most reps miss. Play #2.",
    headline: "The RFP window opens before the RFP.",
    subtitle: "LIT Signals Weekly — one field-tested play per week.",
    paragraphs: [
      hi(v),
      "Most importers lock annual freight contracts in Q4 — but the shortlist forms months earlier, when ops teams quietly benchmark their current providers. If your first touch lands during the RFP, you're a column in someone's spreadsheet. If it lands in the benchmarking window, you're the one who framed the spreadsheet.",
      "The play: build your Q4 target list now, and open with lane-level observations — rate pressure on their trade lane, a carrier they rely on cutting capacity, a port their competitors are shifting to. Be the source of the benchmark.",
    ],
    tip: "Sort any lane by shipment count and prospect the middle of the list. The top 10 get twenty calls a week; numbers 30–80 get almost none.",
    ctaText: "Build your Q4 list",
    ctaUrl: "https://logisticintel.com/search",
    signoff: "— Gabriel",
  }),
  "lit-weekly:3": (v) => ({
    subject: "Read a prospect's carrier mix like a P&L",
    previewText: "What consolidation, churn, and single-carrier risk tell you. Play #3.",
    headline: "Carrier mix is a confession.",
    subtitle: "LIT Signals Weekly — one field-tested play per week.",
    paragraphs: [
      hi(v),
      "A prospect's carrier history tells you exactly how to sell them. One carrier for years? They buy stability — pitch reliability and a backup lane, not price. Four carriers in two years? They're shopping — pitch speed to quote. A recent switch after steady years? Something broke — that's your door.",
      "The play: before any first call, read the target's last 12 months of carrier usage and name the pattern out loud in your opener. “Looks like you moved off MSC in March — how's the new setup holding up?” is a question only someone with the data can ask.",
    ],
    tip: "Single-carrier shippers are underrated targets: one service failure and they need a plan B overnight. Be the plan B they already know.",
    ctaText: "Check a carrier mix",
    ctaUrl: "https://logisticintel.com/search",
    signoff: "— Gabriel",
  }),
  "lit-weekly:4": (v) => ({
    subject: "The follow-up cadence that doesn't burn lists",
    previewText: "Six touches, three angles, zero “just checking in.” Play #4.",
    headline: "Never send “just checking in” again.",
    subtitle: "LIT Signals Weekly — one field-tested play per week.",
    paragraphs: [
      hi(v),
      "Most freight reps stop at two touches; most replies come after four. The difference between persistent and annoying is whether each touch adds new information — and freight data gives you an infinite supply of it.",
      "The cadence: touch 1 is their lane observation. Touch 2, three days later, a market shift on that lane. Touch 3, a week on, what a similar shipper just changed. Then breathe two weeks and close the loop. Every message earns its place in the inbox because it teaches them something about their own freight.",
    ],
    bullets: [
      "Day 0 — their own lane, one specific number",
      "Day 3 — rate or capacity shift on that lane",
      "Day 10 — what a comparable importer just did",
      "Day 24 — polite close: “timing wrong, or wrong person?”",
    ],
    ctaText: "Arm your follow-ups",
    ctaUrl: "https://logisticintel.com/search",
    signoff: "Forward this to whoever runs your SDR cadence. — Gabriel",
  }),
};

/**
 * Returns the fully-rendered branded email for a sequence step, or null
 * when the step has no code-defined content (caller falls back to the
 * Resend-template / stub path).
 */
export function renderSequenceEmail(
  sequenceKey: string,
  step: number,
  vars: SequenceEmailVars,
): BuiltEmail | null {
  const def = CONTENT[`${sequenceKey}:${step}`];
  if (!def) return null;
  return layout(def(vars), vars);
}
