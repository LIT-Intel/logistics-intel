// LIT Marketing · 14-day, 13-touch outbound sequence.
//
// Brand voice: consultative, freight-operator style. Not hype-driven.
// Tokens resolved at send time by the dispatcher's applyMergeVars helper.
//
// Token contract (send-time tokens — left untouched by resolveEmailTemplateHtml):
//   {{first_name}}    — recipient first name
//   {{last_name}}     — recipient last name
//   {{full_name}}     — recipient full name
//   {{company_name}}  — recipient company
//   {{top_lane}}      — top trade lane signal
//   {{sender_name}}   — sender first name
//   {{phone}}         — sender phone
//
// Insert-time tokens (resolved by resolveEmailTemplateHtml before persisting):
//   {{company_intelligence_public_url}}
//   {{contact_discovery_public_url}}
//   {{pulse_ai_public_url}}
//   {{pulse_workflow_public_url}}
//   {{lane_signals_public_url}}

import type { EmailAssetKey } from "./emailAssets";

export type LitTouchKind =
  | "email"
  | "linkedin_invite"
  | "linkedin_message"
  | "call";

export interface LitMarketingTouch {
  /** Position in the 14-touch list (1-indexed). NOT a calendar day — use `calendarDay`. */
  touchIndex: number;
  /** Calendar day of the sequence (1-based). Some days have no touch (e.g. day 7). */
  calendarDay: number;
  /** Days gap from the previous non-wait touch. First touch is 0. */
  delayDays: number;
  kind: LitTouchKind;
  /** Label shown in the timeline. */
  title: string;
  // Email-only:
  subject?: string;
  previewText?: string;
  /** Raw HTML with {{*_public_url}} asset placeholders + send-time tokens. */
  html?: string;
  /** Which product visual the email features. */
  imageAssetKey?: EmailAssetKey;
  // Manual touchpoints (LinkedIn / call):
  /** Copy-paste script body shown in the inspector. */
  scriptMarkdown?: string;
  /** One-liner shown in the step inspector description. */
  description?: string;
  /** Send-time tokens the touch uses (for help text / preview). */
  tokensUsed: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// v8 design tokens — soft-white LIT brand. Founder rejected v7's dark slate
// hero band and v8a's warm-paper background (logo didn't blend with cream).
// This is v8b: clean off-white outer page, pure-white shell so the logo
// reads cleanly on the same surface its PNG was authored for.
//
// Palette:
//   Outer page bg     #F5F7FA  soft cool off-white (subtle separation from shell)
//   Shell bg          #FFFFFF  pure clean white — logo blends, no fringe
//   Brand accent      #00F0FF  neon cyan (2px rule under logo)
//   Navy primary      #0B1220  CTA bg
//   Body text         #0F172A  near-black
//   Muted text        #475569  meta lines
//   Faint text        #94A3B8  footer
//   Hairline          #E2E8F0  divider
//   Pro tip           #F0F9FF / #0369A1  light-blue cool tint, brand-consistent
//
// Hero treatment: shell's clean white runs edge-to-edge from header to body.
// LIT logo top-left, 48px cyan accent rule below — no dark band, no separate
// color block.
// ─────────────────────────────────────────────────────────────────────────────

const _MKT_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const _MKT_LOGO_URL = "https://app.logisticintel.com/logo_email.png";
const _MKT_COLOR = {
  text: "#0F172A",
  textSubtle: "#475569",
  textMuted: "#94A3B8",
  divider: "#E2E8F0",
  ctaBg: "#0B1220",       // navy CTA — professional, brand-aligned
  ctaText: "#FFFFFF",
  ctaAccent: "#00F0FF",   // cyan underline accent on CTA
  bg: "#FFFFFF",          // pure white shell — logo blends seamlessly
  pageBg: "#F5F7FA",      // soft cool off-white outer
  tipBg: "#F0F9FF",       // sky-50 — cool brand-consistent
  tipBorder: "#BAE6FD",   // sky-200
  tipLabel: "#0369A1",    // sky-700 for "Pro tip" eyebrow
  brandAccent: "#00F0FF", // cyan brand rule under header
};

/**
 * v8 layout for outbound marketing emails — warm-paper LIT-brand chrome.
 *
 * The header reads as one continuous warm surface (no dark slate band).
 * LIT logo image left-aligned, then a 48px cyan accent rule below it,
 * then the body. The CTA is a navy pill with a thin cyan border-bottom
 * accent. Pro tip cards use a warm amber tint instead of cold blue.
 *
 * Parameters:
 *   bodyHtml    — pre-built HTML body content (paragraphs, lists, etc.)
 *   ctaText     — button label
 *   ctaUrl      — button URL (send-time token OK, e.g. "https://app.logisticintel.com/...")
 *   previewText — inbox preview snippet (100 chars max)
 *   subjectLine — used for <title> only
 *   proTipHtml  — optional tinted-card body rendered below the main body
 */
export function wrapV7(opts: {
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  previewText: string;
  subjectLine: string;
  proTipHtml?: string;
  // v8 (ZoomInfo-style) optional params — backwards compatible with the
  // 14-touch sequence callers that don't supply these.
  headline?: string;
  bullets?: string[];
  resourceCard?: {
    companyName: string;
    teu12m: string;
    topLane: string;
    topCarrier: string;
    trigger: string;
    crmStage?: string;
    caption: string;
  };
}): string {
  const {
    bodyHtml,
    ctaText,
    ctaUrl,
    previewText,
    subjectLine,
    proTipHtml,
    headline,
    bullets,
    resourceCard,
  } = opts;

  const HERO_BG = "#0B1220";
  const HERO_TEXT = "#FFFFFF";
  const CYAN = "#00F0FF";
  // Icon (not wordmark) — icon_glow_256.png already has its own dark-navy
  // background with a subtle glow, so it stays readable even if the hero
  // bg gets stripped by Gmail mobile / Outlook.com dark mode handling.
  const HERO_LOGO_URL = "https://app.logisticintel.com/icon_glow_256.png";
  const heroHeadline = headline ?? subjectLine;

  const previewBlock = `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${_MKT_COLOR.bg};mso-hide:all;">${previewText}${"&nbsp;&#847;".repeat(60)}</div>`;

  // ROW 1 — hero band (navy). Bulletproof dark background:
  //   1. bgcolor attribute + inline background-color (handles most clients)
  //   2. Outlook VML <v:rect> fill (Outlook strips bg colors on td in certain
  //      Word renderer paths — VML fills the cell with the right color)
  //   3. Dark-mode-keep class so Gmail/Apple Mail dark mode don't invert it
  //   4. background-image as a self-referential gradient (some clients
  //      preserve background-image when they strip background-color)
  //
  // Print-to-PDF (Gmail's @media print stylesheet strips bg images AND
  // colors) is unfixable from the email side. Recipients reading in their
  // inbox will see the dark hero correctly.
  const heroBlock = `<tr><td class="lit-hero-keep-dark" bgcolor="${HERO_BG}" background="${HERO_BG}" style="background-color:${HERO_BG};background-image:linear-gradient(${HERO_BG}, ${HERO_BG});padding:32px 32px 36px 32px;mso-line-height-rule:exactly;">
<!--[if mso | IE]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="mso-position-horizontal:left;position:absolute;left:0;top:0;width:600px;height:240px;z-index:-1;">
  <v:fill type="solid" color="${HERO_BG}" />
</v:rect>
<![endif]-->
<img src="${HERO_LOGO_URL}" width="56" height="56" alt="Logistics Intel" style="display:block;width:56px;height:56px;border:0;outline:none;text-decoration:none;border-radius:12px;" />
<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>
<h1 class="lit-h1 lit-hero-text-keep-light" style="margin:0 0 24px 0;font-family:${_MKT_FONT};font-size:36px;line-height:1.2;font-weight:700;color:${HERO_TEXT};letter-spacing:-0.015em;text-wrap:balance;mso-line-height-rule:exactly;">${heroHeadline}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="${CYAN}" valign="middle" style="background-color:${CYAN};border-radius:10px;mso-padding-alt:14px 24px;"><a class="lit-cta-hero" href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 24px;font-family:${_MKT_FONT};font-size:14px;font-weight:600;color:${HERO_BG};text-decoration:none;border-radius:10px;letter-spacing:0.01em;line-height:1;">${ctaText} &rarr;</a></td></tr></table>
</td></tr>`;

  // ROW 2 — body content.
  const bodyRow = `<tr><td class="lit-pad-x" style="padding:28px 32px 8px 32px;font-family:${_MKT_FONT};font-size:15px;line-height:1.65;color:${_MKT_COLOR.text};text-align:left;">${bodyHtml}${proTipHtml ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:24px 0 0 0;width:100%;"><tr><td bgcolor="${_MKT_COLOR.tipBg}" style="background-color:${_MKT_COLOR.tipBg};border-radius:12px;padding:16px 20px;"><div style="font-family:${_MKT_FONT};font-size:11px;font-weight:700;color:${_MKT_COLOR.tipLabel};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Pro tip</div><div style="font-family:${_MKT_FONT};font-size:15px;line-height:1.55;color:${_MKT_COLOR.text};">${proTipHtml}</div></td></tr></table>` : ""}</td></tr>`;

  // ROW 3 — bullets (conditional). Each bullet: cyan 18px circle with white
  // &#10003; checkmark + 15px label. HTML entity (no inline SVG) for Outlook.
  const bulletsRow =
    bullets && bullets.length > 0
      ? `<tr><td class="lit-pad-x" style="padding:4px 32px 8px 32px;">${bullets
          .map(
            (b) =>
              `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;"><tr><td width="24" valign="top" style="width:24px;padding-top:3px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${CYAN}" width="18" height="18" style="width:18px;height:18px;background-color:${CYAN};border-radius:50%;mso-line-height-rule:exactly;"><tr><td align="center" valign="middle" style="color:${HERO_BG};font-size:11px;font-weight:700;line-height:18px;font-family:${_MKT_FONT};">&#10003;</td></tr></table></td><td style="padding:0 0 12px 12px;font-family:${_MKT_FONT};font-size:15px;line-height:1.55;color:${_MKT_COLOR.text};">${b}</td></tr></table>`,
          )
          .join("")}</td></tr>`
      : "";

  // ROW 4 — secondary CTA (cyan outline pill).
  const secondaryCtaRow = `<tr><td class="lit-pad-x" style="padding:16px 32px 24px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td valign="middle" style="background-color:#FFFFFF;border:2px solid ${CYAN};border-radius:10px;mso-padding-alt:12px 22px;"><a class="lit-cta-secondary" href="${ctaUrl}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${_MKT_FONT};font-size:14px;font-weight:600;color:${HERO_BG};text-decoration:none;border-radius:10px;letter-spacing:0.01em;line-height:1;">${ctaText} &rarr;</a></td></tr></table></td></tr>`;

