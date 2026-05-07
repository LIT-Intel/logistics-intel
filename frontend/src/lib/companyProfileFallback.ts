/**
 * Phase 3 — Company Profile shipment fallback.
 *
 * Builds a minimal IyCompanyProfile-shaped object from the data we already
 * have on `lit_companies` (saved CRM columns) + optional rollups from
 * `lit_company_source_metrics`. Used when no `lit_importyeti_company_snapshot`
 * row exists yet, so the Supply Chain tab is not blank for saved companies.
 *
 * NOT an ImportYeti fetch — this is a "make the page useful immediately
 * from local data" path. Callers should still trigger a background
 * `getSavedCompanyDetail({ forceRefresh: false })` when a shell exists but
 * is stale, so a real snapshot eventually populates the tab.
 *
 * Honest data only: we do NOT fabricate `recentBols` or `topSuppliers`
 * from thin air. Those stay empty until a real snapshot lands, and the
 * UI surfaces a "Refresh Intelligence" CTA.
 *
 * Phase 3 architectural note (TEMPORARY): V2 calls the legacy ImportYeti
 * helpers (`getSavedCompanyShellOnly`, `getSavedCompanyDetail`) for
 * shipment data instead of routing it through the new aggregator. This
 * is the known-good legacy data path. The aggregator still serves
 * identity / contacts / activity / pulse. Consolidate once the legacy
 * helpers are confidently superseded.
 */

import { supabase } from "@/lib/supabase";
import type { IyCompanyProfile, IyRouteKpis } from "@/lib/api";

export type SavedCompanyKpiRow = {
  id: string;
  source_company_key: string | null;
  name: string;
  domain: string | null;
  website: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  country_code: string | null;
  postal_code: string | null;
  shipments_12m: number | null;
  teu_12m: number | null;
  fcl_shipments_12m: number | null;
  lcl_shipments_12m: number | null;
  est_spend_12m: number | null;
  most_recent_shipment_date: string | null;
  top_route_12m: string | null;
  recent_route: string | null;
  industry: string | null;
  headcount: string | null;
  revenue: string | null;
};

function parseRouteLabel(label: string | null): { origin: string | null; destination: string | null } {
  if (!label) return { origin: null, destination: null };
  const parts = label.split(/\s*→\s*|\s*->\s*/);
  if (parts.length >= 2) {
    return { origin: parts[0].trim() || null, destination: parts.slice(1).join(" → ").trim() || null };
  }
  return { origin: null, destination: label.trim() || null };
}

/**
 * Build a minimal IyCompanyProfile from the columns we already have
 * on `lit_companies`. This is enough to populate the header KPIs,
 * the Trade Intelligence right-rail card, FCL/LCL pills, and a
 * single-row "top route" entry. Monthly cadence and recent BOLs
 * remain empty (the snapshot owns those — the Refresh CTA is the
 * way to populate them).
 */
