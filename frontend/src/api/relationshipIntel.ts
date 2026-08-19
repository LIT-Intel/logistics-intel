/**
 * Relationship Intelligence API — AI-researched company network profile.
 *
 * Read path: `lit_company_relationship_intel` (one row per ImportYeti slug,
 * authenticated SELECT via RLS — public-web-derived, non-sensitive).
 * Write path: the `company-relationship-intel` edge fn (user JWT), which runs
 * Claude + web search and upserts the row via the service role. One refresh
 * per company per 7 days — a fresh row comes back with `cached: true`.
 *
 * Row contract (verified against migration 20260819180000):
 *   {
 *     company_id, company_type, company_type_confidence, summary,
 *     facilities:    [{ city, state, kind: warehouse|dc|hq|plant|store, source_url }],
 *     relationships: [{ name, kind: client|distributor|retail_partner|carrier,
 *                       source_url, quote }],   // source-cited only
 *     outbound_ftl_likelihood, outbound_ftl_rationale,
 *     sources: [{ url, title }], model, refreshed_at
 *   }
 *
 * Graceful degradation: read errors resolve to `null` so the card renders its
 * empty state ("Research network") instead of crashing the profile.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { invokeEdge } from "./_client";

const FIVE_MIN = 5 * 60 * 1000;

export interface IntelFacility {
  city: string | null;
  state: string | null;
  /** "warehouse" | "dc" | "hq" | "plant" | "store" (free-form tolerated). */
  kind: string;
  source_url: string | null;
}

export interface IntelRelationship {
  name: string;
  /** "client" | "distributor" | "retail_partner" | "carrier". */
  kind: string;
  source_url: string | null;
  quote: string | null;
}

export interface IntelSource {
  url: string;
  title: string | null;
}

export interface RelationshipIntel {
  company_id: string;
  company_type: string | null;
  company_type_confidence: number | null;
  summary: string | null;
  facilities: IntelFacility[];
  relationships: IntelRelationship[];
  outbound_ftl_likelihood: number | null;
  outbound_ftl_rationale: string | null;
  sources: IntelSource[];
  model: string | null;
  refreshed_at: string | null;
}

/** Normalize whatever company key the page has to the bare IY slug (strip a
 *  "company/" prefix, trim, lowercase). Mirrors inlandFreight/laneIntel. */
function bareSlug(raw: string | null | undefined): string | null {
  const key = String(raw ?? "").trim();
  if (!key) return null;
  return key.replace(/^company\//i, "").trim().toLowerCase() || null;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function score(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeIntel(data: unknown): RelationshipIntel | null {
  const obj = (data ?? null) as any;
  if (!obj || typeof obj !== "object" || !obj.company_id) return null;

  const facilities: IntelFacility[] = Array.isArray(obj.facilities)
    ? obj.facilities
        .map((f: any): IntelFacility => ({
          city: str(f?.city) || null,
          state: str(f?.state) || null,
          kind: str(f?.kind) || "warehouse",
          source_url: str(f?.source_url) || null,
        }))
        .filter((f: IntelFacility) => f.city || f.state)
    : [];

  const relationships: IntelRelationship[] = Array.isArray(obj.relationships)
    ? obj.relationships
        .map((r: any): IntelRelationship => ({
          name: str(r?.name),
          kind: str(r?.kind) || "client",
          source_url: str(r?.source_url) || null,
          quote: str(r?.quote) || null,
        }))
        .filter((r: IntelRelationship) => r.name)
    : [];

  const sources: IntelSource[] = Array.isArray(obj.sources)
    ? obj.sources
        .map((s: any): IntelSource => ({
          url: str(s?.url),
          title: str(s?.title) || null,
        }))
        .filter((s: IntelSource) => s.url)
    : [];

  return {
    company_id: String(obj.company_id),
    company_type: str(obj.company_type) || null,
    company_type_confidence: score(obj.company_type_confidence),
    summary: str(obj.summary) || null,
    facilities,
    relationships,
    outbound_ftl_likelihood: score(obj.outbound_ftl_likelihood),
    outbound_ftl_rationale: str(obj.outbound_ftl_rationale) || null,
    sources,
    model: str(obj.model) || null,
    refreshed_at: str(obj.refreshed_at) || null,
  };
}

function queryKey(slug: string | null): (string | null)[] {
  return ["company-relationship-intel", slug ?? ""];
}

/**
 * Cached relationship-intel row for one company. Resolves `null` (no row yet,
 * or read error) — the card then shows the "Research network" empty state.
 */
export function useRelationshipIntel(
  companyId: string | null | undefined,
): UseQueryResult<RelationshipIntel | null> {
  const slug = bareSlug(companyId);
  return useQuery({
    queryKey: queryKey(slug),
    enabled: Boolean(slug),
    staleTime: FIVE_MIN,
    queryFn: async (): Promise<RelationshipIntel | null> => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from("lit_company_relationship_intel")
        .select("*")
        .eq("company_id", slug)
        .maybeSingle();
      if (error) {
        console.warn("[relationshipIntel] read failed:", error.message);
        return null;
      }
      return normalizeIntel(data);
    },
  });
}

interface ResearchResponse {
  ok: boolean;
  cached?: boolean;
  intel?: unknown;
}

/**
 * Kick off (or refresh) the AI research for one company via the
 * `company-relationship-intel` edge fn. Long-running (~30-60s while Claude
 * web-searches). On success, seeds the read query so the card fills in
 * without a refetch.
 */
export function useResearchRelationshipIntel(
  companyId: string | null | undefined,
): UseMutationResult<RelationshipIntel | null, Error, void> {
  const slug = bareSlug(companyId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RelationshipIntel | null> => {
      if (!slug) throw new Error("Missing company id");
      const res = await invokeEdge<ResearchResponse>("company-relationship-intel", {
        company_id: slug,
      });
      return normalizeIntel(res?.intel);
    },
    onSuccess: (intel) => {
      if (intel) queryClient.setQueryData(queryKey(slug), intel);
      else queryClient.invalidateQueries({ queryKey: queryKey(slug) });
    },
  });
}
