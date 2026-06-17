// email-pulse-report — Authenticated POST.
//
// Emails a Pulse Explorer report (PDF) to a recipient via Resend. The
// PDF is generated client-side (jsPDF) and posted to this function as
// base64. We don't store the PDF; we forward it once and return.
//
// Body:
//   {
//     recipient: string,                       // valid email
//     subject?: string,                        // default fills in
//     question: string,                        // the user's Q to the coach
//     answerMd: string,                        // coach's markdown reply
//     pdfBase64: string,                       // base64-encoded PDF bytes
//     filename?: string,                       // default "pulse-report.pdf"
//   }
//
// Success: { ok: true, message_id }
// Failure: { ok: false, error: string }       // status 4xx / 502
//
// Env vars (required):
//   LIT_RESEND_API_KEY  — Resend API key
//   LIT_RESEND_FROM_EMAIL OR RESEND_FROM_EMAIL — From address (falls back
//     to "LIT Pulse <hello@updates.logisticintel.com>")
//   SUPABASE_URL, SUPABASE_ANON_KEY            — JWT verification

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PDF_BYTES = 6_000_000; // ~6 MB after base64 decode; Resend caps at ~40MB total

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tiny markdown → safe HTML pass for the email body preview.
function renderMarkdownToHtml(md: string): string {
  const safe = escapeHtml(md);
  return safe
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n- /g, "\n• ")
    .replace(/\n/g, "<br/>");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const resendKey = Deno.env.get("LIT_RESEND_API_KEY");
  const fromAddr =
    Deno.env.get("LIT_RESEND_FROM_EMAIL") ||
    Deno.env.get("RESEND_FROM_EMAIL") ||
    "LIT Pulse <hello@updates.logisticintel.com>";

  if (!supabaseUrl || !supabaseAnonKey) return json({ error: "server_misconfigured" }, 500);
  if (!resendKey) return json({ error: "resend_api_key_missing" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const recipient = String(body.recipient || "").trim();
  if (!EMAIL_RE.test(recipient)) return json({ error: "invalid_recipient" }, 400);

  const question = String(body.question || "").slice(0, 2000);
  const answerMd = String(body.answerMd || "").slice(0, 20000);
  const pdfBase64Raw = String(body.pdfBase64 || "");
  if (!pdfBase64Raw) return json({ error: "missing_pdf" }, 400);

  // Strip optional data URL prefix and validate size.
  const pdfBase64 = pdfBase64Raw.includes(",")
    ? pdfBase64Raw.slice(pdfBase64Raw.indexOf(",") + 1)
    : pdfBase64Raw;
  const approxBytes = Math.floor((pdfBase64.length * 3) / 4);
  if (approxBytes > MAX_PDF_BYTES) return json({ error: "pdf_too_large" }, 413);

  const filename = String(body.filename || "pulse-report.pdf").replace(/[^a-zA-Z0-9._-]/g, "_") || "pulse-report.pdf";
  const subject = String(
    body.subject || `LIT Pulse report — ${question ? question.slice(0, 80) : "your map view"}`,
  );

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:#0891b2;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-size:18px;font-weight:600;">
        LIT Pulse Explorer Report
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:20px;">
        <p style="margin:0 0 12px 0;font-size:14px;color:#475569;">
          ${escapeHtml(user.email ?? "A LIT user")} generated a Pulse Explorer report and shared it with you.
        </p>
        ${question ? `<div style="margin:16px 0;padding:12px 14px;background:#f8fafc;border-left:3px solid #0891b2;font-size:13px;"><strong>Question:</strong><br/>${escapeHtml(question)}</div>` : ""}
        ${answerMd ? `<div style="font-size:13px;line-height:1.55;color:#1e293b;margin:12px 0 16px;">${renderMarkdownToHtml(answerMd)}</div>` : ""}
        <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">
          Full report attached as <strong>${escapeHtml(filename)}</strong>.
        </p>
      </div>
    </div>
  `;

  const payload = {
    from: fromAddr,
    to: [recipient],
    reply_to: user.email ?? undefined,
    subject,
    html,
    attachments: [{ filename, content: pdfBase64 }],
  };

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const respJson: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = String(respJson?.message || respJson?.name || respJson?.error || resp.statusText).slice(0, 500);
      console.warn("[email-pulse-report] resend send failed", resp.status, msg);
      return json({ ok: false, error: msg || "resend_failed" }, 502);
    }
    return json({ ok: true, message_id: respJson?.id ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email-pulse-report] threw", msg);
    return json({ ok: false, error: msg.slice(0, 500) }, 502);
  }
});
