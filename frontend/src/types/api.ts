export type FilterOptionsResponse = {
  origin_countries: string[];
  destination_countries: string[];
  modes: string[];
};

export type CompanySearchResult = {
  id?: string;
  company_id?: string;
  name: string;
  country?: string;
  mode_breakdown?: { mode: string; cnt: number }[];
  [key: string]: any;
};

export type SearchCompaniesResponse = {
  results: CompanySearchResult[];
  total: number;
};

// New standardized types for search wiring
export type Mode = 'any'|'air'|'ocean';

export interface CompanyRow {
  company_id: string;
  name: string;
  kpis: {
    shipments_12m: number;
    last_activity: string;
    top_route?: string;
    top_carrier?: string;
  };
}

export interface SearchResponse {
  meta: { total: number; page: number; page_size: number };
  rows: CompanyRow[];
}

export interface CompanyDetails {
  company_id: string;
  name: string;
  website?: string;
  hq_city?: string; hq_state?: string; hq_country?: string;
  kpis: CompanyRow['kpis'];
  plan_gates: { contacts: 'free'|'pro'|'enterprise'; notes: 'free'|'pro'|'enterprise' };
}

export interface ShipmentsResponse {
  company_id: string;
  rows: Array<{
    shipped_on: string; mode: 'air'|'ocean';
    origin: string; destination: string; carrier?: string;
    value_usd?: number; weight_kg?: number;
  }>;
  source: 'primary'|'fallback';
}