  // ROW 5 — resource card (conditional). Sky-50 tinted outer; white inner
  // card with stats; amber trigger row; right-side caption.
  let resourceRow = "";
  if (resourceCard) {
    const stage = resourceCard.crmStage ?? "Active";
    const statRow = (label: string, value: string) =>
      `<tr><td style="padding:6px 0;font-family:${_MKT_FONT};"><div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">${label}</div><div style="font-size:14px;color:#0F172A;line-height:1.4;">${value}</div></td></tr>`;
    const innerCard = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:10px;border:1px solid #E2E8F0;border-collapse:separate;width:100%;"><tr><td style="padding:14px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;"><tr><td valign="middle" style="font-family:${_MKT_FONT};font-size:15px;font-weight:600;color:#0B1220;">${resourceCard.companyName}</td><td align="right" valign="middle"><span style="display:inline-block;background-color:#ECFDF5;color:#047857;padding:2px 8px;border-radius:11px;font-family:${_MKT_FONT};font-size:11px;font-weight:600;">&#10003; CRM: ${stage}</span></td></tr></table><div style="height:1px;background-color:#F1F5F9;font-size:0;line-height:0;margin:10px 0 4px 0;">&nbsp;</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;">${statRow("Trailing 12m", resourceCard.teu12m)}${statRow("Top lane", resourceCard.topLane)}${statRow("Top carrier", resourceCard.topCarrier)}</table><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin-top:10px;width:100%;"><tr><td bgcolor="#FFFBEB" style="background-color:#FFFBEB;border-radius:8px;padding:8px 12px;font-family:${_MKT_FONT};font-size:12px;color:#92400E;line-height:1.4;"><strong style="font-weight:700;">Trigger:</strong> ${resourceCard.trigger}</td></tr></table></td></tr></table>`;

    resourceRow = `<tr><td class="lit-pad-x" style="padding:16px 32px 28px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F0F9FF" style="background-color:#F0F9FF;border-radius:14px;border-collapse:separate;width:100%;"><tr><td style="padding:22px 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;"><tr><td class="lit-rc-left" valign="top" width="60%" style="width:60%;padding-right:16px;">${innerCard}</td><td class="lit-rc-right" valign="middle" width="40%" style="width:40%;font-family:${_MKT_FONT};font-size:14px;line-height:1.55;color:#0F172A;">${resourceCard.caption}</td></tr></table></td></tr></table></td></tr>`;
  }

