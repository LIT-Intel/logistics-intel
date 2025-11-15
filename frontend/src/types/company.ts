export type CompanyLocation = {
  city: string | null;
  state: string | null;
  postal: string | null;
  full_address: string | null;
  c: number; // occurrence count
};

export type CompanyProfile = {
  company_id: string;
  company_name: string;
  total_shipments_12m: number | string;
  alias_names: string[];        // may be []
  locations: CompanyLocation[]; // may be []
};
