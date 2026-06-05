/**
 * Contacts domain — Apollo search/enrich, Lusha search/enrich, generic
 * enrichment helpers.
 *
 * Every paid-provider call is plan-gated server-side via `get-entitlements`
 * and rate-limited per user. Patched 2026-05-28 to close the unauthenticated
 * Apollo hiring-signal proxy (see audit ledger).
 */
import { invokeEdge } from "./_client";

export interface ApolloContactSearchRequest {
  company_id?: string;
  org_id?: string;
  titles?: string[];
  seniority?: string[];
  departments?: string[];
  page?: number;
  per_page?: number;
}

export interface ApolloContactSearchResponse {
  ok: boolean;
  contacts: unknown[];
  total?: number;
  page?: number;
  error?: string;
  code?: string;
}

export interface ApolloContactEnrichRequest {
  contact_id?: string;
  email?: string;
  domain?: string;
  first_name?: string;
  last_name?: string;
}

export interface ApolloContactEnrichResponse {
  ok: boolean;
  contact?: unknown;
  error?: string;
  code?: string;
}

export interface ApolloJobPostingsRequest {
  org_id: string;
}

export interface ApolloJobPostingsResponse {
  ok: boolean;
  org_id?: string;
  total?: number;
  departments?: Array<{ name: string; count: number }>;
  most_recent_posted_at?: string | null;
  freshness?: "hot" | "warm" | "cool" | "unknown";
  sample?: unknown[];
  error?: string;
  code?: string;
}

export interface LushaContactSearchRequest {
  company_id?: string;
  filters?: Record<string, unknown>;
  page?: number;
  per_page?: number;
}

export interface LushaContactSearchResponse {
  ok: boolean;
  contacts: unknown[];
  total?: number;
  error?: string;
}

export interface LushaEnrichmentRequest {
  contact_id?: string;
  email?: string;
}

export interface LushaEnrichmentResponse {
  ok: boolean;
  contact?: unknown;
  error?: string;
}

export interface EnrichContactsRequest {
  contact_ids: string[];
  provider?: "apollo" | "lusha" | "auto";
}

export interface EnrichContactsResponse {
  ok: boolean;
  enriched?: number;
  errors?: unknown[];
  error?: string;
}

export interface EnrichCampaignContactsRequest {
  campaign_id: string;
  contact_ids?: string[];
  provider?: "apollo" | "lusha" | "auto";
}

export interface EnrichCampaignContactsResponse {
  ok: boolean;
  enqueued?: number;
  enriched?: number;
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Operations
// ──────────────────────────────────────────────────────────────────────────

export async function apolloContactSearch(
  req: ApolloContactSearchRequest,
): Promise<ApolloContactSearchResponse> {
  return invokeEdge<ApolloContactSearchResponse>("apollo-contact-search", req);
}

export async function apolloContactEnrich(
  req: ApolloContactEnrichRequest,
): Promise<ApolloContactEnrichResponse> {
  return invokeEdge<ApolloContactEnrichResponse>("apollo-contact-enrich", req);
}

/** Apollo hiring-signal proxy. Plan-gated. */
export async function apolloJobPostings(
  req: ApolloJobPostingsRequest,
): Promise<ApolloJobPostingsResponse> {
  return invokeEdge<ApolloJobPostingsResponse>("apollo-job-postings", req);
}

export async function lushaContactSearch(
  req: LushaContactSearchRequest,
): Promise<LushaContactSearchResponse> {
  return invokeEdge<LushaContactSearchResponse>("lusha-contact-search", req);
}

export async function lushaEnrichment(
  req: LushaEnrichmentRequest,
): Promise<LushaEnrichmentResponse> {
  return invokeEdge<LushaEnrichmentResponse>("lusha-enrichment", req);
}

export async function enrichContacts(
  req: EnrichContactsRequest,
): Promise<EnrichContactsResponse> {
  return invokeEdge<EnrichContactsResponse>("enrich-contacts", req);
}

export async function enrichCampaignContacts(
  req: EnrichCampaignContactsRequest,
): Promise<EnrichCampaignContactsResponse> {
  return invokeEdge<EnrichCampaignContactsResponse>("enrich-campaign-contacts", req);
}