  // ROW 6 — hairline divider.
  const dividerRow = `<tr><td class="lit-pad-x" style="padding:0 32px;"><div style="height:1px;background-color:${_MKT_COLOR.divider};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;

  // ROW 7 — footer.
  const footerRow = `<tr><td class="lit-pad-x" style="padding:18px 32px 26px 32px;font-family:${_MKT_FONT};font-size:12px;line-height:1.65;color:${_MKT_COLOR.textMuted};text-align:left;">Logistics Intel &middot; Atlanta, GA &middot; <a href="https://app.logisticintel.com/unsubscribe?token={{unsubscribe_token}}" style="color:${_MKT_COLOR.textMuted};text-decoration:underline;">unsubscribe</a></td></tr>`;

  // Mobile + dark-mode-keep CSS. The dark-mode rules force the hero band
  // to STAY dark in Gmail / Apple Mail / Outlook.com auto-dark-mode
  // (which would otherwise invert it to light, leaving white text on white).
  // [data-ogsc] = Outlook.com dark-mode selector. [data-ogsb] is the body.
  const mobileStyle = `@media only screen and (max-width:600px){.lit-shell{width:100% !important;max-width:100% !important;border-radius:0 !important;}.lit-pad-x{padding-left:18px !important;padding-right:18px !important;}.lit-hero-keep-dark{padding:24px 22px 28px 22px !important;}.lit-h1{font-size:28px !important;}.lit-cta-hero,.lit-cta-secondary{display:block !important;width:100% !important;text-align:center !important;box-sizing:border-box !important;}.lit-rc-left,.lit-rc-right{display:block !important;width:100% !important;padding-right:0 !important;padding-bottom:12px !important;}}@media (prefers-color-scheme:dark){.lit-hero-keep-dark{background-color:#0B1220 !important;background-image:linear-gradient(#0B1220,#0B1220) !important;}.lit-hero-text-keep-light,.lit-hero-text-keep-light *{color:#FFFFFF !important;}}[data-ogsc] .lit-hero-keep-dark{background-color:#0B1220 !important;}[data-ogsc] .lit-hero-text-keep-light,[data-ogsc] .lit-hero-text-keep-light *{color:#FFFFFF !important;}u + .body .lit-hero-keep-dark{background-color:#0B1220 !important;}u + .body .lit-hero-text-keep-light{color:#FFFFFF !important;}a{text-decoration:none;}img{-ms-interpolation-mode:bicubic;border:0;line-height:100%;outline:none;text-decoration:none;}`;

  return `<!DOCTYPE html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="X-UA-Compatible" content="IE=edge" /><meta name="x-apple-disable-message-reformatting" /><meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light only" /><title>${subjectLine}</title><style>${mobileStyle}</style><!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]--></head><body style="margin:0;padding:0;background-color:${_MKT_COLOR.pageBg};color:${_MKT_COLOR.text};font-family:${_MKT_FONT};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">${previewBlock}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${_MKT_COLOR.pageBg}" style="background-color:${_MKT_COLOR.pageBg};border-collapse:collapse;"><tr><td align="center" valign="top" style="padding:16px 12px 48px 12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="lit-shell" bgcolor="${_MKT_COLOR.bg}" style="max-width:600px;width:100%;background-color:${_MKT_COLOR.bg};border-radius:16px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.04),0 2px 12px rgba(15,23,42,0.05);">${heroBlock}${bodyRow}${bulletsRow}${secondaryCtaRow}${resourceRow}${dividerRow}${footerRow}</table></td></tr></table></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared HTML wrapper helpers (v7 — replaces old wrapWithImage / wrapPlainText)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Touch email with v7 layout. The old `imgPlaceholder` parameter is
 * removed — SVG hero images are replaced by the dark slate hero band.
 * The `proTipHtml` parameter optionally renders a tinted Pro Tip card
 * below the body paragraphs (used on touches 1, 3, 7).
 * The `ctaText`/`ctaUrl` parameters are optional overrides — defaults
 * to "Request a quick look" linking to logisticintel.com.
 */
function wrapWithImage(
  bodyHtml: string,
  _imgPlaceholder: string,
  _imgAlt: string,
  proTipHtml?: string,
  ctaText?: string,
  ctaUrl?: string,
): string {
  // imgPlaceholder / imgAlt parameters are kept in the signature for
  // backward compatibility with the existing call sites but are no
  // longer rendered — the v7 hero band replaces the SVG asset.
  return wrapV7({
    bodyHtml,
    ctaText: ctaText ?? "Request a quick look",
    ctaUrl: ctaUrl ?? "https://www.logisticintel.com",
    previewText: "",
    subjectLine: "",
    proTipHtml,
  });
}

function wrapPlainText(bodyHtml: string, proTipHtml?: string, ctaText?: string, ctaUrl?: string): string {
  return wrapV7({
    bodyHtml,
    ctaText: ctaText ?? "See how it works",
    ctaUrl: ctaUrl ?? "https://www.logisticintel.com",
    previewText: "",
    subjectLine: "",
    proTipHtml,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Value-prop visual helpers — comparison cards + stack cost tables.
// Outlook-safe: 100% inline styles, table-based layout, no flexbox.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Side-by-side "Before vs With LIT" card. Renders as a 2-column table
 * in email clients that support tables (most), and stacks gracefully
 * on narrow widths. Headers get color treatment so the contrast reads.
 */
function comparisonHtml(
  leftLabel: string,
  leftBullets: string[],
  rightLabel: string,
  rightBullets: string[],
): string {
  const bullets = (items: string[]) =>
    items
      .map(
        (b) =>
          `<tr><td style="padding:4px 0 4px 0;font-family:${_MKT_FONT};font-size:14px;line-height:1.5;color:${_MKT_COLOR.text};">• ${b}</td></tr>`,
      )
      .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:18px 0 6px 0;width:100%;"><tr><td valign="top" width="49%" style="padding:14px 14px;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;"><div style="font-family:${_MKT_FONT};font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${leftLabel}</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${bullets(leftBullets)}</table></td><td width="2%" style="width:8px;">&nbsp;</td><td valign="top" width="49%" style="padding:14px 14px;background-color:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;"><div style="font-family:${_MKT_FONT};font-size:11px;font-weight:700;color:#1E40AF;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${rightLabel}</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${bullets(rightBullets)}</table></td></tr></table>`;
}

/**
 * Stacked "your current stack" cost breakdown. Each row shows tool +
 * monthly cost; the total is bolded at the bottom. Used to anchor the
 * dollar math when pitching LIT as a stack replacement.
 */
function stackTableHtml(rows: Array<{ tool: string; cost: string }>, total: string): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 0;font-family:${_MKT_FONT};font-size:14px;color:${_MKT_COLOR.text};">${r.tool}</td><td align="right" style="padding:6px 0;font-family:${_MKT_FONT};font-size:14px;color:${_MKT_COLOR.text};">${r.cost}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;margin:14px 0 6px 0;width:100%;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;"><tr><td style="padding:14px 16px;"><div style="font-family:${_MKT_FONT};font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Typical broker / forwarder stack — per rep</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${body}<tr><td style="padding:10px 0 0 0;border-top:1px solid #E2E8F0;font-family:${_MKT_FONT};font-size:14px;font-weight:700;color:${_MKT_COLOR.text};">Total / rep / month</td><td align="right" style="padding:10px 0 0 0;border-top:1px solid #E2E8F0;font-family:${_MKT_FONT};font-size:14px;font-weight:700;color:${_MKT_COLOR.text};">${total}</td></tr></table></td></tr></table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIT Marketing · split into TWO 14-day sequences (broker / forwarder).
// Each has ~6 emails + 3 LinkedIn touches + 2 calls + final close. The
// LIT_MARKETING_14_TOUCH alias below points at the broker sequence so
// existing campaigns that referenced it keep working.
// ─────────────────────────────────────────────────────────────────────────────

// ── BROKER 14-day sequence ───────────────────────────────────────────────────
export const LIT_MARKETING_BROKER_14: LitMarketingTouch[] = [
  // ── Touch 1 · Day 1 · Email · Intro + stack math ─────────────────────────
  {
    touchIndex: 1,
    calendarDay: 1,
    delayDays: 0,
    kind: "email",
    title: "Email · Intro · stack math",
    subject: "Saw your {{top_lane}} moves last quarter",
    previewText: "Two questions about how you're handling the volume swing.",
    tokensUsed: [
      "{{first_name}}",
      "{{company_name}}",
      "{{top_lane}}",
      "{{sender_name}}",
    ],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Pulled up {{company_name}}'s BOL footprint earlier this week. Your {{top_lane}} lane has been the steady one — but the cadence shifted in the last 60 days. A handful of containers landed on different consignee names than what you'd been running, which usually means either a new partner shipper or a re-route through a different gateway.</p>
<p style="margin:0 0 14px 0;">Two things I'd be curious about, peer to peer:</p>
<p style="margin:0 0 14px 0;">1. Are you seeing the same demurrage drift at LA/LB that everyone else is screaming about this quarter? The dwell on a few of your boxes ran past 7 days.</p>
<p style="margin:0 0 14px 0;">2. Is the {{top_lane}} carrier mix something you picked, or is it whatever your NVO had space on that week?</p>
<p style="margin:0 0 14px 0;">No pitch — just nosy. If you want to compare notes, hit reply.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `If your dwell on {{top_lane}} is creeping past 5 days, you're not alone — terminal congestion at the LA/LB pair has been ugly since late Q3. Worth flagging on rate sheets before peak.`,
      "Pull up my lane data",
    ),
  },
  // ── Touch 2 · Day 2 · LinkedIn invite ────────────────────────────────────
  {
    touchIndex: 2,
    calendarDay: 2,
    delayDays: 1,
    kind: "linkedin_invite",
    title: "LinkedIn connection request",
    description: "Brief, relevant connection request — no pitch.",
    scriptMarkdown: `{{first_name}} — saw {{company_name}}'s footprint on {{top_lane}}. Curious how you're handling the LA/LB dwell drift this quarter. Always good to swap notes with another operator working that lane.`,
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}"],
  },
  // ── Touch 3 · Day 3 · Email · The bad-fit cost ───────────────────────────
  {
    touchIndex: 3,
    calendarDay: 3,
    delayDays: 1,
    kind: "email",
    title: "Email · The cost of bad-fit prospecting",
    subject: "Question on your {{top_lane}} carrier mix",
    previewText: "Looked at the consignee pattern — one thing stood out.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Following up — went a layer deeper on {{company_name}}'s {{top_lane}} pattern this morning.</p>
<p style="margin:0 0 14px 0;">Two things that jumped out:</p>
<p style="margin:0 0 14px 0;">— You're running FCL on the headhaul but the return legs look like consol moves. That's not a bad setup, but the timing on the empties is where most operators leak money on this pair.</p>
<p style="margin:0 0 14px 0;">— Your top three consignees are clustered in one inland market. If you've got a backhaul shipper anywhere within 200 miles, there's a drayage round-trip play that I've seen pencil out at $400–$600 per box.</p>
<p style="margin:0 0 14px 0;">Is the inland leg something you control, or is it on the consignee's account? Different conversation either way.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `FCL headhaul with LCL backhaul is the classic asymmetric exposure. Worth modeling the empty repo cost separately from the loaded leg — most operators bundle them and miss the leak.`,
      "Look at my consignee cluster",
    ),
  },
  // ── Touch 4 · Day 4 · Call · Voicemail ───────────────────────────────────
  {
    touchIndex: 4,
    calendarDay: 4,
    delayDays: 1,
    kind: "call",
    title: "Call · voicemail",
    description: "Voicemail referencing the specific lane signal.",
    scriptMarkdown: `Hey {{first_name}}, {{sender_name}} here. I won't take long — I was looking at {{company_name}}'s {{top_lane}} moves and noticed your consignee cluster is pretty tight in one inland market. Wanted to ask whether you control the drayage leg or if it's on the consignee, because there might be a backhaul play that pencils out. Hit me back at {{phone}} when you've got two minutes. Thanks.`,
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}", "{{phone}}"],
  },
  // ── Touch 5 · Day 5 · Email · Tool-by-tool comparison ────────────────────
  {
    touchIndex: 5,
    calendarDay: 5,
    delayDays: 1,
    kind: "email",
    title: "Email · How we actually help",
    subject: "Where the shipment data fits in",
    previewText: "Briefly: what we use to spot lane shifts before they hit rates.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">A few of you have asked what I'm actually looking at when I reference your lane data — fair question.</p>
<p style="margin:0 0 14px 0;">We pull BOL records on shippers and consignees, then layer in carrier mix, mode, cadence, and a 14-day TEU trendline per lane. That's how I caught the cadence shift on {{company_name}}'s {{top_lane}} last week. Same data tells us when a shipper's locked into an RFP cycle vs. when they're testing capacity — which is the only time a cold outreach actually lands.</p>
<p style="margin:0 0 14px 0;">For broker desks, the practical use is two things:</p>
<p style="margin:0 0 14px 0;">— Skip the importers who aren't moving on lanes you can cover.</p>
<p style="margin:0 0 14px 0;">— Get the heads-up when an existing relationship's volume is drifting before they put it out to bid.</p>
<p style="margin:0 0 14px 0;">If a 20-min walkthrough on three of {{company_name}}'s target lanes would be useful, I'll run it live and you keep the screenshots.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `Volume drift on an existing account is the cheapest renewal signal you'll ever get. By the time it's an RFP email in your inbox, you're already in a bidding war.`,
      "Walk me through three lanes",
    ),
  },
  // ── Touch 6 · Day 6 · LinkedIn DM ────────────────────────────────────────
  {
    touchIndex: 6,
    calendarDay: 6,
    delayDays: 1,
    kind: "linkedin_message",
    title: "LinkedIn follow-up DM",
    description: "Follow-up after connection — concrete operator question.",
    scriptMarkdown: `Thanks for connecting, {{first_name}}. Quick one — on {{top_lane}}, are you running mostly direct shipper relationships or is most of that volume coming through NVOs / freight forwarders? Asking because the carrier mix on your recent moves looks more like a partner play than a primary contract, and that changes which conversations are worth having this quarter.`,
    tokensUsed: ["{{first_name}}", "{{top_lane}}"],
  },
  // ── Touch 7 · Day 8 · Email · Workflow proof ─────────────────────────────
  {
    touchIndex: 7,
    calendarDay: 8,
    delayDays: 2,
    kind: "email",
    title: "Email · Where reps actually lose time",
    subject: "The 18 minutes before a call you can't bill for",
    previewText: "Pre-call research is where the day disappears.",
    tokensUsed: ["{{first_name}}", "{{top_lane}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">One thing I've watched a lot of broker desks struggle with: the 18 minutes a rep burns before every call.</p>
<p style="margin:0 0 14px 0;">Pull up the shipper. Try to figure out what they're moving. Hunt for the right person in procurement. Skim LinkedIn. Check the CRM for last quarter's notes. Then dial — usually missing the angle anyway because none of that surfaced what changed in their freight last month.</p>
<p style="margin:0 0 14px 0;">What we do is collapse that into the first 30 seconds of opening an account: top lanes, cadence, recent shifts, mode mix, and the decision-maker contact info already pulled. The rep walks into the call leading with what actually changed on the shipper's side, instead of "any capacity needs?"</p>
<p style="margin:0 0 14px 0;">For a rep doing 25 dials a day on lanes like {{top_lane}}, that's the difference between 90 minutes of selling and 90 minutes lost to tab-switching. Want to see it run on a {{top_lane}} account this week?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `If a rep has to open four windows to know what a shipper moves, they won't do it every time. They'll wing the call. Which is why "any capacity?" is still the most common broker opener — not because it works, but because it's what you fall back on when you don't have time to prep.`,
      "Run it on {{top_lane}}",
    ),
  },
  // ── Touch 8 · Day 9 · Email · Objection / "we already have X" ────────────
  {
    touchIndex: 8,
    calendarDay: 9,
    delayDays: 1,
    kind: "email",
    title: "Email · Objection handler",
    subject: "Already have a trade-data subscription?",
    previewText: "Where shipment-data tools start to overlap — and where they don't.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Most broker desks I talk to already have something for trade data, something for contacts, and something for outreach. The fair pushback on us is: "why one more login?"</p>
<p style="margin:0 0 14px 0;">Honest answer: we're not trying to be one more login. The reason teams move to us is the workflow — same BOL data, but tied to the decision-maker contact info and the outbound in one place. The handoff between "this shipper's interesting" and "the right person heard about it" usually loses days. Compressing that to minutes is the actual value.</p>
<p style="margin:0 0 14px 0;">If you've already got a trade-data subscription and it's doing its job, great. The question I'd ask is whether the contact info next to each shipper is actually current, and whether the rep can move from "found them" to "in a sequence" without leaving the screen. If yes, keep what you have. If no, we should talk.</p>
<p style="margin:0 0 14px 0;">Worth 20 minutes on your existing setup so you can see the gap before I push?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `Trade data without verified contacts is half the value. The other half — verified contacts without freight context — is just noise. The handoff between the two is where most desks bleed time.`,
      "Compare what I have",
    ),
  },
  // ── Touch 9 · Day 10 · Call · Follow-up ──────────────────────────────────
  {
    touchIndex: 9,
    calendarDay: 10,
    delayDays: 1,
    kind: "call",
    title: "Call · follow-up",
    description: "Follow-up referencing the prior lane observation.",
    scriptMarkdown: `Hey {{first_name}}, {{sender_name}} circling back. Still curious about the {{top_lane}} cadence shift I flagged last week — whether the new consignee names are a partner shipper or a re-route. Either way it's the kind of thing you usually only catch in the BOLs after the fact, and I'd rather flag it before peak GRI hits. {{phone}} if you've got two minutes. Thanks.`,
    tokensUsed: ["{{first_name}}", "{{top_lane}}", "{{sender_name}}", "{{phone}}"],
  },
  // ── Touch 10 · Day 11 · Email · Anonymized example ───────────────────────
  {
    touchIndex: 10,
    calendarDay: 11,
    delayDays: 1,
    kind: "email",
    title: "Email · Anonymized example",
    subject: "What a similar desk caught in their book",
    previewText: "Two RFP cycles flagged ~30 days early. Same lane mix.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Short one. A 5-rep broker desk on lane mix similar to {{company_name}}'s started working with us about 90 days back. What actually changed in their numbers, anonymized:</p>
<p style="margin:0 0 14px 0;">— Qualified meetings per rep per week went from 2.4 to 4.1. They credit it to walking into calls with a specific lane observation in hand instead of "any capacity needs?"</p>
<p style="margin:0 0 14px 0;">— They caught two RFP cycles roughly 30 days early by watching cadence drift on existing accounts. Both closed as renewals at better rates than the prior contract.</p>
<p style="margin:0 0 14px 0;">— Pre-call research dropped from ~18 min to under a minute per account. Same rep count, materially more dials that mattered.</p>
<p style="margin:0 0 14px 0;">No magic — just less time hunting for context. Worth a walkthrough on {{company_name}}'s book?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Walk me through it",
    ),
  },
  // ── Touch 11 · Day 13 · Email · Breakup ──────────────────────────────────
  {
    touchIndex: 11,
    calendarDay: 13,
    delayDays: 2,
    kind: "email",
    title: "Email · Breakup",
    subject: "Closing the loop — last note",
    previewText: "If the timing isn't right, no follow-up coming.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Not going to keep landing in your inbox if the timing isn't there.</p>
<p style="margin:0 0 14px 0;">For what it's worth, the thing I'd actually want you to see is the cadence drift on your {{top_lane}} consignees — that one signal alone has been worth catching RFPs ~30 days early on books that look like {{company_name}}'s. Whether you want to run that with us or not is a separate question.</p>
<p style="margin:0 0 14px 0;">If it makes sense to revisit in the next quarter, ping me. Otherwise, good selling out there.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Send the lane snapshot",
    ),
  },
  // ── Touch 12 · Day 14 · LinkedIn final close ─────────────────────────────
  {
    touchIndex: 12,
    calendarDay: 14,
    delayDays: 1,
    kind: "linkedin_message",
    title: "LinkedIn final close",
    description: "Clean LinkedIn close — leaves the door open.",
    scriptMarkdown: `{{first_name}}, signing off on this one. The thread was really about the {{top_lane}} cadence shift on {{company_name}}'s book — that signal tends to show up 30 days before an RFP hits. Whenever you want to compare notes on the lane, I'm around.`,
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}"],
  },
];

