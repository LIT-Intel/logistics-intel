// quote-generate-pdf — Phase 1 quoting.
//
// Accepts a client-generated base64 PDF, uploads it to Supabase Storage
// (`company-exports` bucket — same bucket export-company-profile uses),
// signs a 24h URL, persists the path/url/expiry on the quote, meters the
// `export_pdf` quota (best-effort, non-blocking), and logs a
// `pdf_generated` quote event.
//
// PDF generation is a paid feature: the `quoting` server-side gate
// (requireQuotingFeature) is enforced before any work happens. Admin
// bypass is server-side only, inside that helper.
//
// Storage bucket (REQUIRED — not provisioned here): `company-exports`,
// Public OFF (signed URLs only). Created/used by export-company-profile.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";
import { resolveOrg, requireQuotingFeature } from "../_shared/quote_helpers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKET = "company-exports"; // matches export-company-profile (BUCKET_NAME)
const SIGNED_URL_EXPIRY_SECONDS = 86_400; // 24h

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("quote-generate-pdf", { request_id: requestId() });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, svc);
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const userId = u.user.id;

  const orgId = await resolveOrg(admin, userId);
  if (!orgId) return json({ ok: false, code: "NO_ORG" }, 403);
  const gate = await requireQuotingFeature(admin, userId, orgId);
  if (!gate.ok) return json(gate.body, gate.status);

  const body = await req.json().catch(() => ({}));
  const quoteId = body.quote_id;
  if (!quoteId || !body.pdf_base64) return json({ ok: false, code: "INVALID_INPUT", message: "quote_id and pdf_base64 required" }, 400);

  const { data: quote } = await admin.from("lit_quotes").select("id, company_id").eq("id", quoteId).eq("org_id", orgId).maybeSingle();
  if (!quote) return json({ ok: false, code: "NOT_FOUND" }, 404);

  const b64 = String(body.pdf_base64).replace(/^data:.*;base64,/, "");
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
  catch { return json({ ok: false, code: "INVALID_PDF" }, 400); }
  if (bytes.length > 6_000_000) return json({ ok: false, code: "PDF_TOO_LARGE" }, 413);

  const path = `${userId}/${quote.company_id}/quotes/${quoteId}/${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) { log.error("upload_failed", { err: up.error.message }); return json({ ok: false, code: "UPLOAD_FAILED" }, 500); }

  const signed = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (signed.error || !signed.data) { log.error("sign_failed", { err: signed.error?.message }); return json({ ok: false, code: "SIGN_FAILED" }, 500); }

  // meter export_pdf quota — best-effort, must not block the artifact.
  try { await admin.rpc("check_usage_limit", { p_org_id: orgId, p_user_id: userId, p_feature_key: "export_pdf", p_quantity: 1 }); } catch (_) { /* non-blocking */ }

  const { data: quoteUpd, error: updErr } = await admin.from("lit_quotes").update({
    pdf_storage_path: path,
    pdf_signed_url: signed.data.signedUrl,
    pdf_expires_at: new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString(),
    pdf_generated_at: new Date().toISOString(),
  }).eq("id", quoteId).select("pdf_signed_url, pdf_expires_at, pdf_storage_path").single();
  if (updErr) { log.error("persist_failed", { err: updErr.message }); return json({ ok: false, code: "PERSIST_FAILED" }, 500); }

  await admin.from("lit_quote_events").insert({ quote_id: quoteId, org_id: orgId, company_id: quote.company_id, event_type: "pdf_generated", created_by: userId });

  log.info("pdf_generated", { quote_id: quoteId, bytes: bytes.length });
  return json({ ok: true, data: quoteUpd });
});
