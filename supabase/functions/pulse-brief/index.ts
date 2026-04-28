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

import {
  buildTemplatedBrief,
  callTavily,
  corsHeaders,
  jsonResponse,
  type BriefSections,
  type SnapshotSummary,
  tryGeminiSynthesis,
} from "../_shared/companyBriefHelpers.ts";

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