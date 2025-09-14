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

