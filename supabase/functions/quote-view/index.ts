// quote-view — PUBLIC quote share-link endpoint (digital quoting overhaul).
//
// DEPLOY NOTE: deploy with --no-verify-jwt (public share link, secured by
// unguessable share_token). There is intentionally NO auth gate — this is the
// link recipients hit from their email. The repo has no supabase/config.toml,
// so JWT-disable must be passed at deploy time.
//
// Modes (?token=<uuid> always required):
//   default        -> 302 redirect to the LIVE quote page in the app
//                     (`${APP_BASE}/q/<token>`). Old emails linked here
//                     directly, so this keeps every previously-sent link
//                     working while landing recipients on the live view.
//   &format=json   -> public, sell-side-only JSON payload for the live quote
//                     page (quote, line items, branding, pdf availability).
//                     Stamps the first view: viewed_at (once), status
//                     sent->viewed, and a 'viewed' quote event.
//   &format=pdf    -> re-signs a fresh 1h signed URL for the stored PDF and
//                     302-redirects to it ("Download PDF" on the live page).
//                     Also stamps the first view (a PDF open IS a view).
//
// Data honesty / privacy: the JSON payload NEVER includes cost, margin, or
// benchmark fields — sell-side numbers only, exactly like the customer PDF.
// Secured solely by the unguessable random share_token (uuid).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";

const BUCKET = "company-exports"; // matches quote-generate-pdf
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1h
const APP_BASE = (Deno.env.get("LIT_APP_URL") ?? "https://app.logisticintel.com").replace(/\/+$/, "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const notAvailable = (status = 404) =>
  new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quote unavailable</title></head>` +
      `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:64px 24px;color:#334155;">` +
      `<h1 style="font-size:20px;">Quote not available</h1>` +
      `<p style="color:#64748b;">This quote link is invalid or has expired.</p></body></html>`,
    { status, headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } },
  );

/** Sell-side-only projection of a lit_quotes row. NEVER cost/margin/benchmark. */
function publicQuote(q: Record<string, unknown>) {
  return {
    quote_number: q.quote_number,
    status: q.status,
    mode: q.mode,
    service_type: q.service_type,
    incoterms: q.incoterms,
    origin_port: q.origin_port,
    destination_port: q.destination_port,
    origin_city: q.origin_city,
    origin_state: q.origin_state,
    origin_country: q.origin_country,
    destination_city: q.destination_city,
    destination_state: q.destination_state,
    destination_country: q.destination_country,
    equipment_type: q.equipment_type,
    container_count: q.container_count,
    weight_lbs: q.weight_lbs,
    volume_cbm: q.volume_cbm,
    pallet_count: q.pallet_count,
    commodity: q.commodity,
    hs_code: q.hs_code,
    currency: q.currency,
    fuel_surcharge_pct: q.fuel_surcharge_pct,
    fuel_surcharge_amount: q.fuel_surcharge_amount,
    subtotal_sell: q.subtotal_sell,
    accessorial_total: q.accessorial_total,
    total_sell: q.total_sell,
    valid_until: q.valid_until,
    terms_text: q.terms_text,
    notes: q.notes,
    sent_at: q.sent_at,
    created_at: q.created_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "GET") return notAvailable(405);
  const log = createLogger("quote-view", { request_id: requestId() });

  const reqUrl = new URL(req.url);
  const token = reqUrl.searchParams.get("token");
  const format = reqUrl.searchParams.get("format"); // null | "json" | "pdf"
  if (!token) return format === "json" ? json({ ok: false, code: "INVALID_TOKEN" }, 400) : notAvailable(400);
  // share_token is a uuid; reject non-uuid input before the query to avoid a
  // noisy Postgres cast error (and surface the same 404 the recipient sees).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return format === "json" ? json({ ok: false, code: "NOT_FOUND" }, 404) : notAvailable(404);
  }

  // Default mode: old-email compatibility + the canonical email CTA target.
  // No DB read needed — the live page's JSON fetch does the view stamping.
  if (format !== "json" && format !== "pdf") {
    return new Response(null, {
      status: 302,
      headers: { ...cors, Location: `${APP_BASE}/q/${token}`, "Cache-Control": "no-store" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, svc);

  const { data: quote } = await admin
    .from("lit_quotes")
    .select("*")
    .eq("share_token", token)
    .maybeSingle();
  if (!quote) return format === "json" ? json({ ok: false, code: "NOT_FOUND" }, 404) : notAvailable(404);

  // First-view tracking. viewed_at is stamped exactly once; the status flip
  // sent->viewed also happens exactly once and never downgrades approved/
  // closed_won/closed_lost/expired. The 'viewed' event fires only on the
  // first open so repeat opens don't spam the timeline.
  const firstView = !quote.viewed_at;
  if (firstView || quote.status === "sent") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (firstView) patch.viewed_at = new Date().toISOString();
    if (quote.status === "sent") patch.status = "viewed";
    await admin.from("lit_quotes").update(patch).eq("id", quote.id);
    if (firstView) {
      await admin.from("lit_quote_events").insert({
        quote_id: quote.id,
        org_id: quote.org_id,
        company_id: quote.company_id,
        event_type: "viewed",
      });
      log.info("quote_viewed_first", { quote_id: quote.id, format });
    }
  }

  // ── PDF mode: sign + redirect (secondary "Download PDF" action) ──────────
  if (format === "pdf") {
    if (!quote.pdf_storage_path) return notAvailable(404);
    const signed = await admin.storage
      .from(BUCKET)
      .createSignedUrl(quote.pdf_storage_path, SIGNED_URL_EXPIRY_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      log.error("sign_failed", { err: signed.error?.message, quote_id: quote.id });
      return notAvailable(404);
    }
    return new Response(null, {
      status: 302,
      headers: { ...cors, Location: signed.data.signedUrl, "Cache-Control": "no-store" },
    });
  }

  // ── JSON mode: payload for the live quote page ───────────────────────────
  const [{ data: items }, { data: company }, { data: org }, { data: os }] = await Promise.all([
    admin
      .from("lit_quote_line_items")
      .select("name, description, unit, quantity, unit_sell, is_accessorial, sort_order")
      .eq("quote_id", quote.id)
      .order("sort_order", { ascending: true }),
    admin.from("lit_companies").select("name").eq("id", quote.company_id).maybeSingle(),
    admin.from("organizations").select("name, logo_url").eq("id", quote.org_id).maybeSingle(),
    admin.from("org_settings").select("quote_defaults").eq("org_id", quote.org_id).maybeSingle(),
  ]);

  const s = (os?.quote_defaults ?? {}) as Record<string, unknown>;
  const branding = {
    company_name: (s.company_name as string) || org?.name || null,
    company_address: (s.company_address as string) || null,
    company_email: (s.company_email as string) || null,
    company_phone: (s.company_phone as string) || null,
    logo_url: (s.logo_url as string) || org?.logo_url || null,
    prepared_by: (s.prepared_by as string) || null,
    signature_name: (s.signature_name as string) || null,
    default_payment_terms: (s.default_payment_terms as string) || null,
    terms_text: (s.terms_text as string) || null,
  };

  return json({
    ok: true,
    data: {
      quote: publicQuote(quote),
      line_items: items ?? [],
      company_name: company?.name ?? null,
      branding,
      pdf_available: Boolean(quote.pdf_storage_path),
      pdf_url: quote.pdf_storage_path
        ? `${url}/functions/v1/quote-view?token=${token}&format=pdf`
        : null,
    },
  });
});
