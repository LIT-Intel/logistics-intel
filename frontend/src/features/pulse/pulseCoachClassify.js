// pulseCoachClassify — client wrapper for the pulse-coach-classify
// edge fn. Two layers:
//
//   1. mergeClassification(heuristic, llm) — overlay LLM entities on
//      top of the instant heuristic parse. The LLM result wins per
//      field; missing fields fall back to heuristic. Both share the
//      same shape so the rest of the page is implementation-blind.
//
//   2. classifyQuery(query) — calls the edge fn with a per-query
//      24h localStorage cache. Returns { ok, classification, cached }.
//
// We never block the UI on the LLM. The Pulse page renders the
// heuristic immediately and upgrades to LLM as it lands.

import { supabase } from '@/lib/supabase';

const CACHE_PREFIX = 'lit.pulse.classify.v1.';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(query) {
  return CACHE_PREFIX + String(query || '').toLowerCase().trim().slice(0, 200);
}

function readCache(query) {
  try {
    const raw = window.localStorage.getItem(cacheKey(query));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || !parsed?.classification) return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.classification;
  } catch {
    return null;
  }
}

function writeCache(query, classification) {
  try {
    window.localStorage.setItem(
      cacheKey(query),
      JSON.stringify({ at: Date.now(), classification }),
    );
  } catch {
    // ignore quota
  }
}

/**
 * Call pulse-coach-classify for the given query. Returns:
 *   { ok: true, classification: {...}, cached?: bool }
 *   { ok: false, code, message }
 */
export async function classifyQuery(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return { ok: false, code: 'EMPTY_QUERY' };
  if (trimmed.length < 3) return { ok: false, code: 'TOO_SHORT' };

  const cached = readCache(trimmed);
  if (cached) return { ok: true, cached: true, classification: cached };

  try {
    const { data, error } = await supabase.functions.invoke('pulse-coach-classify', {
      body: { query: trimmed },
    });
    if (error) {
      let parsed = null;
      try {
        const cloned = error?.context?.clone?.();
        parsed = await cloned?.json?.();
      } catch { parsed = null; }
      return {
        ok: false,
        code: parsed?.code || 'NETWORK',
        message: parsed?.message || error.message || 'Classify failed.',
      };
    }
    if (!data?.ok) {
      return {
        ok: false,
        code: data?.code || 'PROVIDER_ERROR',
        message: data?.message,
      };
    }
    writeCache(trimmed, data.classification);
    return { ok: true, cached: false, classification: data.classification };
  } catch (err) {
    return { ok: false, code: 'NETWORK', message: err?.message };
  }
}

/**
 * Overlay an LLM classification onto the heuristic parser output.
 * The LLM wins per non-empty field — but when the LLM returns
 * empty for something the heuristic found, we keep the heuristic
 * (defensive against under-extraction). Returns the same shape as
 * pulseQueryParser → safe to swap in everywhere.
 */
export function mergeClassification(heuristic, llmClassification) {
  if (!llmClassification) return heuristic;

  const llm = llmClassification;
  const merged = {
    raw: heuristic.raw,
    intent: llm.intent && llm.intent !== 'unclear' ? llm.intent : heuristic.intent,
    direction: llm.direction || heuristic.direction || null,
    quantity: llm.quantity ?? heuristic.quantity ?? null,
    products: pickArray(llm.products, heuristic.products),
    industries: pickArray(llm.industries, heuristic.industries),
    roles: pickArray(llm.roles, heuristic.roles),
    origins: pickArray(llm.origins, heuristic.origins),
    destinations: pickArray(llm.destinations, heuristic.destinations),
    countries: heuristic.countries || [],
    states: heuristic.states || [],
    metros: heuristic.metros || [],
    similarTo: llm.similar_to || heuristic.similarTo || null,
    keywords: heuristic.keywords || [],
    // New LLM-only fields surfaced to the UI
    clarifying_question: llm.clarifying_question || null,
    suggested_refinements: Array.isArray(llm.suggested_refinements)
      ? llm.suggested_refinements
      : [],
    confidence: typeof llm.confidence === 'number' ? llm.confidence : null,
    source: 'llm',
  };

  merged.hasAny = Boolean(
    merged.quantity ||
    merged.direction ||
    merged.products.length ||
    merged.origins.length ||
    merged.destinations.length ||
    merged.countries.length ||
    merged.states.length ||
    merged.metros.length ||
    merged.industries.length ||
    merged.roles.length ||
    merged.similarTo,
  );

  return merged;
}

function pickArray(llmField, heuristicField) {
  if (Array.isArray(llmField) && llmField.length) return llmField;
  if (Array.isArray(heuristicField)) return heuristicField;
  return [];
}
