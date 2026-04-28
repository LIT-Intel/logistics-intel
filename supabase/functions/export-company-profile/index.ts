// Phase B.14 — Export Company Profile Edge Function.
//
// Renders a branded HTML company profile and uploads it to Supabase Storage
// (`company-exports` bucket, signed URL, 24h expiry). PDF generation is
// honestly out-of-scope: Deno Edge Functions cannot run a headless Chromium,
// so format=\"pdf\" returns PDF_NOT_AVAILABLE alongside an HTML fallback URL
// so the UI can still complete the action.
//
// Storage bucket setup (REQUIRED — not provisioned by this function):
//   - In Supabase Studio → Storage → New bucket
//   - Name: company-exports
//   - Public: OFF (signed URLs only)
//   - Suggested RLS: authenticated SELECT for own folder; INSERT via
//     service role only (this function uses the service-role client so
//     INSERT does not need a user policy).

import { createClient } from "npm:@supabase/supabase-js@2";

// Phase B.15 — helpers inlined from _shared/companyBriefHelpers.ts so
// `supabase functions deploy <name>` doesn't fail on missing _shared
// bundle. Keep in sync with the canonical _shared file when changes
// are made.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, apikey",
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumberOrDash(
  value: number | null | undefined,
  options: { keepZero?: boolean } = {},
): string {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  if (num === 0 && !options.keepZero) return "—";
  return Math.round(num).toLocaleString();
}

function formatCurrencyOrDash(value: number | null | undefined): string {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "—";
  return `$${Math.round(num).toLocaleString()}`;
}

