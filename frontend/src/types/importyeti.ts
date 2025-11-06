export type ImportYetiSearchRow = {
  slug: string;
  title: string;
  address: string | null;
  country: string | null;
  total_shipments: number;
  shipments_12m?: number | null;
};

export type ImportYetiSearchResp = {
  meta: {
    total: number;
    page: number;
    page_size: number;
  };
  rows: ImportYetiSearchRow[];
};

export type ImportYetiCompany = {
  slug: string;
  title: string;
  also_known_names: string[];
  address: string | null;
  other_addresses_contact_info: Array<{
    address: string | null;
    most_recent_shipment_to: string | null;
    contact_info_data?: {
      emails?: string[];
      phone_numbers?: string[];
    };
  }>;
  website: string | null;
  other_websites?: Array<{ website: string; frequency: number }>;
  phone_number?: string | null;
  total_shipments: number;
  date_range?: {
    start_date?: string;
    end_date?: string;
  };
  containers?: Array<{
    type: string;
    length: string;
    group: string;
    shipments: number;
    weight: number;
    teu: number;
    count: number;
  }>;
  containers_load?: {
    less?: {
      shipments: number;
      shipments_perc: number;
      weight: number;
      weight_perc: number;
      teu: number;
      teu_perc: number;
    };
    full?: {
      shipments: number;
      shipments_perc: number;
      weight: number;
      weight_perc: number;
      teu: number;
      teu_perc: number;
    };
  };
  map_table?: {
    port_to_port_geographic?: Array<{
      exit_port_country: string;
      exit_port: string;
      entry_port: string;
    }>;
    exit_ports?: Record<string, {
      port_location?: { lat: number; lon: number };
      shipments: number;
    }>;
    entry_ports?: Record<string, {
      port_location?: { lat: number; lon: number };
      shipments: number;
    }>;
    shipments_by_country?: Record<string, number>;
  };
  lane_permutations?: Array<{
    exit_port: string;
    exit_port_country: string;
    entry_port: string;
    entry_port_country: string;
    entry_port_region?: string;
    shipments: number;
    shipments_percents?: number;
    weight?: number;
    teu?: number;
  }>;
  time_series?: Record<string, {
    shipments: number;
    weight: number;
    teu: number;
  }>;
  hs_codes?: Array<{
    hs_code: string;
    description?: string;
    shipments: number;
    shipments_12m?: number;
    weight?: number;
    teu?: number;
    children?: any[];
  }>;
  suppliers_table?: Array<{
    supplier_name: string;
    supplier_address?: string;
    supplier_address_country?: string;
    total_shipments_company: number;
    shipments_12m?: number;
    country?: string;
    country_code?: string;
    most_recent_shipment?: string;
    first_shipment?: string;
  }>;
  recent_bols?: Array<{
    date_formatted?: string;
    Bill_of_Lading?: string | null;
    Master_Bill_of_Lading?: string | null;
    Bill_Type_Code?: string | null;
    Country?: string | null;
    Weight_in_KG?: string | null;
    [key: string]: any;
  }>;
};
