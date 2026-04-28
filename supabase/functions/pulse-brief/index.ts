// Phase B.14 — Pulse Brief Edge Function.
//
// Honest pre-call intelligence brief assembled from:
//   1. The caller's own snapshot KPIs (no fabrication: if a field is null,
//      the brief says "—" or skips the clause).
//   2. Tavily web search (real API call — no canned results).
//   3. Optional Gemini synthesis when GEMINI_API_KEY is set (strict JSON
//      output; if Gemini fails or returns un-parseable text, we fall back
//      to honest templated prose).
//
// Cache target: lit_saved_companies.gemini_brief / gemini_brief_updated_at.
// We only write the cache when the user has saved this company. If no row
// exists we still return the brief but skip the write (and log it).

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

interface SnapshotSummary {
  shipments_12m?: number | null;
  teu_12m?: number | null;
  est_spend_12m?: number | null;
  top_lane?: string | null;
  top_carriers?: string[] | null;
  top_suppliers?: string[] | null;
  last_shipment_date?: string | null;
}

interface TavilySource {
  title: string;
  url: string;
  snippet?: string;
}

interface TavilyResult {
  answer: string | null;
  results: TavilySource[];
}

interface BriefSections {
  executive_summary: string;
  shipment_signal: string;
  public_web_context: string;
  opportunity_angle: string;
  suggested_outreach_angle: string;
  risks_watchouts: string;
  sources: TavilySource[];
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

async function callTavily(
  apiKey: string,
  query: string,
): Promise<{ ok: true; data: TavilyResult } | { ok: false; status: number | null; error: string }> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        include_answer: true,
        max_results: 5,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        status: res.status,
        error: `Tavily returned ${res.status}: ${text.slice(0, 300)}`,
      };
    }
    const data = await res.json();
    const answer = typeof data?.answer === "string" ? data.answer : null;
    const rawResults = Array.isArray(data?.results) ? data.results : [];
    const results: TavilySource[] = rawResults
      .filter((r: any) => r && typeof r.url === "string")
      .map((r: any) => ({
        title: typeof r.title === "string" ? r.title : r.url,
        url: r.url,
        snippet:
          typeof r.content === "string"
            ? r.content.slice(0, 200)
            : undefined,
      }));
    return { ok: true, data: { answer, results } };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: `Tavily network error: ${String(err)}`,
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