function formatDateOrDash(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

// ---------------------------------------------------------------------------
// End of inlined helpers — original imports below have been removed.
// ---------------------------------------------------------------------------

const BUCKET_NAME = "company-exports";
const SIGNED_URL_EXPIRY_SECONDS = 86_400; // 24 hours

interface ExportRequest {
  company_id?: string | null;
  source_company_key?: string | null;
  format?: string;
  include_pulse_brief?: boolean;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  country_code: string | null;
  city: string | null;
  state: string | null;
  shipments_12m: number | null;
  teu_12m: number | null;
  est_spend_12m: number | null;
  most_recent_shipment_date: string | null;
  top_route_12m: string | null;
  recent_route: string | null;
}

interface SavedRow {
  gemini_brief: Record<string, unknown> | null;
  gemini_brief_updated_at: string | null;
}

function renderBriefSection(
  title: string,
  text: unknown,
): string {
  if (typeof text !== "string" || !text.trim()) return "";
  return `
    <section class="brief-section">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </section>
  `;
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function renderSourcesList(sources: unknown): string {
  if (!Array.isArray(sources) || !sources.length) return "";
  // Phase B.16 — render up to 5 sources, surfacing domain hint instead
  // of the full URL in the visible label so we never accidentally expose
  // internal search-provider URLs to the reader. Click target stays the
  // real URL.
  const items = sources
    .slice(0, 5)
    .filter(
      (s) =>
        s &&
        typeof s === "object" &&
        typeof (s as any).url === "string",
    )
    .map((s) => {
      const src = s as { title?: string; url: string; snippet?: string };
      const title = src.title || extractDomain(src.url);
      const domainHint = `<span class="meta"> · ${escapeHtml(extractDomain(src.url))}</span>`;
      return `<li><a href="${escapeHtml(src.url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>${domainHint}</li>`;
    })
    .join("");
  if (!items) return "";
  return `
    <section class="brief-section">
      <h3>Sources</h3>
      <ul class="sources">${items}</ul>
    </section>
  `;
}

function renderHtml(
  company: CompanyRow,
  saved: SavedRow | null,
  includeBrief: boolean,
): string {
  const generatedAt = new Date().toISOString();
  const location = [company.city, company.state, company.country_code]
    .filter(Boolean)
    .join(", ");

  const brief = includeBrief && saved?.gemini_brief
    ? (saved.gemini_brief as Record<string, unknown>)
    : null;

  const briefBlock = brief
    ? `
      <section class="card brief">
        <header class="card-header">
          <h2>Pulse Brief</h2>
          ${
            saved?.gemini_brief_updated_at
              ? `<span class="meta">Generated ${escapeHtml(
                  saved.gemini_brief_updated_at.slice(0, 10),
                )}</span>`
              : ""
          }
        </header>
        ${renderBriefSection("Executive Summary", brief.executive_summary)}
        ${renderBriefSection("Company Context", brief.company_context)}
        ${renderBriefSection("Shipment Signal", brief.shipment_signal)}
        ${renderBriefSection("Public Web Context", brief.public_web_context)}
        ${renderBriefSection("Recent Signals", brief.recent_signals)}
        ${renderBriefSection("Opportunity Angle", brief.opportunity_angle)}
        ${renderBriefSection("Suggested Outreach Angle", brief.suggested_outreach_angle)}
        ${renderBriefSection("Risks / Watchouts", brief.risks_watchouts)}
        ${renderSourcesList(brief.sources)}
      </section>
    `
    : includeBrief
      ? `
      <section class="card brief-empty">
        <p>No Pulse brief is cached for this company yet. Open the company in Logistics Intel and click <strong>Pulse</strong> to generate one, then re-export.</p>
      </section>
    `
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(company.name)} — Company Profile</title>
<style>
  :root {
    color-scheme: light;
    --bg: #f8fafc;
    --surface: #ffffff;
    --ink: #0f172a;
    --muted: #475569;
    --line: #e2e8f0;
    --accent: #4f46e5;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--ink); }
  body {
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
    line-height: 1.5;
    padding: 32px 16px 48px;
  }
  .wrap { max-width: 880px; margin: 0 auto; }
  .hero {
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #0b132d 100%);
    color: #f8fafc;
    border-radius: 20px;
    padding: 28px;
    margin-bottom: 20px;
  }
  .hero .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 11px;
    color: #c7d2fe;
    margin-bottom: 8px;
  }
  .hero h1 { font-size: 30px; margin: 0 0 8px; letter-spacing: -0.02em; }
  .hero .meta { color: #cbd5f5; font-size: 14px; }
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 20px 24px;
    margin-bottom: 16px;
  }
  .card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .card-header h2 { margin: 0; font-size: 18px; letter-spacing: -0.01em; }
  .card-header .meta { color: var(--muted); font-size: 12px; }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
  }
  .kpi {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px 14px;
    background: #f8fafc;
  }
  .kpi .label {
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 10px;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .kpi .value {
    font-size: 18px;
    font-weight: 600;
    color: var(--ink);
  }
  dl.detail {
    display: grid;
    grid-template-columns: 160px 1fr;
    row-gap: 8px;
    column-gap: 12px;
    margin: 0;
  }
  dl.detail dt { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; }
  dl.detail dd { margin: 0; font-size: 14px; }
  .brief-section { margin-top: 14px; }
  .brief-section h3 { font-size: 14px; margin: 0 0 4px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.14em; }
  .brief-section p { margin: 0; font-size: 14px; color: var(--ink); white-space: pre-wrap; }
  ul.sources { margin: 0; padding-left: 18px; font-size: 14px; }
  ul.sources li { margin-bottom: 8px; }
  ul.sources a { color: var(--accent); text-decoration: none; }
  ul.sources .snippet { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .brief-empty { color: var(--muted); }
  footer { color: var(--muted); font-size: 12px; text-align: center; margin-top: 24px; }
</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div class="eyebrow">Logistics Intel — Company Profile</div>
      <h1>${escapeHtml(company.name)}</h1>
      <div class="meta">
        ${[location, company.domain].filter(Boolean).map(escapeHtml).join(" · ")}
      </div>
    </header>

    <section class="card">
      <div class="card-header">
        <h2>Snapshot KPIs (Last 12 Months)</h2>
      </div>
      <div class="kpi-grid">
        <div class="kpi">
          <div class="label">Shipments</div>
          <div class="value">${escapeHtml(formatNumberOrDash(company.shipments_12m, { keepZero: true }))}</div>
        </div>
        <div class="kpi">
          <div class="label">TEU</div>
          <div class="value">${escapeHtml(formatNumberOrDash(company.teu_12m))}</div>
        </div>
        <div class="kpi">
          <div class="label">Est. Spend</div>
          <div class="value">${escapeHtml(formatCurrencyOrDash(company.est_spend_12m))}</div>
        </div>
        <div class="kpi">
          <div class="label">Latest Shipment</div>
          <div class="value">${escapeHtml(formatDateOrDash(company.most_recent_shipment_date))}</div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-header"><h2>Lane &amp; Routing</h2></div>
      <dl class="detail">
        <dt>Top lane (12M)</dt>
        <dd>${escapeHtml(company.top_route_12m || "—")}</dd>
        <dt>Most recent lane</dt>
        <dd>${escapeHtml(company.recent_route || "—")}</dd>
        <dt>Domain</dt>
        <dd>${escapeHtml(company.domain || company.website || "—")}</dd>
        <dt>Country</dt>
        <dd>${escapeHtml(company.country_code || "—")}</dd>
      </dl>
    </section>

    ${briefBlock}

    <footer>Generated by Logistics Intel — ${escapeHtml(generatedAt)}</footer>
  </div>
</body>
</html>`;
}

async function bucketExists(
  storage: ReturnType<ReturnType<typeof createClient>["storage"]["from"]> extends infer _ ? any : never,
  client: ReturnType<typeof createClient>,
): Promise<boolean> {
  try {
    const { data, error } = await client.storage.getBucket(BUCKET_NAME);
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    // Phase B.16 — return 200 so the frontend can read the body's
    // `code` field instead of seeing a generic non-2xx throw from
    // supabase.functions.invoke.
    return jsonResponse(200, {
      ok: false,
      code: "SUPABASE_NOT_CONFIGURED",
      error:
        "Export service is missing core configuration. Contact support.",
    });
  }

  // ---- Auth ----------------------------------------------------------------
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse(401, {
      ok: false,
      code: "UNAUTHORIZED",
      error: "Missing or invalid authorization header.",
    });
  }
  const token = authHeader.slice("bearer ".length).trim();

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return jsonResponse(401, {
      ok: false,
      code: "UNAUTHORIZED",
      error: "Invalid Supabase auth token.",
    });
  }
  const user = userData.user;

  // Service-role client is needed to (a) read lit_companies bypassing RLS
  // for the canonical fields we render, and (b) write to Storage.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Body ----------------------------------------------------------------
  let body: ExportRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(200, {
      ok: false,
      code: "INVALID_INPUT",
      error: "Body must be valid JSON.",
    });
  }

  const format = body.format === "pdf" ? "pdf" : body.format === "html" ? "html" : null;
  if (!format) {
    return jsonResponse(200, {
      ok: false,
      code: "INVALID_INPUT",
      error: 'format must be "html" or "pdf".',
    });
  }
  const companyId = isUuid(body.company_id) ? body.company_id : null;
  const sourceKey =
    typeof body.source_company_key === "string" && body.source_company_key.trim()
      ? body.source_company_key.trim()
      : null;
  if (!companyId && !sourceKey) {
    return jsonResponse(200, {
      ok: false,
      code: "INVALID_INPUT",
      error: "Provide company_id (UUID) or source_company_key.",
    });
  }
  const includeBrief = Boolean(body.include_pulse_brief);

  // ---- Resolve company -----------------------------------------------------
  let companyRow: CompanyRow | null = null;
  {
    const baseQuery = adminClient
      .from("lit_companies")
      .select(
        "id,name,domain,website,country_code,city,state,shipments_12m,teu_12m,est_spend_12m,most_recent_shipment_date,top_route_12m,recent_route",
      );
    const { data, error } = companyId
      ? await baseQuery.eq("id", companyId).maybeSingle()
      : await baseQuery.eq("source_company_key", sourceKey).maybeSingle();
    if (error) {
      console.error("export-company-profile company fetch failed:", error);
      // Phase B.16 — business-state error: return 200 with a code the
      // frontend can map through EXPORT_ERROR_COPY.
      return jsonResponse(200, {
        ok: false,
        code: "COMPANY_FETCH_FAILED",
        error: error.message || "Failed to fetch company.",
      });
    }
    companyRow = (data as CompanyRow | null) ?? null;
  }
  if (!companyRow) {
    // Phase B.16 — return 200 so the frontend's invoke handler can read
    // the body. 404 would surface as a generic non-2xx throw.
    return jsonResponse(200, {
      ok: false,
      code: "COMPANY_NOT_FOUND",
      error: "Company not found in our database.",
    });
  }

  // ---- Saved row (for cached Pulse brief) ---------------------------------
  let savedRow: SavedRow | null = null;
  if (includeBrief) {
    const { data } = await userClient
      .from("lit_saved_companies")
      .select("gemini_brief, gemini_brief_updated_at")
      .eq("user_id", user.id)
      .eq("company_id", companyRow.id)
      .maybeSingle();
    savedRow = (data as SavedRow | null) ?? null;
  }

  // ---- Bucket check --------------------------------------------------------
  const hasBucket = await bucketExists(null, adminClient);
  if (!hasBucket) {
    return jsonResponse(200, {
      ok: false,
      code: "STORAGE_NOT_PROVISIONED",
      error: `Storage bucket "${BUCKET_NAME}" not found. Required action: in Supabase Studio → Storage → New bucket, create "${BUCKET_NAME}" with Public OFF (signed URLs only).`,
    });
  }

  // ---- Render & upload HTML -----------------------------------------------
  const html = renderHtml(companyRow, savedRow, includeBrief);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${user.id}/${companyRow.id}/${timestamp}.html`;

  const { error: uploadErr } = await adminClient.storage
    .from(BUCKET_NAME)
    .upload(path, new Blob([html], { type: "text/html; charset=utf-8" }), {
      contentType: "text/html; charset=utf-8",
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    console.error("export-company-profile upload failed:", uploadErr);
    // Phase B.16 — business-state error: 200 + code so frontend can
    // surface a friendly toast via EXPORT_ERROR_COPY.
    return jsonResponse(200, {
      ok: false,
      code: "UPLOAD_FAILED",
      error: uploadErr.message || "Failed to upload HTML export.",
    });
  }

  const { data: signed, error: signErr } = await adminClient.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (signErr || !signed?.signedUrl) {
    console.error("export-company-profile sign failed:", signErr);
    // Phase B.16 — business-state error: 200 + code.
    return jsonResponse(200, {
      ok: false,
      code: "SIGN_FAILED",
      error: signErr?.message || "Failed to sign URL.",
    });
  }

  const expiresAt = new Date(
    Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000,
  ).toISOString();
  const htmlPayload = {
    format: "html" as const,
    url: signed.signedUrl,
    expires_at: expiresAt,
  };

  // ---- HTML success path --------------------------------------------------
  if (format === "html") {
    return jsonResponse(200, {
      ok: true,
      ...htmlPayload,
    });
  }

  // ---- PDF: honest unavailable + HTML fallback ---------------------------
  return jsonResponse(200, {
    ok: false,
    code: "PDF_NOT_AVAILABLE",
    error:
      'PDF generation requires a runtime that can render HTML→PDF (puppeteer/chromium not available in Deno Edge Functions). Use format="html" or wire a PDF service (DocRaptor, Browserless).',
    fallback: htmlPayload,
  });
});