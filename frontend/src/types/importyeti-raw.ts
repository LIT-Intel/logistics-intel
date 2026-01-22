export interface ImportYetiBOL {
  date_formatted: string;
  lcl: boolean;
  teu: number;
  origin_port?: string;
  destination_port?: string;
  Consignee_Address?: string;
  supplier_address_loc?: string;
  shipper?: string;
  consignee?: string;
  notify_party?: string;
  hs_codes?: string[];
  product_descriptions?: string[];
  container_numbers?: string[];
  weight_kg?: number;
  volume_cbm?: number;
}

export interface ImportYetiRawData {
  key: string;
  title: string;
  name: string;
  country: string;
  city?: string;
  state?: string;
  address_plain?: string;
  website?: string;
  phone?: string;
  email?: string;
  total_shipments: number;
  avg_teu_per_month?: {
    "12m"?: number;
    "6m"?: number;
    "3m"?: number;
  };
  total_shipping_cost?: number;
  recent_bols: ImportYetiBOL[];
  containers?: any[];
  date_range?: {
    start_date: string;
    end_date: string;
  };
  top_suppliers?: Array<{ name: string; count: number }>;
  top_products?: Array<{ name: string; count: number }>;
  top_hs_codes?: Array<{ code: string; count: number }>;
}

export interface ImportYetiRawPayload {
  data: ImportYetiRawData;
  meta?: {
    credits_used?: number;
    cache_hit?: boolean;
    timestamp?: string;
  };
}

export interface CompanySnapshotResponse {
  ok: boolean;
  source: 'cache' | 'importyeti';
  snapshot: any;
  raw: ImportYetiRawPayload;
  cached_at?: string;
  fetched_at?: string;
}