// ── FORWARDER 14-day sequence ────────────────────────────────────────────────
export const LIT_MARKETING_FORWARDER_14: LitMarketingTouch[] = [
  // ── Touch 1 · Day 1 · Email · Intro + qualification math ─────────────────
  {
    touchIndex: 1,
    calendarDay: 1,
    delayDays: 0,
    kind: "email",
    title: "Email · Intro · qualification math",
    subject: "{{top_lane}} — quick question",
    previewText: "Saw the mode split on your recent moves. Curious how you decide.",
    tokensUsed: [
      "{{first_name}}",
      "{{company_name}}",
      "{{top_lane}}",
      "{{sender_name}}",
    ],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Was looking at {{company_name}}'s {{top_lane}} pattern this morning. A few things I noticed and wanted to ask about, operator to operator:</p>
<p style="margin:0 0 14px 0;">— Your mode split on that lane is heavier on consol than I'd expect for the volume bands you're hitting. Is that a service-level choice (transit predictability over cost) or because the FCL math just didn't work this quarter?</p>
<p style="margin:0 0 14px 0;">— Carrier mix shifted in the last 30 days — looks like you tried someone new on a couple of moves. Did the transit hold up, or did you eat dwell on the back end?</p>
<p style="margin:0 0 14px 0;">No pitch, just nosy. If you've got a take, hit reply.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `Mode-split decisions usually look obvious in retrospect and ugly in the moment. If LCL is winning on the rate sheet but FCL buys back a week of transit, that's worth re-modeling — usually pencils out around the 8-CBM mark.`,
      "Pull up my lane",
    ),
  },
  // ── Touch 2 · Day 2 · LinkedIn invite ────────────────────────────────────
  {
    touchIndex: 2,
    calendarDay: 2,
    delayDays: 1,
    kind: "linkedin_invite",
    title: "LinkedIn connection request",
    description: "Brief connection request — no pitch.",
    scriptMarkdown: `{{first_name}} — noticed {{company_name}} has been active on {{top_lane}}. Always interesting to compare notes with another forwarder working that pair, especially with the mode split shifting the way it has been.`,
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}"],
  },
  // ── Touch 3 · Day 3 · Email · Cost of broad prospecting ──────────────────
  {
    touchIndex: 3,
    calendarDay: 3,
    delayDays: 1,
    kind: "email",
    title: "Email · The real cost of broad prospecting",
    subject: "Following up on the consol question",
    previewText: "One more thing I caught on your inbound volume.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Quick follow-up on the lane question from the other day. Went a layer deeper on {{company_name}}'s {{top_lane}} moves.</p>
<p style="margin:0 0 14px 0;">A handful of your inbound shippers are showing a pattern where they pulse heavy for a quarter and then go quiet for two. That's classic seasonal-importer behavior — the kind where if you're not getting a heads-up two weeks before the season starts, the bookings have already gone to whoever called first.</p>
<p style="margin:0 0 14px 0;">Two of those shippers haven't moved a box in 60+ days, which is usually when they're either ramping for the next pulse or quietly testing another forwarder. Either one is worth a phone call this week.</p>
<p style="margin:0 0 14px 0;">Want me to send the specific BCO names so you can prioritize?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `Seasonal importers are the stickiest book a smaller forwarder can build — predictable, sticky, and they reward whoever called first. The trick is watching the quiet quarter, not the busy one.`,
      "Send me the shipper names",
    ),
  },
  // ── Touch 4 · Day 4 · Call · Voicemail ───────────────────────────────────
  {
    touchIndex: 4,
    calendarDay: 4,
    delayDays: 1,
    kind: "call",
    title: "Call · voicemail",
    description: "Voicemail referencing the seasonal shipper signal.",
    scriptMarkdown: `Hey {{first_name}}, {{sender_name}}. Won't keep you — I sent a note about two shippers on your {{top_lane}} book that have gone quiet for 60+ days. That window's usually when they're ramping or testing somebody else, and the call this week is the one that matters. Hit me at {{phone}} if you want the specific names. Thanks.`,
    tokensUsed: ["{{first_name}}", "{{top_lane}}", "{{sender_name}}", "{{phone}}"],
  },
  // ── Touch 5 · Day 5 · Email · Mode + lane fit ────────────────────────────
  {
    touchIndex: 5,
    calendarDay: 5,
    delayDays: 1,
    kind: "email",
    title: "Email · How the lane data actually works",
    subject: "What we use to spot the quiet shippers",
    previewText: "Briefly: where the cadence signal comes from.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">A few of you asked what I'm pulling against when I reference a shipper going quiet on {{top_lane}}. Worth a brief.</p>
<p style="margin:0 0 14px 0;">We work off BOL records — every inbound container has a consignee, shipper, carrier, port pair, and date. Layer that into a per-account cadence model and you get a clear pattern: monthly importers, seasonal pulses, and the ones whose volume just dropped off a cliff for reasons their incumbent forwarder probably hasn't noticed yet.</p>
<p style="margin:0 0 14px 0;">For a 3-person forwarder team, the practical use is short list, real reason. Instead of cold-calling 200 names from a directory, the rep walks into 20 calls with "your boxes on this lane went quiet — what's going on?" That's a conversation, not a pitch.</p>
<p style="margin:0 0 14px 0;">Happy to run a fit-filtered shortlist for {{company_name}}'s active lanes if that'd be useful.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `For a smaller team, 50 well-fit accounts beats 500 generic ones every quarter. The math is on time-per-conversation, not list size.`,
      "Run my shortlist",
    ),
  },
  // ── Touch 6 · Day 6 · LinkedIn DM ────────────────────────────────────────
  {
    touchIndex: 6,
    calendarDay: 6,
    delayDays: 1,
    kind: "linkedin_message",
    title: "LinkedIn follow-up DM",
    description: "Follow-up — concrete operator question on the lane.",
    scriptMarkdown: `Thanks for connecting, {{first_name}}. Quick one — on the {{top_lane}} consol moves I flagged in my note, are you running those through a partner NVO or directly with the carrier? Asking because the rate exposure on shared consols this quarter has been ugly, and operators who own the BL are sitting in a different spot than ones who don't.`,
    tokensUsed: ["{{first_name}}", "{{top_lane}}"],
  },
  // ── Touch 7 · Day 8 · Email · Pulse AI 30-second brief ───────────────────
  {
    touchIndex: 7,
    calendarDay: 8,
    delayDays: 2,
    kind: "email",
    title: "Email · Pulse · 30 seconds before each call",
    subject: "The 30 seconds before the call",
    previewText: "What changed on the lane, what to open with.",
    tokensUsed: ["{{first_name}}", "{{top_lane}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">The hardest 30 seconds in forwarder sales is the bit right before a rep dials — getting enough context to not sound generic, fast enough that the next 20 calls still happen today.</p>
<p style="margin:0 0 14px 0;">What we built for that moment is a one-card brief per shipper: top lanes, cadence, mode mix, carrier mix, what shifted in the last 30 days, and one suggested opener tied to the actual signal. No 80-row BOL grid to scroll. Open the account, glance at the card, dial.</p>
<p style="margin:0 0 14px 0;">For a rep doing 25–30 dials a day, that's 4–5 hours of pre-call hunting clawed back per week. For a 3-rep team on lanes like {{top_lane}}, that's basically half an extra rep without the headcount.</p>
<p style="margin:0 0 14px 0;">Want me to send a sample brief on one of {{top_lane}}'s active shippers so you can see the format?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      `The point isn't more data — it's the right data, fast. A rep who knows what to lead with closes more meetings than one with a longer dossier.`,
      "Send a sample brief",
    ),
  },
  // ── Touch 8 · Day 9 · Email · Stack consolidation deep-dive ──────────────
  {
    touchIndex: 8,
    calendarDay: 9,
    delayDays: 1,
    kind: "email",
    title: "Email · The handoff problem",
    subject: "Where the prospecting workflow breaks",
    previewText: "Trade data, contact info, outreach — the gap is the problem.",
    tokensUsed: ["{{first_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Most forwarder teams I talk to have something for shipment data we already have on them, something for decision-maker contact info, and something for outreach. Three tools. That part's normal.</p>
<p style="margin:0 0 14px 0;">The problem isn't owning them — it's the handoff between them. Rep spots a promising shipper in the trade data, opens a second tab to find the contact, opens a third to drop them in a sequence, then a fourth to log it in CRM. By the time that loop closes the rep has lost the thread on whatever specific signal made the shipper interesting in the first place. The outreach goes out generic.</p>
<p style="margin:0 0 14px 0;">What collapses the workflow is doing all of it from the same screen with the lane signal in view the entire time. The opener writes itself when the rep can see "cadence dropped on this consignee 45 days ago" while drafting the email.</p>
<p style="margin:0 0 14px 0;">Worth a 20-minute walkthrough on a couple of {{first_name}}'s real accounts so you can see the difference live?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Run the walkthrough",
    ),
  },
  // ── Touch 9 · Day 10 · Call · Follow-up ──────────────────────────────────
  {
    touchIndex: 9,
    calendarDay: 10,
    delayDays: 1,
    kind: "call",
    title: "Call · follow-up",
    description: "Follow-up call referencing the quiet-shipper signal.",
    scriptMarkdown: `Hey {{first_name}}, {{sender_name}} circling back. Wanted to see if the two quiet {{top_lane}} shippers I flagged ended up being worth a call. Either way I'd love to hear what came back from them — and if you want me to run the same cadence check on the rest of your book, that takes about 10 minutes. {{phone}} when you've got a sec. Thanks.`,
    tokensUsed: ["{{first_name}}", "{{top_lane}}", "{{sender_name}}", "{{phone}}"],
  },
  // ── Touch 10 · Day 11 · Email · Anonymized example ───────────────────────
  {
    touchIndex: 10,
    calendarDay: 11,
    delayDays: 1,
    kind: "email",
    title: "Email · Anonymized example",
    subject: "What a similar forwarder team caught in 60 days",
    previewText: "Three booked accounts from cadence drift on a single lane.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Short story for context. A 3-rep forwarder team on a similar lane mix to {{company_name}}'s started using us 60 days back. What changed:</p>
<p style="margin:0 0 14px 0;">— Three new BCO accounts booked, all of them shippers their reps had been on quietly for months but couldn't time. The cadence-drift signal flagged each one within a two-week window of when the incumbent forwarder was clearly losing the relationship.</p>
<p style="margin:0 0 14px 0;">— Qualified meetings per rep per week moved from 2.1 to 3.6. Same reps, same dial volume — just better openers.</p>
<p style="margin:0 0 14px 0;">— Pre-call research dropped from ~11 min to under a minute per account. The hours saved went straight into more dials.</p>
<p style="margin:0 0 14px 0;">No magic — they just stopped chasing names from a directory and started chasing shippers whose freight footprint actually said something. Worth seeing what the same approach surfaces on {{company_name}}'s book?</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Run it on my book",
    ),
  },
  // ── Touch 11 · Day 13 · Email · Breakup ──────────────────────────────────
  {
    touchIndex: 11,
    calendarDay: 13,
    delayDays: 2,
    kind: "email",
    title: "Email · Breakup",
    subject: "Last note — closing the loop",
    previewText: "If the timing's off, I'll back off.",
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"],
    html: wrapPlainText(
      `<p style="margin:0 0 14px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 14px 0;">Not going to keep landing in your inbox if the timing isn't there.</p>
<p style="margin:0 0 14px 0;">For what it's worth, the thing I'd really want you to see is the cadence-drift signal on {{company_name}}'s {{top_lane}} book — that one read alone has been worth catching shippers ~30 days before their incumbent forwarder loses them. Whether you want to do something about it with us or not is a separate question.</p>
<p style="margin:0 0 14px 0;">If it makes more sense to revisit next quarter, ping me. Otherwise, good selling out there.</p>
<p style="margin:0;">— {{sender_name}}</p>`,
      undefined,
      "Send the lane snapshot",
    ),
  },
  // ── Touch 12 · Day 14 · LinkedIn final close ─────────────────────────────
  {
    touchIndex: 12,
    calendarDay: 14,
    delayDays: 1,
    kind: "linkedin_message",
    title: "LinkedIn final close",
    description: "Clean LinkedIn close — leaves the door open.",
    scriptMarkdown: `{{first_name}}, signing off on this one. The thread was really about the cadence-drift read on {{company_name}}'s {{top_lane}} shippers — that signal tends to show up before the incumbent loses them. Whenever you want to compare notes on the lane, I'm around.`,
    tokensUsed: ["{{first_name}}", "{{company_name}}", "{{top_lane}}"],
  },
];

