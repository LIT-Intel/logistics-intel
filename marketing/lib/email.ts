/**
 * Resend email sender — direct REST call so we don't need the SDK as a
 * dependency. RESEND_API_KEY is set on the lit-marketing Vercel project.
 *
 * Returns { ok: true, id } on success; { ok: false, error } on failure.
 * Failures are logged but don't throw — callers can fan out emails
 * concurrently and tolerate individual sends failing without losing
 * the source-of-truth Sanity write.
 */

export type SendEmailInput = {
  from: string;
  to: string | string[];
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY unset — skipping send");
    return { ok: false, error: "resend_key_unset" };
  }

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("[email] resend non-2xx", r.status, text.slice(0, 400));
      return { ok: false, error: `resend_${r.status}` };
    }

    const j = await r.json().catch(() => ({}));
    return { ok: true, id: j?.id || "unknown" };
  } catch (e: any) {
    console.error("[email] send failed", e?.message || e);
    return { ok: false, error: "send_threw" };
  }
}

/** Trim + escape user-supplied strings for safe inline HTML rendering. */
export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