function buildTemplatedBrief(
  companyName: string,
  snap: SnapshotSummary | undefined,
  tavily: TavilyResult,
): BriefSections {
  const shipment_signal = buildShipmentSignal(snap);

  const public_web_context = (() => {
    if (tavily.answer && tavily.answer.trim()) return tavily.answer.trim();
    if (tavily.results[0]?.snippet) {
      return `${tavily.results[0].title}: ${tavily.results[0].snippet}`;
    }
    return `No public web context returned by Tavily for ${companyName}.`;
  })();

  const execClauses: string[] = [];
  if (tavily.results.length > 0) {
    execClauses.push(
      `${companyName} appears in ${tavily.results.length} recent web sources`,
    );
  }
  if (snap?.shipments_12m && snap.shipments_12m > 0) {
    execClauses.push(
      `shipped ${Math.round(snap.shipments_12m).toLocaleString()} times in the last 12 months`,
    );
  }
  if (snap?.top_lane && snap.top_lane.trim()) {
    execClauses.push(`with ${snap.top_lane} as the strongest lane`);
  }
  const executive_summary = execClauses.length
    ? execClauses.join(", ") +
      ". This brief was assembled from snapshot data and Tavily search results only; no LLM synthesis was applied."
    : `No structured snapshot or web data was available to summarize ${companyName}. Save the company and refresh the snapshot to populate this section.`;

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
        `position service tier against ${Math.round(snap.shipments_12m).toLocaleString()}-shipment annual cadence`,
      );
    }
    return parts.length
      ? parts.join("; ") + "."
      : "Opportunity angle requires snapshot KPIs (lane, carriers, volume). Refresh the snapshot to enable this section.";
  })();

  const suggested_outreach_angle = (() => {
    if (snap?.top_lane && snap.top_lane.trim()) {
      return `Open with reference to their ${snap.top_lane} flow and ask which leg currently underperforms on transit time or rate.`;
    }
    return "Open with a question about which trade lane the buyer wants to optimize this quarter — snapshot did not surface a primary lane to anchor on.";
  })();

  const risks_watchouts = (() => {
    const parts: string[] = [];
    if (snap?.top_carriers && snap.top_carriers.length === 1) {
      parts.push(
        `Carrier concentration risk: only ${snap.top_carriers[0]} appears in the top-carrier list`,
      );
    }
    if (snap?.last_shipment_date) {
      try {
        const last = new Date(snap.last_shipment_date);
        const days = Math.floor(
          (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (Number.isFinite(days) && days > 90) {
          parts.push(
            `Last shipment is ${days} days old — verify the account is still actively importing before committing outreach budget`,
          );
        }
      } catch {
        // ignore date parse failures
      }
    }
    return parts.length
      ? parts.join(". ") + "."
      : "No structured risk signals surfaced in the snapshot. Validate account health with the buyer directly before scaling outreach.";
  })();

  return {
    executive_summary,
    shipment_signal,
    public_web_context,
    opportunity_angle,
    suggested_outreach_angle,
    risks_watchouts,
    sources: tavily.results,
  };
}

async function tryGeminiSynthesis(
  apiKey: string,
  companyName: string,
  snap: SnapshotSummary | undefined,
  tavily: TavilyResult,
): Promise<Partial<BriefSections> | null> {
  const prompt = `You will receive structured snapshot data and Tavily search results for the company "${companyName}".
Produce ONLY a brief grounded in the provided data.
Do NOT invent shipment counts, contact names, dates, or events.
If a section cannot be supported by the inputs, say so explicitly in that section.

Return STRICT JSON, no markdown, with exactly these keys:
{
  "executive_summary": string,
  "opportunity_angle": string,
  "suggested_outreach_angle": string,
  "risks_watchouts": string
}

Snapshot:
${JSON.stringify(snap ?? {}, null, 2)}

Tavily answer:
${tavily.answer ?? "(none)"}

Tavily sources (title, url, snippet):
${tavily.results
  .map(
    (s) =>
      `- ${s.title} (${s.url})${s.snippet ? `: ${s.snippet}` : ""}`,
  )
  .join("\n") || "(none)"}
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

// ---------------------------------------------------------------------------
// End of inlined helpers — original imports below have been removed.
// ---------------------------------------------------------------------------

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
    return jsonResponse(500, {
      ok: false,
      code: "SUPABASE_NOT_CONFIGURED",
      error:
        "SUPABASE_URL or SUPABASE_ANON_KEY not configured for pulse-brief.",
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
    return jsonResponse(400, {
      ok: false,
      code: "INVALID_INPUT",
      error: "Body must be valid JSON.",
    });
  }

  const companyName =
    typeof body.company_name === "string" ? body.company_name.trim() : "";
  if (!companyName) {
    return jsonResponse(400, {
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
        if (fresh && savedRow.gemini_brief && typeof savedRow.gemini_brief === "object") {
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

  // ---- Tavily key ----------------------------------------------------------
  const tavilyKey = Deno.env.get("TAVILY_API_KEY");
  if (!tavilyKey) {
    return jsonResponse(200, {
      ok: false,
      code: "TAVILY_NOT_CONFIGURED",
      error:
        "Tavily API key not configured in Supabase secrets. Set TAVILY_API_KEY to enable Pulse briefs.",
    });
  }

  // ---- Tavily call ---------------------------------------------------------
  const query = `${companyName}${
    domain ? ` site:${domain} OR ${domain}` : ""
  } logistics shipping company news`;
  const tavily = await callTavily(tavilyKey, query);
  if (!tavily.ok) {
    console.error("pulse-brief Tavily failed:", tavily.error);
    return jsonResponse(200, {
      ok: false,
      code: "TAVILY_FAILED",
      error: tavily.error,
    });
  }

  // ---- Brief assembly ------------------------------------------------------
  let sections: BriefSections = buildTemplatedBrief(
    companyName,
    snap,
    tavily.data,
  );

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (geminiKey) {
    try {
      const synth = await tryGeminiSynthesis(
        geminiKey,
        companyName,
        snap,
        tavily.data,
      );
      if (synth) {
        sections = {
          ...sections,
          ...synth,
        };
      }
    } catch (err) {
      console.warn("pulse-brief Gemini synthesis threw, using templates:", err);
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