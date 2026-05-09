// v7 email layout for LIT lifecycle emails.
// Synced with deployed send-subscription-email v7 edge function.
//
// Design: slate-100 page bg (#F1F5F9), white card (600px, 18px radius,
// 2-layer box-shadow), dark slate hero band (#0A1024) with LIT icon +
// "Logistic Intel" wordmark, bold sans-serif headline, brand blue CTA
// (#2563EB) with 2px #1E40AF bottom border.
//
// Rules:
//   - Inline styles only — no <style> block (Outlook strips embedded CSS).
//   - <table> layout for all email clients; max-width: 600px container.
//   - All <img src> are absolute https:// PNG URLs (SVG strips in Outlook).
//   - Bulletproof CTA: bgcolor on the wrapping <td>, NO MSO conditional
//     comments (they aren't needed with table-based CTA layout).
//   - No heroImageUrl slot — the dark header band replaces it.
//   - plainTextOnly suppresses the dark hero band and shows the LIT icon
//     inline at the top (used for the founder note).
//   - footerNote is kept for backward compat but rendered inside the card.
//   - List-Unsubscribe footer link required by Gmail/Yahoo since Feb 2024.

export interface BaseLayoutContext {
  headline: string;
  /** Optional subtitle line below the h1 (slate-600, 18px). */
  subtitle?: string;
  /** Pre-built HTML body content (paragraphs, lists, Pro Tip cards). */
  bodyHtml: string;
  /** Plain text version of the body. */
  bodyText: string;
  ctaText: string;
  ctaUrl: string;
  /** Optional small note below the CTA button (italic, muted). Kept for
   *  backward compat with older templates — rendered as italic footer text. */
  footerNote?: string;
  unsubscribeUrl: string;
  /** When false, suppresses the dark hero band and renders a plain icon
   *  at top-left instead (used for the founder note). Default: true. */
  showHeroBanner?: boolean;
  /** @deprecated — kept for compat. Pass showHeroBanner: false instead. */
  plainTextOnly?: boolean;
  previewText: string;
  /** @deprecated — kept for compat. Hero image is now the dark header band;
   *  this param is accepted but not rendered. */
  heroImageUrl?: string;
  /** @deprecated — kept for compat. Not rendered. */
  heroAlt?: string;
}

// Brand tokens — single source of truth. Matches deployed v7 edge fn.
const COLOR = {
  text: "#0F172A",          // primary body text (slate 900)
  textSubtle: "#475569",    // secondary text (slate 600)
  textMuted: "#94A3B8",     // tertiary / footer text (slate 400)
  divider: "#E2E8F0",       // hairline divider (slate 200)
  ctaBg: "#2563EB",         // brand blue CTA
  ctaBgDark: "#1E40AF",     // CTA bottom-border (depth)
  ctaText: "#FFFFFF",
  bg: "#FFFFFF",            // card background
  pageBg: "#F1F5F9",        // outer page background (slate 100)
  heroBg: "#0A1024",        // dark hero band (slate 950)
};

const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// LIT icon — real 256×256 PNG, CDN-cached from GitHub raw.
const LIT_ICON_URL = "https://raw.githubusercontent.com/LIT-Intel/logistics-intel/main/frontend/public/icon_256.png";

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the full HTML + plain text pair for a lifecycle email.
 * Callers pass the resolved headline, body, CTA, and unsubscribe URL.
 * The function does no asset resolution — it trusts the caller.
 */
