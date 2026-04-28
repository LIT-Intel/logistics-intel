// Phase B.16 — Pulse Brief Edge Function (deepened, provider-name-scrubbed).
//
// Pre-call intelligence brief assembled from:
//   1. The caller's own snapshot KPIs (no fabrication: if a field is null,
//      the brief says "—" or skips the clause).
//   2. Public web search results (no provider name surfaced to the user).
//   3. Optional AI synthesis when a synthesis API key is configured (strict
//      JSON output; if synthesis fails or returns un-parseable text, we
//      fall back to honest templated prose).
//
// All business-state errors return HTTP 200 with `{ ok: false, code, error }`
// so the frontend's `supabase.functions.invoke` doesn't throw a generic
// "non-2xx" error before the body reaches the JS layer. Genuine auth
// failures (401), method errors (405), and unexpected infra crashes (500)
// keep their HTTP status — those should surface as sign-in / contact-support
// states.
//
// Cache target: lit_saved_companies.gemini_brief / gemini_brief_updated_at.
// We only write the cache when the user has saved this company. If no row
// exists we still return the brief but skip the write (and log it).

import { createClient } from "npm:@supabase/supabase-js@2";

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

interface SnapshotSummary {
  shipments_12m?: number | null;
  teu_12m?: number | null;
  est_spend_12m?: number | null;
  top_lane?: string | null;
  top_carriers?: string[] | null;
  top_suppliers?: string[] | null;
  last_shipment_date?: string | null;
  contacts_loaded?: number | null;
  active_lanes_count?: number | null;
  industry?: string | null;
  company_description?: string | null;
}

interface WebSource {
  title: string;
  url: string;
  snippet?: string;
}

interface WebSearchResult {
  answer: string | null;
  results: WebSource[];
}

interface BriefSections {
  executive_summary: string;
  company_context: string;
  shipment_signal: string;
  public_web_context: string;
  recent_signals: string;
  opportunity_angle: string;
  suggested_outreach_angle: string;
  risks_watchouts: string;
  sources: WebSource[];
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

function extractDomainFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

// Phase B.16 — provider-neutral web search wrapper. Currently routes to
// Tavily when TAVILY_API_KEY is set, but the function/error names exposed
// to callers and to the user-facing brief never mention the provider.
async function callWebSearch(
  apiKey: string,
  query: string,
): Promise<
  | { ok: true; data: WebSearchResult }
  | { ok: false; status: number | null; error: string }
> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        include_answer: true,
        max_results: 6,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        status: res.status,
        error: `Web search returned ${res.status}: ${text.slice(0, 300)}`,
      };
    }
    const data = await res.json();
    const answer = typeof data?.answer === "string" ? data.answer : null;
    const rawResults = Array.isArray(data?.results) ? data.results : [];
    const results: WebSource[] = rawResults
      .filter((r: any) => r && typeof r.url === "string")
      .map((r: any) => ({
        title: typeof r.title === "string" ? r.title : r.url,
        url: r.url,
        snippet:
          typeof r.content === "string"
            ? r.content.slice(0, 240)
            : undefined,
      }));
    return { ok: true, data: { answer, results } };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: `Web search network error: ${String(err)}`,
    };
  }
}

function buildShipmentSignal(snap: SnapshotSummary | undefined): string {
  if (!snap) {
    return "No snapshot data was supplied with this request, so shipment volume cannot be summarized here. Open the company profile to populate snapshot KPIs.";
  }
  const ships = formatNumberOrDash(snap.shipments_12m, { keepZero: true });
  const teu = formatNumberOrDash(snap.teu_12m);
  const spend = formatCurrencyOrDash(snap.est_spend_12m);
  const lane = snap.top_lane && snap.top_lane.trim() ? snap.top_lane : "—";
  const carriers =
    snap.top_carriers && snap.top_carriers.length
      ? snap.top_carriers.slice(0, 3).join(", ")
      : "—";
  const suppliers =
    snap.top_suppliers && snap.top_suppliers.length
      ? snap.top_suppliers.slice(0, 3).join(", ")
      : "—";
  const last = formatDateOrDash(snap.last_shipment_date);
  return [
    `Last 12 months: ${ships} shipments, ${teu} TEU, ${spend} estimated spend.`,
    `Strongest lane: ${lane}.`,
    `Top carriers: ${carriers}.`,
    `Top suppliers: ${suppliers}.`,
    `Most recent shipment: ${last}.`,
  ].join(" ");
}

