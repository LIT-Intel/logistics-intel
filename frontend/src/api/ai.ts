/**
 * AI domain — LLM-backed helpers across providers.
 *
 * `gemini-*` use Google Gemini. `normalize-company` uses Anthropic Claude
 * (patched 2026-05-28 to require auth — see audit ledger). `pulse-ai-enrich`
 * augments Pulse search results.
 *
 * Every call here spends provider credits. Plan-gate at the call site via
 * `useEntitlements()` before invoking.
 */
import { invokeEdge } from "./_client";

export interface GeminiBriefRequest {
  company_id?: string;
  source_company_key?: string;
  context?: Record<string, unknown>;
}

export interface GeminiBriefResponse {
  ok: boolean;
  brief?: {
    summary?: string;
    talking_points?: string[];
    questions?: string[];
    [k: string]: unknown;
  };
  cached?: boolean;
  error?: string;
}

export interface GeminiEnrichmentRequest {
  company_id?: string;
  contact_id?: string;
  fields?: string[];
}

export interface GeminiEnrichmentResponse {
  ok: boolean;
  enriched?: Record<string, unknown>;
  error?: string;
}

export interface NormalizeCompanyRequest {
  company_id: string;
  force_refresh?: boolean;
}

export interface NormalizeCompanyResponse {
  ok: boolean;
  cached?: boolean;
  canonicalDomain?: string;
  hqLocation?: { city: string; state: string; country: string };
  confidence?: "high" | "medium" | "low";
  isForwarder?: boolean;
  firmographics?: {
    industry?: string;
    estimatedRevenue?: string;
    estimatedHeadcount?: string;
  };
  error?: string;
  detail?: unknown;
}

export interface PulseAiEnrichRequest {
  query?: string;
  company_id?: string;
  results?: unknown[];
}

export interface PulseAiEnrichResponse {
  ok: boolean;
  enriched_results?: unknown[];
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Operations
// ──────────────────────────────────────────────────────────────────────────

export async function geminiBrief(
  req: GeminiBriefRequest,
): Promise<GeminiBriefResponse> {
  return invokeEdge<GeminiBriefResponse>("gemini-brief", req);
}

export async function geminiEnrichment(
  req: GeminiEnrichmentRequest,
): Promise<GeminiEnrichmentResponse> {
  return invokeEdge<GeminiEnrichmentResponse>("gemini-enrichment", req);
}

/** Normalize company data via Anthropic Claude. JWT-required since 2026-05-28. */
export async function normalizeCompany(
  req: NormalizeCompanyRequest,
): Promise<NormalizeCompanyResponse> {
  return invokeEdge<NormalizeCompanyResponse>("normalize-company", req);
}

export async function pulseAiEnrich(
  req: PulseAiEnrichRequest,
): Promise<PulseAiEnrichResponse> {
  return invokeEdge<PulseAiEnrichResponse>("pulse-ai-enrich", req);
}
