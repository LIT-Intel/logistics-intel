/**
 * Quote ↔ Deal linkage helpers (flow-audit GAP fix).
 *
 * Problem: a quote's won-value (lit_quotes.total_sell) and a deal's value
 * (lit_deals.value_amount) were two independent truths, so workspace revenue
 * could double-count the same opportunity.
 *
 * Fix / single source of truth: the DEAL is the source of truth for pipeline
 * value. Quotes roll UP into a deal via lit_quotes.deal_id (migration
 * 20260814245000). When a quote is CONVERTED, we create a deal seeded with the
 * quote's value and link the quote to it — the deal now owns that value. When a
 * quote is ATTACHED to an existing deal we DO NOT overwrite the deal's value
 * (an open deal may already aggregate several quotes / a negotiated figure);
 * the linked quotes are shown on the deal so a human decides the true number.
 * Either way, once a quote carries a deal_id, revenue reporting counts the deal
 * — never the quote independently — so no double-count.
 *
 * New domain module (not lib/api.ts) per CLAUDE.md. Reuses crm.ts for org/user
 * resolution and deal creation so the RLS-stamping insert path stays in one
 * place.
 */
import { supabase } from "@/lib/supabase";
import {
  createDeal,
  getDeal,
  listStages,
  resolveActiveOrgId,
  type Deal,
  type DealServiceType,
} from "./crm";

// Minimal shape of a quote we need to convert/link. Sourced from lit_quotes
// (quote-detail returns the full row; quote-list returns a subset). We read the
// row directly here so the helper works from any surface.
export type LinkableQuote = {
  id: string;
  company_id: string | null; // lit_companies UUID
  contact_id?: string | null;
  quote_number?: string | null;
  service_type?: string | null;
  origin_city?: string | null;
  origin_port?: string | null;
  destination_city?: string | null;
  destination_port?: string | null;
  total_sell?: number | null;
  currency?: string | null;
  deal_id?: string | null;
};

// Map a quote's free-text service_type / mode onto the deal service-type enum
// when it lines up; otherwise leave the deal's service_type null (the user can
// set it in the drawer). Deliberately conservative — never guess.
const DEAL_SERVICE_TYPES_SET = new Set<DealServiceType>([
  "dry_van",
  "flat_bed",
  "reefer",
  "straight_truck",
  "hot_shot",
  "sprinter_van",
  "drayage",
  "intermodal",
  "ocean",
  "air",
  "other",
]);

function mapServiceType(raw?: string | null): DealServiceType | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (DEAL_SERVICE_TYPES_SET.has(v as DealServiceType)) return v as DealServiceType;
  // A couple of common quote-side aliases → deal enum.
  if (v === "ftl" || v === "full_truckload") return "dry_van";
  if (v === "ocean_fcl" || v === "fcl" || v === "lcl") return "ocean";
  return null;
}

function laneEndpoint(port?: string | null, city?: string | null): string | null {
  return (port || city || null) ?? null;
}

/**
 * Load the linkable fields of a quote by id (org-scoped by RLS).
 */
