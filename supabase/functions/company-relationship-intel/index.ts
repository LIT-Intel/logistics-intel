// company-relationship-intel — AI research agent for a LIT company profile.
//
// POST { company_id, force? } (user JWT required):
//   1. Rate limit: one refresh per company per 7 days. A fresh cached row is
//      returned with cached=true; force=true bypasses the cache but ONLY for
//      platform admins (this fn spends paid web-search credits per call —
//      Anthropic bills per 1k searches; OpenAI bills per web_search tool call).
//   2. Loads BOL context (display name, top delivery cities, top commodities)
//      from lit_unified_shipments / lit_companies.
//   3. Calls an LLM WITH a server-side web-search tool to research: company
//      type, published warehouse/DC network (corroborating the BOL-observed
//      facilities), PUBLISHED client/distributor/retail relationships (source
//      URL + quote required — never invented), and an outbound-FTL likelihood
//      0-100 with rationale. DUAL-VENDOR: the key is resolved from
//      OPENAI_API_KEY first, then ANTHROPIC_API_KEY, and the vendor is
//      auto-detected from the key prefix — 'sk-ant-…' → Anthropic Messages
//      API (claude-sonnet-4-6 + web_search server tool, pause_turn loop);
//      anything else (e.g. 'sk-proj-…') → OpenAI Responses API (gpt-4o +
//      web_search_preview, single call).
//   4. Upserts lit_company_relationship_intel (service role) and returns it.
//
// verify_jwt=true (default — do NOT add to .verify-jwt-manifest no_verify_jwt).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, isUserAdmin, json, requireUser } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const OPENAI_MODEL = "gpt-4o";
const MAX_TOKENS = 8192;
const OPENAI_MAX_OUTPUT_TOKENS = 4096;
const WEB_SEARCH_MAX_USES = 8;
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // one refresh per company per 7 days
const MAX_CONTINUATIONS = 4; // pause_turn guard for the server-side search loop

const COMPANY_TYPES = ["wholesaler", "retailer", "manufacturer", "distributor", "3pl", "other"];
const FACILITY_KINDS = ["warehouse", "dc", "hq", "plant", "store"];
const RELATIONSHIP_KINDS = ["client", "distributor", "retail_partner", "carrier"];

interface IntelRow {
  company_id: string;
  company_type: string | null;
  company_type_confidence: number | null;
  summary: string | null;
  facilities: unknown[];
  relationships: unknown[];
  outbound_ftl_likelihood: number | null;
  outbound_ftl_rationale: string | null;
  sources: unknown[];
  model: string;
  refreshed_at: string;
  requested_by: string;
}

function bareSlug(raw: unknown): string | null {
  const key = String(raw ?? "").trim();
  if (!key) return null;
  return key.replace(/^company\//i, "").trim().toLowerCase() || null;
}

function clampScore(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function str(v: unknown, max = 2000): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

function isHttpUrl(v: unknown): boolean {
  try {
    const u = new URL(String(v ?? ""));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Count the most common non-empty value in a string column sample. */
function mostCommon(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

function topCounted(values: (string | null | undefined)[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v);
}

/** Extract the final JSON object from the model's answer (tolerates fences/prose). */
function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch { /* fall through to substring extraction */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1));
  }
  throw new Error("No JSON object found in model output");
}

/** Coerce the model output into the exact table shape. Never trusts the model. */
function sanitize(parsed: Record<string, unknown>) {
  const companyTypeRaw = String(parsed.company_type ?? "").trim().toLowerCase();
  const company_type = COMPANY_TYPES.includes(companyTypeRaw) ? companyTypeRaw : (companyTypeRaw ? "other" : null);

  const facilities = (Array.isArray(parsed.facilities) ? parsed.facilities : [])
    .map((f) => {
      const o = (f ?? {}) as Record<string, unknown>;
      const kind = String(o.kind ?? "").trim().toLowerCase();
      return {
        city: str(o.city, 120),
        state: str(o.state, 60),
        kind: FACILITY_KINDS.includes(kind) ? kind : "warehouse",
        source_url: isHttpUrl(o.source_url) ? String(o.source_url) : null,
      };
    })
    .filter((f) => f.city || f.state)
    .slice(0, 30);

  // Hard rule: a relationship without a citable public source is dropped.
  const relationships = (Array.isArray(parsed.relationships) ? parsed.relationships : [])
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const kind = String(o.kind ?? "").trim().toLowerCase();
      return {
        name: str(o.name, 200),
        kind: RELATIONSHIP_KINDS.includes(kind) ? kind : "client",
        source_url: isHttpUrl(o.source_url) ? String(o.source_url) : null,
        quote: str(o.quote, 500),
      };
    })
    .filter((r) => r.name && r.source_url)
    .slice(0, 30);

  const sources = (Array.isArray(parsed.sources) ? parsed.sources : [])
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return { url: isHttpUrl(o.url) ? String(o.url) : null, title: str(o.title, 300) };
    })
    .filter((s) => s.url)
    .slice(0, 20);

  return {
    company_type,
    company_type_confidence: clampScore(parsed.company_type_confidence),
    summary: str(parsed.summary, 1500),
    facilities,
    relationships,
    outbound_ftl_likelihood: clampScore(parsed.outbound_ftl_likelihood),
    outbound_ftl_rationale: str(parsed.outbound_ftl_rationale, 1500),
    sources,
  };
}

