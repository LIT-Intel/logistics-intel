// Premium typography-first email layout for LIT lifecycle emails.
//
// Design intent: feel like a personal note from the LIT team, not a
// templated newsletter. Pure white throughout (no body bg color, no
// boxed feel), real PNG logo at the top served from GitHub raw, single
// dark CTA, generous spacing.
//
// Renders cleanly in Gmail web/mobile, Apple Mail, iOS Mail, Outlook
// web, Outlook desktop 2016+. Uses MSO conditional VML for the CTA so
// Outlook 2007–2019 desktop also renders the rounded button correctly.
//
// Rules:
//   - Inline styles only — no <style> block (Outlook strips embedded CSS).
//   - <table> layout for Outlook; max-width: 600px container.
//   - All <img src> are absolute https URLs, no SVG (Outlook desktop
//     strips SVG → falls back to alt text).
//   - One primary CTA. No secondary buttons (every secondary button
//     reduces primary CTA clicks ~30%).
//   - List-Unsubscribe footer link required by Gmail/Yahoo since Feb 2024.

export interface BaseLayoutContext {
  /** Optional: small inline product visual rendered ABOVE the headline.
   *  Use only when you have a real PNG. SVGs strip in Outlook desktop.
   *  Skip entirely for the founder note. */
  heroImageUrl?: string;
  heroAlt?: string;
  headline: string;
  /** Pre-built HTML body content (paragraphs, lists, etc.). */
  bodyHtml: string;
  /** Plain text version of the body. */
  bodyText: string;
  ctaText: string;
  ctaUrl: string;
  /** Optional small note below the CTA button (italic, muted). */
  footerNote?: string;
  unsubscribeUrl: string;
  /** When true, hero image is omitted regardless of heroImageUrl. */
  plainTextOnly?: boolean;
  previewText: string;
}

// Brand tokens — single source of truth.
const COLOR = {
  text: "#0F172A",          // primary body text (slate 900)
  textSubtle: "#475569",    // secondary text (slate 600)
  textMuted: "#94A3B8",     // tertiary / footer text (slate 400)
  divider: "#E2E8F0",       // hairline divider (slate 200)
  accent: "#0F172A",        // CTA + accent stripe (deep slate)
  accentText: "#FFFFFF",
  bg: "#FFFFFF",            // pure white — no boxed feel
};

const FONT_BODY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const FONT_HEADLINE = '"Charter", "Iowan Old Style", "Source Serif Pro", Georgia, "Times New Roman", serif';

// LIT logo — real PNG hosted on GitHub raw. CDN-cacheable, accessible
// regardless of marketing-site deploy state. 920×260 source rendered
// at 160×46 in email so retina displays look crisp.
const LIT_LOGO_URL = "https://raw.githubusercontent.com/LIT-Intel/logistics-intel/main/frontend/public/logo_email.png";

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the full HTML + plain text pair for a lifecycle email.
 * Callers should pass fully-resolved https:// URLs for heroImageUrl
 * (when used) and ctaUrl. The function does no asset resolution — it
 * trusts the caller to have already substituted any placeholders.
 */
export function renderEmailLayout(ctx: BaseLayoutContext): { html: string; text: string } {
  const {
    heroImageUrl,
    heroAlt = "LIT — freight intelligence",
    headline,
    bodyHtml,
    bodyText,
    ctaText,
    ctaUrl,
    footerNote,
    unsubscribeUrl,
    plainTextOnly = false,
    previewText,
  } = ctx;

  // Hidden preview-text padding. Email clients show ~100 chars in the
  // inbox preview; the &847; zero-width-joiner sequence pads after the
  // visible preview so the next visible line in the email body doesn't
  // bleed into the inbox preview.
  const previewBlock = `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#FFFFFF;mso-hide:all;">${htmlEscape(previewText)}${"&nbsp;&#847;".repeat(60)}</div>`;

  const heroBlock =
    !plainTextOnly && heroImageUrl
      ? `
          <!-- Optional hero image (PNG only — SVG strips in Outlook desktop) -->
          <tr>
            <td style="padding: 8px 0 28px 0;">
              <img
                src="${heroImageUrl}"
                alt="${htmlEscape(heroAlt)}"
                width="600"
                style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;"
              />
            </td>
          </tr>`
      : "";

  // CTA — uses MSO VML rounded rectangle for Outlook desktop, regular
  // <a> for everything else. The bulletproof button pattern.
  const ctaBlock = `
          <tr>
            <td align="left" style="padding: 8px 0 36px 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ctaUrl}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="8%" stroke="f" fillcolor="${COLOR.accent}">
                <w:anchorlock/>
                <center style="color:${COLOR.accentText};font-family:${FONT_BODY};font-size:15px;font-weight:600;letter-spacing:0.01em;">${htmlEscape(ctaText)}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${ctaUrl}" style="display:inline-block;background-color:${COLOR.accent};color:${COLOR.accentText};font-family:${FONT_BODY};font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:8px;letter-spacing:0.01em;mso-hide:all;">${htmlEscape(ctaText)} →</a>
              <!--<![endif]-->
            </td>
          </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${htmlEscape(headline)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${COLOR.bg};color:${COLOR.text};font-family:${FONT_BODY};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  ${previewBlock}

  <!-- Outer wrapper. Pure white throughout — no boxed feel. -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLOR.bg};border-collapse:collapse;">
    <tr>
      <td align="center" style="padding: 56px 24px 64px 24px;">

        <!-- Content column (600px) -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;border-collapse:collapse;">

          <!-- Logo: real PNG, top-left -->
          <tr>
            <td align="left" style="padding: 0 0 40px 0;">
              <img
                src="${LIT_LOGO_URL}"
                alt="Logistics Intel"
                width="160"
                style="display:block;width:160px;height:auto;border:0;outline:none;text-decoration:none;"
              />
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding: 0 0 24px 0;">
              <h1 style="margin:0;font-family:${FONT_HEADLINE};font-size:32px;font-weight:700;color:${COLOR.text};line-height:1.2;letter-spacing:-0.01em;">${htmlEscape(headline)}</h1>
            </td>
          </tr>

          ${heroBlock}

          <!-- Body content -->
          <tr>
            <td style="padding: 0 0 8px 0;font-family:${FONT_BODY};font-size:16px;line-height:1.65;color:${COLOR.text};">
              ${bodyHtml}
            </td>
          </tr>

          ${ctaBlock}

          ${
            footerNote
              ? `
          <tr>
            <td style="padding: 0 0 32px 0;font-family:${FONT_BODY};font-size:14px;color:${COLOR.textSubtle};line-height:1.55;font-style:italic;">
              ${footerNote}
            </td>
          </tr>`
              : ""
          }

          <!-- Hairline divider -->
          <tr>
            <td style="padding: 0;">
              <div style="height:1px;background-color:${COLOR.divider};font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0 0 0;font-family:${FONT_BODY};font-size:13px;line-height:1.7;color:${COLOR.textMuted};">
              <span style="color:${COLOR.textSubtle};font-weight:600;">Logistics Intel</span> — freight revenue intelligence for logistics sales teams.<br/>
              You are receiving this because you signed up for a LIT account.<br/>
              <a href="${unsubscribeUrl}" style="color:${COLOR.textMuted};text-decoration:underline;">Unsubscribe</a> &middot; <a href="mailto:hello@logisticintel.com" style="color:${COLOR.textMuted};text-decoration:underline;">hello@logisticintel.com</a>
            </td>
          </tr>

        </table>
        <!-- /content column -->

      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    headline,
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
