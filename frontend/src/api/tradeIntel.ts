/**
 * Trade-intel hooks — forwarder/broker relationships (and, next, the Trade
 * Graph) derived from LIT's own BOL data (lit_unified_shipments).
 *
 * The notify party on an ocean BOL is almost always the importer's freight
 * forwarder or customs broker — i.e. the INCUMBENT 3PL a sales rep needs to
 * displace. lit_company_forwarders() aggregates it per company with self-notify
 * rows filtered out server-side (pg_trgm similarity vs the consignee name).
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const FIVE_MIN = 5 * 60 * 1000;

export interface CompanyForwarder {
  forwarder_name: string;
  shipment_count: number;
  first_shipment: string | null; // ISO date
  last_shipment: string | null;  // ISO date
  share_pct: number;
}

export interface TradeGraphSupplier {
  shipper_name: string;
  shipments: number;
  teu: number;
  first_shipment: string | null;
  last_shipment: string | null;
  origin_country: string | null;
  origin_country_code: string | null;
  origin_city: string | null;
  top_chapter: string | null;
}
export interface TradeGraphChapter {
  chapter: string;
  label: string;
  shipments: number;
  classified_only: boolean;
}
export interface TradeGraphLane {
  origin_port: string;
  destination_port: string;
  shipments: number;
  last_shipment: string | null;
}
export interface TradeGraphFacility {
  dest_city: string;
  dest_state: string | null;
  dest_zip: string | null;
  shipments: number;
  last_shipment: string | null;
}
export interface TradeGraphCompetitor {
  company_id: string;
  company_name: string;
  shared_suppliers: number;
  shared_names: string[];
  shipments: number;
}
export interface TradeGraph {
  suppliers: TradeGraphSupplier[];
  chapters: TradeGraphChapter[];
  lanes: TradeGraphLane[];
  facilities: TradeGraphFacility[];
  competitors: TradeGraphCompetitor[];
  forwarders: CompanyForwarder[];
}

/** The full Trade Graph for one company — suppliers, commodity mix, lanes,
 *  inland facilities, shared-supplier competitors, and forwarder incumbents —
 *  in a single composite RPC round-trip. */
export function useCompanyTradeGraph(
  slug: string | null | undefined,
): UseQueryResult<TradeGraph | null> {
  return useQuery({
    queryKey: ["company-trade-graph", slug ?? ""],
    enabled: Boolean(slug),
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lit_company_trade_graph", {
        p_company_key: slug,
      });
      if (error || !data) return null;
      return data as TradeGraph;
    },
  });
}

export interface FmcsaMatch {
  dot_number: string;
  legal_name: string;
  dba_name: string | null;
  phy_city: string | null;
  phy_state: string | null;
  phy_zip: string | null;
  power_units: number | null;
  drivers: number | null;
  recent_mileage: number | null;
  recent_mileage_year: string | null;
  carrier_operation: string | null;
  authorized_for_hire: boolean;
  private_fleet: boolean;
  hazmat: boolean;
}

export interface SupplierCustomer {
  company_id: string;
  company_name: string;
  shipments: number;
  teu: number | null;
  first_shipment: string | null;
  last_shipment: string | null;
  top_chapter: string | null;
  top_chapter_label: string | null;
}

/** Supplier pivot — every OTHER tracked importer/exporter this supplier ships
 *  to ("what other companies is this supplier working with"). Lazy: only
 *  fetches when a supplier row is expanded. */
export function useSupplierCustomers(
  supplierName: string | null,
  excludeCompany: string | null | undefined,
): UseQueryResult<SupplierCustomer[]> {
  return useQuery({
    queryKey: ["supplier-customers", supplierName ?? "", excludeCompany ?? ""],
    enabled: Boolean(supplierName),
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lit_supplier_customers", {
        p_supplier_name: supplierName,
        p_exclude_company: excludeCompany ?? null,
      });
      if (error) return [];
      return (data ?? []) as SupplierCustomer[];
    },
  });
}

/* ─── FMCSA identity gating ───
 * The edge fn prefix-searches for recall; DISPLAY requires a verified same-
 * company match. Without this, a profile named "Company" (directory fallback)
 * matched "Company Wrench Ltd" etc. on every profile — garbage. Rules:
 *  - the profile name must be specific: ≥2 meaningful tokens, and not a
 *    generic word (company, international, logistics, …)
 *  - a candidate's normalized legal/dba name must EQUAL the profile name, or
 *    differ only by trailing corporate/fleet descriptor tokens
 *    (…STORE / TRANSPORTATION / LOGISTICS / TRUCKING / FLEET / etc.)
 */
