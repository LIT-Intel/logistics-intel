export type SourceTag = 'importyeti' | 'local' | 'lusha';

export interface CompanyLite {
  company_id: string;
  name: string;
  source: SourceTag;
  address?: string | null;
  country_code?: string | null;
  kpis: {
    shipments_12m: number;
    last_activity: string | null;
  };
  extras?: {
    top_suppliers?: string[];
  };
}

export interface ShipmentLite {
  date: string;
  bol: string;
  mbl?: string | null;
  hs_code?: string | null;
  teu?: number | null;
  qty?: number | null;
  qty_unit?: string | null;
  shipper_name?: string | null;
  consignee_name?: string | null;
  description?: string | null;
  lcl?: boolean | null;
  shipping_cost_usd?: number | null;
}

export interface CommandCenterRecord {
  company: CompanyLite;
  shipments?: ShipmentLite[];
  created_at: string;
}