const SYSTEM_PROMPT = `You are a freight-intelligence researcher for a logistics sales platform. Given a US importer identified from customs (BOL) records, research the PUBLIC WEB and report:

(a) What the company does and its company type: exactly one of wholesaler | retailer | manufacturer | distributor | 3pl | other, with a 0-100 confidence.
(b) Warehouse / distribution-center / plant / HQ / store locations. Prefer primary sources: the company's official site (locations pages, contact pages, careers pages), press releases, dealer/store locators, industrial-real-estate news.
(c) PUBLISHED client, distributor, retail-partner, or carrier relationships. ONLY include a relationship when a public web page names it — cite the exact URL and a short supporting quote (<= 2 sentences) from that page. Some shippers list "our clients" or "where to buy" pages — those are ideal. NEVER invent or infer a relationship without a citable source. Empty arrays are perfectly acceptable.
(d) An outbound-FTL likelihood, 0-100: how likely is this company to be tendering full-truckload freight FROM its own warehouses TO downstream partners? Ground it in facility count + company type + named downstream partners. A wholesaler/distributor with multiple warehouses across the country and named retail/distributor partners = high (80+). A single-location importer that receives containers and sells locally = low (<40). A retailer shipping to its own stores = moderate-high. Explain the rationale in 2-3 sentences.

Rules:
- Use web search (up to ${WEB_SEARCH_MAX_USES} searches). Search the company name plus terms like "warehouse", "distribution center", "our clients", "where to buy", "distributors".
- If you cannot confidently identify the company, say so in the summary, keep arrays empty, and use low confidences. Never fabricate.
- The BOL-observed delivery cities you are given are ground truth from customs data — use them to disambiguate the company and to corroborate (not replace) web-found facilities.

After researching, respond with STRICT JSON only — no prose before or after, no markdown fences — matching exactly:
{
  "company_type": "wholesaler|retailer|manufacturer|distributor|3pl|other",
  "company_type_confidence": 0-100,
  "summary": "2-3 sentence freight-relevant profile",
  "facilities": [{"city": "...", "state": "...", "kind": "warehouse|dc|hq|plant|store", "source_url": "https://..."}],
  "relationships": [{"name": "...", "kind": "client|distributor|retail_partner|carrier", "source_url": "https://...", "quote": "..."}],
  "outbound_ftl_likelihood": 0-100,
  "outbound_ftl_rationale": "...",
  "sources": [{"url": "https://...", "title": "..."}]
}

Output ONLY the JSON object — no markdown fences, no prose before or after.`;