// Phase B.16 — flag results that look like real signals (news, expansions,
// hires, partnerships, funding). Heuristic-only; we never fabricate signal
// language — we just surface sentences that the source itself already
// wrote.
const SIGNAL_KEYWORDS = [
  "announce",
  "expand",
  "expansion",
  "launch",
  "partnership",
  "partner with",
  "facility",
  "hiring",
  "hires",
  "funding",
  "raised",
  "acquisition",
  "acquired",
  "opens",
  "opening",
  "growth",
  "investment",
];

function buildRecentSignals(web: WebSearchResult): string {
  if (!web.results.length) return "No major recent public signals found.";
  const hits: { sentence: string; title: string }[] = [];
  for (const src of web.results) {
    const content = (src.snippet || "").trim();
    if (!content) continue;
    // Split on sentence boundaries, keep the first signal-bearing one.
    const sentences = content
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (SIGNAL_KEYWORDS.some((kw) => lower.includes(kw))) {
        hits.push({
          sentence: sentence.slice(0, 220),
          title: src.title || extractDomainFromUrl(src.url),
        });
        break;
      }
    }
    if (hits.length >= 3) break;
  }
  if (!hits.length) return "No major recent public signals found.";
  return hits
    .map((h) => `${h.sentence} (${h.title})`)
    .join("\n\n");
}

function buildCompanyContext(
  companyName: string,
  snap: SnapshotSummary | undefined,
  web: WebSearchResult,
): string {
  const parts: string[] = [];
  if (snap?.company_description && snap.company_description.trim()) {
    parts.push(snap.company_description.trim());
  } else if (web.results[0]?.snippet) {
    parts.push(web.results[0].snippet.slice(0, 220).trim());
  }
  if (snap?.industry && snap.industry.trim()) {
    parts.push(`Industry: ${snap.industry.trim()}.`);
  }
  if (!parts.length) {
    return "Public business context not available from current sources.";
  }
  return parts.join(" ");
}