export async function loadLinkableQuote(quoteId: string): Promise<LinkableQuote | null> {
  const { data, error } = await supabase
    .from("lit_quotes")
    .select(
      "id,company_id,contact_id,quote_number,service_type,mode,origin_city,origin_port,destination_city,destination_port,total_sell,currency,deal_id",
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as LinkableQuote;
}

/**
 * Resolve the deal's company reference from a quote's lit_companies UUID.
 * Deals carry a saved_company_id (lit_saved_companies) plus a text company_id
 * fallback. We look for an existing saved-company row in this org that points at
 * the quote's company so the deal shows the right company card; if none exists
 * we still stamp company_id (text) with the UUID so the deal is not orphaned.
 */
async function resolveDealCompanyRefs(
  companyUuid: string | null,
): Promise<{ saved_company_id: string | null; company_id: string | null }> {
  if (!companyUuid) return { saved_company_id: null, company_id: null };
  const orgId = await resolveActiveOrgId();
  if (orgId) {
    const { data } = await supabase
      .from("lit_saved_companies")
      .select("id")
      .eq("org_id", orgId)
      .eq("company_id", companyUuid)
      .limit(1)
      .maybeSingle();
    if ((data as any)?.id) {
      return { saved_company_id: (data as any).id, company_id: companyUuid };
    }
  }
  return { saved_company_id: null, company_id: companyUuid };
}

/** Set (or clear) a quote's deal link. */
export async function setQuoteDeal(quoteId: string, dealId: string | null): Promise<void> {
  const { error } = await supabase
    .from("lit_quotes")
    .update({ deal_id: dealId })
    .eq("id", quoteId);
  if (error) throw new Error(error.message);
}

/** Quotes linked to a given deal, newest first — for the Deal Detail drawer. */
export type LinkedQuote = {
  id: string;
  quote_number: string | null;
  status: string;
  total_sell: number | null;
  currency: string | null;
  updated_at: string | null;
};

export async function listQuotesForDeal(dealId: string): Promise<LinkedQuote[]> {
  const { data, error } = await supabase
    .from("lit_quotes")
    .select("id,quote_number,status,total_sell,currency,updated_at")
    .eq("deal_id", dealId)
    .order("updated_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as LinkedQuote[];
}

/**
 * Company quotes that are NOT yet linked to any deal — for the "attach existing
 * quote" picker on a deal. Scoped to the deal's company (lit_companies UUID).
 */
export async function listAttachableQuotes(companyUuid: string): Promise<LinkedQuote[]> {
  if (!companyUuid) return [];
  const { data, error } = await supabase
    .from("lit_quotes")
    .select("id,quote_number,status,total_sell,currency,updated_at")
    .eq("company_id", companyUuid)
    .is("deal_id", null)
    .order("updated_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as LinkedQuote[];
}

/**
 * Convert a quote into a deal.
 *
 * Idempotent: if the quote already links a deal, that existing deal is returned
 * (the caller opens it) — we never create a duplicate.
 *
 * On first conversion we create a new lit_deal seeded from the quote:
 *   - title       = "Quote {number}" (deals have a title; quotes do not)
 *   - value_amount = quote.total_sell  ← the deal now OWNS this value
 *   - company/contact from the quote
 *   - service_type / lane mapped from the quote when they line up
 *   - stage       = the org's "Quoted" stage (falls back to the first stage)
 * …then stamps quote.deal_id so the quote rolls up into the deal.
 */
export async function convertQuoteToDeal(
  quoteId: string,
): Promise<{ deal: Deal; created: boolean }> {
  const quote = await loadLinkableQuote(quoteId);
  if (!quote) throw new Error("Quote not found.");

  // Idempotency — already linked → return the existing deal.
  if (quote.deal_id) {
    const existing = await getDeal(quote.deal_id);
    if (existing) return { deal: existing, created: false };
    // Dangling link (deal was deleted → ON DELETE SET NULL should have cleared
    // it, but be defensive): fall through and create a fresh one.
  }

  const stages = await listStages();
  const quotedStage =
    stages.find((s) => s.name.toLowerCase() === "quoted") ??
    stages.find((s) => !s.is_won && !s.is_lost) ??
    stages[0];
  if (!quotedStage) throw new Error("No pipeline stages configured for this workspace.");

  const { saved_company_id, company_id } = await resolveDealCompanyRefs(quote.company_id);

  const origin = laneEndpoint(quote.origin_port, quote.origin_city);
  const destination = laneEndpoint(quote.destination_port, quote.destination_city);
  const label = quote.quote_number ? `Quote ${quote.quote_number}` : "Quote";

  const deal = await createDeal({
    title: label,
    stage_id: quotedStage.id,
    saved_company_id,
    company_id,
    value_amount: quote.total_sell ?? null,
    currency: quote.currency ?? "USD",
    primary_contact_id: quote.contact_id ?? null,
    service_type: mapServiceType(quote.service_type),
    origin,
    destination,
    notes: `Created from ${label}.`,
  });

  await setQuoteDeal(quote.id, deal.id);
  return { deal, created: true };
}

/**
 * Attach a quote to an already-open deal. We deliberately DO NOT touch the
 * deal's value_amount — an open deal may already aggregate a negotiated figure
 * or several quotes, and silently overwriting it is how double-counting / lost
 * figures happen. The quote now rolls up into the deal (shown in the drawer);
 * a human decides whether to adjust the deal value.
 */
export async function attachQuoteToDeal(quoteId: string, dealId: string): Promise<void> {
  await setQuoteDeal(quoteId, dealId);
}

/** Unlink a quote from its deal (does not delete either). */
export async function detachQuoteFromDeal(quoteId: string): Promise<void> {
  await setQuoteDeal(quoteId, null);
}
