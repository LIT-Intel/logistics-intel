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
