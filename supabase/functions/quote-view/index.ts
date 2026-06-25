// quote-view — PUBLIC quote share-link tracker (Phase 1 quoting).
//
// DEPLOY NOTE: deploy with --no-verify-jwt (public share link, secured by
// unguessable share_token). There is intentionally NO auth gate — this is the
// link recipients click in their email. The repo has no supabase/config.toml,
// so JWT-disable must be passed at deploy time.
//
// Flow:
//   1. Validate ?token= against lit_quotes.share_token (service-role read).
//   2. On first view (status === 'sent'): flip status -> 'viewed' and log a
//      'viewed' event. Already-viewed / approved / won / lost are untouched.
//   3. Re-sign a fresh 1h signed URL for the stored PDF and 302-redirect to it.
//
// Secured solely by the unguessable random share_token (uuid). No PII is
// returned in the response body; the only output is a redirect to a signed
// (time-limited) PDF URL or a minimal 404 HTML page.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";

const BUCKET = "company-exports"; // matches quote-generate-pdf
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1h

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const notAvailable = (status = 404) =>
  new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quote unavailable</title></head>` +
      `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:64px 24px;color:#334155;">` +
      `<h1 style="font-size:20px;">Quote not available</h1>` +
      `<p style="color:#64748b;">This quote link is invalid or has expired.</p></body></html>`,
    { status, headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "GET") return notAvailable(405);
  const log = createLogger("quote-view", { request_id: requestId() });

  const token = new URL(req.url).searchParams.get("token");
  if (!token) return notAvailable(400);

  const url = Deno.env.get("SUPABASE_URL")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, svc);

  const { data: quote } = await admin
    .from("lit_quotes")
    .select("id, org_id, company_id, status, share_token, pdf_storage_path, pdf_expires_at")
    .eq("share_token", token)
    .maybeSingle();
  if (!quote) return notAvailable(404);

  // First-view tracking: flip sent -> viewed exactly once. viewed/approved/
  // closed_won/closed_lost/expired are terminal-ish for this signal and must
  // not be downgraded or re-logged.
  if (quote.status === "sent") {
    await admin
      .from("lit_quotes")
      .update({ status: "viewed", updated_at: new Date().toISOString() })
      .eq("id", quote.id);
    await admin.from("lit_quote_events").insert({
      quote_id: quote.id,
      org_id: quote.org_id,
      company_id: quote.company_id,
      event_type: "viewed",
    });
    log.info("quote_viewed_first", { quote_id: quote.id });
  }

  if (!quote.pdf_storage_path) return notAvailable(404);

  const signed = await admin.storage.from(BUCKET).createSignedUrl(quote.pdf_storage_path, SIGNED_URL_EXPIRY_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    log.error("sign_failed", { err: signed.error?.message, quote_id: quote.id });
    return notAvailable(404);
  }

  return new Response(null, {
    status: 302,
    headers: { ...cors, Location: signed.data.signedUrl, "Cache-Control": "no-store" },
  });
});