const FMCSA_SUFFIX_STRIP = /\s+(LLC|INC|CORP|CORPORATION|CO|LTD|LIMITED|COMPANY|USA)\.?$/g;
const GENERIC_NAME_TOKENS = new Set([
  "COMPANY", "COMPANIES", "INTERNATIONAL", "LOGISTICS", "GROUP", "GLOBAL",
  "INDUSTRIES", "ENTERPRISES", "HOLDINGS", "SERVICES", "TRADING", "IMPORT",
  "EXPORT", "IMPORTS", "EXPORTS", "USA", "AMERICA", "CORPORATION", "INC", "LLC",
]);
const FLEET_DESCRIPTOR_TOKENS = new Set([
  "STORE", "STORES", "TRANSPORT", "TRANSPORTATION", "LOGISTICS", "TRUCKING",
  "FLEET", "DISTRIBUTION", "DELIVERY", "EXPRESS", "CARRIER", "CARRIERS",
  "SERVICES", "SERVICE", "US", "USA", "NORTH", "AMERICA", "GROUP", "HOLDINGS",
]);

function fmcsaNorm(v: string): string {
  return v.toUpperCase().replace(/[.,'&]/g, " ").replace(FMCSA_SUFFIX_STRIP, "").replace(/\s+/g, " ").trim();
}

/** True when the profile name is specific enough to identity-match on. */
export function fmcsaNameIsSpecific(name: string | null | undefined): boolean {
  const norm = fmcsaNorm(String(name ?? ""));
  if (norm.length < 6) return false;
  const tokens = norm.split(" ").filter(Boolean);
  const meaningful = tokens.filter((t) => !GENERIC_NAME_TOKENS.has(t));
  return tokens.length >= 2 && meaningful.length >= 1;
}

/** True when a census candidate is verifiably the SAME company, not a
 *  lookalike: equal after normalization, or equal plus ≤2 trailing fleet
 *  descriptor tokens ("GORDON FOOD SERVICE STORE" for "Gordon Food Service"). */
export function fmcsaIsSameCompany(companyName: string, candidate: FmcsaMatch): boolean {
  const target = fmcsaNorm(companyName);
  if (!target) return false;
  for (const raw of [candidate.legal_name, candidate.dba_name]) {
    if (!raw) continue;
    const cand = fmcsaNorm(raw);
    if (cand === target) return true;
    if (cand.startsWith(target + " ")) {
      const rest = cand.slice(target.length).trim().split(" ").filter(Boolean);
      if (rest.length <= 2 && rest.every((t) => FLEET_DESCRIPTOR_TOKENS.has(t))) return true;
    }
  }
  return false;
}

/** VERIFIED FMCSA motor-carrier registrations for this exact company — real
 *  federal fleet data (power units, drivers, mileage, private-fleet flag).
 *  Resolves [] unless the name is specific AND a candidate passes the
 *  same-company gate; lookalikes and generic-name matches never render. */
export function useFmcsaFleet(
  companyName: string | null | undefined,
): UseQueryResult<FmcsaMatch[]> {
  const specific = fmcsaNameIsSpecific(companyName);
  return useQuery({
    queryKey: ["fmcsa-fleet", (companyName ?? "").toLowerCase()],
    enabled: Boolean(companyName) && specific,
    staleTime: 24 * 60 * 60 * 1000, // server caches 30d; a day client-side is plenty
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fmcsa-carrier-lookup", {
        body: { name: companyName },
      });
      if (error || !data?.ok) return [];
      const all = (data.matches ?? []) as FmcsaMatch[];
      return all.filter((m) => fmcsaIsSameCompany(String(companyName), m));
    },
  });
}

/** Forwarders/brokers this company ships with, by BOL notify-party volume.
 *  `slug` is the ImportYeti company key ("gordon-food-service" or
 *  "company/gordon-food-service" — the RPC strips the prefix). Resolves to []
 *  when the company has no notify-party data; null only on hard error. */
export function useCompanyForwarders(
  slug: string | null | undefined,
): UseQueryResult<CompanyForwarder[] | null> {
  return useQuery({
    queryKey: ["company-forwarders", slug ?? ""],
    enabled: Boolean(slug),
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lit_company_forwarders", {
        p_company_key: slug,
      });
      if (error) return null;
      return (data ?? []) as CompanyForwarder[];
    },
  });
}