Deno.serve(async (req) => {
  const log = createLogger("company-relationship-intel", { request_id: requestId() });
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, code: "BAD_JSON", error: "Invalid JSON" }, 400); }
  const companyId = bareSlug(body.company_id);
  if (!companyId) return json({ ok: false, code: "MISSING_COMPANY_ID", error: "Missing company_id" }, 400);

  try {
    const admin = auth.admin;

    // ── Rate limit: one refresh per company per 7 days ────────────────────
    const { data: existing } = await admin
      .from("lit_company_relationship_intel")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    let force = body.force === true;
    if (force) {
      const { isPlatformAdmin } = await isUserAdmin(admin, auth.user.id);
      if (!isPlatformAdmin) force = false; // force is a platform-admin-only lever
    }
    // A research run is already in flight (started < 5 min ago) — don't
    // double-start; the UI is polling the row.
    if (existing?.research_status === "pending" && !force) {
      const ageMs = Date.now() - new Date(existing.refreshed_at as string).getTime();
      if (Number.isFinite(ageMs) && ageMs < 5 * 60 * 1000) {
        return json({ ok: true, pending: true, intel: existing });
      }
    }
    // Only a SUCCESSFUL fresh row satisfies the 7-day cache — an error row
    // may be retried immediately (that's the whole point of surfacing it).
    if (existing && !force && existing.research_status === "ok") {
      const ageMs = Date.now() - new Date(existing.refreshed_at as string).getTime();
      if (Number.isFinite(ageMs) && ageMs < REFRESH_WINDOW_MS) {
        return json({ ok: true, cached: true, intel: existing });
      }
    }

    // Auto-repair the common paste mistakes (stray whitespace/newlines,
    // wrapping quotes) — a raw pasted value like "sk-proj-..." (with quotes)
    // reads as a syntactically-sent-but-invalid key and 401s.
    const sanitizeKey = (raw: string | undefined | null) =>
      String(raw ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
    // Key resolution: OPENAI_API_KEY first, then ANTHROPIC_API_KEY (which may
    // currently hold an OpenAI sk-proj key). Vendor is auto-detected from the
    // key's prefix, so either vendor's key works in either secret slot.
    const apiKey = sanitizeKey(Deno.env.get("OPENAI_API_KEY")) ||
      sanitizeKey(Deno.env.get("ANTHROPIC_API_KEY"));
    if (!apiKey) return json({ ok: false, code: "NOT_CONFIGURED", error: "OPENAI_API_KEY / ANTHROPIC_API_KEY not configured" }, 500);
    // 'sk-ant-…' → Anthropic Messages API; anything else → OpenAI Responses API.
    const useAnthropic = apiKey.startsWith("sk-ant-");

    // Safe fingerprint of the key AS THE FUNCTION SEES IT — never the key
    // itself. Appended to error_detail on auth failures so we can tell a
    // wrong-value problem (sha matches the dashboard digest => stored value
    // is itself bad) from a propagation problem (sha differs => the function
    // is still running with an older env).
    const keyFingerprint = async (): Promise<string> => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
      const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      return `len=${apiKey.length}, starts='${apiKey.slice(0, 7)}', ends='${apiKey.slice(-4)}', sha256=${hex.slice(0, 16)}…`;
    };

    // ── Vendor call paths. Each returns the model's answer text block(s) (or
    // an error string); the parse → sanitize → upsert pipeline below is shared.
    type ModelResult =
      | { ok: true; texts: string[]; usage: Record<string, unknown> }
      | { ok: false; error: string };

    // Anthropic Messages API + web_search server tool (pause_turn loop).
    const callAnthropic = async (userPrompt: string): Promise<ModelResult> => {
      const messages: Array<{ role: string; content: unknown }> = [{ role: "user", content: userPrompt }];
      let aData: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
        const aRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            tools: [{ type: "web_search_20250305", name: "web_search", max_uses: WEB_SEARCH_MAX_USES }],
            messages,
          }),
        });
        if (!aRes.ok) {
          const t = await aRes.text();
          const fp = aRes.status === 401 || aRes.status === 403 ? ` [key seen by fn: ${await keyFingerprint()}]` : "";
          return { ok: false, error: `Anthropic API HTTP ${aRes.status}: ${t.slice(0, 300)}${fp}` };
        }
        aData = await aRes.json();
        if (aData?.stop_reason !== "pause_turn") break;
        // Server-side search loop paused — resume by echoing the assistant turn.
        messages.push({ role: "assistant", content: aData.content });
      }
      const content = Array.isArray(aData?.content) ? (aData!.content as Array<Record<string, unknown>>) : [];
      const texts = content.filter((b) => b?.type === "text").map((b) => String(b.text ?? ""));
      if (texts.length === 0) {
        return { ok: false, error: `Model returned no text (stop_reason: ${aData?.stop_reason ?? "unknown"})` };
      }
      return { ok: true, texts, usage: (aData?.usage ?? {}) as Record<string, unknown> };
    };

    // OpenAI Responses API + web_search_preview server tool (single call —
    // OpenAI runs the search loop server-side, no continuation needed).
    const callOpenAI = async (userPrompt: string): Promise<ModelResult> => {
      const oRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          tools: [{ type: "web_search_preview" }],
          max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
          instructions: SYSTEM_PROMPT,
          input: userPrompt,
        }),
      });
      if (!oRes.ok) {
        const t = await oRes.text();
        const fp = oRes.status === 401 || oRes.status === 403 ? ` [key seen by fn: ${await keyFingerprint()}]` : "";
        return { ok: false, error: `OpenAI API HTTP ${oRes.status}: ${t.slice(0, 300)}${fp}` };
      }
      const oData = (await oRes.json()) as Record<string, unknown>;
      // Final text lives in output[] items of type "message" → content[] of
      // type "output_text" → .text (plus a convenience output_text field on
      // some responses). On status 'incomplete' we still try any text found.
      const texts: string[] = [];
      const output = Array.isArray(oData.output) ? (oData.output as Array<Record<string, unknown>>) : [];
      for (const item of output) {
        if (item?.type !== "message") continue;
        const parts = Array.isArray(item.content) ? (item.content as Array<Record<string, unknown>>) : [];
        for (const part of parts) {
          if (part?.type === "output_text" && String(part.text ?? "").trim()) texts.push(String(part.text));
        }
      }
      if (texts.length === 0 && String(oData.output_text ?? "").trim()) texts.push(String(oData.output_text));
      if (texts.length === 0) {
        const reason = oData.status === "incomplete"
          ? `incomplete: ${String((oData.incomplete_details as Record<string, unknown> | null | undefined)?.reason ?? "unknown")}`
          : `status: ${oData.status ?? "unknown"}`;
        return { ok: false, error: `Model returned no text (${reason})` };
      }
      return { ok: true, texts, usage: (oData.usage ?? {}) as Record<string, unknown> };
    };

    // ── Start-and-poll: the research takes 30-90s (up to 8 web searches),
    // too long to hold one request open reliably (gateway timeouts read as a
    // generic "failed" in the UI with no cause). Mark the row pending, run
    // the research in the background (EdgeRuntime.waitUntil), and let the UI
    // poll the row. Every failure path writes research_status='error' with
    // the REAL cause in error_detail.
    await admin.from("lit_company_relationship_intel").upsert({
      company_id: companyId,
      research_status: "pending",
      error_detail: null,
      refreshed_at: new Date().toISOString(),
      requested_by: auth.user.id,
    }, { onConflict: "company_id" });

    const failRun = async (detail: string) => {
      log.error("research_failed", { err: detail.slice(0, 300), company_id: companyId });
      await admin.from("lit_company_relationship_intel").update({
        research_status: "error",
        error_detail: detail.slice(0, 600),
        refreshed_at: new Date().toISOString(),
      }).eq("company_id", companyId);
    };

    const runResearch = async () => {
      // ── BOL context: display name, top delivery cities, top commodities ─
      const { data: bols } = await admin
        .from("lit_unified_shipments")
        .select("consignee_name, shipper_name, dest_city, dest_state, hs_code, product_description")
        .eq("company_id", companyId)
        .order("bol_date", { ascending: false })
        .limit(400);

      const rows = bols ?? [];
      // Canonical name: lit_companies row if one exists for this slug, else
      // the most common consignee (falling back to shipper) on the BOLs.
      const { data: companyRow } = await admin
        .from("lit_companies")
        .select("name")
        .in("source_company_key", [companyId, `company/${companyId}`])
        .limit(1)
        .maybeSingle();
      const displayName =
        str(companyRow?.name, 200) ||
        mostCommon(rows.map((r) => r.consignee_name)) ||
        mostCommon(rows.map((r) => r.shipper_name)) ||
        companyId.replace(/-/g, " ");

      const topCities = topCounted(
        rows.map((r) => (r.dest_city && r.dest_state ? `${r.dest_city}, ${r.dest_state}` : r.dest_city)),
        8,
      );
      const topCommodities = topCounted(rows.map((r) => r.product_description), 5);
      const topHs = topCounted(rows.map((r) => (r.hs_code ? String(r.hs_code).slice(0, 4) : null)), 5);

      const userPrompt = `Research this company:

Company name (from customs records): ${displayName}
Company slug: ${companyId}
BOL-observed US delivery locations (most frequent first): ${topCities.length ? topCities.join("; ") : "unknown"}
Top imported commodities (from BOL descriptions): ${topCommodities.length ? topCommodities.join("; ") : "unknown"}
Top HS chapters/headings: ${topHs.length ? topHs.join(", ") : "unknown"}`;

      const modelUsed = useAnthropic ? ANTHROPIC_MODEL : OPENAI_MODEL;
      log.info("research_started", {
        company_id: companyId,
        user_id: auth.user.id,
        bol_rows: rows.length,
        vendor: useAnthropic ? "anthropic" : "openai",
        model: modelUsed,
      });

      // ── Vendor dispatch (auto-detected from key prefix) ──────────────────
      const result = useAnthropic ? await callAnthropic(userPrompt) : await callOpenAI(userPrompt);
      if (!result.ok) {
        await failRun(result.error);
        return;
      }
      const textBlocks = result.texts;

      let parsed: Record<string, unknown>;
      try {
        // The final text block carries the JSON answer; earlier ones are narration.
        parsed = extractJson(textBlocks[textBlocks.length - 1]);
      } catch {
        try {
          parsed = extractJson(textBlocks.join("\n"));
        } catch {
          await failRun(`Model returned non-JSON output: ${textBlocks.join(" ").slice(0, 200)}`);
          return;
        }
      }

      const clean = sanitize(parsed);
      const row = {
        company_id: companyId,
        ...clean,
        model: modelUsed,
        research_status: "ok",
        error_detail: null,
        refreshed_at: new Date().toISOString(),
        requested_by: auth.user.id,
      };

      const { error: upsertError } = await admin
        .from("lit_company_relationship_intel")
        .upsert(row, { onConflict: "company_id" });
      if (upsertError) {
        await failRun(`DB upsert failed: ${upsertError.message}`);
        return;
      }

      const usage = result.usage;
      log.info("research_completed", {
        company_id: companyId,
        user_id: auth.user.id,
        relationships: clean.relationships.length,
        facilities: clean.facilities.length,
        ftl_likelihood: clean.outbound_ftl_likelihood,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      });
    };

    const task = runResearch().catch((err) => failRun(`Unhandled: ${String(err)}`));
    // Prefer background execution so the response returns instantly; fall
    // back to awaiting inline if the runtime lacks waitUntil.
    const edgeRuntime = (globalThis as Record<string, unknown>).EdgeRuntime as
      | { waitUntil?: (p: Promise<unknown>) => void }
      | undefined;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(task);
    else await task;

    return json({ ok: true, started: true }, 202);
  } catch (err) {
    log.error("internal_error", { err: String(err), company_id: companyId });
    return json({ ok: false, code: "INTERNAL_ERROR", error: "Relationship research failed", detail: String(err).slice(0, 300) }, 500);
  }
});
