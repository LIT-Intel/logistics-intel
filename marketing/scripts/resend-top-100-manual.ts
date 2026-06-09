/**
 * One-off: re-send the "Top 100 active shippers" lead magnet to the user
 * who signed up at 2026-06-09 15:48 UTC and received a broken-link email.
 *
 * Why this exists:
 *   The download URL hard-coded into the marketing pipeline pointed at
 *   /lead-magnets/top-100-shippers.pdf, but the file didn't exist yet.
 *   Amrit001132@gmail.com got the welcome email anyway and the link 404'd.
 *   The PDF is now in marketing/public/lead-magnets/, and this script
 *   delivers it to her without re-running the lead capture or duplicating
 *   any downstream enrollment / Attio fan-out.
 *
 * Send path:
 *   Direct Resend HTTP API call (no template). Uses the same brand voice
 *   as the route's inline-fallback HTML, with an apology line bolted on.
 *
 * Required env:
 *   RESEND_API_KEY
 *
 * Optional env:
 *   RESEND_FROM_EMAIL    (default: "Logistic Intel <hello@logisticintel.com>")
 *   LIT_TOP_100_PDF_URL  (default: https://logisticintel.com/lead-magnets/top-100-shippers.pdf)
 *   TARGET_EMAIL         (default: Amrit001132@gmail.com)
 *
 * Run:
 *   RESEND_API_KEY=re_... npx tsx scripts/resend-top-100-manual.ts
 * Or from marketing/:
 *   RESEND_API_KEY=re_... npm exec tsx scripts/resend-top-100-manual.ts
 */
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "Logistic Intel <hello@logisticintel.com>";

const PDF_URL =
  process.env.LIT_TOP_100_PDF_URL ||
  "https://logisticintel.com/lead-magnets/top-100-shippers.pdf";

const TARGET_EMAIL = process.env.TARGET_EMAIL || "Amrit001132@gmail.com";

function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0] || "there";
  const token = local.split(/[._\-0-9]/)[0] || local;
  if (!token) return "there";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function htmlBody(firstName: string, pdfUrl: string): string {
  const fn = escapeHtml(firstName);
  const url = escapeHtml(pdfUrl);
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0b1220;line-height:1.55;">
  <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;">Quick fix on that download, ${fn}.</h1>
  <p style="font-size:15px;color:#475569;margin:0 0 16px;">Apologies for the earlier broken link. The Top 100 Active U.S. Shippers report is live now, sourced from US customs filings over the last twelve months.</p>
  <p style="font-size:15px;color:#475569;margin:0 0 24px;">Grab it here:</p>
  <a href="${url}" style="display:inline-block;background:#0F172A;color:#00F0FF;font-weight:700;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:8px;">Download the PDF</a>
  <p style="font-size:13px;color:#94a3b8;margin:28px 0 0;">If you want HS codes, decision-maker contacts, and lane activity per shipper, start a free trial at <a href="https://logisticintel.com/signup" style="color:#0F172A;">logisticintel.com/signup</a>.</p>
  <p style="font-size:12px;color:#cbd5e1;margin:20px 0 0;">Victor at Logistic Intel</p>
</body></html>`;
}

function textBody(firstName: string, pdfUrl: string): string {
  return [
    `Quick fix on that download, ${firstName}.`,
    "",
    "Apologies for the earlier broken link. The Top 100 Active U.S. Shippers report is live now, sourced from US customs filings over the last twelve months.",
    "",
    `Grab it here: ${pdfUrl}`,
    "",
    "If you want HS codes, decision-maker contacts, and lane activity per shipper, start a free trial at https://logisticintel.com/signup.",
    "",
    "Victor at Logistic Intel",
  ].join("\n");
}

async function main() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error(
      "[resend-top-100-manual] RESEND_API_KEY is unset — aborting. Pass it inline:\n" +
        "  RESEND_API_KEY=re_... npx tsx scripts/resend-top-100-manual.ts",
    );
    process.exit(1);
  }

  const firstName = firstNameFromEmail(TARGET_EMAIL);
  const payload = {
    from: FROM_EMAIL,
    to: [TARGET_EMAIL],
    subject: "Your Top 100 shippers report (download fixed)",
    html: htmlBody(firstName, PDF_URL),
    text: textBody(firstName, PDF_URL),
  };

  console.log(
    `[resend-top-100-manual] sending to ${TARGET_EMAIL} (first name: ${firstName}, pdf: ${PDF_URL})`,
  );

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await r.text().catch(() => "");
  if (!r.ok) {
    console.error(
      `[resend-top-100-manual] FAILED ${r.status}: ${bodyText.slice(0, 600)}`,
    );
    process.exit(1);
  }
  try {
    const j = JSON.parse(bodyText);
    console.log(`[resend-top-100-manual] OK — message id: ${j?.id ?? "unknown"}`);
  } catch {
    console.log(`[resend-top-100-manual] OK — response: ${bodyText.slice(0, 200)}`);
  }
}

main().catch((e) => {
  console.error("[resend-top-100-manual] threw", e);
  process.exit(1);
});
