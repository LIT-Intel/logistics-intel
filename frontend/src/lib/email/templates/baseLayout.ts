// Base email layout for LIT lifecycle emails.
//
// Produces a { html, text } tuple from a structured context object.
// Rules:
//   - Inline styles only — no <style> block (Outlook strips embedded CSS).
//   - Outlook-safe <table> layout, 600px max-width.
//   - Hero image rendered at 600×315 from a 1200×630 source.
//   - plainTextOnly skips the hero entirely (used for founder note).

export interface BaseLayoutContext {
  heroImageUrl?: string;
  heroAlt?: string;
  headline: string;
  /** Pre-built HTML body content (paragraphs, lists, etc.). */
  bodyHtml: string;
  /** Plain text version of the body. */
  bodyText: string;
  ctaText: string;
  ctaUrl: string;
  /** Optional small note below the CTA button. */
  footerNote?: string;
  unsubscribeUrl: string;
  /** When true the hero image block is omitted. Used for the founder note. */
  plainTextOnly?: boolean;
  previewText: string;
}

// Color tokens
const COLOR = {
  bg: "#F8FAFC",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#475569",
  accent: "#2563EB",
  border: "#E5E7EB",
  button: "#0F172A",
  buttonText: "#FFFFFF",
};

const FONT_BODY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const FONT_HEADLINE = "Georgia, serif";

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the full HTML + plain text pair for a lifecycle email.
 * Callers should pass fully-resolved https:// URLs for heroImageUrl and ctaUrl.
 */
export function renderEmailLayout(ctx: BaseLayoutContext): { html: string; text: string } {
  const {
    heroImageUrl,
    heroAlt = "LIT — Logistics Intelligence",
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

  // Preview text is hidden but renders in inbox previews
  const previewBlock = `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLOR.bg};">${htmlEscape(previewText)}${"&nbsp;&#847;".repeat(60)}</div>`;

  const heroBlock =
    !plainTextOnly && heroImageUrl
      ? `
      <!-- Hero image -->
      <tr>
        <td align="center" style="padding: 0 32px 24px 32px;">
          <img
            src="${heroImageUrl}"
            alt="${htmlEscape(heroAlt)}"
            width="536"
            height="268"
            style="display:block;width:100%;max-width:536px;height:auto;border-radius:12px;border:1px solid ${COLOR.border};"
          />
        </td>
      </tr>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
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
<body style="margin:0;padding:0;background-color:${COLOR.bg};font-family:${FONT_BODY};">
  ${previewBlock}

  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${COLOR.bg};border-collapse:collapse;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <!-- Email card (600px) -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background-color:${COLOR.card};border-radius:16px;border:1px solid ${COLOR.border};border-collapse:collapse;overflow:hidden;">

          <!-- Top accent bar -->
          <tr>
            <td height="4" style="background-color:${COLOR.accent};font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Logo row -->
          <tr>
            <td align="left" style="padding: 28px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td style="background-color:${COLOR.button};border-radius:8px;padding:6px 12px;">
                    <span style="color:#FFFFFF;font-family:${FONT_BODY};font-size:13px;font-weight:700;letter-spacing:0.04em;">LIT</span>
                  </td>
                  <td style="padding-left:8px;">
                    <span style="color:${COLOR.muted};font-family:${FONT_BODY};font-size:12px;">Logistics Intel</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding: 24px 32px 20px 32px;">
              <h1 style="margin:0;font-family:${FONT_HEADLINE};font-size:26px;font-weight:700;color:${COLOR.text};line-height:1.3;">${headline}</h1>
            </td>
          </tr>

          ${heroBlock}

          <!-- Body content -->
          <tr>
            <td style="padding: 0 32px 28px 32px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${COLOR.text};">
              ${bodyHtml}
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td align="left" style="padding: 0 32px 32px 32px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ctaUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="8%" stroke="f" fillcolor="${COLOR.button}">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:${FONT_BODY};font-size:15px;font-weight:700;">${htmlEscape(ctaText)}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${ctaUrl}" style="display:inline-block;background-color:${COLOR.button};color:${COLOR.buttonText};font-family:${FONT_BODY};font-size:15px;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:8px;letter-spacing:0.01em;">${htmlEscape(ctaText)}</a>
              <!--<![endif]-->
            </td>
          </tr>

          ${
            footerNote
              ? `
          <!-- Footer note -->
          <tr>
            <td style="padding: 0 32px 28px 32px;font-family:${FONT_BODY};font-size:13px;color:${COLOR.muted};line-height:1.5;">
              ${footerNote}
            </td>
          </tr>`
              : ""
          }

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <hr style="border:none;border-top:1px solid ${COLOR.border};margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px 28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="font-family:${FONT_BODY};font-size:12px;color:${COLOR.muted};line-height:1.6;">
                    <strong style="color:${COLOR.text};">Logistics Intel / LIT</strong><br/>
                    You are receiving this because you signed up for a LIT account.<br/>
                    Questions? Reply to this email — we read every one.<br/>
                    <a href="${unsubscribeUrl}" style="color:${COLOR.muted};text-decoration:underline;">Unsubscribe</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /email card -->

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
    footerNote ? footerNote.replace(/<[^>]+>/g, "").trim() + "\n" : "",
    "---",
    "Logistics Intel / LIT",
    "Questions? Reply to this email.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text };
}