// Backward-compat alias — anything referencing LIT_MARKETING_14_TOUCH gets
// the broker sequence. New consumers should pick LIT_MARKETING_BROKER_14
// or LIT_MARKETING_FORWARDER_14 explicitly.
export const LIT_MARKETING_14_TOUCH: LitMarketingTouch[] = LIT_MARKETING_BROKER_14;


// ─────────────────────────────────────────────────────────────────────────────
// Builder-step adapter
// ─────────────────────────────────────────────────────────────────────────────

export type LitBuilderStep = {
  localId: string;
  kind: LitTouchKind | "wait";
  subject: string;
  body: string;
  title: string;
  description: string;
  waitDays: number;
  delayDays: number;
  delayHours: number;
  delayMinutes: number;
  includeSignature: boolean;
  expanded: boolean;
};

/**
 * Convert the LIT_MARKETING_14_TOUCH sequence into BuilderStep-compatible
 * objects for CampaignBuilder.
 *
 * Includes a synthetic wait step between touch 6 (day 6) and touch 7 (day 8)
 * to make the day-7 gap visible in the timeline.
 *
 * The caller is responsible for passing each email step's html through
 * resolveEmailTemplateHtml() before persisting it.
 */
export type LitAudience = "broker" | "forwarder";

export function applyLitMarketingSequenceToBuilder(
  resolveHtml: (raw: string) => string,
  audience: LitAudience = "broker",
): LitBuilderStep[] {
  function uid() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  const sequence =
    audience === "forwarder" ? LIT_MARKETING_FORWARDER_14 : LIT_MARKETING_BROKER_14;
  const out: LitBuilderStep[] = [];

  for (let i = 0; i < sequence.length; i++) {
    const touch = sequence[i];

    // Insert a synthetic wait step between touch 6 (calendarDay 6) and
    // touch 7 (calendarDay 8) to surface the day-7 gap.
    if (touch.touchIndex === 7) {
      out.push({
        localId: uid(),
        kind: "wait",
        subject: "",
        body: "",
        title: "",
        description: "",
        waitDays: 1,
        delayDays: 0,
        delayHours: 0,
        delayMinutes: 0,
        includeSignature: false,
        expanded: false,
      });
    }

    if (touch.kind === "email") {
      out.push({
        localId: uid(),
        kind: "email",
        subject: touch.subject ?? "",
        body: touch.html ? resolveHtml(touch.html) : "",
        title: touch.title,
        description: touch.description ?? "",
        waitDays: 0,
        delayDays: touch.touchIndex === 7 ? 1 : touch.delayDays,
        delayHours: 0,
        delayMinutes: 0,
        includeSignature: true,
        expanded: i === 0,
      });
    } else if (
      touch.kind === "linkedin_invite" ||
      touch.kind === "linkedin_message" ||
      touch.kind === "call"
    ) {
      // For manual touchpoints: title holds the step label, description holds
      // the script so reps can copy-paste it from the inspector.
      out.push({
        localId: uid(),
        kind: touch.kind,
        subject: "",
        body: "",
        title: touch.title,
        description: touch.scriptMarkdown ?? touch.description ?? "",
        waitDays: 0,
        delayDays: touch.delayDays,
        delayHours: 0,
        delayMinutes: 0,
        includeSignature: false,
        expanded: false,
      });
    }
  }

  return out;
}