export function renderEmailLayout(ctx: BaseLayoutContext): { html: string; text: string } {
  const {
    headline,
    subtitle,
    bodyHtml,
    bodyText,
    ctaText,
    ctaUrl,
    footerNote,
    unsubscribeUrl,
    previewText,
  } = ctx;

  // showHeroBanner defaults true; plainTextOnly (deprecated) maps to false.
  const showBanner = ctx.showHeroBanner !== false && !ctx.plainTextOnly;

  const previewBlock = `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#FFFFFF;mso-hide:all;">${htmlEscape(previewText)}${"&nbsp;&#847;".repeat(60)}</div>`;

  const heroBlock = showBanner
    ? `<tr><td bgcolor="${COLOR.heroBg}" style="background-color:${COLOR.heroBg};padding:32px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td valign="middle" style="padding-right:14px;"><img src="${LIT_ICON_URL}" width="40" height="40" alt="LIT" style="display:block;width:40px;height:40px;border-radius:9px;border:0;outline:none;" /></td><td valign="middle" style="font-family:${FONT_BODY};font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;line-height:1;">Logistic Intel</td></tr></table></td></tr>`
    : `<tr><td style="padding:36px 40px 0 40px;"><img src="${LIT_ICON_URL}" alt="LIT" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:10px;border:0;outline:none;" /></td></tr>`;

  const subtitleBlock = subtitle
    ? `<p style="margin:0;font-family:${FONT_BODY};font-size:18px;font-weight:500;line-height:1.4;color:${COLOR.textSubtle};text-align:left;">${htmlEscape(subtitle)}</p>`
    : "";

  // CTA — table-based bulletproof button. bgcolor on the <td> so
  // Outlook renders the background even without VML. No MSO conditional
  // comments needed with this approach.
  const ctaBlock = `<tr><td style="padding:8px 40px 36px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="${COLOR.ctaBg}" valign="middle" style="background-color:${COLOR.ctaBg};border-radius:10px;mso-padding-alt:16px 32px;border-bottom:2px solid ${COLOR.ctaBgDark};"><a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:16px 32px;font-family:${FONT_BODY};font-size:16px;font-weight:600;color:${COLOR.ctaText};text-decoration:none;border-radius:10px;letter-spacing:0.01em;line-height:1;">${htmlEscape(ctaText)} →</a></td></tr></table></td></tr>`;

  const footerNoteBlock = footerNote
    ? `<tr><td style="padding:0 40px 24px 40px;font-family:${FONT_BODY};font-size:14px;color:${COLOR.textSubtle};line-height:1.55;font-style:italic;">${footerNote}</td></tr>`
    : "";

  const html = `<!DOCTYPE html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="X-UA-Compatible" content="IE=edge" /><meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light only" /><title>${htmlEscape(headline)}</title><!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]--></head><body style="margin:0;padding:0;background-color:${COLOR.pageBg};color:${COLOR.text};font-family:${FONT_BODY};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">${previewBlock}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLOR.pageBg}" style="background-color:${COLOR.pageBg};border-collapse:collapse;"><tr><td align="center" valign="top" style="padding:40px 16px 56px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="${COLOR.bg}" style="max-width:600px;width:100%;background-color:${COLOR.bg};border-radius:18px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);">${heroBlock}<tr><td style="padding:36px 40px 4px 40px;"><h1 style="margin:0 0 8px 0;font-family:${FONT_BODY};font-size:30px;font-weight:800;color:${COLOR.text};line-height:1.18;letter-spacing:-0.02em;text-align:left;">${htmlEscape(headline)}</h1>${subtitleBlock}</td></tr><tr><td style="padding:24px 40px 8px 40px;font-family:${FONT_BODY};font-size:16px;line-height:1.65;color:${COLOR.text};text-align:left;">${bodyHtml}</td></tr>${ctaBlock}${footerNoteBlock}<tr><td style="padding:0 40px;"><div style="height:1px;background-color:${COLOR.divider};font-size:0;line-height:0;">&nbsp;</div></td></tr><tr><td style="padding:24px 40px 32px 40px;font-family:${FONT_BODY};font-size:13px;line-height:1.7;color:${COLOR.textMuted};text-align:left;"><span style="color:${COLOR.textSubtle};font-weight:600;">Logistics Intel</span> — freight revenue intelligence for logistics sales teams.<br/>You are receiving this because you signed up for a LIT account.<br/><a href="${unsubscribeUrl}" style="color:${COLOR.textMuted};text-decoration:underline;">Unsubscribe</a> &middot; <a href="mailto:hello@logisticintel.com" style="color:${COLOR.textMuted};text-decoration:underline;">hello@logisticintel.com</a></td></tr></table></td></tr></table></body></html>`;

  const text = [
    headline,
    subtitle ?? "",
    "",
    bodyText,
    "",
    `${ctaText}: ${ctaUrl}`,
    "",
    footerNote ? footerNote.replace(/<[^>]+>/g, "").trim() : "",
    "—",
    "Logistics Intel — freight revenue intelligence for logistics sales teams.",
    "Questions? Reply to this email.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();

  return { html, text };
}