function buildTemplatedBrief(
  companyName: string,
  snap: SnapshotSummary | undefined,
  web: WebSearchResult,
): BriefSections {
  const shipment_signal = buildShipmentSignal(snap);

  const public_web_context = (() => {
    if (web.answer && web.answer.trim()) return web.answer.trim();
    if (web.results[0]?.snippet) {
      return `${web.results[0].title}: ${web.results[0].snippet}`;
    }
    return `No public web context available for ${companyName}.`;
  })();

  const company_context = buildCompanyContext(companyName, snap, web);
  const recent_signals = buildRecentSignals(web);

  // Phase B.16 — richer executive summary that combines real KPIs with
  // the first sentence of the web answer (no invented facts).
  const execClauses: string[] = [];
  if (snap?.shipments_12m && snap.shipments_12m > 0) {
    execClauses.push(
      `${companyName} shipped ${Math.round(
        snap.shipments_12m,
      ).toLocaleString()} times in the last 12 months`,
    );
  } else {
    execClauses.push(`${companyName} appears in our records`);
  }
  if (snap?.top_lane && snap.top_lane.trim()) {
    execClauses.push(`with ${snap.top_lane} as the strongest lane`);
  }
  if (web.results.length > 0) {
    execClauses.push(
      `and is referenced across ${web.results.length} recent public web ${
        web.results.length === 1 ? "source" : "sources"
      }`,
    );
  }
  let executive_summary = execClauses.join(", ") + ".";
  if (web.answer && web.answer.trim()) {
    const firstSentence = web.answer
      .split(/(?<=[.!?])\s+/)[0]
      ?.trim();
    if (firstSentence) executive_summary += ` ${firstSentence}`;
  }
  executive_summary +=
    " This brief is assembled from saved snapshot fields and public web context only — no fabricated facts.";

  // Phase B.16 — opportunity angle stays templated; the LLM-synthesized
  // version (if any) replaces it later.
  const opportunity_angle = (() => {
    const parts: string[] = [];
    if (snap?.top_lane) {
      parts.push(`Lead with ${snap.top_lane} pricing and reliability`);
    }
    if (snap?.top_carriers && snap.top_carriers.length) {
      parts.push(
        `compare against ${snap.top_carriers.slice(0, 2).join(", ")}`,
      );
    }
    if (snap?.shipments_12m && snap.shipments_12m > 0) {
      parts.push(
        `position service tier against the ${Math.round(
          snap.shipments_12m,
        ).toLocaleString()}-shipment annual cadence`,
      );
    }
    return parts.length
      ? parts.join("; ") + "."
      : "Opportunity angle requires snapshot KPIs (lane, carriers, volume). Refresh the snapshot to enable this section.";
  })();

  // Phase B.16 — 2-3 specific bullets, not a single generic prompt.
  const suggested_outreach_angle = (() => {
    const bullets: string[] = [];
    if (snap?.top_lane && snap.top_lane.trim()) {
      bullets.push(
        `Pricing leverage on the ${snap.top_lane} lane — ask about current carrier mix and rate visibility.`,
      );
    }
    const ships = Number(snap?.shipments_12m || 0);
    if (ships > 100) {
      bullets.push(
        "High-volume operator — likely values reliability over lowest spot rate. Lead with consistency and visibility.",
      );
    } else if (ships > 0 && ships < 50) {
      bullets.push(
        "Mid-volume opportunity — emerging account, focus on partnership upside.",
      );
    }
    const contacts = Number(snap?.contacts_loaded || 0);
    if (contacts < 1) {
      bullets.push(
        "No verified contact yet. First outreach should be a research-grade approach via LinkedIn or web before email.",
      );
    }
    if (!bullets.length) {
      bullets.push(
        "Open with a question about which trade lane the buyer wants to optimize this quarter — snapshot did not surface enough signal to anchor on.",
      );
    }
    return bullets.map((b) => `• ${b}`).join("\n");
  })();

  // Phase B.16 — only flag risks that are actually supported by data.
  const risks_watchouts = (() => {
    const flags: string[] = [];
    if (web.results.length < 2) {
      flags.push(
        "Low public data signal — fewer than two public sources surfaced for this company.",
      );
    }
    if (Number(snap?.contacts_loaded || 0) < 1) {
      flags.push(
        "Limited contact visibility — no verified decision-maker contacts loaded yet.",
      );
    }
    if (snap?.last_shipment_date) {
      try {
        const last = new Date(snap.last_shipment_date);
        const days = Math.floor(
          (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (Number.isFinite(days) && days > 7) {
          // Snapshot stale heuristic: shipment data older than 7 days
          // may not reflect the latest activity until a snapshot refresh.
          if (days > 90) {
            flags.push(
              `Last shipment is ${days} days old — verify the account is still actively importing before committing outreach budget.`,
            );
          } else if (days > 30) {
            flags.push(
              "Snapshot pending refresh — most recent shipment is older than 30 days.",
            );
          }
        }
      } catch {
        // ignore date parse failures
      }
    }
    if (snap?.top_carriers && snap.top_carriers.length === 1) {
      flags.push(
        `Carrier concentration risk: only ${snap.top_carriers[0]} appears in the top-carrier list.`,
      );
    }
    if (Number(snap?.active_lanes_count || 0) === 1) {
      flags.push(
        "Single-lane dependency — the account flows over only one trade lane in the last 12 months.",
      );
    }
    if (!flags.length) {
      return "No structured risk signals surfaced. Validate account health with the buyer directly before scaling outreach.";
    }
    return flags.map((f) => `• ${f}`).join("\n");
  })();

  return {
    executive_summary,
    company_context,
    shipment_signal,
    public_web_context,
    recent_signals,
    opportunity_angle,
    suggested_outreach_angle,
    risks_watchouts,
    sources: web.results.slice(0, 5),
  };
}

// Phase B.16 — synthesis prompt forbids vendor names + requests new sections.
async function tryAiSynthesis(
  apiKey: string,
  companyName: string,
  snap: SnapshotSummary | undefined,
  web: WebSearchResult,
): Promise<Partial<BriefSections> | null> {
  const prompt = `You will receive structured snapshot data and public web search results for the company "${companyName}".
Produce ONLY a brief grounded in the provided data.
HARD RULES:
- Do NOT invent shipment counts, contact names, dates, or events.
- Do NOT mention the names of any third-party vendors, search providers,
  or AI services in your output (e.g. do not say "Tavily", "Gemini",
  "Google", "OpenAI", or any vendor brand).
- If a section cannot be supported by the inputs, say so explicitly.
- For "suggested_outreach_angle", return 2 to 3 specific bullet points
  (use "• " as the bullet character, separate with newlines).
- For "risks_watchouts", return only flags that are actually supported by
  the inputs (use "• " as the bullet character).

Return STRICT JSON, no markdown, with exactly these keys:
{
  "executive_summary": string,
  "company_context": string,
  "opportunity_angle": string,
  "suggested_outreach_angle": string,
  "risks_watchouts": string
}

Snapshot:
${JSON.stringify(snap ?? {}, null, 2)}

Web search answer:
${web.answer ?? "(none)"}

Web sources (title, url, snippet):
${
    web.results
      .map(
        (s) =>
          `- ${s.title} (${extractDomainFromUrl(s.url)})${
            s.snippet ? `: ${s.snippet}` : ""
          }`,
      )
      .join("\n") || "(none)"
  }
`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      data?.candidates?.[0]?.output ??
      null;
    if (typeof text !== "string") return null;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const out: Partial<BriefSections> = {};
    if (typeof parsed.executive_summary === "string")
      out.executive_summary = parsed.executive_summary;
    if (typeof parsed.company_context === "string")
      out.company_context = parsed.company_context;
    if (typeof parsed.opportunity_angle === "string")
      out.opportunity_angle = parsed.opportunity_angle;
    if (typeof parsed.suggested_outreach_angle === "string")
      out.suggested_outreach_angle = parsed.suggested_outreach_angle;
    if (typeof parsed.risks_watchouts === "string")
      out.risks_watchouts = parsed.risks_watchouts;
    return Object.keys(out).length ? out : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

interface PulseBriefRequest {
  company_id?: string | null;
  source_company_key?: string | null;
  company_name?: string | null;
  domain?: string | null;
  snapshot_summary?: SnapshotSummary | null;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
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
  if (!supabaseUrl || !supabaseAnonKey) {
    // Phase B.16 — return 200 so the frontend doesn't see a generic
    // "non-2xx" before it can read the body's `code` field.
    return jsonResponse(200, {
      ok: false,
      code: "SUPABASE_NOT_CONFIGURED",
      error:
        "AI brief service is missing core configuration. Contact support.",
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

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return jsonResponse(401, {
      ok: false,
      code: "UNAUTHORIZED",
      error: "Invalid Supabase auth token.",
    });
  }
  const user = userData.user;

  // ---- Body ----------------------------------------------------------------
  let body: PulseBriefRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(200, {
      ok: false,
      code: "INVALID_INPUT",
      error: "Body must be valid JSON.",
    });
  }

  const companyName =
    typeof body.company_name === "string" ? body.company_name.trim() : "";
  if (!companyName) {
    return jsonResponse(200, {
      ok: false,
      code: "INVALID_INPUT",
      error: "company_name is required.",
    });
  }
  const companyId = isUuid(body.company_id) ? body.company_id : null;
  const domain =
    typeof body.domain === "string" && body.domain.trim()
      ? body.domain.trim()
      : null;
  const snap: SnapshotSummary | undefined =
    body.snapshot_summary && typeof body.snapshot_summary === "object"
      ? (body.snapshot_summary as SnapshotSummary)
      : undefined;

  // ---- Cache check ---------------------------------------------------------
  let savedRowId: string | null = null;
  if (companyId) {
    try {
      const { data: savedRow } = await supabase
        .from("lit_saved_companies")
        .select("id, gemini_brief, gemini_brief_updated_at")
        .eq("user_id", user.id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (savedRow) {
        savedRowId = savedRow.id ?? null;
        const updatedAt = savedRow.gemini_brief_updated_at
          ? new Date(savedRow.gemini_brief_updated_at).getTime()
          : 0;
        const fresh =
          updatedAt > 0 && Date.now() - updatedAt < CACHE_TTL_MS;
        if (
          fresh &&
          savedRow.gemini_brief &&
          typeof savedRow.gemini_brief === "object"
        ) {
          return jsonResponse(200, {
            ok: true,
            company_name: companyName,
            generated_at: new Date(updatedAt).toISOString(),
            cached: true,
            sections: savedRow.gemini_brief,
          });
        }
      }
    } catch (err) {
      console.warn("pulse-brief cache lookup failed:", err);
    }
  }

  // ---- Web search key ------------------------------------------------------
  const webSearchKey = Deno.env.get("TAVILY_API_KEY");
  if (!webSearchKey) {
    return jsonResponse(200, {
      ok: false,
      code: "TAVILY_NOT_CONFIGURED",
      error:
        "AI brief search source not configured. Ask your admin to enable it.",
    });
  }

  // ---- Web search ----------------------------------------------------------
  const query = `${companyName}${
    domain ? ` site:${domain} OR ${domain}` : ""
  } logistics shipping company news`;
  const web = await callWebSearch(webSearchKey, query);
  if (!web.ok) {
    console.error("pulse-brief web search failed:", web.error);
    return jsonResponse(200, {
      ok: false,
      code: "TAVILY_FAILED",
      error: "Web search failed. Try again in a moment.",
    });
  }

  // ---- Brief assembly ------------------------------------------------------
  let sections: BriefSections = buildTemplatedBrief(
    companyName,
    snap,
    web.data,
  );

  const synthesisKey = Deno.env.get("GEMINI_API_KEY");
  if (synthesisKey) {
    try {
      const synth = await tryAiSynthesis(
        synthesisKey,
        companyName,
        snap,
        web.data,
      );
      if (synth) {
        sections = {
          ...sections,
          ...synth,
        };
      }
    } catch (err) {
      console.warn(
        "pulse-brief AI synthesis threw, using templates:",
        err,
      );
    }
  }

  // ---- Cache write (best-effort) ------------------------------------------
  let cacheNote: string | null = null;
  if (companyId && savedRowId) {
    const { error: updErr } = await supabase
      .from("lit_saved_companies")
      .update({
        gemini_brief: sections,
        gemini_brief_updated_at: new Date().toISOString(),
      })
      .eq("id", savedRowId);
    if (updErr) {
      console.warn("pulse-brief cache write failed:", updErr);
      cacheNote = "Cache write failed; brief returned uncached.";
    }
  } else if (companyId && !savedRowId) {
    cacheNote =
      "Brief not cached: company is not in the user's lit_saved_companies. Save the company to enable caching.";
  }

  return jsonResponse(200, {
    ok: true,
    company_name: companyName,
    generated_at: new Date().toISOString(),
    cached: false,
    cache_note: cacheNote,
    sections,
  });
});