export function synthesizeProfileFromSavedRow(row: SavedCompanyKpiRow): IyCompanyProfile {
  const totalShipments12m = Number(row.shipments_12m) || 0;
  const totalTeu12m = Number(row.teu_12m) || 0;
  const fcl12m = Number(row.fcl_shipments_12m) || 0;
  const lcl12m = Number(row.lcl_shipments_12m) || 0;
  const estSpend = Number(row.est_spend_12m) || 0;

  const topRouteLabel = row.top_route_12m || row.recent_route || null;
  const { origin, destination } = parseRouteLabel(topRouteLabel);

  const topRoutes = topRouteLabel
    ? [
        {
          route: topRouteLabel,
          origin: origin ?? "",
          destination: destination ?? "",
          shipments: totalShipments12m,
          teu: totalTeu12m,
        } as any,
      ]
    : [];

  const routeKpis: IyRouteKpis = {
    shipmentsLast12m: totalShipments12m || null,
    teuLast12m: totalTeu12m || null,
    estSpendUsd12m: estSpend || null,
    topRouteLast12m: topRouteLabel,
    mostRecentRoute: row.recent_route || topRouteLabel,
    sampleSize: totalShipments12m || null,
    topRoutesLast12m: topRoutes as any,
  };

  const address = [row.address_line1, row.city, row.state].filter(Boolean).join(", ") || null;

  const slug = (row.source_company_key ?? "").replace(/^company\//, "");

  const profile: IyCompanyProfile = {
    key: row.source_company_key ?? slug,
    companyId: slug,
    name: row.name,
    title: row.name,
    domain: row.domain,
    website: row.website,
    phoneNumber: row.phone,
    phone: row.phone,
    address,
    countryCode: row.country_code,
    country: row.country_code,
    lastShipmentDate: row.most_recent_shipment_date,
    estSpendUsd12m: estSpend || null,
    totalShipments: totalShipments12m || null,
    totalShipmentsAllTime: totalShipments12m || null,
    totalTeuAllTime: totalTeu12m || null,
    fcl_shipments_all_time: fcl12m || null,
    lcl_shipments_all_time: lcl12m || null,
    fcl_shipments_perc:
      totalShipments12m > 0 ? Number(((fcl12m / totalShipments12m) * 100).toFixed(1)) : null,
    lcl_shipments_perc:
      totalShipments12m > 0 ? Number(((lcl12m / totalShipments12m) * 100).toFixed(1)) : null,
    industry: row.industry,
    routeKpis,
    timeSeries: [],
    recentBols: [],
    containers: {
      fclShipments12m: fcl12m || null,
      lclShipments12m: lcl12m || null,
    },
    topSuppliers: [],
    topRoutes: topRoutes as any,
    top_routes: topRoutes as any,
  };

  return profile;
}

/**
 * Optional async enrichment — pulls per-country rollups from
 * `lit_company_source_metrics` for the given company_key and folds
 * them into the synthesized profile as additional `topRoutes` entries
 * (origin = country, destination = "—"). Best-effort; returns input
 * unchanged on any failure.
 */
export async function enrichWithSourceMetrics(
  profile: IyCompanyProfile,
  companyKey: string | null,
): Promise<IyCompanyProfile> {
  if (!companyKey) return profile;
  try {
    const { data, error } = await supabase
      .from("lit_company_source_metrics")
      .select("country, shipments, teu, value_usd, lcl")
      .eq("company_key", companyKey);
    if (error || !data || data.length === 0) return profile;

    const byCountry = new Map<string, { shipments: number; teu: number }>();
    for (const row of data as any[]) {
      const country = String(row.country || "").trim();
      if (!country) continue;
      const prev = byCountry.get(country) || { shipments: 0, teu: 0 };
      byCountry.set(country, {
        shipments: prev.shipments + (Number(row.shipments) || 0),
        teu: prev.teu + (Number(row.teu) || 0),
      });
    }

    const extraRoutes = Array.from(byCountry.entries())
      .map(([country, agg]) => ({
        route: `${country} → ${profile.country || "—"}`,
        origin: country,
        destination: profile.country || "—",
        shipments: agg.shipments,
        teu: agg.teu,
      }))
      .sort((a, b) => b.shipments - a.shipments)
      .slice(0, 10);

    if (extraRoutes.length === 0) return profile;

    const merged = [...(profile.topRoutes ?? [])];
    for (const r of extraRoutes) {
      if (!merged.some((m: any) => m?.origin === r.origin)) {
        merged.push(r as any);
      }
    }

    return {
      ...profile,
      topRoutes: merged as any,
      top_routes: merged as any,
      routeKpis: profile.routeKpis
        ? { ...profile.routeKpis, topRoutesLast12m: merged as any }
        : profile.routeKpis,
    };
  } catch (e) {
    console.warn("[companyProfileFallback] enrichWithSourceMetrics failed", e);
    return profile;
  }
}

/**
 * Fetch the saved-company row for a given UUID and synthesize a
 * fallback profile. Returns null if the company is not in
 * `lit_companies` (e.g. directory-only profiles).
 */
export async function loadSyntheticProfile(
  companyUuid: string | null,
): Promise<IyCompanyProfile | null> {
  if (!companyUuid) return null;
  try {
    const { data, error } = await supabase
      .from("lit_companies")
      .select(
        "id, source_company_key, name, domain, website, phone, address_line1, city, state, country_code, postal_code, shipments_12m, teu_12m, fcl_shipments_12m, lcl_shipments_12m, est_spend_12m, most_recent_shipment_date, top_route_12m, recent_route, industry, headcount, revenue",
      )
      .eq("id", companyUuid)
      .maybeSingle();

    if (error || !data) return null;
    let profile = synthesizeProfileFromSavedRow(data as SavedCompanyKpiRow);
    profile = await enrichWithSourceMetrics(profile, data.source_company_key);
    return profile;
  } catch (e) {
    console.warn("[companyProfileFallback] loadSyntheticProfile failed", e);
    return null;
  }
}
