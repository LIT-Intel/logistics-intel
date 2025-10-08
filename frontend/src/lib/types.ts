export type SearchRow = {
  company_id?: string;
  company_name: string;
  shipments_12m?: number;
  last_activity?: { value?: string };
  top_routes?: Array<{ origin_country?: string; dest_country?: string; shipments?: number }>;
};

export type CompanyStateFlags = {
  saved?: boolean;
  watching?: boolean;
  alerted?: boolean;
};
